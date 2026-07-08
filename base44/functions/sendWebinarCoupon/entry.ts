import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function toChatId(localPhone) {
  let clean = String(localPhone || '').replace(/[^\d]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return `${clean}@c.us`;
}

// Sends post-webinar follow-up messages (intro + options with links)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { webinar_type, webinar_date, registration_ids } = body;

    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const greenSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' });
    const botEnabled = botSettings[0]?.value === 'true';
    const greenEnabled = greenSettings[0]?.value === 'true';

    // שליפת תבניות הודעה
    const introRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_post_intro', is_active: true });
    const optionsRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_post_options', is_active: true });
    const introTemplate = introRecords[0]?.content || 'היי {name}, שמחנו לראות אותך בהדרכה!';
    const optionsTemplate = optionsRecords[0]?.content || '';

    // שליפת קישורים מ-ServiceContent
    const [sc1, sc2, sc3] = await Promise.all([
      base44.asServiceRole.entities.ServiceContent.filter({ sub_type: 'webinar_option1_digital', is_active: true }),
      base44.asServiceRole.entities.ServiceContent.filter({ sub_type: 'webinar_option2_meeting_program', is_active: true }),
      base44.asServiceRole.entities.ServiceContent.filter({ sub_type: 'webinar_option3_full_personal', is_active: true }),
    ]);
    const option1Link = sc1[0]?.url || '';
    const option2Link = sc2[0]?.url || '';
    const option3Link = sc3[0]?.url || '';

    // Select target registrations
    let regs = [];
    if (Array.isArray(registration_ids) && registration_ids.length > 0) {
      for (const id of registration_ids) {
        const r = await base44.asServiceRole.entities.WebinarRegistration.filter({ id });
        if (r[0]) regs.push(r[0]);
      }
    } else if (webinar_type) {
      const all = await base44.asServiceRole.entities.WebinarRegistration.filter({ webinar_type });
      let filtered = all;
      if (webinar_date) {
        const targetDay = webinar_date.substring(0, 10);
        filtered = all.filter(r => r.webinar_date && r.webinar_date.substring(0, 10) === targetDay);
      }
      regs = filtered.filter(r => !r.coupon_sent);
    } else {
      return Response.json({ error: 'missing_target' }, { status: 400 });
    }

    let sent = 0, skipped = 0;
    for (const reg of regs) {
      if (reg.coupon_sent) { skipped++; continue; }
      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) { skipped++; continue; }

      const chatId = toChatId(contact.phone);
      const name = contact.full_name || '';

      // הודעה 1: ברכה
      const introMessage = introTemplate.replaceAll('{name}', name);

      // הודעה 2: מסלולים עם קישורים
      const optionsMessage = optionsTemplate
        .replaceAll('{name}', name)
        .replaceAll('{option1_link}', option1Link)
        .replaceAll('{option2_link}', option2Link)
        .replaceAll('{option3_link}', option3Link);

      let status = 'skipped';
      if (botEnabled && greenEnabled) {
        // שליחת הודעה 1
        const res1 = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message: introMessage }),
        });

        // השהיה של 1.5 שניות
        await new Promise(resolve => setTimeout(resolve, 1500));

        // שליחת הודעה 2
        const res2 = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message: optionsMessage }),
        });

        status = (res1.ok && res2.ok) ? 'sent' : 'failed';
      } else if (botEnabled) {
        status = 'sent';
      }

      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, {
        coupon_sent: true,
        coupon_sent_at: new Date().toISOString().split('T')[0],
        attended: true,
      });
      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
        content: (introMessage + '\n---\n' + optionsMessage).substring(0, 500),
        sent_by: 'system', is_automated: true,
        template_id: 'webinar_post_options', status,
      });
      sent++;
    }

    return Response.json({ ok: true, sent, skipped });
  } catch (error) {
    console.error('sendWebinarCoupon error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
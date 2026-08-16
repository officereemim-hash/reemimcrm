import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

import { uchatSend } from '../../shared/uchat.ts';


Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { webinar_type, webinar_date, registration_ids } = body;

    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botSettings[0]?.value === 'true';

    const introRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_post_intro', is_active: true });
    const optionsRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_post_options', is_active: true });
    const introTemplate = introRecords[0]?.content || 'היי {name}, שמחנו לראות אותך בהדרכה!';
    const optionsTemplate = optionsRecords[0]?.content || '';

    const [sc1, sc2, sc3] = await Promise.all([
      base44.asServiceRole.entities.ServiceContent.filter({ sub_type: 'webinar_option1_digital', is_active: true }),
      base44.asServiceRole.entities.ServiceContent.filter({ sub_type: 'webinar_option2_meeting_program', is_active: true }),
      base44.asServiceRole.entities.ServiceContent.filter({ sub_type: 'webinar_option3_full_personal', is_active: true }),
    ]);
    const option1Link = sc1[0]?.url || '';
    const option2Link = sc2[0]?.url || '';
    const option3Link = sc3[0]?.url || '';

    let regs = [];
    if (Array.isArray(registration_ids) && registration_ids.length > 0) {
      for (const id of registration_ids) { const r = await base44.asServiceRole.entities.WebinarRegistration.filter({ id }); if (r[0]) regs.push(r[0]); }
    } else if (webinar_type) {
      const all = await base44.asServiceRole.entities.WebinarRegistration.filter({ webinar_type });
      let filtered = all;
      if (webinar_date) { const targetDay = webinar_date.substring(0, 10); filtered = all.filter(r => r.webinar_date && r.webinar_date.substring(0, 10) === targetDay); }
      regs = filtered.filter(r => !r.coupon_sent);
    } else { return Response.json({ error: 'missing_target' }, { status: 400 }); }

    let sent = 0, skipped = 0;
    for (const reg of regs) {
      if (reg.coupon_sent) { skipped++; continue; }
      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) { skipped++; continue; }

      const name = contact.full_name || '';
      const contactFirstName = name.split(' ')[0];

      const introMessage = introTemplate.replaceAll('{name}', name);
      const optionsMessage = optionsTemplate.replaceAll('{name}', name).replaceAll('{option1_link}', option1Link).replaceAll('{option2_link}', option2Link).replaceAll('{option3_link}', option3Link);

      let status = 'skipped';
      if (botEnabled) {
        const ok1 = await uchatSend(base44, contact.phone, 'webinar_post_intro', contactFirstName, [name]);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const ok2 = await uchatSend(base44, contact.phone, 'webinar_post_options', contactFirstName, [name, option1Link, option2Link, option3Link]);
        status = (ok1 && ok2) ? 'sent' : 'failed';
      }

      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, { coupon_sent: true, coupon_sent_at: new Date().toISOString().split('T')[0], attended: true });
      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
        content: (introMessage + '\n---\n' + optionsMessage).substring(0, 500),
        sent_by: 'system', is_automated: true, template_id: 'webinar_post_options', status,
      });
      sent++;
    }

    return Response.json({ ok: true, sent, skipped });
  } catch (error) {
    console.error('sendWebinarCoupon error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
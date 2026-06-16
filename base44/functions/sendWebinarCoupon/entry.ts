import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function toChatId(localPhone) {
  let clean = String(localPhone || '').replace(/[^\d]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return `${clean}@c.us`;
}

function genCoupon(type) {
  const prefix = { investments: 'INV', divorce: 'DIV', retirement: 'RET' }[type] || 'WEB';
  return `${prefix}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}

// Sends webinar coupon — automatic (by webinar_type) or manual (by registration_ids)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { webinar_type, registration_ids } = body;

    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const greenSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' });
    const botEnabled = botSettings[0]?.value === 'true';
    const greenEnabled = greenSettings[0]?.value === 'true';

    const couponRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_coupon', is_active: true });
    const template = couponRecords[0]?.content || 'תודה {name}! קוד ההטבה שלך: {coupon_code}';

    // Select target registrations
    let regs = [];
    if (Array.isArray(registration_ids) && registration_ids.length > 0) {
      for (const id of registration_ids) {
        const r = await base44.asServiceRole.entities.WebinarRegistration.filter({ id });
        if (r[0]) regs.push(r[0]);
      }
    } else if (webinar_type) {
      const all = await base44.asServiceRole.entities.WebinarRegistration.filter({ webinar_type });
      regs = all.filter(r => !r.coupon_sent);
    } else {
      return Response.json({ error: 'missing_target' }, { status: 400 });
    }

    let sent = 0, skipped = 0;
    for (const reg of regs) {
      if (reg.coupon_sent) { skipped++; continue; }
      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) { skipped++; continue; }

      const couponCode = reg.coupon_code || genCoupon(reg.webinar_type);
      const message = template.replaceAll('{name}', contact.full_name || '').replaceAll('{coupon_code}', couponCode);

      let status = 'skipped';
      if (botEnabled && greenEnabled) {
        const res = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: toChatId(contact.phone), message }),
        });
        status = res.ok ? 'sent' : 'failed';
      } else if (botEnabled) {
        status = 'sent';
      }

      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, {
        coupon_code: couponCode,
        coupon_sent: true,
        coupon_sent_at: new Date().toISOString().split('T')[0],
      });
      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
        content: message.substring(0, 500), sent_by: 'system', is_automated: true,
        template_id: 'webinar_coupon', status,
      });
      sent++;
    }

    return Response.json({ ok: true, sent, skipped });
  } catch (error) {
    console.error('sendWebinarCoupon error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
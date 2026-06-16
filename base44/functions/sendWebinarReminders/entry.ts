import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function toChatId(localPhone) {
  let clean = String(localPhone || '').replace(/[^\d]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return `${clean}@c.us`;
}

function fillTemplate(template, values) {
  return String(template || '')
    .replaceAll('{name}', values.name || '')
    .replaceAll('{zoom_link}', values.zoom_link || '');
}

const ZOOM_SUBTYPE = {
  investments: 'zoom_webinar_investments',
  divorce: 'zoom_webinar_divorce',
  retirement: 'zoom_webinar_retirement',
};

// Scheduled — sends 1h-before and at-start webinar reminders
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const greenSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' });
    const botEnabled = botSettings[0]?.value === 'true';
    const greenEnabled = greenSettings[0]?.value === 'true';

    async function getContent(key) {
      const r = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
      return r[0]?.content || '';
    }
    async function getZoom(type) {
      const r = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'external_link', sub_type: ZOOM_SUBTYPE[type], is_active: true });
      return r[0]?.url || '';
    }

    const now = Date.now();
    const regs = await base44.asServiceRole.entities.WebinarRegistration.list('-created_date', 500);

    const tpl1h = await getContent('webinar_reminder_1h');
    const tplStart = await getContent('webinar_reminder_start');
    const zoomCache = {};

    let sent1h = 0, sentStart = 0;

    for (const reg of regs) {
      if (!reg.webinar_date || reg.attended) continue;
      const start = new Date(reg.webinar_date).getTime();
      const minsToStart = (start - now) / 60000;

      let phase = null;
      if (minsToStart <= 60 && minsToStart > 45 && !reg.reminder_1h_sent) phase = '1h';
      else if (minsToStart <= 10 && minsToStart > -10 && !reg.reminder_start_sent) phase = 'start';
      if (!phase) continue;

      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) continue;

      if (zoomCache[reg.webinar_type] === undefined) zoomCache[reg.webinar_type] = await getZoom(reg.webinar_type);
      const zoomLink = zoomCache[reg.webinar_type];

      const template = phase === '1h' ? tpl1h : tplStart;
      const message = fillTemplate(template, { name: contact.full_name, zoom_link: zoomLink });
      if (!message) continue;

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

      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, phase === '1h' ? { reminder_1h_sent: true } : { reminder_start_sent: true });
      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
        content: message.substring(0, 500), sent_by: 'system', is_automated: true,
        template_id: phase === '1h' ? 'webinar_reminder_1h' : 'webinar_reminder_start', status,
      });

      if (phase === '1h') sent1h++; else sentStart++;
    }

    return Response.json({ ok: true, sent1h, sentStart });
  } catch (error) {
    console.error('sendWebinarReminders error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
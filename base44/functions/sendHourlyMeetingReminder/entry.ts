import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function fillMessage(template, contact, meeting) {
  const scheduled = meeting.scheduled_at ? new Date(meeting.scheduled_at) : null;
  const time = scheduled ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(scheduled) : '';
  return template
    .replaceAll('{שם}', contact?.full_name || meeting.contact_name || '')
    .replaceAll('{name}', contact?.full_name || meeting.contact_name || '')
    .replaceAll('{time}', time)
    .replaceAll('{location}', meeting.location || '')
    .replaceAll('{location_details}', meeting.location || '');
}

async function sendWhatsApp(phone, message) {
  let cleanPhone = phone.replace(/[\s\-\+\(\)]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  const chatId = `${cleanPhone}@c.us`;
  const res = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const templates = await base44.asServiceRole.entities.BotContent.filter({ key: 'meeting_day_reminder' });
    const template = templates[0]?.content || '';
    if (!template) return Response.json({ success: false, error: 'Missing BotContent meeting_day_reminder' }, { status: 400 });

    const now = new Date();
    const windowStart = new Date(now.getTime() + 45 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 75 * 60 * 1000);
    const meetings = await base44.asServiceRole.entities.Meeting.filter({ status: 'scheduled', reminder_h1_sent: false });

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const meeting of meetings) {
      if (!meeting.scheduled_at) {
        skipped++;
        continue;
      }
      const scheduledAt = new Date(meeting.scheduled_at);
      if (scheduledAt < windowStart || scheduledAt > windowEnd) {
        skipped++;
        continue;
      }

      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) {
        skipped++;
        continue;
      }

      const message = fillMessage(template, contact, meeting);
      const ok = await sendWhatsApp(contact.phone, message);

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: message,
        sent_by: 'system',
        is_automated: true,
        template_id: 'meeting_day_reminder',
        status: ok ? 'sent' : 'failed',
      });

      if (ok) {
        await base44.asServiceRole.entities.Meeting.update(meeting.id, { reminder_h1_sent: true });
        sent++;
      } else {
        failed++;
      }
    }

    return Response.json({ success: true, sent, failed, skipped, total: meetings.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
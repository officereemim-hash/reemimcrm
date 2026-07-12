import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function toIsraelDateString(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

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
    body: JSON.stringify({ chatId, message, typingTime: 3000 }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const [botRow, greenRow] = await Promise.all([
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' }),
    ]);
    if (botRow[0]?.value !== 'true' || greenRow[0]?.value !== 'true') {
      return Response.json({ ok: true, skipped: 'bot_or_green_disabled' });
    }

    const template = 'מחר בשעה {time} הפגישה שלנו! 📍 {location}\nנתראה, קרנות ראמים 🌿';

    const tomorrow = toIsraelDateString(addDays(new Date(), 1));
    const meetings = await base44.asServiceRole.entities.Meeting.filter({ status: 'scheduled', reminder_d1_sent: false });

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const meeting of meetings) {
      if (!meeting.scheduled_at || toIsraelDateString(new Date(meeting.scheduled_at)) !== tomorrow) {
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
        template_id: 'pre_meeting_reminder',
        status: ok ? 'sent' : 'failed',
      });

      if (ok) {
        await base44.asServiceRole.entities.Meeting.update(meeting.id, { reminder_d1_sent: true });
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
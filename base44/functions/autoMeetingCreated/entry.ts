import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const values = new Uint8Array(32);
  crypto.getRandomValues(values);
  return Array.from(values, value => chars[value % chars.length]).join('');
}

function normalizePhone(phone) {
  let cleanPhone = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  return cleanPhone;
}

async function sendWhatsApp(phone, message) {
  const chatId = `${normalizePhone(phone)}@c.us`;
  const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  return response.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const meeting = payload.data;

    if (!meeting?.id) return Response.json({ error: 'Missing meeting data' }, { status: 400 });
    if (meeting.scheduling_token) return Response.json({ success: true, skipped: true, reason: 'token_exists' });

    const token = generateToken();
    await base44.asServiceRole.entities.Meeting.update(meeting.id, { scheduling_token: token });

    // ה-URL של האפליקציה — עדכן כאן לכתובת הפאבליש של בשמת
    const appUrl = Deno.env.get('BASE44_APP_URL') || 'https://reemimcrm.base44.app';

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id });
    const contact = contacts[0];
    if (!contact?.phone) return Response.json({ success: true, token_created: true, whatsapp_sent: false, note: 'Contact phone missing' });

    const scheduleUrl = `${appUrl.replace(/\/$/, '')}/schedule?token=${token}`;
    const message = `שלום ${contact.full_name || ''}! לתיאום הפגישה שלנו לחצי כאן:\n${scheduleUrl}`;
    const ok = await sendWhatsApp(contact.phone, message);

    await base44.asServiceRole.entities.Communication.create({
      contact_id: contact.id,
      type: 'whatsapp',
      direction: 'outbound',
      content: message,
      sent_by: 'system',
      is_automated: true,
      status: ok ? 'sent' : 'failed',
    });

    return Response.json({ success: true, token_created: true, whatsapp_sent: ok });
  } catch (error) {
    console.error('autoMeetingCreated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
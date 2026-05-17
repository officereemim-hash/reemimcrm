import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  let cleanPhone = phone.replace(/[\s\-\+]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  const chatId = `${cleanPhone}@c.us`;

  const res = await fetch(
    `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    }
  );
  return res.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    const contacts = await base44.asServiceRole.entities.Contact.list();

    const birthdayContacts = contacts.filter(c => {
      if (!c.birth_date) return false;
      if (['archived', 'not_relevant'].includes(c.status)) return false;
      const bd = new Date(c.birth_date);
      return bd.getMonth() + 1 === todayMonth && bd.getDate() === todayDay;
    });

    let sent = 0;
    let failed = 0;
    for (const contact of birthdayContacts) {
      if (!contact.phone) continue;

      const message = `יום הולדת שמח ${contact.full_name}! 🎂 מאחלים לך יום מיוחד ומלא שמחה. צוות קרנות ראמים`;

      const ok = await sendWhatsApp(contact.phone, message);

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: message,
        sent_by: 'system',
        is_automated: true,
        template_id: 'birthday_v1',
        status: ok ? 'sent' : 'failed',
      });

      if (ok) {
        await base44.asServiceRole.entities.Contact.update(contact.id, {
          last_contact_date: today.toISOString().split('T')[0],
          last_bot_interaction_at: today.toISOString(),
        });
        sent++;
      } else {
        failed++;
        console.error(`Failed to send birthday greeting to ${contact.phone}`);
      }
    }

    return Response.json({ success: true, sent, failed, total: birthdayContacts.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
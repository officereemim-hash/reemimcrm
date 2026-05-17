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

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();

    const contacts = await base44.asServiceRole.entities.Contact.list();

    const dueContacts = contacts.filter(c =>
      c.annual_followup_date === todayStr &&
      c.status === 'completed' &&
      !['closed', 'not_relevant'].includes(c.bot_status)
    );

    let tasksCreated = 0;
    let whatsappSent = 0;
    let whatsappFailed = 0;

    for (const contact of dueContacts) {
      // Create task for bar regardless of WhatsApp success
      await base44.asServiceRole.entities.Task.create({
        contact_id: contact.id,
        title: `שיחת שירות שנתית — ${contact.full_name}`,
        type: 'annual_followup',
        category: 'sales',
        status: 'open',
        priority: 'high',
        assigned_to: 'bar',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        auto_generated: true,
      });
      tasksCreated++;

      if (!contact.phone) continue;

      const message = `שלום ${contact.full_name}! 🌿 עבר שנה מאז הטיפול שלנו. נשמח לשיחת שירות שנתית. נקבע?`;

      const ok = await sendWhatsApp(contact.phone, message);

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: message,
        sent_by: 'system',
        is_automated: true,
        template_id: 'annual_v1',
        status: ok ? 'sent' : 'failed',
      });

      if (ok) {
        await base44.asServiceRole.entities.Contact.update(contact.id, {
          bot_status: 'waiting_user_reply',
          last_bot_interaction_at: now.toISOString(),
        });
        whatsappSent++;
      } else {
        console.error(`Failed to send annual followup WhatsApp to ${contact.phone}`);
        whatsappFailed++;
      }
    }

    return Response.json({ success: true, tasksCreated, whatsappSent, whatsappFailed, total: dueContacts.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
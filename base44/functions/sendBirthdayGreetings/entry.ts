import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
    for (const contact of birthdayContacts) {
      // Log the birthday greeting communication
      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: `יום הולדת שמח ${contact.full_name}! 🎂 מאחלים לך יום מיוחד ומלא שמחה. צוות קרנות ראמים`,
        sent_by: 'system',
        is_automated: true,
        template_id: 'birthday_v1',
        status: 'sent',
      });

      await base44.asServiceRole.entities.Contact.update(contact.id, {
        last_contact_date: today.toISOString().split('T')[0],
        last_bot_interaction_at: today.toISOString(),
      });

      sent++;
    }

    return Response.json({ success: true, sent, total: birthdayContacts.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const todayStr = new Date().toISOString().split('T')[0];

    const contacts = await base44.asServiceRole.entities.Contact.list();

    const dueContacts = contacts.filter(c =>
      c.annual_followup_date === todayStr &&
      c.status === 'completed' &&
      !['closed', 'not_relevant'].includes(c.bot_status)
    );

    let tasksCreated = 0;
    for (const contact of dueContacts) {
      // Create task for bar
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

      // Log communication
      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: `שלום ${contact.full_name}! 🌿 עבר שנה מאז הטיפול שלנו. נשמח לשיחת שירות שנתית. נקבע?`,
        sent_by: 'system',
        is_automated: true,
        template_id: 'annual_v1',
        status: 'sent',
      });

      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        last_bot_interaction_at: new Date().toISOString(),
      });

      tasksCreated++;
    }

    return Response.json({ success: true, tasksCreated, total: dueContacts.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
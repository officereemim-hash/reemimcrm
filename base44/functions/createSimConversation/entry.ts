import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function normalizeIntlPhone(phone) {
  let clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return clean;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { phone = '', email = '', name = '', contact_id = '' } = await req.json();
    const intlPhone = normalizeIntlPhone(phone);

    // השיחה נוצרת בצד השרת כדי שה-webhook יוכל להוסיף אליה הודעות (Fast Path)
    const conversation = await base44.asServiceRole.agents.createConversation({
      agent_name: 'bot_reemim',
      metadata: {
        name: name || `בדיקה ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}`,
        source: 'test',
        phone: intlPhone,
        email,
        ...(contact_id ? { contact_id } : {}),
      },
    });

    if (intlPhone) {
      // עדכון המיפוי טלפון→שיחה כך שה-webhook ינתב לשיחה החדשה
      const key = `phone_conv_${intlPhone}`;
      const existing = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      if (existing[0]) {
        await base44.asServiceRole.entities.SystemSetting.update(existing[0].id, { value: conversation.id });
      } else {
        await base44.asServiceRole.entities.SystemSetting.create({
          category: 'flow',
          key,
          label: `שיחת בוט לטלפון ${intlPhone}`,
          value: conversation.id,
          value_type: 'text',
        });
      }

      // ה-webhook מעדיף את conversation_id שעל הפנייה הפעילה — חייבים לעדכן גם אותו
      let contacts = await base44.asServiceRole.entities.Contact.filter({ phone: intlPhone });
      if (contacts.length === 0) contacts = await base44.asServiceRole.entities.Contact.filter({ phone: '0' + intlPhone.substring(3) });
      if (contacts.length === 0) contacts = await base44.asServiceRole.entities.Contact.filter({ phone: '+' + intlPhone });
      const contact = contacts[0];
      if (contact) {
        const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id }, '-created_date', 20);
        const openRequest = requests.find(r => !['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(r.status));
        if (openRequest) {
          await base44.asServiceRole.entities.ServiceRequest.update(openRequest.id, { conversation_id: conversation.id });
        }
      }
    }

    return Response.json({ conversation });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
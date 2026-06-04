import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function normalizePhone(phone) {
  let cleanPhone = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  return cleanPhone;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const serviceRequest = body.data || body.record || body;
    const previousServiceRequest = body.old_data || body.previousRecord || body.previous || {};

    if (!serviceRequest?.id || !serviceRequest?.contact_id) {
      return Response.json({ ok: true, skipped: 'no_record' });
    }

    const newStatus = serviceRequest.status;
    const oldStatus = previousServiceRequest.status;
    const newPending = serviceRequest.pending_bot_message;
    const oldPending = previousServiceRequest.pending_bot_message;
    const statusChanged = newStatus && newStatus !== oldStatus;
    const pendingChanged = newPending && newPending !== oldPending;

    if (!statusChanged && !pendingChanged) {
      return Response.json({ ok: true, skipped: 'no_change' });
    }

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: serviceRequest.contact_id });
    const contact = contacts[0];
    if (!contact?.phone) {
      return Response.json({ ok: true, skipped: 'no_phone' });
    }

    const phone = normalizePhone(contact.phone);
    const chatId = `${phone}@c.us`;
    const serviceType = serviceRequest.service_type || '';
    const sendMessageUrl = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`;

    async function getContent(key) {
      const records = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
      return records[0]?.content || '';
    }

    async function getUrl(contentType, subType) {
      const records = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: contentType, sub_type: subType, is_active: true });
      if (records[0]) return records[0].url || '';

      const fallbackRecords = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: contentType, service_type: serviceType, is_active: true });
      return fallbackRecords[0]?.url || '';
    }

    async function sendWhatsApp(message) {
      if (!message) return false;
      const response = await fetch(sendMessageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
      });
      return response.ok;
    }

    async function logCommunication(content, templateId, sent) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id: serviceRequest.contact_id,
        type: 'whatsapp',
        direction: 'outbound',
        content: String(content || '').substring(0, 500),
        sent_by: 'system',
        is_automated: true,
        template_id: templateId,
        status: sent ? 'sent' : 'failed',
      });
    }

    if (pendingChanged && newPending === 'send_basmat_schedule') {
      const intro = await getContent('schedule_intro');
      const message = intro || `היי ${contact.full_name || ''}! 😊\nנשמח לקבוע פגישה עם בשמת.\nאיפה הכי נוח?\n1. מודיעין\n2. פתח תקווה\n3. זום\n4. טלפון`;
      const sent = await sendWhatsApp(message);
      await logCommunication(message, 'schedule_intro', sent);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        last_bot_interaction_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { pending_bot_message: '' });
      return Response.json({ ok: true, action: 'send_basmat_schedule' });
    }

    if (statusChanged && newStatus === 'quote_sent') {
      const quoteContent = await getContent('quote_sent');
      const quoteUrl = await getUrl('pdf', `quote_${serviceType}`);
      const message = (quoteContent || 'שמחתי לדבר! הנה הצעת המחיר 📄').replace('{link}', quoteUrl).replace('{name}', contact.full_name || '');
      const sent = await sendWhatsApp(message);
      if (quoteUrl && !message.includes(quoteUrl)) await sendWhatsApp(quoteUrl);
      await logCommunication(message, 'quote_sent', sent);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        last_bot_interaction_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.Task.create({
        contact_id: contact.id,
        service_request_id: serviceRequest.id,
        title: `פולו-אפ הצעת מחיר — ${contact.full_name || ''}`,
        type: 'followup',
        category: 'sales',
        assigned_to: 'bar',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        auto_generated: true,
      });
      return Response.json({ ok: true, action: 'quote_sent', whatsapp_sent: sent });
    }

    if (statusChanged && newStatus === 'closed_lost') {
      const reviewsUrl = await getUrl('external_link', 'reviews_page');
      const qaUrl = await getUrl('external_link', 'qa_page');
      const reasonTemplate = await getContent('not_interested_reason');
      const valueTemplate = await getContent('value_proposition');
      const optInTemplate = await getContent('opt_in_future');
      const firstMessage = (reasonTemplate || `מבינים לגמרי 😊`).replace('{name}', contact.full_name || '');
      const secondMessage = valueTemplate.replace('{reviews_link}', reviewsUrl).replace('{qa_link}', qaUrl);
      const sent = await sendWhatsApp(firstMessage);
      if (secondMessage) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendWhatsApp(secondMessage);
      }
      if (optInTemplate) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendWhatsApp(optInTemplate);
      }
      await logCommunication(firstMessage, 'not_interested_reason', sent);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'not_relevant',
        opt_in_future: true,
        future_followup_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        last_bot_interaction_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, action: 'not_interested', whatsapp_sent: sent });
    }

    return Response.json({ ok: true, skipped: 'no_matching_action' });
  } catch (error) {
    console.error('autoServiceRequestUpdated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
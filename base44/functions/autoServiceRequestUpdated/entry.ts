import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function normalizePhone(phone) {
  let cleanPhone = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  return cleanPhone;
}

function fillTemplate(template, values) {
  return String(template || '')
    .replaceAll('{name}', values.name || '')
    .replaceAll('{שם}', values.name || '')
    .replaceAll('{time}', values.time || '')
    .replaceAll('{caller_phone}', values.caller_phone || '')
    .replaceAll('{link}', values.link || '')
    .replaceAll('{reviews_link}', values.reviews_link || '')
    .replaceAll('{qa_link}', values.qa_link || '');
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
      if (subType) {
        const records = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: contentType, sub_type: subType, is_active: true });
        if (records[0]) return records[0].url || '';
      }

      const fallbackRecords = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: contentType, service_type: serviceType, is_active: true });
      return fallbackRecords[0]?.url || '';
    }

    async function getSetting(key) {
      const records = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      return records[0]?.value || '';
    }

    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';
    const greenApiEnabled = (await getSetting('green_api_enabled')) === 'true';

    async function sendWhatsApp(message) {
      if (!message) return { status: 'skipped', errorDetail: 'empty_message' };
      if (!botEnabled) {
        return { status: 'skipped', errorDetail: 'log_only_whatsapp_bot_disabled' };
      }
      if (!greenApiEnabled) {
        return { status: 'sent', errorDetail: 'simulated_green_api_disabled' };
      }

      const response = await fetch(sendMessageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
      });
      const responseText = await response.text();
      return {
        status: response.ok ? 'sent' : 'failed',
        errorDetail: response.ok ? '' : responseText.substring(0, 500),
      };
    }

    async function addMessageToConversation(content, result) {
      if (!content || result?.status === 'skipped') return;

      const conversationId = serviceRequest.conversation_id;
      if (!conversationId) {
        console.log('conversation_injection_skipped: no_conversation_id');
        return;
      }

      try {
        const conv = await base44.asServiceRole.agents.getConversation(conversationId);
        const hasUserMessage = (conv.messages || []).some((m) => m.role === 'user');
        if (!hasUserMessage) {
          console.log('conversation_injection_skipped: no_user_message');
          return;
        }
        await base44.asServiceRole.agents.addMessage(conv, { role: 'assistant', content });
        console.log('message_added_to_conversation');
      } catch (err) {
        // Simulator conversations belong to the app user — injection blocked, Communication record already saved
        console.warn('conversation_injection_skipped:', err.message);
      }
    }

    async function logCommunication(content, templateId, result) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id: serviceRequest.contact_id,
        type: 'whatsapp',
        direction: 'outbound',
        content: String(content || '').substring(0, 500),
        sent_by: 'system',
        is_automated: true,
        template_id: templateId,
        status: result?.status || 'skipped',
        error_detail: result?.errorDetail || '',
      });
      await addMessageToConversation(content, result);
    }

    if (pendingChanged && newPending === 'send_basmat_schedule') {
      const intro = await getContent('schedule_intro');
      const message = intro || 'מעולה, השלב הבא הוא תיאום פגישה עם בשמת. איך תרצה לקיים את הפגישה? זום / מודיעין / פתח תקווה / טלפון';
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
      const intro = await getContent('schedule_intro');
      const message = fillTemplate(intro || 'מעולה, שמחנו לשמוע שתרצה להתקדם. השלב הבא הוא תיאום פגישה עם בשמת.', {
        name: contact.full_name || '',
      });
      const sent = await sendWhatsApp(message);
      await logCommunication(message, 'schedule_intro', sent);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        last_bot_interaction_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, action: 'route_a_interested', whatsapp_sent: sent });
    }

    if (statusChanged && newStatus === 'phone_meeting') {
      const phoneTemplate = await getContent('meeting_scheduled_phone');
      const callerPhone = await getSetting('coordinator_phone') || 'מספר המתאמת יישלח בהמשך';
      let message = fillTemplate(phoneTemplate, {
        name: contact.full_name || '',
        time: serviceRequest.last_appointment_time_str || '',
        caller_phone: callerPhone,
      });
      if (!serviceRequest.last_appointment_time_str) {
        message = message.replace(/\s*במועד:\s*\n\s*/g, '\n');
      }
      const sent = await sendWhatsApp(message);
      await logCommunication(message, 'meeting_scheduled_phone', sent);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_agent',
        last_bot_interaction_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, action: 'phone_meeting_scheduled', whatsapp_sent: sent });
    }

    if (statusChanged && newStatus === 'awaiting_client_decision') {
      const quoteContent = await getContent('quote_sent');
      const quoteUrl = await getUrl('pdf', 'quote_' + serviceType);
      const message = fillTemplate(quoteContent || 'שמחתי לדבר! הנה הצעת המחיר כמובקש 📄 {link}', {
        name: contact.full_name || '',
        link: quoteUrl,
      });
      const sent = await sendWhatsApp(message);
      if (quoteUrl && !message.includes(quoteUrl)) {
        const linkResult = await sendWhatsApp(quoteUrl);
        await logCommunication(quoteUrl, 'quote_sent_link', linkResult);
      }
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
      return Response.json({ ok: true, action: 'route_b_thinking', whatsapp_sent: sent });
    }

    if (statusChanged && (newStatus === 'followup_active' || newStatus === 'closed_lost')) {
      const reviewsUrl = await getUrl('external_link', 'reviews_page');
      const qaUrl = await getUrl('external_link', 'qa_page');
      const reasonTemplate = await getContent('not_interested_reason');
      const valueTemplate = await getContent('value_proposition');
      const optInTemplate = await getContent('opt_in_future');
      const firstMessage = fillTemplate(reasonTemplate || 'מבינים לגמרי 🙏 נשמח לדעת בקצרה מה הסיבה שהשירות פחות מתאים כרגע.', { name: contact.full_name || '' });
      const secondMessage = fillTemplate(valueTemplate, { reviews_link: reviewsUrl, qa_link: qaUrl });
      const thirdMessage = fillTemplate(optInTemplate, { name: contact.full_name || '' });
      const sent = await sendWhatsApp(firstMessage);
      if (secondMessage) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const secondResult = await sendWhatsApp(secondMessage);
        await logCommunication(secondMessage, 'value_proposition', secondResult);
      }
      if (thirdMessage) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const thirdResult = await sendWhatsApp(thirdMessage);
        await logCommunication(thirdMessage, 'opt_in_future', thirdResult);
      }
      await logCommunication(firstMessage, 'not_interested_reason', sent);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'not_relevant',
        opt_in_future: true,
        future_followup_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        last_bot_interaction_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, action: 'route_c_not_interested', whatsapp_sent: sent });
    }

    return Response.json({ ok: true, skipped: 'no_matching_action' });
  } catch (error) {
    console.error('autoServiceRequestUpdated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
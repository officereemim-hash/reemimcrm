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
    .replaceAll('{qa_link}', values.qa_link || '')
    .replaceAll('{zoom_link}', values.zoom_link || '')
    .replaceAll('{waze_link}', values.waze_link || '')
    .replaceAll('{meeting_link}', values.meeting_link || '')
    .replaceAll('{questionnaire_link}', values.questionnaire_link || '')
    .replaceAll('{quote_link}', values.quote_link || '')
    .replaceAll('{summary}', values.summary || '');
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
    const questionnaireFilled = serviceRequest.questionnaire_completed === true && previousServiceRequest.questionnaire_completed !== true;

    if (!statusChanged && !pendingChanged && !questionnaireFilled) {
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

    // מיפוי תחום → sub_type של שאלון שורנס המתאים
    const SHORANSS_SUBTYPE = {
      retirement: 'shoranss_retirement',
      economic_feasibility: 'shoranss_economic',
      investments: 'shoranss_investments',
      divorce_split: 'shoranss_divorce',
      tax_advisory: 'shoranss_tax',
      annual_service_call: 'shoranss_retirement',
    };

    async function getQuestionnaireUrl() {
      const subType = SHORANSS_SUBTYPE[serviceType];
      if (!subType) return '';
      const records = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'questionnaire', sub_type: subType, is_active: true });
      return records[0]?.url || '';
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

    // הגנה מכפילות: אם אותה הודעה כבר נשלחה לאיש הקשר ב-2 הדקות האחרונות — מדלגים
    async function alreadySentRecently(templateId) {
      const recent = await base44.asServiceRole.entities.Communication.filter(
        { contact_id: serviceRequest.contact_id, template_id: templateId },
        '-created_date', 1
      );
      return !!(recent[0] && Date.now() - new Date(recent[0].created_date).getTime() < 2 * 60 * 1000);
    }

    // שליפת הסיכום שמילאה המתאמת בשיחת המכירה הטלפונית — אם אין סיכום, מוחזר ריק ולא נשלח
    async function getPhoneSummaryBlock() {
      const meetings = await base44.asServiceRole.entities.Meeting.filter(
        { contact_id: serviceRequest.contact_id, type: 'intro_sale' },
        '-scheduled_at', 5
      );
      const summary = meetings.find(m => m.summary && m.summary.trim())?.summary?.trim() || '';
      if (!summary) return '';
      const blockTemplate = await getContent('phone_call_summary_block');
      return blockTemplate ? blockTemplate.replaceAll('{summary}', summary) : summary;
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

    // שליחת קובץ (PDF/תמונה/וידאו) דרך Green API — לפי URL קבוע מ-ServiceContent
    async function sendWhatsAppFile(fileUrl, fileName) {
      if (!fileUrl) return { status: 'skipped', errorDetail: 'empty_file' };
      if (!botEnabled) return { status: 'skipped', errorDetail: 'log_only_whatsapp_bot_disabled' };
      if (!greenApiEnabled) return { status: 'sent', errorDetail: 'simulated_green_api_disabled' };

      const fileApiUrl = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendFileByUrl/${API_TOKEN}`;
      const response = await fetch(fileApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, urlFile: fileUrl, fileName: fileName || 'file', caption: '' }),
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

    if (statusChanged && newStatus === 'interested') {
      if (await alreadySentRecently('schedule_intro')) {
        return Response.json({ ok: true, skipped: 'duplicate_event' });
      }
      const intro = await getContent('schedule_intro');
      const quoteUrl = await getUrl('pdf', 'quote_' + serviceType);
      let message = fillTemplate(intro || 'מעולה, שמחנו לשמוע שתרצה להתקדם. השלב הבא הוא תיאום פגישה עם בשמת.', {
        name: contact.full_name || '',
        summary: await getPhoneSummaryBlock(),
        quote_link: quoteUrl,
      });
      if (!quoteUrl) {
        // אם אין קישור להצעה — מסירים את שורות ההצעה מההודעה
        message = message.split('\n').filter(line => !line.includes('הצעת המחיר')).join('\n');
      }
      message = message.replace(/\n{3,}/g, '\n\n');
      const sent = await sendWhatsApp(message);
      await logCommunication(message, 'schedule_intro', sent);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        last_bot_interaction_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, action: 'route_a_interested', whatsapp_sent: sent });
    }

    if (statusChanged && newStatus === 'phone_meeting') {
      if (await alreadySentRecently('meeting_scheduled_phone')) {
        return Response.json({ ok: true, skipped: 'duplicate_event' });
      }
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

    const meetingStatuses = ['meeting_scheduled', 'meeting_scheduled_frontal', 'meeting_scheduled_zoom'];
    if (statusChanged && meetingStatuses.includes(newStatus)) {
      const apptType = serviceRequest.last_appointment_type || '';

      let templateKey = 'meeting_scheduled_zoom';
      if (serviceType === 'divorce_split') templateKey = 'meeting_scheduled_divorce_split';
      else if (serviceType === 'annual_service_call') templateKey = 'meeting_scheduled_annual_service';
      else if (newStatus === 'meeting_scheduled_frontal') templateKey = apptType.includes('petah_tikva') ? 'meeting_scheduled_petah_tikva' : 'meeting_scheduled_modiin';
      else if (newStatus === 'meeting_scheduled_zoom') templateKey = 'meeting_scheduled_zoom';
      else if (apptType === 'modiin') templateKey = 'meeting_scheduled_modiin';
      else if (apptType.includes('petah_tikva')) templateKey = 'meeting_scheduled_petah_tikva';
      else if (apptType === 'phone') templateKey = 'meeting_scheduled_phone';

      if (await alreadySentRecently(templateKey)) {
        return Response.json({ ok: true, skipped: 'duplicate_event' });
      }

      // קישור הפגישה האמיתי (אם נשמר ע"י Cal.com), אחרת חדר הזום הקבוע
      let meetingLink = '';
      if (serviceRequest.meeting_id) {
        const meetings = await base44.asServiceRole.entities.Meeting.filter({ id: serviceRequest.meeting_id });
        meetingLink = meetings[0]?.calendar_link || '';
      }
      const zoomLink = meetingLink || await getUrl('external_link', 'zoom_personal_room');
      const wazeLink = templateKey === 'meeting_scheduled_modiin'
        ? await getUrl('external_link', 'waze_modiin')
        : templateKey === 'meeting_scheduled_petah_tikva'
          ? await getUrl('external_link', 'waze_petah_tikva')
          : '';

      const values = {
        name: contact.full_name || '',
        time: serviceRequest.last_appointment_time_str || '',
        zoom_link: zoomLink,
        waze_link: wazeLink,
        meeting_link: meetingLink || zoomLink,
        caller_phone: await getSetting('coordinator_phone'),
      };

      // 1. אישור פגישה
      const confirmTemplate = await getContent(templateKey);
      const confirmMessage = fillTemplate(confirmTemplate || '{name}, הפגישה עם בשמת נקבעה בהצלחה במועד: {time}', values);
      const confirmResult = await sendWhatsApp(confirmMessage);
      await logCommunication(confirmMessage, templateKey, confirmResult);

      // 2. שאלון שורנס (הסיכום + הצעת המחיר כבר נשלחו בשלב quote_sent — אין כפילות כאן)
      // אם התחום לא מזוהה — לא שולחים שאלון אקראי; שולחים בירור תחום ומסמנים pending_service_clarify
      const questionnaireUrl = await getQuestionnaireUrl();
      if (!questionnaireUrl) {
        const clarifyTemplate = await getContent('service_type_clarify');
        const clarifyMessage = fillTemplate(clarifyTemplate || 'לאיזה תחום הפנייה? 1) ייעוץ פרישה 2) היתכנות כלכלית 3) תכנון השקעות 4) איזון אקטוארי בגירושין 5) זכויות מס', values);
        await new Promise(resolve => setTimeout(resolve, 1200));
        const clarifyResult = await sendWhatsApp(clarifyMessage);
        await logCommunication(clarifyMessage, 'service_type_clarify', clarifyResult);
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { pending_service_clarify: true });
        await base44.asServiceRole.entities.Contact.update(contact.id, {
          bot_status: 'waiting_user_reply',
          last_bot_interaction_at: new Date().toISOString(),
        });
        return Response.json({ ok: true, action: 'meeting_scheduled_clarify_service', template: templateKey });
      }

      const questionnaireTemplate = await getContent('questionnaire_request');
      if (questionnaireTemplate) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const questionnaireMessage = fillTemplate(questionnaireTemplate, { ...values, questionnaire_link: questionnaireUrl });
        const questionnaireResult = await sendWhatsApp(questionnaireMessage);
        await logCommunication(questionnaireMessage, 'questionnaire_request', questionnaireResult);
      }

      // עצירה כאן! בקשת המסמכים תישלח רק לאחר סימון questionnaire_completed=true

      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        shoranss_questionnaire: 'sent',
        last_bot_interaction_at: new Date().toISOString(),
      });

      return Response.json({ ok: true, action: 'meeting_scheduled_sequence', template: templateKey });
    }

    if (statusChanged && newStatus === 'quote_sent') {
      if (await alreadySentRecently('quote_sent')) {
        return Response.json({ ok: true, skipped: 'duplicate_event' });
      }
      const quoteContent = await getContent('quote_sent');
      const quoteUrl = await getUrl('pdf', 'quote_' + serviceType);
      const message = fillTemplate(quoteContent || 'שמחתי לדבר! הנה הצעת המחיר כמובקש 📄 {link}', {
        name: contact.full_name || '',
        link: quoteUrl,
        summary: await getPhoneSummaryBlock(),
      }).replace(/\n{3,}/g, '\n\n');
      const sent = await sendWhatsApp(message);
      if (quoteUrl && !message.includes(quoteUrl)) {
        // אם הצעת המחיר היא קובץ PDF ישיר — שולחים כקובץ מצורף; אחרת כקישור טקסט
        const isPdfFile = /\.pdf(\?.*)?$/i.test(quoteUrl);
        if (isPdfFile) {
          await new Promise(resolve => setTimeout(resolve, 1200));
          const fileResult = await sendWhatsAppFile(quoteUrl, `הצעת מחיר - ${contact.full_name || ''}.pdf`);
          await logCommunication(quoteUrl, 'quote_sent_file', fileResult);
        } else {
          const linkResult = await sendWhatsApp(quoteUrl);
          await logCommunication(quoteUrl, 'quote_sent_link', linkResult);
        }
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
      if (await alreadySentRecently('not_interested_reason')) {
        return Response.json({ ok: true, skipped: 'duplicate_event' });
      }
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

    if (questionnaireFilled) {
      const values = { name: contact.full_name || '' };

      // 1. תודה על מילוי השאלון
      const thanksTemplate = await getContent('questionnaire_completed_thanks');
      if (thanksTemplate) {
        const thanksMessage = fillTemplate(thanksTemplate, values);
        const thanksResult = await sendWhatsApp(thanksMessage);
        await logCommunication(thanksMessage, 'questionnaire_completed_thanks', thanksResult);
      }

      // 2. בקשת מסמכים + לאן לשלוח
      const docsTemplate = await getContent('documents_request');
      if (docsTemplate) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const docsMessage = fillTemplate(docsTemplate, values);
        const docsResult = await sendWhatsApp(docsMessage);
        await logCommunication(docsMessage, 'documents_request', docsResult);
      }

      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        shoranss_questionnaire: 'filled',
        last_bot_interaction_at: new Date().toISOString(),
      });

      return Response.json({ ok: true, action: 'questionnaire_completed_docs' });
    }

    return Response.json({ ok: true, skipped: 'no_matching_action' });
  } catch (error) {
    console.error('autoServiceRequestUpdated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
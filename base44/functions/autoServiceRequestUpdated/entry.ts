import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';
async function getUchatTemplateName(base44, key) {
  const r = await base44.asServiceRole.entities.SystemSetting.filter({ key: `uchat_tpl_${key}` });
  return r[0]?.value || '';
}
async function uchatTemplateNamespace(templateName) {
  const listOnce = async () => {
    try {
      const r = await fetch(`${UCHAT_BASE}/whatsapp-template/list`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } });
      if (!r.ok) return null;
      const j = await r.json();
      const arr = j?.data || j?.templates || j || [];
      const t = (Array.isArray(arr) ? arr : []).find(x => x?.name === templateName || x?.template_name === templateName);
      return t?.namespace || null;
    } catch { return null; }
  };
  let ns = await listOnce();
  if (!ns) { try { await fetch(`${UCHAT_BASE}/whatsapp-template/sync`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } }); } catch {} ns = await listOnce(); }
  return ns;
}
async function uchatSendTemplate(phone972, firstName, templateName, bodyParams) {
  const namespace = await uchatTemplateNamespace(templateName);
  if (!namespace) { console.error(`uchat: template '${templateName}' not found/synced`); return null; }
  const params = {};
  (bodyParams || []).forEach((v, i) => { params[`BODY_{{${i + 1}}}`] = String(v ?? ''); });
  const res = await fetch(`${UCHAT_BASE}/subscriber/send-whatsapp-template-by-user-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
    body: JSON.stringify({ user_id: phone972, create_if_not_found: 'yes', contact: { first_name: firstName || '' }, content: { namespace, name: templateName, lang: 'he', params } }),
  });
  if (!res.ok) { console.error('uchat template http', res.status, await res.text().catch(() => '')); return null; }
  const j = await res.json().catch(() => ({}));
  const mid = j?.mid || j?.data?.mid || null;
  if (j?.status === 'ok' && mid) return { ...j, mid };
  console.error('uchat template not ok:', JSON.stringify(j));
  return null;
}
async function uchatSend(base44, phone, tplKey, firstName, params) {
  let p = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (p.startsWith('0')) p = '972' + p.substring(1);
  const tplName = await getUchatTemplateName(base44, tplKey);
  if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
  return !!(await uchatSendTemplate(p, firstName, tplName, params || []));
}

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
    .replaceAll('{summary}', values.summary || '')
    .replaceAll('{car_plate}', values.car_plate || '');
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
    const documentsJustReceived = serviceRequest.documents_received === true && previousServiceRequest.documents_received !== true;

    if (!statusChanged && !pendingChanged && !questionnaireFilled && !documentsJustReceived) {
      return Response.json({ ok: true, skipped: 'no_change' });
    }

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: serviceRequest.contact_id });
    const contact = contacts[0];
    if (!contact?.phone) {
      return Response.json({ ok: true, skipped: 'no_phone' });
    }

    const phone = normalizePhone(contact.phone);
    const serviceType = serviceRequest.service_type || '';
    const firstName = (contact.full_name || '').split(' ')[0];

    async function getContent(key) {
      const records = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
      return records[0]?.content || '';
    }

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

    async function alreadySentRecently(templateId) {
      const recent = await base44.asServiceRole.entities.Communication.filter(
        { contact_id: serviceRequest.contact_id, template_id: templateId },
        '-created_date', 1
      );
      return !!(recent[0] && Date.now() - new Date(recent[0].created_date).getTime() < 2 * 60 * 1000);
    }

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

    async function sendWhatsApp(message, uchatTplKey, uchatParams) {
      if (!message) return { status: 'skipped', errorDetail: 'empty_message' };
      if (!botEnabled) return { status: 'skipped', errorDetail: 'log_only_whatsapp_bot_disabled' };
      if (uchatTplKey) {
        const ok = await uchatSend(base44, contact.phone, uchatTplKey, firstName, uchatParams || []);
        return { status: ok ? 'sent' : 'failed', errorDetail: ok ? '' : 'uchat_send_failed' };
      }
      return { status: 'skipped', errorDetail: 'no_template_key' };
    }

    async function sendWhatsAppFile(fileUrl, fileName) {
      if (!fileUrl) return { status: 'skipped', errorDetail: 'empty_file' };
      if (!botEnabled) return { status: 'skipped', errorDetail: 'log_only_whatsapp_bot_disabled' };
      return { status: 'skipped', errorDetail: 'uchat_no_file_support_yet' };
    }

    async function addMessageToConversation(content, result) {
      if (!content || result?.status === 'skipped') return;
      const conversationId = serviceRequest.conversation_id;
      if (!conversationId) { console.log('conversation_injection_skipped: no_conversation_id'); return; }
      try {
        const conv = await base44.asServiceRole.agents.getConversation(conversationId);
        const hasUserMessage = (conv.messages || []).some((m) => m.role === 'user');
        if (!hasUserMessage) { console.log('conversation_injection_skipped: no_user_message'); return; }
        await base44.asServiceRole.agents.addMessage(conv, { role: 'assistant', content });
        console.log('message_added_to_conversation');
      } catch (err) {
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
      const sent = await sendWhatsApp(message, 'schedule_intro', [contact.full_name || '']);
      await logCommunication(message, 'schedule_intro', sent);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        last_bot_interaction_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { pending_bot_message: '' });
      return Response.json({ ok: true, action: 'send_basmat_schedule' });
    }

    if (statusChanged && newStatus === 'awaiting_client_decision') {
      if (await alreadySentRecently('quote_sent')) {
        return Response.json({ ok: true, skipped: 'duplicate_event' });
      }

      const phoneSummary = await getPhoneSummaryBlock();
      const quoteUrl = await getUrl('pdf', 'quote_' + serviceType);
      const quoteContent = await getContent('quote_sent');
      let message = fillTemplate(quoteContent || 'שמחתי לדבר! הנה הצעת המחיר כמובקש 📄 {link}\n\nמה תרצה לעשות?\n✅ *מעוניין* — להתקדם לתיאום פגישה\n🤔 *אחשוב* — ניתן לך זמן ונחזור אליך\n❌ *לא מעוניין* — לסגור את הפנייה', {
        name: contact.full_name || '',
        link: quoteUrl,
        summary: phoneSummary,
      }).replace(/\n{3,}/g, '\n\n');

      const sent = await sendWhatsApp(message, 'quote_sent', [contact.full_name || '', quoteUrl]);
      await logCommunication(message, 'quote_sent', sent);

      if (quoteUrl) {
        const isPdfFile = /\.pdf(\?.*)?$/i.test(quoteUrl);
        if (isPdfFile) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const fileResult = await sendWhatsAppFile(quoteUrl, `הצעת מחיר - ${contact.full_name || ''}.pdf`);
          await logCommunication(quoteUrl, 'quote_sent_file', fileResult);
        }
      }

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

      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        last_bot_interaction_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, action: 'route_b_awaiting_decision', whatsapp_sent: sent });
    }

    if (statusChanged && newStatus === 'interested') {
      if (serviceRequest.source === 'webinar') {
        return Response.json({ ok: true, skipped: 'webinar_handled_by_webinar_flow' });
      }
      if (await alreadySentRecently('schedule_intro')) {
        return Response.json({ ok: true, skipped: 'duplicate_event' });
      }

      const isWebinar = false;
      const alreadyGotQuote = await alreadySentRecently('quote_sent');

      const intro = await getContent('schedule_intro');
      const phoneSummary = (isWebinar || alreadyGotQuote) ? '' : await getPhoneSummaryBlock();
      const quoteUrl = (isWebinar || alreadyGotQuote) ? '' : await getUrl('pdf', 'quote_' + serviceType);
      let message = fillTemplate(intro || 'מעולה, שמחנו לשמוע שתרצה להתקדם. השלב הבא הוא תיאום פגישה עם בשמת.', {
        name: contact.full_name || '',
        summary: phoneSummary,
        quote_link: quoteUrl,
      });
      if (!quoteUrl) {
        message = message.split('\n').filter(line => !line.includes('הצעת המחיר')).join('\n');
      }
      if (!phoneSummary) {
        message = message.split('\n').filter(line => !line.includes('סיכום') && !line.includes('{summary}')).join('\n');
      }
      message = message.replace(/\n{3,}/g, '\n\n');
      const sent = await sendWhatsApp(message, 'schedule_intro', [contact.full_name || '']);
      await logCommunication(message, 'schedule_intro', sent);

      if (!isWebinar && !alreadyGotQuote && quoteUrl) {
        const isPdfFile = /\.pdf(\?.*)?$/i.test(quoteUrl);
        if (isPdfFile) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const fileResult = await sendWhatsAppFile(quoteUrl, `הצעת מחיר - ${contact.full_name || ''}.pdf`);
          await logCommunication(quoteUrl, 'interested_quote_file', fileResult);
        }
      }

      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        last_bot_interaction_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, action: 'route_a_interested', whatsapp_sent: sent, webinar: isWebinar });
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
      const sent = await sendWhatsApp(message, 'meeting_scheduled_phone', [contact.full_name || '', serviceRequest.last_appointment_time_str || '', callerPhone]);
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
      const isWebinar = serviceRequest.source === 'webinar';

      let templateKey = 'meeting_scheduled_zoom';
      if (serviceType === 'divorce_split') templateKey = 'meeting_scheduled_divorce_split';
      else if (serviceType === 'annual_service_call') templateKey = 'meeting_scheduled_annual_service';
      else if (newStatus === 'meeting_scheduled_frontal') templateKey = apptType.includes('petah_tikva') ? 'meeting_scheduled_petah_tikva' : 'meeting_scheduled_modiin';
      else if (newStatus === 'meeting_scheduled_zoom') templateKey = 'meeting_scheduled_zoom';
      else if (apptType === 'modiin') templateKey = 'meeting_scheduled_modiin';
      else if (apptType.includes('petah_tikva')) templateKey = 'meeting_scheduled_petah_tikva';
      else if (apptType === 'phone' && !isWebinar) templateKey = 'meeting_scheduled_phone';

      if (await alreadySentRecently(templateKey)) {
        return Response.json({ ok: true, skipped: 'duplicate_event' });
      }

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

      const confirmTemplate = await getContent(templateKey);
      const confirmMessage = fillTemplate(confirmTemplate || '{name}, הפגישה עם בשמת נקבעה בהצלחה במועד: {time}', values);
      const confirmResult = await sendWhatsApp(confirmMessage, templateKey, [contact.full_name || '', serviceRequest.last_appointment_time_str || '', zoomLink || wazeLink || '']);
      await logCommunication(confirmMessage, templateKey, confirmResult);

      if (isWebinar) {
        const isModiinMeeting = templateKey === 'meeting_scheduled_modiin' || apptType === 'modiin';
        if (!isModiinMeeting) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const closingTemplate = await getContent('conversation_closing');
          const closingMessage = fillTemplate(closingTemplate || 'תודה רבה {name}, שיהיה לך יום נפלא! 🙏', values);
          const closingResult = await sendWhatsApp(closingMessage, 'conversation_closing', [contact.full_name || '']);
          await logCommunication(closingMessage, 'conversation_closing', closingResult);
        }

        await base44.asServiceRole.entities.Contact.update(contact.id, {
          bot_status: isModiinMeeting ? 'waiting_user_reply' : 'closed',
          last_bot_interaction_at: new Date().toISOString(),
        });
        return Response.json({ ok: true, action: 'webinar_meeting_scheduled', template: templateKey });
      }

      const questionnaireUrl = await getQuestionnaireUrl();
      if (!questionnaireUrl) {
        const clarifyTemplate = await getContent('service_type_clarify');
        const clarifyMessage = fillTemplate(clarifyTemplate || 'לאיזה תחום הפנייה? 1) ייעוץ פרישה 2) היתכנות כלכלית 3) תכנון השקעות 4) איזון אקטוארי בגירושין 5) זכויות מס', values);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const clarifyResult = await sendWhatsApp(clarifyMessage, 'service_type_clarify', [contact.full_name || '']);
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
        await new Promise(resolve => setTimeout(resolve, 3000));
        const questionnaireMessage = fillTemplate(questionnaireTemplate, { ...values, questionnaire_link: questionnaireUrl });
        const questionnaireResult = await sendWhatsApp(questionnaireMessage, 'questionnaire_request', [contact.full_name || '', questionnaireUrl]);
        await logCommunication(questionnaireMessage, 'questionnaire_request', questionnaireResult);
      }

      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        shoranss_questionnaire: 'sent',
        last_bot_interaction_at: new Date().toISOString(),
      });

      return Response.json({ ok: true, action: 'meeting_scheduled_sequence', template: templateKey });
    }

    if (statusChanged && newStatus === 'quote_sent') {
      return Response.json({ ok: true, action: 'quote_sent_silent' });
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
      const sent = await sendWhatsApp(firstMessage, 'not_interested_reason', [contact.full_name || '']);
      if (secondMessage) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const secondResult = await sendWhatsApp(secondMessage, 'value_proposition', [reviewsUrl, qaUrl]);
        await logCommunication(secondMessage, 'value_proposition', secondResult);
      }
      if (thirdMessage) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const thirdResult = await sendWhatsApp(thirdMessage, 'opt_in_future', [contact.full_name || '']);
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

    if (documentsJustReceived) {
      const confirmedTemplate = await getContent('documents_confirmed');
      if (confirmedTemplate) {
        const confirmedMessage = fillTemplate(confirmedTemplate, { name: contact.full_name || '' });
        const confirmedResult = await sendWhatsApp(confirmedMessage, 'documents_confirmed', [contact.full_name || '']);
        await logCommunication(confirmedMessage, 'documents_confirmed', confirmedResult);
      }

      const isWebinar = serviceRequest.source === 'webinar';
      if (!isWebinar) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const closingTemplate = await getContent('preparation_complete_closing')
          || 'תודה רבה {name}! 🌿\nההכנה לפגישה הושלמה — את/ה מוזמן/ת להגיע מוכן/ה ורגוע/ה.\nנשמח לראותך בפגישה עם בשמת! 💜';
        const closingMessage = fillTemplate(closingTemplate, { name: contact.full_name || '' });
        const closingResult = await sendWhatsApp(closingMessage, 'preparation_complete_closing', [contact.full_name || '']);
        await logCommunication(closingMessage, 'preparation_complete_closing', closingResult);
      }

      return Response.json({ ok: true, action: 'documents_confirmed' });
    }

    if (questionnaireFilled) {
      const values = { name: contact.full_name || '' };

      const thanksTemplate = await getContent('questionnaire_completed_thanks');
      if (thanksTemplate) {
        const thanksMessage = fillTemplate(thanksTemplate, values);
        const thanksResult = await sendWhatsApp(thanksMessage, 'questionnaire_completed_thanks', [contact.full_name || '']);
        await logCommunication(thanksMessage, 'questionnaire_completed_thanks', thanksResult);
      }

      const needsEmail = !contact.email;
      const idRequestKey = needsEmail ? 'questionnaire_id_email_request' : 'questionnaire_id_request';
      let idRequestTemplate = await getContent(idRequestKey);
      if (!idRequestTemplate && needsEmail) {
        idRequestTemplate = await getContent('questionnaire_id_request');
        if (idRequestTemplate) idRequestTemplate += '\n\n📧 וגם — מה כתובת המייל שלך?';
      }
      if (idRequestTemplate) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const idRequestMessage = fillTemplate(idRequestTemplate, values);
        const idRequestResult = await sendWhatsApp(idRequestMessage, idRequestKey, [contact.full_name || '']);
        await logCommunication(idRequestMessage, idRequestKey, idRequestResult);
      }

      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
        current_step: 'waiting_id_details',
      });

      await base44.asServiceRole.entities.Contact.update(contact.id, {
        bot_status: 'waiting_user_reply',
        shoranss_questionnaire: 'filled',
        last_bot_interaction_at: new Date().toISOString(),
      });

      return Response.json({ ok: true, action: 'questionnaire_completed_waiting_id' });
    }

    return Response.json({ ok: true, skipped: 'no_matching_action' });
  } catch (error) {
    console.error('autoServiceRequestUpdated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
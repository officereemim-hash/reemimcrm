import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');
const WEBHOOK_SECRET = Deno.env.get('GREEN_API_WEBHOOK_SECRET');
const AGENT_NAME = 'bot_reemim';

function normalizeLocalPhone(phone) {
  const clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  return clean.startsWith('972') ? '0' + clean.substring(3) : clean;
}

function normalizeIntlPhone(phone) {
  let clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return clean;
}

function extractText(messageData) {
  if (messageData?.typeMessage === 'textMessage') {
    return messageData.textMessageData?.textMessage || '';
  }
  if (messageData?.typeMessage === 'extendedTextMessage') {
    return messageData.extendedTextMessageData?.text || '';
  }
  return '';
}

function normalizeAnswer(text) {
  return String(text || '').trim().replace(/[*"'״]/g, '').toLowerCase();
}

function detectServiceType(text) {
  const serviceMap = {
    '1': 'retirement',
    'ייעוץ פרישה': 'retirement',
    'פרישה': 'retirement',
    '2': 'economic_feasibility',
    'התכנות כלכלית': 'economic_feasibility',
    'התכנות': 'economic_feasibility',
    '3': 'investments',
    'השקעות': 'investments',
    '4': 'divorce_split',
    'איזון אקטוארי': 'divorce_split',
    'גירושין': 'divorce_split',
    'איזון': 'divorce_split',
    '5': 'tax_advisory',
    'ייעוץ מס': 'tax_advisory',
    'מס': 'tax_advisory',
    '6': 'annual_service',
    'שירות שנתי': 'annual_service',
    'שירות': 'annual_service',
  };
  const normalized = normalizeAnswer(text);
  return serviceMap[normalized] || serviceMap[String(text || '').trim()] || '';
}

function extractContactDetails(text) {
  const emailMatch = String(text || '').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const compactText = String(text || '').replace(/[\-\s]/g, '');
  const phoneMatch = compactText.match(/05\d{8}/);

  if (!emailMatch || !phoneMatch) return null;

  const email = emailMatch[0].toLowerCase().trim();
  const phone = phoneMatch[0];
  const name = String(text || '')
    .replace(emailMatch[0], '')
    .replace(/0[5]\d[\d\-]{7,11}/g, '')
    .replace(/[,;:]/g, ' ')
    .replace(/(?:^|\s)שמי?(?=\s|$)\s*/gi, ' ')
    .replace(/(?:^|\s)מספרי?(?=\s|$)\s*/gi, ' ')
    .replace(/(?:^|\s)טלפון(?=\s|$)\s*/gi, ' ')
    .replace(/(?:^|\s)מייל(?=\s|$)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length < 2) return null;
  return { name, phone, email };
}

async function sendWhatsApp(chatId, message, botEnabled) {
  if (!chatId || !message || !botEnabled) return null;
  const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  if (!response.ok) return null;
  return await response.json();
}

async function sendTyping(chatId, seconds = 15, botEnabled = false) {
  if (!botEnabled) return;
  fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendTyping/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, typingTime: seconds * 1000 }),
  }).catch(() => {});
}

async function getBotContent(base44, key) {
  const records = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
  return records[0]?.content || '';
}

async function getServiceContentUrl(base44, query) {
  const records = await base44.asServiceRole.entities.ServiceContent.filter({ ...query, is_active: true });
  return records[0]?.url || '';
}

async function logIncoming(base44, idMessage, phone, text, chatId, conversationId, status = 'replied') {
  return await base44.asServiceRole.entities.WhatsAppMessageLog.create({
    id_message: idMessage || `wa_${Date.now()}`,
    phone,
    direction: 'incoming',
    text: String(text || '').substring(0, 500),
    status,
    conversation_id: conversationId,
    chat_id: chatId,
  });
}

async function logOutgoing(base44, idMessage, phone, text, chatId, conversationId, status = 'replied') {
  return await base44.asServiceRole.entities.WhatsAppMessageLog.create({
    id_message: idMessage || `out_${Date.now()}`,
    phone,
    direction: 'outgoing',
    text: String(text || '').substring(0, 500),
    status,
    conversation_id: conversationId,
    chat_id: chatId,
  });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const secretParam = url.searchParams.get('secret') || '';
    const body = await req.json();

    if (WEBHOOK_SECRET && body.webhookSecret && body.webhookSecret !== WEBHOOK_SECRET) {
      return Response.json({ error: 'Invalid webhook secret' }, { status: 403 });
    }
    if (WEBHOOK_SECRET && secretParam && secretParam !== WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const expectedInstanceId = Deno.env.get('GREEN_API_INSTANCE_ID') || '';
    const incomingInstanceId = String(body.instanceData?.idInstance || '');
    if (expectedInstanceId && incomingInstanceId && incomingInstanceId !== expectedInstanceId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (body.typeWebhook !== 'incomingMessageReceived') {
      return Response.json({ ok: true, skipped: true });
    }

    const messageData = body.messageData;
    const senderData = body.senderData;
    const idMessage = body.idMessage || '';
    const chatId = senderData?.chatId || '';

    if (!chatId || !chatId.endsWith('@c.us')) {
      return Response.json({ ok: true, skipped: 'group_chat' });
    }

    const text = extractText(messageData).trim();
    if (!text) {
      return Response.json({ ok: true, skipped: 'non_text_or_empty' });
    }

    const base44 = createClientFromRequest(req);
    const phone = chatId.replace('@c.us', '');
    const localPhone = normalizeLocalPhone(phone);

    const [botEnabledSettings, cachedConversationSettings, blockList, duplicateMessages, testModeSettings] = await Promise.all([
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'phone_conv_' + phone }),
      base44.asServiceRole.entities.WhatsAppBlockList.list(),
      idMessage ? base44.asServiceRole.entities.WhatsAppMessageLog.filter({ id_message: idMessage }) : Promise.resolve([]),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'test_mode_allowed_numbers' }),
    ]);

    // ===== מצב בדיקה: אם הוגדרה רשימה לבנה — מגיבים רק למספרים שבה =====
    const allowedRaw = String(testModeSettings[0]?.value || '').trim();
    if (allowedRaw) {
      const allowedNumbers = allowedRaw.split(',').map(n => normalizeLocalPhone(n.trim())).filter(Boolean);
      if (!allowedNumbers.includes(localPhone)) {
        return Response.json({ ok: true, skipped: true, reason: 'test_mode_not_allowed' });
      }
    }

    if (duplicateMessages.length > 0) {
      return Response.json({ ok: true, skipped: true, reason: 'duplicate' });
    }

    const blockedPhones = blockList.map(item => String(item.phone || '').replace(/[\s\-\+]/g, ''));
    if (blockedPhones.includes(phone) || blockedPhones.includes(localPhone)) {
      return Response.json({ ok: true, skipped: true, reason: 'blocked' });
    }

    const botEnabled = botEnabledSettings[0]?.value === 'true' || botEnabledSettings[0]?.value === true;
    const outgoingStatus = botEnabled ? 'replied' : 'skipped';

    // אישור מיידי בתחילת שיחה חדשה — לפני האינדיקטור — כדי שהפונה (בעיקר מבוגר) יראה תגובה ודאית מיד
    const isNewConversation = cachedConversationSettings.length === 0;
    if (isNewConversation) {
      const instantAck = await getBotContent(base44, 'instant_ack');
      if (instantAck) {
        await sendWhatsApp(chatId, instantAck, botEnabled);
      }
    }

    // שליחת אינדיקטור "מקליד..." מיד — כדי שהפונה יראה שהבוט מגיב
    await sendTyping(chatId, 15, botEnabled);

    // חיפוש Contact ב-3 פורמטים + בדיקת rate limit — הכל במקביל לחיסכון בזמן
    const [recentLogs, contactsByIntl, contactsByLocal, contactsByPlus] = await Promise.all([
      base44.asServiceRole.entities.WhatsAppMessageLog.filter({ phone }, '-created_date', 30),
      base44.asServiceRole.entities.Contact.filter({ phone }),
      base44.asServiceRole.entities.Contact.filter({ phone: localPhone }),
      base44.asServiceRole.entities.Contact.filter({ phone: '+' + phone }),
    ]);

    const recentOutgoing = recentLogs.filter(log => log.direction === 'outgoing' && Date.now() - new Date(log.created_date).getTime() < 60 * 60 * 1000);
    if (botEnabled && recentOutgoing.length >= 10) {
      return Response.json({ ok: true, skipped: true, reason: 'rate_limited' });
    }

    const contacts = contactsByIntl.length > 0 ? contactsByIntl : contactsByLocal.length > 0 ? contactsByLocal : contactsByPlus;
    let contact = contacts[0] || null;

    // ===== הסרה מרשימת התפוצה דרך וואטסאפ =====
    const UNSUBSCRIBE_KEYWORDS = ['הסר', 'הסרה', 'הסירו אותי', 'להסיר אותי', 'תסירו אותי', 'תפסיקו לשלוח', 'stop', 'unsubscribe'];
    const normalizedForUnsub = normalizeAnswer(text);
    if (UNSUBSCRIBE_KEYWORDS.includes(normalizedForUnsub)) {
      const unsubContact = contacts[0] || null;
      if (unsubContact) {
        await base44.asServiceRole.entities.Contact.update(unsubContact.id, { mailing_opt_out: true });
        await base44.asServiceRole.entities.Communication.create({
          contact_id: unsubContact.id,
          type: 'whatsapp',
          direction: 'inbound',
          content: `הלקוח/ה ביקש/ה הסרה מרשימת התפוצה ("${text}")`,
          sent_by: 'system',
          is_automated: true,
          status: 'sent',
        });
      }
      const unsubMessage = await getBotContent(base44, 'unsubscribe_confirm') || 'הוסרת מרשימת התפוצה שלנו ✅';
      await sendWhatsApp(chatId, unsubMessage, botEnabled);
      return Response.json({ ok: true, unsubscribed: true });
    }
    // ===== סוף הסרה מתפוצה =====
    if (contact && (!contact.full_name || !contact.phone || !contact.email)) contact = null;

    let serviceRequest = null;
    if (contact) {
      const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id }, '-created_date', 20);
      serviceRequest = requests.find(request => !['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(request.status)) || requests[0] || null;
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        last_bot_interaction_at: new Date().toISOString(),
        bot_status: contact.bot_status === 'new' ? 'in_conversation' : contact.bot_status,
      });
    }

    let conversationId = serviceRequest?.conversation_id || cachedConversationSettings[0]?.value || null;
    let conversation = null;

    if (conversationId) {
      try {
        conversation = await base44.asServiceRole.agents.getConversation(conversationId);
      } catch (error) {
        conversationId = null;
      }
    }

    if (!conversationId) {
      conversation = await base44.asServiceRole.agents.createConversation({
        agent_name: AGENT_NAME,
        metadata: { name: contact?.full_name || phone, phone, source: 'whatsapp' },
      });
      conversationId = conversation.id;
      await base44.asServiceRole.entities.SystemSetting.create({
        key: 'phone_conv_' + phone,
        value: conversationId,
        category: 'flow',
      });
      if (serviceRequest) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { conversation_id: conversationId });
      }
    }

    if (!contact && cachedConversationSettings.length === 0) {
      const greetingMessage = await getBotContent(base44, 'greeting');
      if (greetingMessage) {
        const sent = await sendWhatsApp(chatId, greetingMessage, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp0`, phone, greetingMessage, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${greetingMessage}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp0_greeting' });
      }
    }

    // FP-Details: חילוץ פרטים — גם אם הסוכן יצר Contact במקביל, ה-FP צריך לתפוס
    if (!contact || !serviceRequest) {
      const details = extractContactDetails(text);
      if (details) {
        const settingKey = 'pending_contact_' + phone;
        const settingValue = JSON.stringify(details);
        const existingSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: settingKey });
        if (existingSettings.length > 0) {
          await base44.asServiceRole.entities.SystemSetting.update(existingSettings[0].id, { value: settingValue });
        } else {
          await base44.asServiceRole.entities.SystemSetting.create({ key: settingKey, value: settingValue, category: 'flow' });
        }

        const confirmTemplate = await getBotContent(base44, 'contact_details_confirm');
        const confirmMessage = (confirmTemplate || 'הפרטים שלך:\n📛 שם: {name}\n📱 טלפון: {phone}\n📧 מייל: {email}\n\nהאם הכל נכון? כתוב/י *כן* לאישור.')
          .replaceAll('{name}', details.name)
          .replaceAll('{phone}', details.phone)
          .replaceAll('{email}', details.email);
        const sent = await sendWhatsApp(chatId, confirmMessage, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_details`, phone, confirmMessage, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${confirmMessage}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_details_confirm' });
      }
    }

    // FP-Confirm: אישור פרטים ("כן") — בודק pending בלי תלות בקיום Contact (הסוכן עלול ליצור Contact במקביל)
    const positiveAnswers = ['כן', 'נכון', 'הכל נכון', 'בטח', 'כמובן', 'אוקי', 'ok', 'סבבה', '👍', '✅'];
    if (positiveAnswers.includes(normalizeAnswer(text))) {
      const settingKey = 'pending_contact_' + phone;
      const pendingSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: settingKey });
      if (pendingSettings.length > 0) {
        const details = JSON.parse(pendingSettings[0].value);
        // חיפוש בכל הפורמטים — הסוכן עלול לשמור עם +972 או 0
        let existingContacts = await base44.asServiceRole.entities.Contact.filter({ phone: details.phone });
        if (existingContacts.length === 0) existingContacts = await base44.asServiceRole.entities.Contact.filter({ phone });
        if (existingContacts.length === 0) existingContacts = await base44.asServiceRole.entities.Contact.filter({ phone: '+' + phone });
        const createdContact = existingContacts[0] || await base44.asServiceRole.entities.Contact.create({
          full_name: details.name,
          phone: details.phone,
          email: details.email,
          source: 'manual',
          status: 'new_lead',
        });

        const serviceRequestData = {
          contact_id: createdContact.id,
          contact_name: details.name,
          contact_phone: details.phone,
          contact_email: details.email,
          status: 'new',
          source: 'bot',
          conversation_id: conversationId,
        };
        await base44.asServiceRole.entities.ServiceRequest.create(serviceRequestData);
        await base44.asServiceRole.entities.SystemSetting.delete(pendingSettings[0].id);

        const welcomeMessage = await getBotContent(base44, 'welcome') || 'ברוך הבא! במה נוכל לעזור?';
        const sent = await sendWhatsApp(chatId, welcomeMessage, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_saved`, phone, welcomeMessage, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${welcomeMessage}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_details_saved' });
      }
    }

    // ===== FP-WebinarCoupon: זיהוי קוד קופון וובינר → קישור תשלום (דמו) =====
    if (contact) {
      const couponText = String(text || '').trim().toUpperCase();
      const couponMatch = couponText.match(/\b(INV|DIV|RET|WEB)-[A-Z0-9]{4,6}\b/);
      if (couponMatch) {
        const code = couponMatch[0];
        const regsByContact = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 20);
        const reg = regsByContact.find(r => String(r.coupon_code || '').toUpperCase() === code);
        if (reg) {
          const PAYMENT_SUBTYPE = {
            investments: 'payment_webinar_investments',
            divorce: 'payment_webinar_divorce',
            retirement: 'payment_webinar_retirement',
          };
          const paymentUrl = await getServiceContentUrl(base44, { content_type: 'payment_link', sub_type: PAYMENT_SUBTYPE[reg.webinar_type] });
          const couponCfgRecords = await base44.asServiceRole.entities.WebinarCouponSetting.filter({ webinar_type: reg.webinar_type });
          const couponCfg = couponCfgRecords[0] || {};
          const intro = await getBotContent(base44, 'webinar_payment_intro') || 'מעולה {name}! קישור לתשלום: {payment_link}';
          const message = intro
            .replaceAll('{name}', contact.full_name || '')
            .replaceAll('{payment_link}', paymentUrl)
            .replaceAll('{discount}', couponCfg.discount_percent != null ? String(couponCfg.discount_percent) : '')
            .replaceAll('{amount}', couponCfg.amount != null ? String(couponCfg.amount) : '');
          const sent = await sendWhatsApp(chatId, message, botEnabled);
          await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, { pending_payment: true });
          await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
          await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_coupon`, phone, message, chatId, conversationId, outgoingStatus);
          try {
            await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${message}` });
          } catch (error) {}
          return Response.json({ ok: true, fast_path: 'fp_webinar_coupon', webinar_type: reg.webinar_type });
        }
      }
    }

    // ===== FP-WebinarPaid: "שילמתי" אחרי מימוש קופון =====
    // אם הצוות כבר אישר תשלום (payment_completed) → שולחים בחירת מיקום פגישה.
    // אם עדיין לא אושר → שולחים הודעת המתנה. אישור התשלום נעשה ע"י הצוות בלבד.
    if (contact && (normalizeAnswer(text).startsWith('שילמתי') || normalizeAnswer(text) === 'שולם')) {
      const regsByContact = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 10);
      const reg = regsByContact.find(r => r.pending_payment === true || r.payment_completed === true);
      if (reg) {
        let message;
        let fastPath;
        if (reg.payment_completed === true) {
          // הצוות כבר אישר — בחירת מיקום פגישה
          const locationMessage = await getBotContent(base44, 'webinar_location_choice') || 'איך תרצו לקיים את הפגישה?\n1) זום 2) מודיעין 3) פתח תקווה 4) טלפון';
          message = locationMessage.replaceAll('{name}', contact.full_name || '');
          fastPath = 'fp_webinar_paid_confirmed';
        } else {
          // עדיין לא אושר ע"י הצוות — הודעת המתנה
          const ackMessage = await getBotContent(base44, 'webinar_payment_pending_ack') || 'תודה רבה על העדכון! הצוות בודק שהתשלום התקבל ויעדכן אותך בהקדם.';
          message = ackMessage.replaceAll('{name}', contact.full_name || '');
          fastPath = 'fp_webinar_paid_pending';
        }
        const sent = await sendWhatsApp(chatId, message, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_paid`, phone, message, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${message}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: fastPath });
      }
    }

    // ===== FP-ServiceClarify: מענה על בירור תחום (כשהשאלון לא נשלח כי התחום לא זוהה) =====
    if (contact && serviceRequest && serviceRequest.pending_service_clarify) {
      const clarifiedType = detectServiceType(text);
      const SHORANSS_SUBTYPE = {
        retirement: 'shoranss_retirement',
        economic_feasibility: 'shoranss_economic',
        investments: 'shoranss_investments',
        divorce_split: 'shoranss_divorce',
        tax_advisory: 'shoranss_tax',
      };
      const clarifySubType = SHORANSS_SUBTYPE[clarifiedType];

      if (clarifiedType && clarifySubType) {
        // זוהה תחום — שולחים את השאלון הנכון
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
          service_type: clarifiedType,
          pending_service_clarify: false,
        });
        const questionnaireUrl = await getServiceContentUrl(base44, { content_type: 'questionnaire', sub_type: clarifySubType });
        const questionnaireTemplate = await getBotContent(base44, 'questionnaire_request');
        const message = (questionnaireTemplate || 'מצורף שאלון קצר למילוי לקראת הפגישה:\n{questionnaire_link}')
          .replaceAll('{name}', contact.full_name || '')
          .replaceAll('{questionnaire_link}', questionnaireUrl);
        const sent = await sendWhatsApp(chatId, message, botEnabled);
        await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_user_reply', shoranss_questionnaire: 'sent' });
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_clarify`, phone, message, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${message}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_service_clarified', service_type: clarifiedType });
      }

      // עדיין לא זוהה תחום — העברה לנציגה
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { pending_service_clarify: false });
      await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_agent', conversation_owner: 'bar' });
      const escalateMessage = await getBotContent(base44, 'escalate_to_agent') || 'מעבירים את הפנייה לנציגת שירות, נחזור אליך בהקדם 🙏';
      const sent = await sendWhatsApp(chatId, escalateMessage, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_clarify_esc`, phone, escalateMessage, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${escalateMessage}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_service_clarify_escalated' });
    }

    const selectedServiceType = detectServiceType(text);
    if (selectedServiceType && contact && serviceRequest && !serviceRequest.service_type) {
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { service_type: selectedServiceType });
      const waitMessageTemplate = await getBotContent(base44, 'after_choice_wait');
      const calendarLink = await getServiceContentUrl(base44, {
        service_type: 'general',
        content_type: 'calendar_link',
        sub_type: 'coordinator_calendar',
      });

      if (waitMessageTemplate && calendarLink) {
        const message = waitMessageTemplate.replace('{calendar_link}', calendarLink);
        const sent = await sendWhatsApp(chatId, message, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_service`, phone, message, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${message}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_service_choice', service_type: selectedServiceType });
      }
    }

    // ===== FP-WaitCoordinator: הלקוח בחר להמתין לנציגה =====
    const waitAnswers = ['אמתין', 'אמתין לנציגה', 'אחכה לנציגה', 'שתחזרו אליי', 'שתחזרו אלי', 'תחזרו אליי', 'תחזרו אלי', 'נציגה', 'מחכה לשיחה'];
    // "1" = המתנה לנציגה רק כשעוד לא נשלח תפריט הפגישות (בסטטוס interested "1" = זום)
    if (contact && serviceRequest && waitAnswers.includes(normalizeAnswer(text))) {
      await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_agent' });
      const ackMessage = await getBotContent(base44, 'wait_coordinator_ack') || 'מעולה! נציגה תחזור אלייך בהקדם 🙏';
      const sent = await sendWhatsApp(chatId, ackMessage, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_wait`, phone, ackMessage, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${ackMessage}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_wait_coordinator' });
    }

    // ===== FP-MeetingChoice: בחירת מיקום פגישה אחרי שהלקוח מעוניין (interested) =====
    if (contact && serviceRequest && serviceRequest.status === 'interested') {
      const locationMap = {
        'א': 'zoom', 'ב': 'modiin', 'ג': 'petah_tikva_wednesday', 'ד': 'phone',
        'זום': 'zoom', 'zoom': 'zoom', 'בזום': 'zoom',
        'מודיעין': 'modiin', 'במודיעין': 'modiin',
        'פתח תקווה': 'petah_tikva_wednesday', 'פתח-תקווה': 'petah_tikva_wednesday', 'פת': 'petah_tikva_wednesday', 'בפתח תקווה': 'petah_tikva_wednesday',
        'טלפון': 'phone', 'שיחת טלפון': 'phone', 'בטלפון': 'phone', 'שיחה טלפונית': 'phone',
      };
      const chosenLocation = locationMap[normalizeAnswer(text)];
      if (chosenLocation) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { last_appointment_type: chosenLocation });

        let calendarQuery;
        if (serviceRequest.service_type === 'divorce_split') {
          calendarQuery = { service_type: 'divorce_split', content_type: 'calendar_link', sub_type: 'divorce_calendar' };
        } else if (serviceRequest.service_type === 'annual_service_call') {
          calendarQuery = { service_type: 'annual_service_call', content_type: 'calendar_link', sub_type: 'annual_service_calendar' };
        } else {
          const subTypeMap = {
            zoom: 'zoom_calendar',
            modiin: 'modiin_calendar',
            petah_tikva_wednesday: 'petah_tikva_calendar',
            phone: 'phone_calendar',
          };
          calendarQuery = { service_type: 'general', content_type: 'calendar_link', sub_type: subTypeMap[chosenLocation] };
        }

        const calendarUrl = await getServiceContentUrl(base44, calendarQuery);
        if (calendarUrl) {
          const sent = await sendWhatsApp(chatId, calendarUrl, botEnabled);
          await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
          await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_meeting`, phone, calendarUrl, chatId, conversationId, outgoingStatus);
          try {
            await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${calendarUrl}` });
          } catch (error) {}
          return Response.json({ ok: true, fast_path: 'fp_meeting_choice', location: chosenLocation });
        }
      }
    }

    // ===== FP-Kavati: "קבעתי" — אישור קצר בלבד (היצירה בפועל דרך Cal.com webhook) =====
    if (normalizeAnswer(text) === 'קבעתי') {
      const confirmedMessage = await getBotContent(base44, 'appointment_confirmed');
      if (confirmedMessage) {
        const sent = await sendWhatsApp(chatId, confirmedMessage, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_kavati`, phone, confirmedMessage, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${confirmedMessage}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_appointment_confirmed' });
      }
    }

    // ===== FP-IDDetails: קליטת ת.ז. + תאריך לידה אחרי מילוי שאלון =====
    if (serviceRequest && serviceRequest.current_step === 'waiting_id_details' && contact) {
      // חילוץ ת.ז. (9 ספרות) ותאריך לידה (DD/MM/YYYY או DD.MM.YYYY או DD-MM-YYYY)
      const idMatch = text.match(/\b(\d{9})\b/);
      const dateMatch = text.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/);

      if (idMatch && dateMatch) {
        const idNumber = idMatch[1];
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        const year = dateMatch[3];
        const birthDate = `${year}-${month}-${day}`;

        // שמירה ב-Contact
        await base44.asServiceRole.entities.Contact.update(contact.id, {
          id_number: idNumber,
          birth_date: birthDate,
          bot_status: 'waiting_user_reply',
          last_bot_interaction_at: new Date().toISOString(),
        });

        // אישור קבלה + שליחת בקשת מסמכים
        const ackMessage = await getBotContent(base44, 'id_details_received_ack') || 'תודה רבה! קיבלנו את הפרטים ✅';
        const sent = await sendWhatsApp(chatId, ackMessage, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_id_ack`, phone, ackMessage, chatId, conversationId, outgoingStatus);

        // שליחת בקשת מסמכים
        const docsTemplate = await getBotContent(base44, 'documents_request') || '';
        if (docsTemplate) {
          await new Promise(resolve => setTimeout(resolve, 1200));
          const docsMessage = docsTemplate.replaceAll('{name}', contact.full_name || '');
          const docsSent = await sendWhatsApp(chatId, docsMessage, botEnabled);
          await logOutgoing(base44, docsSent?.idMessage || `out_${Date.now()}_fp_id_docs`, phone, docsMessage, chatId, conversationId, outgoingStatus);
        }

        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
          current_step: 'waiting_documents',
        });

        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${ackMessage}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_id_details_received', id_number: idNumber, birth_date: birthDate });
      }

      // לא הצליח לחלץ — מבקש שוב
      const retryMessage = await getBotContent(base44, 'id_details_retry') || 'לא הצלחתי לזהות את הפרטים. נא לשלוח בהודעה אחת את מספר תעודת הזהות (9 ספרות) ותאריך לידה (DD/MM/YYYY)';
      const sent = await sendWhatsApp(chatId, retryMessage, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_id_retry`, phone, retryMessage, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${retryMessage}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_id_details_retry' });
    }

    // ===== FP-DocsSent: "שלחתי" אחרי מילוי שאלון — אישור שקיבלנו, ממתינים לבדיקה =====
    if (serviceRequest && serviceRequest.questionnaire_completed && !serviceRequest.documents_received && normalizeAnswer(text).startsWith('שלחתי')) {
      const docsAckMessage = await getBotContent(base44, 'documents_sent_ack') || 'תודה ששלחת, אנחנו נעדכן אותך ברגע שיתקבלו המסמכים 🙏';
      const sent = await sendWhatsApp(chatId, docsAckMessage, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_docs`, phone, docsAckMessage, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${docsAckMessage}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_documents_sent_ack' });
    }

    // ===== FP-Polite: תגובת נימוס קצרה במצב המתנה — מענה קצר בלי סוכן =====
    const politeAnswers = ['תודה', 'תודה רבה', 'מעולה', 'אחלה', 'סבבה', 'יופי', 'מושלם', 'בסדר', 'בסדר גמור', '👍', '🙏', '❤️', '😊'];
    const waitingStatuses = ['phone_meeting', 'meeting_scheduled', 'meeting_scheduled_frontal', 'meeting_scheduled_zoom'];
    if (serviceRequest && waitingStatuses.includes(serviceRequest.status) && politeAnswers.includes(normalizeAnswer(text))) {
      const politeReply = await getBotContent(base44, 'polite_ack') || 'בשמחה 🙂';
      const sent = await sendWhatsApp(chatId, politeReply, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_polite`, phone, politeReply, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${politeReply}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_polite_ack' });
    }

    const goodbyeAnswers = ['סיום', 'סיום שיחה', 'ביי', 'להתראות', 'תודה סיום', 'סיימנו', 'זהו'];
    if (goodbyeAnswers.includes(normalizeAnswer(text))) {
      const goodbyeMessage = await getBotContent(base44, 'goodbye') || 'שמחנו לשוחח! שיהיה לך יום נפלא 🙏';
      const sent = await sendWhatsApp(chatId, goodbyeMessage, botEnabled);
      if (serviceRequest) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { status: 'completed' });
      }
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_goodbye`, phone, goodbyeMessage, chatId, conversationId, outgoingStatus);
      return Response.json({ ok: true, fast_path: 'fp_goodbye' });
    }

    const messageCountBefore = (conversation.messages || []).length;
    const incomingLog = await logIncoming(base44, idMessage, phone, text, chatId, conversationId, 'pending_reply');
    await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });

    let agentReply = '';
    const pollStart = Date.now();
    let lastTypingRefresh = pollStart;
    let sentReassurance = false;

    while (Date.now() - pollStart < 25000) {
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!sentReassurance && Date.now() - pollStart > 15000) {
        sentReassurance = true;
        const patienceMessage = await getBotContent(base44, 'patience_message') || 'עוד רגע ואחזור אליך 😊';
        await sendWhatsApp(chatId, patienceMessage, botEnabled);
      }

      if (Date.now() - lastTypingRefresh > 6000) {
        lastTypingRefresh = Date.now();
        await sendTyping(chatId, 8, botEnabled);
      }

      const freshConversation = await base44.asServiceRole.agents.getConversation(conversationId);
      const messages = freshConversation.messages || [];
      if (messages.length > messageCountBefore + 1) {
        for (let index = messages.length - 1; index >= messageCountBefore + 1; index--) {
          if (messages[index].role === 'assistant' && messages[index].content && messages[index].content !== '<empty message>') {
            agentReply = messages[index].content;
            break;
          }
        }
        if (agentReply) break;
      }
    }

    if (agentReply) {
      const sent = await sendWhatsApp(chatId, agentReply, botEnabled);
      await base44.asServiceRole.entities.WhatsAppMessageLog.update(incomingLog.id, { status: 'replied' });
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}`, phone, agentReply, chatId, conversationId, outgoingStatus);
      return Response.json({ ok: true, conversationId, replied: true });
    }

    return Response.json({ ok: true, conversationId, queued: true });
  } catch (error) {
    console.error('greenApiWebhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
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
    .replace(/0[5][\d\-\s]{8,12}/g, '')
    .replace(/שמי?\s*/gi, '')
    .replace(/מספרי?\s*/gi, '')
    .replace(/טלפון:?\s*/gi, '')
    .replace(/מייל:?\s*/gi, '')
    .replace(/[,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length < 2) return null;
  return { name, phone, email };
}

async function sendWhatsApp(chatId, message) {
  if (!chatId || !message) return null;
  const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  if (!response.ok) return null;
  return await response.json();
}

async function sendTyping(chatId, seconds = 15) {
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

async function logOutgoing(base44, idMessage, phone, text, chatId, conversationId) {
  return await base44.asServiceRole.entities.WhatsAppMessageLog.create({
    id_message: idMessage || `out_${Date.now()}`,
    phone,
    direction: 'outgoing',
    text: String(text || '').substring(0, 500),
    status: 'replied',
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

    const [botEnabledSettings, cachedConversationSettings, blockList, duplicateMessages] = await Promise.all([
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'phone_conv_' + phone }),
      base44.asServiceRole.entities.WhatsAppBlockList.list(),
      idMessage ? base44.asServiceRole.entities.WhatsAppMessageLog.filter({ id_message: idMessage }) : Promise.resolve([]),
    ]);

    if (duplicateMessages.length > 0) {
      return Response.json({ ok: true, skipped: true, reason: 'duplicate' });
    }

    const blockedPhones = blockList.map(item => String(item.phone || '').replace(/[\s\-\+]/g, ''));
    if (blockedPhones.includes(phone) || blockedPhones.includes(localPhone)) {
      return Response.json({ ok: true, skipped: true, reason: 'blocked' });
    }

    const botEnabled = botEnabledSettings.length === 0 || botEnabledSettings[0].value === 'true';
    if (!botEnabled) {
      const testPhoneSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_test_phones' });
      const testPhones = (testPhoneSettings[0]?.value || '')
        .split(',')
        .map(item => normalizeIntlPhone(item.trim()))
        .filter(Boolean);
      if (!testPhones.includes(phone)) {
        return Response.json({ ok: true, skipped: true, reason: 'bot_disabled' });
      }
    }

    const recentLogs = await base44.asServiceRole.entities.WhatsAppMessageLog.filter({ phone }, '-created_date', 30);
    const recentOutgoing = recentLogs.filter(log => log.direction === 'outgoing' && Date.now() - new Date(log.created_date).getTime() < 60 * 60 * 1000);
    if (recentOutgoing.length >= 10) {
      return Response.json({ ok: true, skipped: true, reason: 'rate_limited' });
    }

    await sendTyping(chatId, 15);

    let contacts = await base44.asServiceRole.entities.Contact.filter({ phone });
    if (contacts.length === 0) contacts = await base44.asServiceRole.entities.Contact.filter({ phone: localPhone });
    if (contacts.length === 0) contacts = await base44.asServiceRole.entities.Contact.filter({ phone: '+' + phone });
    let contact = contacts[0] || null;
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

    if (!conversationId) {
      const logWithConversation = recentLogs.find(log => log.conversation_id);
      if (logWithConversation?.conversation_id) conversationId = logWithConversation.conversation_id;
    }

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
        const sent = await sendWhatsApp(chatId, greetingMessage);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp0`, phone, '[fp0_greeting]', chatId, conversationId);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: greetingMessage });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp0_greeting' });
      }
    }

    if (!contact) {
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

        const confirmMessage = `הפרטים שלך:\n📛 שם: ${details.name}\n📱 טלפון: ${details.phone}\n📧 מייל: ${details.email}\n\nהאם הכל נכון? כתוב/י *כן* לאישור או תקנ/י את הפרט השגוי.`;
        const sent = await sendWhatsApp(chatId, confirmMessage);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_details`, phone, '[fp_details_confirm]', chatId, conversationId);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: confirmMessage });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_details_confirm' });
      }
    }

    const positiveAnswers = ['כן', 'נכון', 'הכל נכון', 'בטח', 'כמובן', 'אוקי', 'ok', 'סבבה', '👍', '✅'];
    if (!contact && positiveAnswers.includes(normalizeAnswer(text))) {
      const settingKey = 'pending_contact_' + phone;
      const pendingSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: settingKey });
      if (pendingSettings.length > 0) {
        const details = JSON.parse(pendingSettings[0].value);
        const existingContacts = await base44.asServiceRole.entities.Contact.filter({ phone: details.phone });
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
        const sent = await sendWhatsApp(chatId, welcomeMessage);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_saved`, phone, '[fp_details_saved_welcome]', chatId, conversationId);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: welcomeMessage });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_details_saved' });
      }
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
        const sent = await sendWhatsApp(chatId, message);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_service`, phone, `[fp_service_choice_${selectedServiceType}]`, chatId, conversationId);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: message });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_service_choice', service_type: selectedServiceType });
      }
    }

    const goodbyeAnswers = ['סיום', 'סיום שיחה', 'ביי', 'להתראות', 'תודה סיום', 'סיימנו', 'זהו'];
    if (goodbyeAnswers.includes(normalizeAnswer(text))) {
      const goodbyeMessage = await getBotContent(base44, 'goodbye') || 'שמחנו לשוחח! שיהיה לך יום נפלא 🙏';
      const sent = await sendWhatsApp(chatId, goodbyeMessage);
      if (serviceRequest) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { status: 'completed' });
      }
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_goodbye`, phone, '[fp_goodbye]', chatId, conversationId);
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
        const messages = ['עוד קצת סבלנות, כמעט שם 🙏', 'עוד רגע ואחזור אליך 😊', 'ממש בדרך! ✨'];
        await sendWhatsApp(chatId, messages[Math.floor(Math.random() * messages.length)]);
      }

      if (Date.now() - lastTypingRefresh > 6000) {
        lastTypingRefresh = Date.now();
        await sendTyping(chatId, 8);
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
      const sent = await sendWhatsApp(chatId, agentReply);
      await base44.asServiceRole.entities.WhatsAppMessageLog.update(incomingLog.id, { status: 'replied' });
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}`, phone, agentReply, chatId, conversationId);
      return Response.json({ ok: true, conversationId, replied: true });
    }

    return Response.json({ ok: true, conversationId, queued: true });
  } catch (error) {
    console.error('greenApiWebhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
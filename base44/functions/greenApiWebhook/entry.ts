import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');
const WEBHOOK_SECRET = Deno.env.get('GREEN_API_WEBHOOK_SECRET');
const AGENT_NAME = 'dr_adri_bot';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Verify webhook secret if provided
    if (WEBHOOK_SECRET && body.webhookSecret && body.webhookSecret !== WEBHOOK_SECRET) {
      return Response.json({ error: 'Invalid webhook secret' }, { status: 403 });
    }

    const webhookType = body.typeWebhook;

    // Only process incoming messages
    if (webhookType !== 'incomingMessageReceived') {
      return Response.json({ ok: true, skipped: true });
    }

    const messageData = body.messageData;
    const senderData = body.senderData;
    const idMessage = body.idMessage;
    const chatId = senderData?.chatId;

    // Only handle personal chats (not groups)
    if (!chatId || !chatId.endsWith('@c.us')) {
      return Response.json({ ok: true, skipped: 'group_chat' });
    }

    // Extract text
    let text = '';
    if (messageData?.typeMessage === 'textMessage') {
      text = messageData.textMessageData?.textMessage || '';
    } else if (messageData?.typeMessage === 'extendedTextMessage') {
      text = messageData.extendedTextMessageData?.text || '';
    } else {
      // Skip non-text messages for now
      return Response.json({ ok: true, skipped: 'non_text' });
    }

    if (!text.trim()) {
      return Response.json({ ok: true, skipped: 'empty' });
    }

    // Extract phone from chatId
    const phone = chatId.replace('@c.us', '');

    // Check block list
    const blocked = await base44.asServiceRole.entities.WhatsAppBlockList.filter({ phone });
    if (blocked.length > 0) {
      return Response.json({ ok: true, skipped: 'blocked' });
    }

    // Find or create Contact
    let contacts = await base44.asServiceRole.entities.Contact.filter({ phone });
    let contact;
    if (contacts.length > 0) {
      contact = contacts[0];
    } else {
      // Also try with +972 prefix
      const phoneWith972 = phone.startsWith('972') ? '+' + phone : phone;
      contacts = await base44.asServiceRole.entities.Contact.filter({ phone: phoneWith972 });
      if (contacts.length > 0) {
        contact = contacts[0];
      } else {
        // Create new contact
        const senderName = senderData?.senderName || 'לא ידוע';
        contact = await base44.asServiceRole.entities.Contact.create({
          full_name: senderName,
          phone: phone,
          status: 'new_lead',
          source: 'facebook',
          bot_status: 'new',
          conversation_owner: 'bot',
        });
      }
    }

    // Update contact last interaction
    await base44.asServiceRole.entities.Contact.update(contact.id, {
      last_bot_interaction_at: new Date().toISOString(),
      bot_status: contact.bot_status === 'new' ? 'in_conversation' : contact.bot_status,
    });

    // Find or create agent conversation
    let conversationId = contact.current_service_request_id
      ? null
      : null;

    // Try to find existing conversation via WhatsAppMessageLog
    const recentLogs = await base44.asServiceRole.entities.WhatsAppMessageLog.filter(
      { phone, direction: 'incoming' }, '-created_date', 1
    );
    if (recentLogs.length > 0 && recentLogs[0].conversation_id) {
      conversationId = recentLogs[0].conversation_id;
    }

    // If no conversation found, create one
    if (!conversationId) {
      const conv = await base44.asServiceRole.agents.createConversation(AGENT_NAME);
      conversationId = conv.id;
    }

    // Log incoming message
    await base44.asServiceRole.entities.WhatsAppMessageLog.create({
      id_message: idMessage,
      phone,
      direction: 'incoming',
      text: text.substring(0, 500),
      status: 'pending_reply',
      conversation_id: conversationId,
      chat_id: chatId,
    });

    // Send message to agent
    await base44.asServiceRole.agents.addMessage(conversationId, {
      role: 'user',
      content: text,
    });

    // Poll for agent response (up to 15 seconds)
    let agentReply = null;
    const startTime = Date.now();
    const maxWait = 15000;

    while (Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const messages = await base44.asServiceRole.agents.getMessages(conversationId);
      if (messages && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'assistant' && lastMsg.content) {
          agentReply = lastMsg.content;
          break;
        }
      }
    }

    if (agentReply) {
      // Send reply via WhatsApp
      const sendUrl = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`;
      const sendResponse = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: agentReply }),
      });
      const sendResult = await sendResponse.json();

      // Log outgoing message
      await base44.asServiceRole.entities.WhatsAppMessageLog.create({
        id_message: sendResult.idMessage || '',
        phone,
        direction: 'outgoing',
        text: agentReply.substring(0, 500),
        status: 'replied',
        conversation_id: conversationId,
        chat_id: chatId,
      });

      // Update incoming log status
      const incomingLogs = await base44.asServiceRole.entities.WhatsAppMessageLog.filter(
        { id_message: idMessage }
      );
      if (incomingLogs.length > 0) {
        await base44.asServiceRole.entities.WhatsAppMessageLog.update(incomingLogs[0].id, {
          status: 'replied',
        });
      }
    }

    return Response.json({ ok: true, conversationId, replied: !!agentReply });
  } catch (error) {
    console.error('greenApiWebhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Find pending messages (incoming that haven't been replied to)
    const pendingLogs = await base44.asServiceRole.entities.WhatsAppMessageLog.filter(
      { status: 'pending_reply', direction: 'incoming' }, '-created_date', 50
    );

    let processed = 0;
    let replied = 0;
    let timedOut = 0;

    for (const log of pendingLogs) {
      processed++;

      // Check if too old (> 30 minutes = timeout)
      const createdAt = new Date(log.created_date).getTime();
      const now = Date.now();
      if (now - createdAt > 30 * 60 * 1000) {
        await base44.asServiceRole.entities.WhatsAppMessageLog.update(log.id, { status: 'timeout' });
        timedOut++;
        continue;
      }

      // Check conversation for agent reply
      if (!log.conversation_id) {
        continue;
      }

      const messages = await base44.asServiceRole.agents.getMessages(log.conversation_id);
      if (!messages || messages.length === 0) continue;

      // Find the last assistant message after the user's message
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.content);
      if (!lastAssistant) continue;

      // Check if we already sent this reply (by checking outgoing logs for this conversation)
      const existingOutgoing = await base44.asServiceRole.entities.WhatsAppMessageLog.filter(
        { conversation_id: log.conversation_id, direction: 'outgoing', text: lastAssistant.content.substring(0, 100) },
        '-created_date', 1
      );
      if (existingOutgoing.length > 0) {
        // Already sent, mark as replied
        await base44.asServiceRole.entities.WhatsAppMessageLog.update(log.id, { status: 'replied' });
        replied++;
        continue;
      }

      // Send via WhatsApp
      const chatId = log.chat_id || `${log.phone}@c.us`;
      const sendUrl = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`;
      const sendResponse = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: lastAssistant.content }),
      });

      if (sendResponse.ok) {
        const sendResult = await sendResponse.json();

        // Log outgoing
        await base44.asServiceRole.entities.WhatsAppMessageLog.create({
          id_message: sendResult.idMessage || '',
          phone: log.phone,
          direction: 'outgoing',
          text: lastAssistant.content.substring(0, 500),
          status: 'replied',
          conversation_id: log.conversation_id,
          chat_id: chatId,
        });

        // Update incoming status
        await base44.asServiceRole.entities.WhatsAppMessageLog.update(log.id, { status: 'replied' });
        replied++;
      } else {
        console.error('Failed to send WhatsApp:', await sendResponse.text());
        await base44.asServiceRole.entities.WhatsAppMessageLog.update(log.id, { status: 'error' });
      }
    }

    return Response.json({ ok: true, processed, replied, timedOut });
  } catch (error) {
    console.error('processWhatsAppReplies error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
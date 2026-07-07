import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INTERNAL_SECRET = 'pwr_scheduled_run_2026';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // אימות: או admin או secret פנימי (scheduled task)
    const url = new URL(req.url);
    const secretParam = url.searchParams.get('secret') || '';
    if (secretParam !== INTERNAL_SECRET) {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Check if WhatsApp bot is enabled
    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botSettings.length > 0 && botSettings[0].value === 'true';

    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    // ===== PROCESS PENDING BOT MESSAGES =====
    const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-updated_date', 50);
    const pendingBotRequests = allRequests.filter(r => r.pending_bot_message && r.pending_bot_message.length > 0);

    for (const sr of pendingBotRequests) {
      try {
        console.log(`processWhatsAppReplies: found pending_bot_message=${sr.pending_bot_message} for ${sr.id}`);

        await base44.asServiceRole.functions.invoke('autoServiceRequestUpdated', {
          event: { type: 'update', entity_name: 'ServiceRequest', entity_id: sr.id },
          data: { ...sr, conversation_id: sr.conversation_id },
          old_data: { ...sr, pending_bot_message: '' },
        });

        await base44.asServiceRole.entities.ServiceRequest.update(sr.id, {
          pending_bot_message: '',
          last_system_message: sr.pending_bot_message,
        });
      } catch (pendErr) {
        console.warn('processWhatsAppReplies: pending bot error:', pendErr.message);
        try {
          await base44.asServiceRole.entities.ServiceRequest.update(sr.id, { pending_bot_message: '' });
        } catch (_) {}
      }
    }

    // ===== PROCESS PENDING WHATSAPP REPLIES (pending_reply + timeout_fallback) =====
    const [pendingReplies, timeoutFallbacks] = await Promise.all([
      base44.asServiceRole.entities.WhatsAppMessageLog.filter({ status: 'pending_reply' }),
      base44.asServiceRole.entities.WhatsAppMessageLog.filter({ status: 'timeout_fallback' }),
    ]);
    const pending = [...pendingReplies, ...timeoutFallbacks];

    if (pending.length === 0) {
      return Response.json({ ok: true, processed: 0, pending_bot: pendingBotRequests.length });
    }

    console.log(`Processing ${pending.length} pending WhatsApp replies (${pendingReplies.length} pending_reply, ${timeoutFallbacks.length} timeout_fallback)`);

    let processed = 0;
    let errors = 0;

    for (const msg of pending) {
      try {
        const createdAt = new Date(msg.created_date);
        const ageMs = Date.now() - createdAt.getTime();
        // pending_reply: חלון 15 דקות; timeout_fallback: חלון 30 דקות
        const maxAgeMs = msg.status === 'timeout_fallback' ? 30 * 60 * 1000 : 15 * 60 * 1000;
        if (ageMs > maxAgeMs) {
          console.log(`Message ${msg.id_message} timed out (${Math.round(ageMs / 1000)}s old, status=${msg.status})`);
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'timeout' });
          continue;
        }

        if (!msg.conversation_id || !msg.chat_id) {
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'error' });
          continue;
        }

        const conversation = await base44.asServiceRole.agents.getConversation(msg.conversation_id);
        const messages = conversation.messages || [];
        const expectedCount = msg.message_count_at_send || 0;

        let botReply = '';
        if (messages.length > expectedCount) {
          for (let i = messages.length - 1; i >= expectedCount; i--) {
            if (messages[i].role === 'assistant' && messages[i].content && messages[i].content !== '<empty message>' && !messages[i].content.startsWith('[לקוח כתב]:')) {
              botReply = messages[i].content;
              break;
            }
          }
        }

        if (!botReply) {
          console.log(`No reply yet for ${msg.id_message} (${Math.round(ageMs / 1000)}s old)`);
          continue;
        }

        let sentOk = false;
        if (botEnabled) {
          const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
          const sendResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: msg.chat_id, message: botReply }),
          });
          sentOk = sendResponse.ok;
          if (!sentOk) console.error('Failed to send WhatsApp:', await sendResponse.text());
        }

        await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: botEnabled && sentOk ? 'replied' : 'skipped' });
        await base44.asServiceRole.entities.WhatsAppMessageLog.create({
          id_message: `out_${Date.now()}_pr`,
          phone: msg.phone || msg.chat_id?.replace('@c.us', '') || '',
          direction: 'outgoing',
          text: botReply.substring(0, 500),
          status: botEnabled && sentOk ? 'replied' : 'skipped',
          chat_id: msg.chat_id,
          conversation_id: msg.conversation_id,
        });
        processed++;
      } catch (err) {
        console.error(`Error processing message ${msg.id_message}:`, err.message);
        errors++;
      }
    }

    return Response.json({ ok: true, processed, errors, total: pending.length });
  } catch (error) {
    console.error('processWhatsAppReplies error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
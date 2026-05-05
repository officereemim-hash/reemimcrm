import { base44 } from '@/api/base44Client';
import { findAndSaveConversationId } from '@/lib/findConversationId';

const AGENT_NAME = 'bot_reemim';
const _sentTriggers = new Set();
const _sendingLock = new Map();

async function wasTriggerRecentlySent(requestId, trigger) {
  const timeline = await base44.entities.ServiceRequestTimeline.filter(
    { service_request_id: requestId, event_type: 'message_sent' },
    '-created_date',
    10
  );
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return timeline.some(t => {
    if (!t.description || !t.description.includes(trigger)) return false;
    return new Date(t.created_date).getTime() > fiveMinutesAgo;
  });
}

export async function handleBotMessage(requestId, { skipIfNoTrigger = false, trigger = null } = {}) {
  const lockKey = trigger ? `${requestId}:${trigger}` : requestId;
  if (_sendingLock.has(lockKey)) {
    console.log('handleBotMessage: SKIPPING — locked for', lockKey);
    return null;
  }
  _sendingLock.set(lockKey, Date.now());
  try {
    return await _handleBotMessageInternal(requestId, skipIfNoTrigger);
  } finally {
    setTimeout(() => _sendingLock.delete(lockKey), 30000);
  }
}

async function _handleBotMessageInternal(requestId, skipIfNoTrigger = false) {
  await new Promise(resolve => setTimeout(resolve, 2000));

  const requests = await base44.entities.ServiceRequest.filter({ id: requestId });
  const req = requests[0];
  if (!req) {
    console.log('handleBotMessage: request not found', requestId);
    return null;
  }

  // Find conversation_id if missing
  let conversationId = req.conversation_id;
  const isValid = (id) => /^[a-f0-9]{24}$/i.test(id || '') && id !== req.contact_id;
  if (!isValid(conversationId) && req.contact_phone) {
    conversationId = await findAndSaveConversationId(requestId, req.contact_phone);
  }

  const trigger = req.pending_bot_message;
  if (trigger) {
    const triggerKey = `${requestId}:${trigger}`;
    if (_sentTriggers.has(triggerKey)) {
      await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' }).catch(() => {});
      return null;
    }
    const alreadySent = await wasTriggerRecentlySent(requestId, trigger);
    if (alreadySent) {
      _sentTriggers.add(triggerKey);
      await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' }).catch(() => {});
      return null;
    }
    await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' }).catch(() => {});

    const botResult = await base44.functions.invoke('onServiceRequestUpdate', {
      event: { type: 'update', entity_name: 'ServiceRequest', entity_id: requestId },
      data: { ...req, status: trigger, conversation_id: conversationId },
      old_data: { ...req, status: 'previous' },
    });
    const result = await sendMessage(botResult?.data, requestId, trigger, conversationId);
    if (result) _sentTriggers.add(triggerKey);
    return result;
  }

  const currentStatus = req.status;
  if (skipIfNoTrigger) return null;

  const botResult = await base44.functions.invoke('onServiceRequestUpdate', {
    event: { type: 'update', entity_name: 'ServiceRequest', entity_id: requestId },
    data: { ...req, status: currentStatus, conversation_id: conversationId },
    old_data: { ...req, status: 'previous' },
  });
  const botTrigger = botResult?.data?.botTrigger;
  if (botTrigger) {
    const alreadySent = await wasTriggerRecentlySent(requestId, botTrigger);
    if (alreadySent) return null;
    const result2 = await sendMessage(botResult?.data, requestId, botTrigger, conversationId);
    if (result2) _sentTriggers.add(`${requestId}:${botTrigger}`);
    return result2;
  }
  return null;
}

async function isWhatsAppBotEnabled() {
  try {
    const settings = await base44.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    return settings[0]?.value === 'true' || settings[0]?.value === true;
  } catch { return false; }
}

async function sendMessage(resultData, requestId, trigger, conversationId) {
  const botEnabled = await isWhatsAppBotEnabled();
  if (!botEnabled) {
    console.log('sendMessage: WhatsApp bot disabled — logging only');
  }

  const pending = resultData?.pendingBotMessage;
  if (!pending?.message) {
    console.log('sendMessage: no message to send');
    return null;
  }

  const effectiveConvId = pending?.conversationId || conversationId;

  // Sync message to Agent conversation
  if (effectiveConvId) {
    try {
      const conv = await base44.agents.getConversation(effectiveConvId);
      await base44.agents.addMessage(conv, { role: 'assistant', content: pending.message });
    } catch (err) {
      console.warn('sendMessage: agent message failed:', err.message);
    }
  }

  // Send WhatsApp copy if phone available and bot enabled
  const contactPhone = pending.contactPhone;
  if (botEnabled && contactPhone) {
    try {
      await base44.functions.invoke('sendWhatsAppMessage', { phone: contactPhone, message: pending.message });
    } catch (waErr) {
      console.warn('sendMessage: WhatsApp failed:', waErr.message);
    }
  }

  // Log to WhatsAppMessageLog
  if (contactPhone && effectiveConvId) {
    try {
      await base44.entities.WhatsAppMessageLog.create({
        phone: contactPhone,
        direction: 'outgoing',
        text: pending.message.substring(0, 500),
        status: botEnabled ? 'replied' : 'skipped',
        conversation_id: effectiveConvId,
      });
    } catch (logErr) {
      console.warn('sendMessage: log failed:', logErr.message);
    }
  }

  // Log to timeline
  await base44.entities.ServiceRequestTimeline.create({
    service_request_id: requestId,
    event_type: 'message_sent',
    description: `הודעת ${trigger} נשלחה אוטומטית`,
  });

  return { trigger, conversationId: effectiveConvId };
}
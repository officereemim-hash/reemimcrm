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
    const botResult = await base44.functions.invoke('autoServiceRequestUpdated', {
      event: { type: 'update', entity_name: 'ServiceRequest', entity_id: requestId },
      data: { ...req, pending_bot_message: trigger, conversation_id: conversationId },
      old_data: { ...req, pending_bot_message: '' },
    });
    if (!botResult?.data?.action) return null;
    const result = { trigger, conversationId, action: botResult.data.action };
    _sentTriggers.add(triggerKey);
    return result;
  }

  const currentStatus = req.status;
  if (skipIfNoTrigger) return null;

  const botResult = await base44.functions.invoke('autoServiceRequestUpdated', {
    event: { type: 'update', entity_name: 'ServiceRequest', entity_id: requestId },
    data: { ...req, status: currentStatus, conversation_id: conversationId },
    old_data: { ...req, status: 'previous' },
  });
  if (botResult?.data?.action) {
    return { trigger: currentStatus, conversationId, action: botResult.data.action };
  }
  return null;
}
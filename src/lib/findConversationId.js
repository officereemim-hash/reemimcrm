import { base44 } from '@/api/base44Client';

const AGENT_NAME = 'bot_reemim';

/**
 * Finds the conversation_id for a service request by looking at WhatsAppMessageLog
 * or agent conversations. Saves it to the ServiceRequest if found.
 */
export async function findAndSaveConversationId(requestId, contactPhone) {
  if (!contactPhone) return null;

  // Clean phone
  let cleanPhone = contactPhone.replace(/[\s\-\+]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);

  // 1. Check WhatsAppMessageLog for existing conversation_id
  const logs = await base44.entities.WhatsAppMessageLog.filter(
    { phone: cleanPhone },
    '-created_date',
    5
  );
  for (const log of logs) {
    if (log.conversation_id && /^[a-f0-9]{24}$/i.test(log.conversation_id)) {
      await base44.entities.ServiceRequest.update(requestId, { conversation_id: log.conversation_id });
      return log.conversation_id;
    }
  }

  // 2. Also try with original phone format
  if (cleanPhone !== contactPhone) {
    const logs2 = await base44.entities.WhatsAppMessageLog.filter(
      { phone: contactPhone },
      '-created_date',
      5
    );
    for (const log of logs2) {
      if (log.conversation_id && /^[a-f0-9]{24}$/i.test(log.conversation_id)) {
        await base44.entities.ServiceRequest.update(requestId, { conversation_id: log.conversation_id });
        return log.conversation_id;
      }
    }
  }

  // 3. Search agent conversations
  try {
    const convs = await base44.agents.listConversations({
      limit: 20,
      sort: '-created_date',
      q: { agent_name: AGENT_NAME },
    });
    if (convs && convs.length > 0) {
      // Return the most recent conversation (best guess)
      const convId = convs[0].id;
      await base44.entities.ServiceRequest.update(requestId, { conversation_id: convId });
      return convId;
    }
  } catch (err) {
    console.warn('findConversationId: agent search failed:', err.message);
  }

  return null;
}
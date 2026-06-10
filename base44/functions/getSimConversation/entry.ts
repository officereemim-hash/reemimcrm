import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { conversation_id } = await req.json();

    if (conversation_id) {
      const conversation = await base44.asServiceRole.agents.getConversation(conversation_id);
      return Response.json({ conversation });
    }

    const conversations = await base44.asServiceRole.agents.listConversations({ agent_name: 'bot_reemim' });
    return Response.json({ conversations: conversations || [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
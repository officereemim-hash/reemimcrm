import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// פונקציית debug זמנית — קריאת שיחת סוכן לפי conversation_id (מוגנת בסוד פנימי). למחיקה אחרי השימוש.
const INTERNAL_SECRET = 'dbg_conv_dump_2026_tmp';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== INTERNAL_SECRET) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const conversationId = url.searchParams.get('conversation_id') || '';
    if (!conversationId) return Response.json({ error: 'missing conversation_id' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const conversation = await base44.asServiceRole.agents.getConversation(conversationId);
    const messages = (conversation.messages || []).map((m, i) => ({
      i,
      role: m.role,
      content: String(m.content || '').substring(0, 300),
      created: m.created_date || m.created_at || null,
    }));
    return Response.json({ ok: true, count: messages.length, status: conversation.status || null, messages: messages.slice(-12) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

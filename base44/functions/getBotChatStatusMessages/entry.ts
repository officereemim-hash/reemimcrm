import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toUtcTime = (value) => {
  if (!value) return 0;
  const s = String(value);
  return new Date(/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`).getTime();
};

const buildPhoneVariants = (phone) => {
  const raw = String(phone || '').trim().replace(/[\s-]/g, '').replace(/^\+/, '');
  if (!raw) return [];
  const normalized = raw.startsWith('0') ? `972${raw.substring(1)}` : raw;
  const local = normalized.startsWith('972') ? `0${normalized.substring(3)}` : raw;
  return [...new Set([raw, normalized, `+${normalized}`, local].filter(Boolean))];
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversation_id } = await req.json();
    if (!conversation_id) {
      return Response.json({ messages: [] });
    }

    const conv = await base44.asServiceRole.agents.getConversation(conversation_id);
    const meta = conv?.metadata || {};

    // 1) Deterministic link: ServiceRequest pointing to this conversation
    let contact = null;
    const linked = await base44.asServiceRole.entities.ServiceRequest.filter({ conversation_id });
    if (linked[0]?.contact_id) {
      const byId = await base44.asServiceRole.entities.Contact.filter({ id: linked[0].contact_id });
      contact = byId[0] || null;
    }

    // 2) Fallback: phone from conversation metadata
    if (!contact) {
      for (const variant of buildPhoneVariants(meta.phone)) {
        const found = await base44.asServiceRole.entities.Contact.filter({ phone: variant });
        if (found[0]) { contact = found[0]; break; }
      }
    }

    // 3) Fallback: email from conversation metadata
    if (!contact && meta.email) {
      const byEmail = await base44.asServiceRole.entities.Contact.filter({ email: String(meta.email).trim().toLowerCase() });
      contact = byEmail[0] || null;
    }

    if (!contact) {
      return Response.json({ messages: [], reason: 'no_contact' });
    }

    const communications = await base44.asServiceRole.entities.Communication.filter(
      { contact_id: contact.id, type: 'whatsapp', direction: 'outbound' }, '-created_date', 20
    );
    const startedAt = toUtcTime(conv?.created_date);
    const messages = communications
      .filter(c => c.is_automated && c.content && toUtcTime(c.created_date) >= startedAt - 60000)
      .map(c => ({
        id: `status-${c.id}`,
        role: 'assistant',
        content: c.content,
        created_date: c.created_date,
        source: 'status_automation',
        status: c.status,
      }))
      .reverse();

    return Response.json({ messages });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
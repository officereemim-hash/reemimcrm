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

    // Conversation details come from the client (it owns the conversation object);
    // reading the conversation server-side fails with 403 for app-user-owned conversations.
    const { conversation_id, phone, email, started_at } = await req.json();
    if (!conversation_id) {
      return Response.json({ messages: [] });
    }

    const meta = { phone, email };

    // Resolve a contact_id — the Contact record itself may have been deleted,
    // so ServiceRequest records (which store contact_phone/contact_email) are also searched.
    let contactId = null;

    // 1) Deterministic link: ServiceRequest pointing to this conversation
    const linked = await base44.asServiceRole.entities.ServiceRequest.filter({ conversation_id });
    contactId = linked[0]?.contact_id || null;

    const phoneVariants = buildPhoneVariants(meta.phone);

    // 2) Contact by phone
    if (!contactId) {
      for (const variant of phoneVariants) {
        const found = await base44.asServiceRole.entities.Contact.filter({ phone: variant });
        if (found[0]) { contactId = found[0].id; break; }
      }
    }

    // 3) ServiceRequest by contact_phone (works even when the Contact was deleted)
    if (!contactId) {
      for (const variant of phoneVariants) {
        const found = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_phone: variant }, '-created_date', 1);
        if (found[0]?.contact_id) { contactId = found[0].contact_id; break; }
      }
    }

    // 4) Email fallbacks
    if (!contactId && meta.email) {
      const normalizedEmail = String(meta.email).trim().toLowerCase();
      const byEmail = await base44.asServiceRole.entities.Contact.filter({ email: normalizedEmail });
      contactId = byEmail[0]?.id || null;
      if (!contactId) {
        const bySr = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_email: normalizedEmail }, '-created_date', 1);
        contactId = bySr[0]?.contact_id || null;
      }
    }

    if (!contactId) {
      return Response.json({ messages: [], reason: 'no_contact' });
    }

    const communications = await base44.asServiceRole.entities.Communication.filter(
      { contact_id: contactId, type: 'whatsapp', direction: 'outbound' }, '-created_date', 20
    );
    const startedAt = toUtcTime(started_at);
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
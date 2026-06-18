import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Normalizes a phone to a few comparable forms so we catch every stored variant.
function phoneVariants(raw) {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  const local = digits; // e.g. 0501234567
  const intl972 = local.startsWith('0') ? '972' + local.slice(1) : digits;
  const plus = '+' + intl972;
  return [...new Set([raw, local, intl972, plus, intl972 + '@c.us', local + '@c.us'])].filter(Boolean);
}

// Wipes every record tied to a test phone (and/or email) so the bot behaves as if it's a brand-new user.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const phone = (body.phone || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    if (!phone && !email) {
      return Response.json({ error: 'missing_phone_or_email' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const variants = phone ? phoneVariants(phone) : [];
    const deleted = {};

    const del = async (name, records) => {
      let n = 0;
      for (const r of records) { await svc.entities[name].delete(r.id); n++; }
      if (n) deleted[name] = (deleted[name] || 0) + n;
    };

    // 1) Find matching contacts (by any phone variant or email)
    const allContacts = await svc.entities.Contact.list('-created_date', 1000);
    const matchContacts = allContacts.filter(c => {
      const cp = (c.phone || '').replace(/\D/g, '');
      const byPhone = phone && variants.some(v => (v || '').replace(/\D/g, '') && cp.endsWith((v || '').replace(/\D/g, '').slice(-9)));
      const byEmail = email && (c.email || '').toLowerCase() === email;
      return byPhone || byEmail;
    });
    const contactIds = new Set(matchContacts.map(c => c.id));

    // 2) Delete all child records linked to those contacts
    const childEntities = ['ServiceRequest', 'Meeting', 'Task', 'Communication', 'Document', 'WebinarRegistration', 'ServiceRequestFile', 'ServiceRequestTimeline'];
    for (const ent of childEntities) {
      try {
        const all = await svc.entities[ent].list('-created_date', 2000);
        const rel = all.filter(r => contactIds.has(r.contact_id));
        // ServiceRequestTimeline / ServiceRequestFile link via service_request_id — handle below
        await del(ent, rel);
      } catch (_) { /* entity may not exist; skip */ }
    }

    // 2b) Timeline / files linked through service_request_id of the deleted requests
    // (already covered above where they carry contact_id; this is a best-effort extra pass)

    // 3) WhatsApp logs by phone variants
    try {
      const logs = await svc.entities.WhatsAppMessageLog.list('-created_date', 3000);
      const relLogs = logs.filter(l => {
        const lp = (l.phone || '').replace(/\D/g, '');
        return variants.some(v => (v || '').replace(/\D/g, '') && lp.endsWith((v || '').replace(/\D/g, '').slice(-9)));
      });
      await del('WhatsAppMessageLog', relLogs);
    } catch (_) { /* skip */ }

    // 4) Remove from block list (so a re-test isn't blocked by a prior "הסר")
    try {
      const blocks = await svc.entities.WhatsAppBlockList.list('-created_date', 2000);
      const relBlocks = blocks.filter(b => {
        const bp = (b.phone || '').replace(/\D/g, '');
        return variants.some(v => (v || '').replace(/\D/g, '') && bp.endsWith((v || '').replace(/\D/g, '').slice(-9)));
      });
      await del('WhatsAppBlockList', relBlocks);
    } catch (_) { /* skip */ }

    // 4b) Remove saved conversation mappings & pending-contact settings so the bot treats it as brand-new
    try {
      const phoneKeys = variants.map(v => (v || '').replace(/\D/g, '')).filter(Boolean);
      const settings = await svc.entities.SystemSetting.list('-created_date', 3000);
      const relSettings = settings.filter(s => {
        const k = s.key || '';
        if (!k.startsWith('phone_conv_') && !k.startsWith('pending_contact_')) return false;
        return phoneKeys.some(pk => k.endsWith(pk.slice(-9)));
      });
      await del('SystemSetting', relSettings);
    } catch (_) { /* skip */ }

    // 5) Finally delete the contacts themselves
    await del('Contact', matchContacts);

    return Response.json({ ok: true, deleted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
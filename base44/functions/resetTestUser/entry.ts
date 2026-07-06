import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function phoneVariants(raw) {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  const local = digits;
  const intl972 = local.startsWith('0') ? '972' + local.slice(1) : digits;
  const plus = '+' + intl972;
  return [...new Set([raw, local, intl972, plus])].filter(Boolean);
}

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
    const errors = [];

    // מחיקה מקבילית במקבצים של 10
    const del = async (name, records) => {
      for (let i = 0; i < records.length; i += 10) {
        const batch = records.slice(i, i + 10);
        const results = await Promise.allSettled(batch.map(r => svc.entities[name].delete(r.id)));
        for (const result of results) {
          if (result.status === 'rejected') {
            errors.push({ entity: name, error: result.reason?.message || String(result.reason) });
          }
        }
      }
      if (records.length) deleted[name] = (deleted[name] || 0) + records.length;
    };

    // 1) מציאת Contacts — שאילתות ממוקדות
    let matchContacts = [];
    for (const v of variants) {
      const byPhone = await svc.entities.Contact.filter({ phone: v });
      matchContacts.push(...byPhone);
    }
    if (email) {
      const byEmail = await svc.entities.Contact.filter({ email });
      matchContacts.push(...byEmail);
    }
    // ייחוד לפי id
    const contactIdSet = new Set();
    matchContacts = matchContacts.filter(c => {
      if (contactIdSet.has(c.id)) return false;
      contactIdSet.add(c.id);
      return true;
    });
    const contactIds = [...contactIdSet];

    // 2) מחיקת ישויות-בת לכל contact
    const childEntities = ['ServiceRequest', 'Meeting', 'Task', 'Communication', 'Document', 'WebinarRegistration', 'ServiceRequestFile', 'ServiceRequestTimeline'];
    for (const contactId of contactIds) {
      for (const ent of childEntities) {
        const records = await svc.entities[ent].filter({ contact_id: contactId });
        if (records.length) await del(ent, records);
      }
    }

    // 3) WhatsApp logs — שאילתות ממוקדות לפי טלפון
    for (const v of variants) {
      const logs = await svc.entities.WhatsAppMessageLog.filter({ phone: v });
      if (logs.length) await del('WhatsAppMessageLog', logs);
    }

    // 4) חסימות — שאילתות ממוקדות לפי טלפון
    for (const v of variants) {
      const blocks = await svc.entities.WhatsAppBlockList.filter({ phone: v });
      if (blocks.length) await del('WhatsAppBlockList', blocks);
    }

    // 4b) הגדרות מערכת דינמיות — שאילתות ממוקדות לפי מפתח
    const settingPrefixes = ['phone_conv_', 'pending_contact_', 'rate_limit_alerted_', 'loop_guard_alerted_', 'id_retry_', 'pending_missing_field_'];
    const phoneSuffixes = variants.map(v => (v || '').replace(/\D/g, '')).filter(Boolean);
    const uniqueSuffixes = [...new Set(phoneSuffixes)];
    for (const prefix of settingPrefixes) {
      for (const suffix of uniqueSuffixes) {
        const settings = await svc.entities.SystemSetting.filter({ key: prefix + suffix });
        if (settings.length) await del('SystemSetting', settings);
      }
    }

    // 5) שמירת shoranss_lead_ids כדי שהסנכרון לא ייצור אותם מחדש
    const leadIds = matchContacts.map(c => c.shoranss_lead_id).filter(Boolean);
    if (leadIds.length > 0) {
      const existing = await svc.entities.SystemSetting.filter({ key: 'ignored_shoranss_lead_ids' });
      const current = existing[0]?.value ? existing[0].value.split(',').filter(Boolean) : [];
      const merged = [...new Set([...current, ...leadIds])].join(',');
      if (existing[0]) {
        await svc.entities.SystemSetting.update(existing[0].id, { value: merged });
      } else {
        await svc.entities.SystemSetting.create({ category: 'flow', key: 'ignored_shoranss_lead_ids', label: 'Ignored Shoranss Lead IDs (test cleanup)', value: merged, value_type: 'text' });
      }
    }

    // 6) מחיקת Contacts עצמם
    await del('Contact', matchContacts);

    return Response.json({ ok: errors.length === 0, deleted, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
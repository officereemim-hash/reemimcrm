import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SPREADSHEET_ID = '1NZGh13s9AMQy-tROtUDxdI8nQ0K4Dq8pgp4MCIQDvJg';
const WEBSITE_TAB = 'Website';
const WEBINAR_TAB = 'Meta_webinar_New';
const SYNC_STATE_KEY = 'leads_sync_last_rows';

function normalizePhone(raw) {
  let clean = String(raw || '').replace(/[^\d]/g, '');
  if (clean.startsWith('972')) clean = '0' + clean.substring(3);
  if (clean.length === 9 && clean.startsWith('5')) clean = '0' + clean;
  return clean;
}

function extractYear(dateStr) {
  const match = String(dateStr || '').match(/20\d{2}/);
  return match ? parseInt(match[0]) : null;
}

function detectServiceType(reason) {
  const text = String(reason || '');
  if (text.includes('פרישה')) return 'retirement';
  if (text.includes('השקע')) return 'investments';
  if (text.includes('גירוש') || text.includes('איזון')) return 'divorce_split';
  if (text.includes('מס')) return 'tax_advisory';
  if (text.includes('כדאיות') || text.includes('היתכנות')) return 'economic_feasibility';
  return undefined;
}

function detectWebinarType(rowText) {
  const text = String(rowText || '');
  if (text.includes('השקע')) return 'investments';
  if (text.includes('גירוש') || text.includes('איזון')) return 'divorce';
  return 'retirement';
}

function parseWebinarDate(createdTime) {
  const date = new Date(createdTime);
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function readTab(accessToken, tab) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`'${tab}'!A1:Z`)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Failed reading tab ${tab}: ${data.error?.message}`);
  return data.values || [];
}

function buildHeaderIndex(headerRow) {
  const index = {};
  (headerRow || []).forEach((header, i) => {
    index[String(header || '').trim().toLowerCase()] = i;
  });
  return index;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const isAutomation = !user;
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!user && !isAutomation) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Load sync state (last processed row counts per tab)
    const stateSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: SYNC_STATE_KEY });
    const state = stateSettings[0] ? JSON.parse(stateSettings[0].value) : { website: 1, webinar: 1 };

    // Load existing contacts for de-duplication
    const existingContacts = await base44.asServiceRole.entities.Contact.list('-created_date', 1000);
    const phoneSet = new Set();
    const emailSet = new Set();
    for (const c of existingContacts) {
      if (c.phone) phoneSet.add(normalizePhone(c.phone));
      if (c.email) emailSet.add(String(c.email).toLowerCase().trim());
    }

    const [websiteRows, webinarRows] = await Promise.all([
      readTab(accessToken, WEBSITE_TAB),
      readTab(accessToken, WEBINAR_TAB),
    ]);

    let created = { website: 0, webinar: 0, skipped_duplicates: 0, skipped_invalid: 0 };

    // ===== Website tab =====
    const wsHeaders = buildHeaderIndex(websiteRows[0]);
    const wsDate = wsHeaders['date'];
    const wsFirst = wsHeaders['first name'];
    const wsLast = wsHeaders['last name'];
    const wsPhone = wsHeaders['phone'];
    const wsEmail = wsHeaders['email'];
    const wsReason = wsHeaders['סיבת הפניה'];

    for (let i = Math.max(state.website, 1); i < websiteRows.length; i++) {
      const row = websiteRows[i];
      if (!row || row.length === 0) continue;
      const phone = normalizePhone(row[wsPhone]);
      const email = String(row[wsEmail] || '').toLowerCase().trim();
      const fullName = `${row[wsFirst] || ''} ${row[wsLast] || ''}`.trim();

      if (!phone || !fullName) { created.skipped_invalid++; continue; }
      if (phoneSet.has(phone) || (email && emailSet.has(email))) { created.skipped_duplicates++; continue; }

      const year = extractYear(row[wsDate]);
      const isHistorical = year !== null && year < 2026;
      const reason = String(row[wsReason] || '').trim();
      const noteParts = [];
      if (isHistorical) noteParts.push('ליד היסטורי (יובא מגוגל שיטס)');
      if (reason) noteParts.push(`סיבת הפניה: ${reason}`);

      const contact = await base44.asServiceRole.entities.Contact.create({
        full_name: fullName,
        phone,
        email: email || undefined,
        source: 'website',
        status: 'new_lead',
        notes: noteParts.join('\n') || undefined,
      });

      await base44.asServiceRole.entities.ServiceRequest.create({
        contact_id: contact.id,
        contact_name: fullName,
        contact_phone: phone,
        contact_email: email || undefined,
        service_type: detectServiceType(reason),
        status: 'new',
        source: 'website',
        notes: noteParts.join('\n') || undefined,
      });

      phoneSet.add(phone);
      if (email) emailSet.add(email);
      created.website++;
    }

    // ===== Webinar (Meta) tab =====
    const wbHeaders = buildHeaderIndex(webinarRows[0]);
    const wbCreated = wbHeaders['created_time'];
    const wbFirst = wbHeaders['שם_פרטי'];
    const wbLast = wbHeaders['שם_משפחה'];
    const wbEmail = wbHeaders['דוא"ל'];
    const wbPhone = wbHeaders['phone'];

    for (let i = Math.max(state.webinar, 1); i < webinarRows.length; i++) {
      const row = webinarRows[i];
      if (!row || row.length === 0) continue;
      const phone = normalizePhone(row[wbPhone]);
      const email = String(row[wbEmail] || '').toLowerCase().trim();
      const fullName = `${row[wbFirst] || ''} ${row[wbLast] || ''}`.trim();

      if (!phone || !fullName) { created.skipped_invalid++; continue; }
      if (phoneSet.has(phone) || (email && emailSet.has(email))) { created.skipped_duplicates++; continue; }

      const year = extractYear(row[wbCreated]);
      const isHistorical = year !== null && year < 2026;

      const contact = await base44.asServiceRole.entities.Contact.create({
        full_name: fullName,
        phone,
        email: email || undefined,
        source: 'webinar',
        status: 'new_lead',
        notes: isHistorical ? 'ליד היסטורי (יובא מגוגל שיטס)' : undefined,
      });

      await base44.asServiceRole.entities.WebinarRegistration.create({
        contact_id: contact.id,
        webinar_type: detectWebinarType(row.join(' ')),
        webinar_date: parseWebinarDate(row[wbCreated]),
      });

      phoneSet.add(phone);
      if (email) emailSet.add(email);
      created.webinar++;
    }

    // Save sync state
    const newState = JSON.stringify({ website: websiteRows.length, webinar: webinarRows.length });
    if (stateSettings[0]) {
      await base44.asServiceRole.entities.SystemSetting.update(stateSettings[0].id, { value: newState });
    } else {
      await base44.asServiceRole.entities.SystemSetting.create({
        key: SYNC_STATE_KEY,
        value: newState,
        category: 'flow',
        label: 'מצב סנכרון לידים מגוגל שיטס',
      });
    }

    return Response.json({ ok: true, ...created });
  } catch (error) {
    console.error('syncLeadsFromSheets error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
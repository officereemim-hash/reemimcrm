import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PROCESSED_LABEL = 'Shoranss-Processed';

async function gmail(token, path, opts = {}) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Gmail ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function b64urlDecode(data) {
  const s = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
  try { return decodeURIComponent(escape(atob(s))); } catch { return ''; }
}

function decodeRfc2047(s) {
  return String(s || '').replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b) => {
    try { return decodeURIComponent(escape(atob(b))); } catch { return ''; }
  });
}

function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function bytesToUtf8(s) {
  try { return decodeURIComponent(escape(s)); } catch { return s; }
}

function extractText(payload) {
  let raw = '';
  const walk = (p) => {
    if (!p) return;
    if ((p.mimeType === 'text/plain' || p.mimeType === 'text/html') && p.body?.data) {
      const b64 = String(p.body.data).replace(/-/g, '+').replace(/_/g, '/');
      try { raw += atob(b64) + '\n'; } catch (e) {}
    }
    if (p.parts) p.parts.forEach(walk);
  };
  walk(payload);
  return bytesToUtf8(decodeQuotedPrintable(raw));
}

async function ensureLabel(token) {
  const { labels } = await gmail(token, 'labels');
  const found = (labels || []).find((l) => l.name === PROCESSED_LABEL);
  if (found) return found.id;
  const created = await gmail(token, 'labels', {
    method: 'POST',
    body: JSON.stringify({ name: PROCESSED_LABEL, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
  });
  return created.id;
}

function normName(s) {
  return String(s || '').replace(/^(fwd|fw|נ|העברה)\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const token = accessToken;
    const labelId = await ensureLabel(token);

    // שני המקורות: ישירות משורנס, וגם מה שמועבר אוטומטית מהמייל של בשמת
    const q = encodeURIComponent(
      '(from:notifications@app.surense.com OR from:bosmat@oryx-alt.com) ' +
      'newer_than:60d'
    );
    const list = await gmail(token, `messages?q=${q}&maxResults=1`);
    const ids = (list.messages || []).map((m) => m.id);

    const seen = new Set();
    let matched = 0, skippedDup = 0, flagged = 0;

    for (const id of ids) {
      const msg = await gmail(token, `messages/${id}?format=full`);
      const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
      const subject = decodeRfc2047(headers['subject'] || '');
      const text = extractText(msg.payload);
      const label = () => gmail(token, `messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: [labelId] }) });

      if (!/נוצר ליד חדש/.test(text) && !/נוצר ליד חדש/.test(subject)) { await label(); continue; }

      const m = text.match(/app\.surense\.com\/leads\?id=([0-9a-fA-F-]{36})/);
      const leadId = m ? m[1] : '';
      const name = normName(subject);

      // דדופ לפי מזהה הליד מ-שורנס
      if (leadId) {
        if (seen.has(leadId)) { await label(); skippedDup++; continue; }
        const existing = await base44.asServiceRole.entities.Contact.filter({ shoranss_lead_id: leadId });
        if (existing.length > 0) { await label(); skippedDup++; continue; }
        seen.add(leadId);
      }

      // התאמה לפי שם — עדיפות למי ששלחנו לו שאלון
      let candidates = await base44.asServiceRole.entities.Contact.filter({ full_name: name, shoranss_questionnaire: 'sent' });
      if (candidates.length === 0) candidates = await base44.asServiceRole.entities.Contact.filter({ full_name: name });

      if (candidates.length === 1) {
        const c = candidates[0];
        await base44.asServiceRole.entities.Contact.update(c.id, {
          shoranss_questionnaire: 'filled',
          shoranss_linked: true,
          ...(leadId ? { shoranss_lead_id: leadId, shoranss_lead_url: `https://app.surense.com/leads?id=${leadId}` } : {}),
        });
        await base44.asServiceRole.entities.Communication.create({
          contact_id: c.id, type: 'note', direction: 'inbound', sent_by: 'system',
          is_automated: true, status: 'sent', template_id: 'shoranss_lead_created',
          content: `שאלון שורנס מולא — נוצר ליד בשורנס (${name}). לצפייה: https://app.surense.com/leads?id=${leadId}`,
        });
        matched++;
      } else {
        // אין התאמה — ליד שלא הגיע מהבוט. יוצרים לקוח חדש + משימה להשלמה.
        const newContact = await base44.asServiceRole.entities.Contact.create({
          full_name: name,
          status: 'new_lead',
          source: 'shoranss',
          shoranss_questionnaire: 'filled',
          shoranss_linked: true,
          ...(leadId ? { shoranss_lead_id: leadId, shoranss_lead_url: `https://app.surense.com/leads?id=${leadId}` } : {}),
        });
        await base44.asServiceRole.entities.Communication.create({
          contact_id: newContact.id, type: 'note', direction: 'inbound', sent_by: 'system',
          is_automated: true, status: 'sent', template_id: 'shoranss_lead_created',
          content: `נוצר לקוח חדש מהתראת שורנס (${name}). מקור: שורנס. לצפייה: https://app.surense.com/leads?id=${leadId}`,
        });
        await base44.asServiceRole.entities.Task.create({
          title: `שורנס: ליד חדש מ-שורנס — להשלים טלפון/ת"ז — ${name}`,
          contact_id: newContact.id,
          type: 'followup', status: 'open', priority: 'high', auto_generated: true,
          notes: `נוצר לקוח חדש מהתראת שורנס (${name}). יש להשלים טלפון/ת"ז. קישור: https://app.surense.com/leads?id=${leadId}`,
        });
        flagged++;
      }
      await label();
    }

    const countQ = async (qq) => {
      try {
        const r = await gmail(token, `messages?q=${encodeURIComponent(qq)}&maxResults=1`);
        return r.resultSizeEstimate ?? 0;
      } catch (e) { return `ERR:${e.message}`; }
    };
    const profile = await gmail(token, 'profile');
    const diag = {
      connectedEmail: profile.emailAddress,
      cFromNotif: await countQ('from:notifications@app.surense.com'),
      cFromNotifAnywhere: await countQ('from:notifications@app.surense.com in:anywhere'),
      cLabeled: await countQ('label:Shoranss-Processed'),
      cMainQuery: await countQ('(from:notifications@app.surense.com OR from:bosmat@oryx-alt.com) -label:Shoranss-Processed newer_than:60d'),
    };
    return Response.json({ ok: true, diag, matched, skippedDup, flagged });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function b64(data) {
  let s = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  try { return atob(s); } catch (e) { return ''; }
}
function toUtf8(s) { try { return decodeURIComponent(escape(s)); } catch { return s; } }

function decodeRfc2047(s) {
  return String(s || '').replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b) => toUtf8(b64(b)));
}

async function gmail(token, path, opts = {}) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...opts, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Gmail ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function extractText(payload) {
  let raw = '';
  const walk = (p) => {
    if (!p) return;
    if ((p.mimeType === 'text/plain' || p.mimeType === 'text/html') && p.body?.data) {
      raw += b64(p.body.data) + '\n';
    }
    if (p.parts) p.parts.forEach(walk);
  };
  walk(payload);
  return toUtf8(raw);
}

function normName(s) {
  return String(s || '').replace(/^(fwd|fw|נ|העברה)\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { accessToken: token } = await base44.asServiceRole.connectors.getConnection('gmail');

    const q = encodeURIComponent('(from:notifications@app.surense.com OR from:bosmat@oryx-alt.com) newer_than:60d');
    const list = await gmail(token, `messages?q=${q}&maxResults=25`);
    const ids = (list.messages || []).map((m) => m.id);

    // Load ignored lead IDs (from test cleanup) so we don't re-create deleted test contacts
    const ignoredSetting = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'ignored_shoranss_lead_ids' });
    const ignoredIds = new Set((ignoredSetting[0]?.value || '').split(',').filter(Boolean));

    const seen = new Set();
    let matched = 0, skippedDup = 0, flagged = 0;
    const created = [];

    for (const id of ids) {
      const msg = await gmail(token, `messages/${id}?format=full`);
      const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
      const subject = decodeRfc2047(headers['subject'] || '');
      const text = extractText(msg.payload);

      if (!/נוצר ליד חדש/.test(text)) continue;

      const m = text.match(/app\.surense\.com\/leads\?id=([0-9a-fA-F-]{36})/);
      const leadId = m ? m[1] : '';
      const name = normName(subject);
      if (!name) continue;

      if (leadId) {
        if (seen.has(leadId) || ignoredIds.has(leadId)) { skippedDup++; continue; }
        seen.add(leadId);
        const existing = await base44.asServiceRole.entities.Contact.filter({ shoranss_lead_id: leadId });
        if (existing.length > 0) { skippedDup++; continue; }
      }

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
        const newContact = await base44.asServiceRole.entities.Contact.create({
          full_name: name, status: 'new_lead', source: 'shoranss',
          shoranss_questionnaire: 'filled', shoranss_linked: true,
          ...(leadId ? { shoranss_lead_id: leadId, shoranss_lead_url: `https://app.surense.com/leads?id=${leadId}` } : {}),
        });
        await base44.asServiceRole.entities.Communication.create({
          contact_id: newContact.id, type: 'note', direction: 'inbound', sent_by: 'system',
          is_automated: true, status: 'sent', template_id: 'shoranss_lead_created',
          content: `נוצר לקוח חדש מהתראת שורנס (${name}). מקור: שורנס. לצפייה: https://app.surense.com/leads?id=${leadId}`,
        });
        await base44.asServiceRole.entities.Task.create({
          title: `שורנס: ליד חדש מ-שורנס — להשלים טלפון/ת"ז — ${name}`,
          contact_id: newContact.id, type: 'followup', status: 'open', priority: 'high', auto_generated: true,
          notes: `נוצר לקוח חדש מהתראת שורנס (${name}). יש להשלים טלפון/ת"ז. קישור: https://app.surense.com/leads?id=${leadId}`,
        });
        created.push(name);
        flagged++;
      }
    }

    return Response.json({ ok: true, scanned: ids.length, matched, flagged, skippedDup, created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
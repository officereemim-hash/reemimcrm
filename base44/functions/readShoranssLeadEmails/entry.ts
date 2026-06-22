import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function b64(data) {
  let s = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  try { return atob(s); } catch (e) { return ''; }
}
function decodeRfc2047(s) {
  return String(s || '').replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b) => {
    try { return decodeURIComponent(escape(b64(b))); } catch { return ''; }
  });
}
function decodeQP(str) {
  return str.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function toUtf8(s) { try { return decodeURIComponent(escape(s)); } catch { return s; } }

async function gmail(token, path, opts = {}) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...opts, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Gmail ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function collectParts(payload) {
  const out = [];
  const walk = (p) => {
    if (!p) return;
    if ((p.mimeType === 'text/plain' || p.mimeType === 'text/html') && p.body?.data) {
      out.push({ mime: p.mimeType, decoded: b64(p.body.data) });
    }
    if (p.parts) p.parts.forEach(walk);
  };
  walk(payload);
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { accessToken: token } = await base44.asServiceRole.connectors.getConnection('gmail');
    const q = encodeURIComponent('(from:notifications@app.surense.com OR from:bosmat@oryx-alt.com) newer_than:60d');
    const list = await gmail(token, `messages?q=${q}&maxResults=25`);
    const ids = (list.messages || []).map((m) => m.id);

    const debug = [];
    for (const id of ids) {
      const msg = await gmail(token, `messages/${id}?format=full`);
      const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
      const parts = collectParts(msg.payload);
      const rawPlain = parts.find((p) => p.mime === 'text/plain')?.decoded || '';
      const textQP = toUtf8(decodeQP(rawPlain));
      const textRaw = toUtf8(rawPlain);
      debug.push({
        from: headers['from'],
        subjectDecoded: decodeRfc2047(headers['subject'] || ''),
        snippetQP: textQP.slice(0, 120),
        snippetRaw: textRaw.slice(0, 120),
        matchQP: /נוצר ליד חדש/.test(textQP),
        matchRaw: /נוצר ליד חדש/.test(textRaw),
      });
    }
    return Response.json({ ok: true, scanned: ids.length, debug });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
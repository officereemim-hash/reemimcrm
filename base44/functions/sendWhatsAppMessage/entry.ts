import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';
const _uchatNsCache = {};
async function uchatResolveNs(phone972) {
  if (!phone972) return null;
  if (_uchatNsCache[phone972]) return _uchatNsCache[phone972];
  try {
    const r = await fetch(`${UCHAT_BASE}/subscriber/get-info-by-user-id?user_id=${phone972}`, { headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } });
    if (!r.ok) return null;
    const j = await r.json();
    const ns = j?.user_ns || j?.data?.user_ns || null;
    if (ns) _uchatNsCache[phone972] = ns;
    return ns;
  } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phone, message, fileUrl, fileName } = await req.json();
    if (!phone || (!message && !fileUrl)) {
      return Response.json({ error: 'Missing phone and (message or fileUrl)' }, { status: 400 });
    }

    // Normalize phone — remove leading 0, ensure country code
    let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '972' + normalizedPhone.slice(1);
    }
    if (normalizedPhone.startsWith('+')) {
      normalizedPhone = normalizedPhone.slice(1);
    }

    const chatId = `${normalizedPhone}@c.us`;

    const ns = await uchatResolveNs(normalizedPhone);
    if (!ns) return Response.json({ ok: false, error: 'uchat_subscriber_not_found', chatId }, { status: 200 });
    const textToSend = fileUrl ? `${message || ''}${message ? '\n' : ''}${fileUrl}`.trim() : message;
    const r = await fetch(`${UCHAT_BASE}/subscriber/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
      body: JSON.stringify({ user_ns: ns, content: textToSend }), // uChat מצפה ל-content (לא text) — אחרת 422
    });
    const j = r.ok ? await r.json().catch(() => ({})) : {};
    if (j?.status === 'ok') return Response.json({ ok: true, mid: j.mid || j.data?.mid || null, chatId });
    return Response.json({ error: 'uchat send failed', details: j }, { status: 500 });
  } catch (error) {
    console.error('sendWhatsAppMessage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
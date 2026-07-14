import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

// ─── ספק שליחה: Green ↔ uChat (רדום תחת WHATSAPP_PROVIDER) ───
const WHATSAPP_PROVIDER = Deno.env.get('WHATSAPP_PROVIDER') || 'green';
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

    // uChat: שליחה ידנית של נציג = בתוך שיחה פעילה → send-text (קבצים: שליחת הקישור כטקסט בשלב 1)
    if (WHATSAPP_PROVIDER === 'uchat') {
      const ns = await uchatResolveNs(normalizedPhone);
      if (!ns) return Response.json({ ok: false, error: 'uchat_subscriber_not_found', chatId }, { status: 200 });
      const textToSend = fileUrl ? `${message || ''}${message ? '\n' : ''}${fileUrl}`.trim() : message;
      const r = await fetch(`${UCHAT_BASE}/subscriber/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
        body: JSON.stringify({ user_ns: ns, text: textToSend }),
      });
      const j = r.ok ? await r.json().catch(() => ({})) : {};
      if (j?.status === 'ok') return Response.json({ ok: true, mid: j.mid || j.data?.mid || null, chatId });
      return Response.json({ error: 'uchat send failed', details: j }, { status: 500 });
    }

    const greenSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' });
    const greenApiEnabled = greenSettings.length > 0 && greenSettings[0].value === 'true';
    if (!greenApiEnabled) {
      return Response.json({ ok: true, simulated: true, chatId });
    }

    const results = {};

    // שליחת קובץ (PDF / תמונה / וידאו) — אם סופק fileUrl
    if (fileUrl) {
      const fileApiUrl = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendFileByUrl/${API_TOKEN}`;
      const fileResponse = await fetch(fileApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, urlFile: fileUrl, fileName: fileName || 'file', caption: message || '' }),
      });
      const fileResult = await fileResponse.json();
      if (!fileResponse.ok) {
        return Response.json({ error: 'Green API file error', details: fileResult }, { status: 500 });
      }
      results.fileIdMessage = fileResult.idMessage;
      // קובץ נשלח עם caption — אין צורך לשלוח שוב את הטקסט בנפרד
      return Response.json({ ok: true, ...results, chatId });
    }

    // שליחת הודעת טקסט רגילה
    const url = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message, typingTime: 3000 }),
    });

    const result = await response.json();

    if (!response.ok) {
      return Response.json({ error: 'Green API error', details: result }, { status: 500 });
    }

    return Response.json({ ok: true, idMessage: result.idMessage, chatId });
  } catch (error) {
    console.error('sendWhatsAppMessage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
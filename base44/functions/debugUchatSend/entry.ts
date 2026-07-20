// פונקציית debug זמנית — שליחת send-text ישירה והחזרת התשובה הגולמית של uChat. למחיקה אחרי השימוש.
const INTERNAL_SECRET = 'dbg_uchat_send_2026_tmp';
const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== INTERNAL_SECRET) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const phone972 = url.searchParams.get('phone') || '';
    const text = url.searchParams.get('text') || 'בדיקת מערכת 🙏';

    // 1) resolve user_ns
    const infoRes = await fetch(`${UCHAT_BASE}/subscriber/get-info-by-user-id?user_id=${phone972}`, {
      headers: { Authorization: `Bearer ${UCHAT_TOKEN}` },
    });
    const infoText = await infoRes.text();
    let info = null; try { info = JSON.parse(infoText); } catch {}
    const ns = info?.user_ns || info?.data?.user_ns || null;

    // 2) send-text
    let sendStatus = null, sendBody = null;
    if (ns) {
      const sendRes = await fetch(`${UCHAT_BASE}/subscriber/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
        body: JSON.stringify({ user_ns: ns, content: text }),
      });
      sendStatus = sendRes.status;
      sendBody = await sendRes.text();
    }

    return Response.json({
      token_present: !!UCHAT_TOKEN,
      info_http: infoRes.status,
      info_body: infoText.substring(0, 600),
      resolved_ns: ns,
      send_http: sendStatus,
      send_body: String(sendBody || '').substring(0, 600),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

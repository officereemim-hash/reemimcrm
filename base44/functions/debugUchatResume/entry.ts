// פונקציית debug זמנית — בדיקת מצב subscriber + resume-bot. למחיקה אחרי השימוש.
const INTERNAL_SECRET = 'dbg_uchat_resume_2026_tmp';
const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== INTERNAL_SECRET) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const phone972 = url.searchParams.get('phone') || '';
    const doResume = url.searchParams.get('resume') === '1';

    const infoRes = await fetch(`${UCHAT_BASE}/subscriber/get-info-by-user-id?user_id=${phone972}`, {
      headers: { Authorization: `Bearer ${UCHAT_TOKEN}` },
    });
    const info = await infoRes.json().catch(() => ({}));
    const d = info?.data || info || {};
    const ns = d.user_ns || null;

    let resumeStatus = null, resumeBody = null;
    if (doResume && ns) {
      const r = await fetch(`${UCHAT_BASE}/subscriber/resume-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
        body: JSON.stringify({ user_ns: ns }),
      });
      resumeStatus = r.status;
      resumeBody = (await r.text()).substring(0, 400);
    }

    return Response.json({
      user_ns: ns,
      status: d.status || null,
      agent_id: d.agent_id ?? null,
      pause_bot: d.pause_bot ?? d.bot_paused ?? d.paused ?? null,
      resume_http: resumeStatus,
      resume_body: resumeBody,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

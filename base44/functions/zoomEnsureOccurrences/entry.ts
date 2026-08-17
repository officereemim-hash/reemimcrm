// תחזוקת "המופע הקבוע" (17.8.2026): בונה/מוודא סדרת מופעים חודשית לוובינר הקבוע עד סוף 2027,
// כדי שהוובינר לעולם לא ייעלם מהפורטל של זום (מה שקרה כשנשאר מופע יחיד והתאריך שלו עבר).
// שימוש: POST /functions/zoomEnsureOccurrences?secret=diag_zx9Qm7   body אופציונלי: {"from":"2026-09-01T17:00:00Z"}
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SECRET = 'diag_zx9Qm7';

async function getZoomToken() {
  const a = Deno.env.get('ZOOM_ACCOUNT_ID'), c = Deno.env.get('ZOOM_CLIENT_ID'), s = Deno.env.get('ZOOM_CLIENT_SECRET');
  if (!a || !c || !s) return null;
  const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${a}`, {
    method: 'POST', headers: { Authorization: `Basic ${btoa(`${c}:${s}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return r.ok ? (await r.json()).access_token : null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== SECRET) return Response.json({ error: 'forbidden' }, { status: 401 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const t = await getZoomToken();
    if (!t) return Response.json({ error: 'no_token' }, { status: 500 });
    const wid = (await base44.asServiceRole.entities.SystemSetting.filter({ key: 'zoom_webinar_id' }))[0]?.value;
    if (!wid) return Response.json({ error: 'no_webinar_id' }, { status: 500 });

    // תאריך הבסיס: מהפרמטר, אחרת המופע העתידי הקרוב, אחרת בעוד שבוע ב-20:00
    const w0 = await (await fetch(`https://api.zoom.us/v2/webinars/${wid}`, { headers: { Authorization: `Bearer ${t}` } })).json();
    const futureOcc = (w0.occurrences || []).filter(o => o.status === 'available' && new Date(o.start_time).getTime() > Date.now())
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
    const fromISO = body.from || futureOcc?.start_time || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().substring(0, 10) + 'T17:00:00Z';

    const d = new Date(fromISO);
    const local = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(d).replace(' ', 'T');
    const monthlyDay = Math.min(Number(local.substring(8, 10)), 28);

    const patch = await fetch(`https://api.zoom.us/v2/webinars/${wid}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_time: local, timezone: 'Asia/Jerusalem',
        recurrence: { type: 3, repeat_interval: 1, monthly_day: monthlyDay, end_date_time: '2027-12-31T20:00:00Z' },
      }),
    });
    if (!patch.ok && patch.status !== 204) {
      return Response.json({ error: 'patch_failed', status: patch.status, detail: (await patch.text().catch(() => '')).substring(0, 500) }, { status: 500 });
    }

    const w1 = await (await fetch(`https://api.zoom.us/v2/webinars/${wid}`, { headers: { Authorization: `Bearer ${t}` } })).json();
    const occ = (w1.occurrences || []).map(o => ({ start: o.start_time, status: o.status }));
    return Response.json({ ok: true, webinar_id: wid, base_local: local, occurrences_count: occ.length, occurrences: occ.slice(0, 6), start_url_exists: !!w1.start_url });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});

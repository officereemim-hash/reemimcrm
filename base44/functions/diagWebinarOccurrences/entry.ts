import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SECRET = 'diag_zx9Qm7';

async function getZoomToken() {
  const accountId = Deno.env.get('ZOOM_ACCOUNT_ID');
  const clientId = Deno.env.get('ZOOM_CLIENT_ID');
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET');
  if (!accountId || !clientId || !clientSecret) return null;
  const auth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) return null;
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== SECRET) return Response.json({ error: 'forbidden' }, { status: 401 });
    const base44 = createClientFromRequest(req);

    const webinarId = (await base44.asServiceRole.entities.SystemSetting.filter({ key: 'zoom_webinar_id' }))[0]?.value;
    const token = await getZoomToken();
    if (!token) return Response.json({ error: 'no_zoom_token' }, { status: 500 });

    const wRes = await fetch(`https://api.zoom.us/v2/webinars/${webinarId}`, { headers: { Authorization: `Bearer ${token}` } });
    const w = await wRes.json();
    const now = Date.now();
    const occ = (w.occurrences || []).map((o) => ({ start_time: o.start_time, status: o.status, occurrence_id: o.occurrence_id }))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    const nearestFutureAvailable = occ.filter((o) => o.status === 'available' && new Date(o.start_time).getTime() > now)[0] || null;

    // registrations grouped by webinar_date
    const regs = await base44.asServiceRole.entities.WebinarRegistration.list('-created_date', 500);
    const byDate = {};
    for (const r of regs) { const k = r.webinar_date || 'null'; byDate[k] = (byDate[k] || 0) + 1; }

    return Response.json({
      webinar_id: webinarId, topic: w.topic, type: w.type, timezone: w.timezone,
      total_occurrences: occ.length,
      available_count: occ.filter((o) => o.status === 'available').length,
      nearest_future_available: nearestFutureAvailable,
      occurrences: occ,
      registration_dates: byDate,
      server_now_utc: new Date(now).toISOString(),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});

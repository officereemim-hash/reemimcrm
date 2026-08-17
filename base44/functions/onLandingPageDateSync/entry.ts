import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
  if (!res.ok) { console.error('Zoom token error:', await res.text()); return null; }
  const data = await res.json();
  return data.access_token;
}

// ריפוי עצמי (17.8): כשאין אף מופע עתידי — בונים מחדש סדרת מופעים חודשית עד סוף 2027
// (מופע יחיד שעבר = הוובינר נעלם מהפורטל והרישומים נכשלים — התקלה של 17.8)
async function ensureFutureOccurrences(token, webinarId, fromDateISO) {
  const d = new Date(fromDateISO);
  if (isNaN(d.getTime()) || d.getTime() < Date.now()) return false;
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d).replace(' ', 'T');
  const monthlyDay = Number(local.substring(8, 10));
  const res = await fetch(`https://api.zoom.us/v2/webinars/${webinarId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_time: local, timezone: 'Asia/Jerusalem',
      recurrence: { type: 3, repeat_interval: 1, monthly_day: Math.min(monthlyDay, 28), end_date_time: '2027-12-31T20:00:00Z' },
    }),
  });
  if (!res.ok) { console.error('ensureFutureOccurrences failed:', res.status, await res.text().catch(() => '')); return false; }
  return true;
}

// Automation (LandingPage update): sync webinar_date to all registrations of the current cycle
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const page = body.data || body.record || body;
    const prev = body.old_data || body.previous || {};

    if (!page?.webinar_type) return Response.json({ ok: true, skipped: 'no_type' });

    const newDate = page.webinar_date || null;
    const oldDate = prev.webinar_date || null;
    if (newDate === oldDate) return Response.json({ ok: true, skipped: 'date_unchanged' });

    const now = Date.now();

    // Update all future, non-attended registrations of this webinar type
    const regs = await base44.asServiceRole.entities.WebinarRegistration.filter({ webinar_type: page.webinar_type });
    const targets = regs.filter(r =>
      r.attended !== true &&
      r.webinar_date &&
      new Date(r.webinar_date).getTime() > now
    );

    let synced = 0;
    for (const r of targets) {
      await base44.asServiceRole.entities.WebinarRegistration.update(r.id, {
        webinar_date: newDate,
        reminder_1h_sent: false,
        reminder_start_sent: false,
      });
      synced++;
    }

    // Update the nearest future Zoom occurrence to match the new date
    if (newDate) {
      try {
        const token = await getZoomToken();
        const webinarId = (await base44.asServiceRole.entities.SystemSetting.filter({ key: 'zoom_webinar_id' }))[0]?.value;
        if (token && webinarId) {
          const wRes = await fetch(`https://api.zoom.us/v2/webinars/${webinarId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const w = await wRes.json();
          let next = (w.occurrences || [])
            .filter(o => o.status === 'available' && new Date(o.start_time).getTime() > now)
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
          if (!next) {
            // אין מופע עתידי — בונים מחדש את הסדרה מהתאריך החדש ושולפים שוב
            const healed = await ensureFutureOccurrences(token, webinarId, newDate);
            if (healed) {
              const w2 = await (await fetch(`https://api.zoom.us/v2/webinars/${webinarId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
              next = (w2.occurrences || [])
                .filter(o => o.status === 'available' && new Date(o.start_time).getTime() > now)
                .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
            }
          }
          if (next) {
            const d = new Date(newDate);
            const local = new Intl.DateTimeFormat('sv-SE', {
              timeZone: 'Asia/Jerusalem',
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            }).format(d).replace(' ', 'T');
            await fetch(`https://api.zoom.us/v2/webinars/${webinarId}?occurrence_id=${next.occurrence_id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                start_time: local,
                timezone: 'Asia/Jerusalem',
              }),
            });
          }
        }
      } catch (e) {
        console.error('zoom occurrence date update failed:', e.message);
      }
    }

    // Clear old recording so new cycle starts fresh
    if (newDate && oldDate && newDate !== oldDate && page.id) {
      await base44.asServiceRole.entities.LandingPage.update(page.id, { recording_url: '' });
    }

    return Response.json({ ok: true, synced });
  } catch (error) {
    console.error('onLandingPageDateSync error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
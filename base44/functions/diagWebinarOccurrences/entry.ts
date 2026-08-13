import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SECRET = 'diag_zx9Qm7';

async function getZoomToken() {
  const accountId = Deno.env.get('ZOOM_ACCOUNT_ID');
  const clientId = Deno.env.get('ZOOM_CLIENT_ID');
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET');
  if (!accountId || !clientId || !clientSecret) return null;
  const auth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) return null;
  return (await res.json()).access_token;
}
const zget = (t, path) => fetch(`https://api.zoom.us/v2${path}`, { headers: { Authorization: `Bearer ${t}` } });

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== SECRET) return Response.json({ error: 'forbidden' }, { status: 401 });
    const action = url.searchParams.get('action') || 'snapshot';
    const token = await getZoomToken();
    if (!token) return Response.json({ error: 'no_zoom_token' }, { status: 500 });

    if (action === 'snapshot' || action === 'get') {
      const id = url.searchParams.get('id') || '86166375348';
      const w = await (await zget(token, `/webinars/${id}`)).json();
      return Response.json({ id: w.id, topic: w.topic, type: w.type, timezone: w.timezone, host_id: w.host_id,
        host_email: w.host_email, agenda: w.agenda, start_url_present: !!w.start_url, registration_url: w.registration_url,
        occurrences_count: (w.occurrences || []).length, settings: w.settings });
    }

    if (action === 'create') {
      const srcId = url.searchParams.get('src') || '86166375348';
      const src = await (await zget(token, `/webinars/${srcId}`)).json();
      const s = src.settings || {};
      const settings = {
        host_video: s.host_video, panelists_video: s.panelists_video, practice_session: s.practice_session,
        hd_video: s.hd_video, approval_type: s.approval_type, registration_type: s.registration_type,
        audio: s.audio, auto_recording: 'cloud', close_registration: s.close_registration,
        show_share_button: s.show_share_button, allow_multiple_devices: s.allow_multiple_devices,
        registrants_confirmation_email: s.registrants_confirmation_email,
        registrants_email_notification: s.registrants_email_notification,
        meeting_authentication: s.meeting_authentication, contact_name: s.contact_name, contact_email: s.contact_email,
      };
      const payload = { topic: src.topic, type: 6, timezone: src.timezone || 'Asia/Jerusalem', agenda: src.agenda || '', settings };
      const cr = await fetch(`https://api.zoom.us/v2/users/${src.host_id}/webinars`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await cr.json();
      if (!cr.ok) return Response.json({ error: 'create_failed', status: cr.status, body }, { status: 500 });
      return Response.json({ created: true, new_id: body.id, type: body.type, topic: body.topic,
        registration_url: body.registration_url, start_url_present: !!body.start_url, settings: body.settings, sent_payload: payload });
    }

    if (action === 'testreg') {
      const id = url.searchParams.get('id'); const email = url.searchParams.get('email');
      if (!id || !email) return Response.json({ error: 'need id+email' }, { status: 400 });
      const zr = await fetch(`https://api.zoom.us/v2/webinars/${id}/registrants`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, first_name: 'בדיקה', last_name: 'עינת' }) });
      const body = await zr.json();
      return Response.json({ ok: zr.ok, status: zr.status, join_url: body.join_url, registrant_id: body.registrant_id, body });
    }
    return Response.json({ error: 'unknown_action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});

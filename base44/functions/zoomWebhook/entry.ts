import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SECRET = Deno.env.get('ZOOM_WEBHOOK_SECRET_TOKEN') || '';

// אין כאן שליחות וואטסאפ — כל השליחה במסלול הוובינר מתבצעת ב-autoWebinarRegistrationUpdated.

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


Deno.serve(async (req) => {
  try {
    const body = await req.json();

    if (body.event === 'endpoint.url_validation') {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body.payload.plainToken));
      const encryptedToken = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
      return Response.json({ plainToken: body.payload.plainToken, encryptedToken });
    }

    const base44 = createClientFromRequest(req);

    if (body.event === 'webinar.ended') {
      const token = await getZoomToken();
      if (!token) return Response.json({ ok: false, error: 'no_zoom_token' }, { status: 500 });
      const uuid = body.payload?.object?.uuid;
      if (!uuid) return Response.json({ ok: true, skipped: 'no_uuid' });
      const encoded = encodeURIComponent(encodeURIComponent(uuid));
      const res = await fetch(`https://api.zoom.us/v2/past_webinars/${encoded}/participants?page_size=300`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { console.error('Zoom participants error:', res.status, await res.text()); return Response.json({ ok: false, error: 'participants_fetch_failed' }, { status: 500 }); }
      const data = await res.json();
      let marked = 0;
      for (const p of (data.participants || [])) {
        const email = (p.user_email || '').toLowerCase().trim();
        if (!email) continue;
        const contacts = await base44.asServiceRole.entities.Contact.filter({ email });
        const contact = contacts[0];
        if (!contact) continue;
        const regs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 1);
        if (regs[0] && !regs[0].attended) {
          const updated = await base44.asServiceRole.entities.WebinarRegistration.update(regs[0].id, { attended: true });
          marked++;
          // קריאה פנימית למסלול "תודה על ההשתתפות" — עדכון service-role לא מפעיל אוטומציית דשבורד.
          // חובה invoke פנימי (ולא fetch לכתובת הציבורית): כתובת ציבורית מריצה את הגרסה המפורסמת
          // וללא הרשאת שירות — ולכן התודה לא יצאה ולא נרשמה שגיאה. (תוקן 13.8)
          try {
            const invokeRes = await base44.asServiceRole.functions.invoke('autoWebinarRegistrationUpdated', {
              data: { ...(updated || regs[0]), id: regs[0].id, attended: true },
              old_data: { attended: false },
            });
            console.log('thankyou flow invoked:', JSON.stringify(invokeRes?.data || invokeRes || {}));
          } catch (e) { console.error('thankyou flow invoke FAILED:', e.message); }
        }
      }
      return Response.json({ ok: true, marked });
    }

    if (body.event === 'recording.completed') {
      // אין שליחת הודעת הקלטה ללקוחות (הוסר 16.8) — רק שמירת הקישור בדף הנחיתה.
      const obj = body.payload?.object;
      const shareLink = obj?.share_url || (obj?.recording_files || []).find(f => f.play_url)?.play_url || '';
      if (!shareLink) return Response.json({ ok: true, skipped: 'no_share_link' });
      const token = await getZoomToken();
      if (!token) return Response.json({ ok: false, error: 'no_zoom_token' }, { status: 500 });
      const uuid = obj?.uuid;
      if (!uuid) return Response.json({ ok: true, skipped: 'no_uuid' });
      const encoded = encodeURIComponent(encodeURIComponent(uuid));
      const pRes = await fetch(`https://api.zoom.us/v2/past_webinars/${encoded}/participants?page_size=300`, { headers: { Authorization: `Bearer ${token}` } });
      const pData = pRes.ok ? await pRes.json() : { participants: [] };

      // זיהוי סוג הוובינר לפי המשתתפים — כדי לדעת לאיזה דף נחיתה לשמור את ההקלטה
      const typeCounts = {};
      const processedEmails = new Set();
      for (const p of (pData.participants || [])) {
        const email = (p.user_email || '').toLowerCase().trim();
        if (!email || processedEmails.has(email)) continue;
        processedEmails.add(email);
        const contact = (await base44.asServiceRole.entities.Contact.filter({ email }))[0];
        if (!contact) continue;
        const regs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 1);
        if (regs[0]?.webinar_type) typeCounts[regs[0].webinar_type] = (typeCounts[regs[0].webinar_type] || 0) + 1;
      }

      const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topType) {
        const lp = (await base44.asServiceRole.entities.LandingPage.filter({ webinar_type: topType, is_active: true }))[0];
        if (lp && !lp.recording_url) await base44.asServiceRole.entities.LandingPage.update(lp.id, { recording_url: shareLink });
      }

      return Response.json({ ok: true, recording_saved_to_landing_page: !!topType });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('zoomWebhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
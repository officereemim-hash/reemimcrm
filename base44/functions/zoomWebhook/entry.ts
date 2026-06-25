import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN_GREEN = Deno.env.get('GREEN_API_TOKEN');
const SECRET = Deno.env.get('ZOOM_WEBHOOK_SECRET_TOKEN') || '';

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
  const data = await res.json();
  return data.access_token;
}

function toChatId(localPhone) {
  let clean = String(localPhone || '').replace(/[^\d]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return `${clean}@c.us`;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();

    // Zoom endpoint validation
    if (body.event === 'endpoint.url_validation') {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body.payload.plainToken));
      const encryptedToken = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
      return Response.json({ plainToken: body.payload.plainToken, encryptedToken });
    }

    const base44 = createClientFromRequest(req);

    // ===== webinar.ended → mark attendance =====
    if (body.event === 'webinar.ended') {
      const token = await getZoomToken();
      if (!token) return Response.json({ ok: false, error: 'no_zoom_token' }, { status: 500 });

      const uuid = body.payload?.object?.uuid;
      if (!uuid) return Response.json({ ok: true, skipped: 'no_uuid' });

      const encoded = encodeURIComponent(encodeURIComponent(uuid));
      const res = await fetch(`https://api.zoom.us/v2/past_webinars/${encoded}/participants?page_size=300`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error('Zoom participants error:', res.status, await res.text());
        return Response.json({ ok: false, error: 'participants_fetch_failed' }, { status: 500 });
      }
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
          await base44.asServiceRole.entities.WebinarRegistration.update(regs[0].id, { attended: true });
          marked++;
        }
      }
      return Response.json({ ok: true, marked });
    }

    // ===== recording.completed → send recording to participants =====
    if (body.event === 'recording.completed') {
      const obj = body.payload?.object;
      const shareLink = obj?.share_url || (obj?.recording_files || []).find(f => f.play_url)?.play_url || '';
      if (!shareLink) return Response.json({ ok: true, skipped: 'no_share_link' });

      const token = await getZoomToken();
      if (!token) return Response.json({ ok: false, error: 'no_zoom_token' }, { status: 500 });

      const uuid = obj?.uuid;
      if (!uuid) return Response.json({ ok: true, skipped: 'no_uuid' });

      const encoded = encodeURIComponent(encodeURIComponent(uuid));
      const pRes = await fetch(`https://api.zoom.us/v2/past_webinars/${encoded}/participants?page_size=300`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pData = pRes.ok ? await pRes.json() : { participants: [] };

      // Load template and settings
      const tplRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_recording', is_active: true });
      const template = tplRecords[0]?.content || 'הנה הקלטת הוובינר לצפייה חוזרת:\n{recording_link}';
      const botEnabled = ((await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }))[0]?.value) === 'true';
      const greenEnabled = ((await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' }))[0]?.value) === 'true';

      let sent = 0;
      const processedEmails = new Set();
      const typeCounts = {};

      for (const p of (pData.participants || [])) {
        const email = (p.user_email || '').toLowerCase().trim();
        if (!email || processedEmails.has(email)) continue;
        processedEmails.add(email);

        const contacts = await base44.asServiceRole.entities.Contact.filter({ email });
        const contact = contacts[0];
        if (!contact?.phone) continue;

        // Send only to actual registrants (skip host/panelists/internal staff)
        const regs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 1);
        if (!regs[0]) continue;

        if (regs[0].webinar_type) {
          typeCounts[regs[0].webinar_type] = (typeCounts[regs[0].webinar_type] || 0) + 1;
        }

        const message = template
          .replaceAll('{name}', contact.full_name || '')
          .replaceAll('{recording_link}', shareLink);

        let status = 'skipped';
        if (botEnabled && greenEnabled) {
          const waRes = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN_GREEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: toChatId(contact.phone), message }),
          });
          status = waRes.ok ? 'sent' : 'failed';
        } else if (botEnabled) {
          status = 'sent';
        }

        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
          content: message.substring(0, 500), sent_by: 'system',
          is_automated: true, template_id: 'webinar_recording', status,
        });
        if (status === 'sent') sent++;

        // Small delay between messages
        await new Promise(r => setTimeout(r, 1500));
      }
      // Auto-fill recording_url on the active landing page for the top webinar type
      const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topType) {
        const lp = (await base44.asServiceRole.entities.LandingPage.filter({ webinar_type: topType, is_active: true }))[0];
        if (lp && !lp.recording_url) {
          await base44.asServiceRole.entities.LandingPage.update(lp.id, { recording_url: shareLink });
        }
      }

      return Response.json({ ok: true, sent });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('zoomWebhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
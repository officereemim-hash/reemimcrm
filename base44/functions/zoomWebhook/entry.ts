import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SECRET = Deno.env.get('ZOOM_WEBHOOK_SECRET_TOKEN') || '';

const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';
async function getUchatTemplateName(base44, key) { const r = await base44.asServiceRole.entities.SystemSetting.filter({ key: `uchat_tpl_${key}` }); return r[0]?.value || ''; }
async function uchatTemplateNamespace(templateName) {
  const listOnce = async () => { try { const r = await fetch(`${UCHAT_BASE}/whatsapp-template/list`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } }); if (!r.ok) return null; const j = await r.json(); const arr = j?.data || j?.templates || j || []; const t = (Array.isArray(arr) ? arr : []).find(x => x?.name === templateName || x?.template_name === templateName); return t?.namespace || null; } catch { return null; } };
  let ns = await listOnce(); if (!ns) { try { await fetch(`${UCHAT_BASE}/whatsapp-template/sync`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } }); } catch {} ns = await listOnce(); } return ns;
}
async function uchatSendTemplate(phone972, firstName, templateName, bodyParams) {
  const namespace = await uchatTemplateNamespace(templateName); if (!namespace) { console.error(`uchat: template '${templateName}' not found/synced`); return null; }
  const params = {}; (bodyParams || []).forEach((v, i) => { params[`BODY_{{${i + 1}}}`] = String(v ?? ''); });
  const res = await fetch(`${UCHAT_BASE}/subscriber/send-whatsapp-template-by-user-id`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` }, body: JSON.stringify({ user_id: phone972, create_if_not_found: 'yes', contact: { first_name: firstName || '' }, content: { namespace, name: templateName, lang: 'he', params } }) });
  if (!res.ok) { console.error('uchat template http', res.status, await res.text().catch(() => '')); return null; }
  const j = await res.json().catch(() => ({})); const mid = j?.mid || j?.data?.mid || null; if (j?.status === 'ok' && mid) return { ...j, mid }; console.error('uchat template not ok:', JSON.stringify(j)); return null;
}
async function uchatSend(base44, phone, tplKey, firstName, params) {
  let p = String(phone || '').replace(/[\s\-\+\(\)]/g, ''); if (p.startsWith('0')) p = '972' + p.substring(1);
  const tplName = await getUchatTemplateName(base44, tplKey); if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
  return !!(await uchatSendTemplate(p, firstName, tplName, params || []));
}

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
        if (regs[0] && !regs[0].attended) { await base44.asServiceRole.entities.WebinarRegistration.update(regs[0].id, { attended: true }); marked++; }
      }
      return Response.json({ ok: true, marked });
    }

    if (body.event === 'recording.completed') {
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

      const tplRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_recording', is_active: true });
      const template = tplRecords[0]?.content || 'הנה הקלטת הוובינר לצפייה חוזרת:\n{recording_link}';
      const botEnabled = ((await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }))[0]?.value) === 'true';

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

        const regs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 1);
        if (!regs[0]) continue;

        const priorRec = await base44.asServiceRole.entities.Communication.filter({ contact_id: contact.id, template_id: 'webinar_recording' }, '-created_date', 5);
        if (priorRec.some(c => (c.content || '').includes(shareLink))) continue;

        if (regs[0].webinar_type) typeCounts[regs[0].webinar_type] = (typeCounts[regs[0].webinar_type] || 0) + 1;

        const message = template.replaceAll('{name}', contact.full_name || '').replaceAll('{recording_link}', shareLink);
        const contactFirstName = (contact.full_name || '').split(' ')[0];

        let status = 'skipped';
        if (botEnabled) {
          const ok = await uchatSend(base44, contact.phone, 'webinar_recording', contactFirstName, [contact.full_name || '', shareLink]);
          status = ok ? 'sent' : 'failed';
        }

        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
          content: message.substring(0, 500), sent_by: 'system', is_automated: true, template_id: 'webinar_recording', status,
        });
        if (status === 'sent') sent++;
        await new Promise(r => setTimeout(r, 1500));
      }

      const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topType) {
        const lp = (await base44.asServiceRole.entities.LandingPage.filter({ webinar_type: topType, is_active: true }))[0];
        if (lp && !lp.recording_url) await base44.asServiceRole.entities.LandingPage.update(lp.id, { recording_url: shareLink });
      }

      return Response.json({ ok: true, sent });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('zoomWebhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
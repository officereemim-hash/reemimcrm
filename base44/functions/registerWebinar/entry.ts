import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

// ─── ספק שליחה: Green ↔ uChat ───
const WHATSAPP_PROVIDER = Deno.env.get('WHATSAPP_PROVIDER') || 'green';
const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';
async function getUchatTemplateName(base44, key) {
  const r = await base44.asServiceRole.entities.SystemSetting.filter({ key: `uchat_tpl_${key}` });
  return r[0]?.value || '';
}
async function uchatTemplateNamespace(templateName) {
  const listOnce = async () => {
    try {
      const r = await fetch(`${UCHAT_BASE}/whatsapp-template/list`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } });
      if (!r.ok) return null;
      const j = await r.json();
      const arr = j?.data || j?.templates || j || [];
      const t = (Array.isArray(arr) ? arr : []).find(x => x?.name === templateName || x?.template_name === templateName);
      return t?.namespace || null;
    } catch { return null; }
  };
  let ns = await listOnce();
  if (!ns) { try { await fetch(`${UCHAT_BASE}/whatsapp-template/sync`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } }); } catch {} ns = await listOnce(); }
  return ns;
}
async function uchatSendTemplate(phone972, firstName, templateName, bodyParams) {
  const namespace = await uchatTemplateNamespace(templateName);
  if (!namespace) { console.error(`uchat: template '${templateName}' not found/synced`); return null; }
  const params = {};
  (bodyParams || []).forEach((v, i) => { params[`BODY_{{${i + 1}}}`] = String(v ?? ''); });
  const res = await fetch(`${UCHAT_BASE}/subscriber/send-whatsapp-template-by-user-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
    body: JSON.stringify({ user_id: phone972, create_if_not_found: 'yes', contact: { first_name: firstName || '' }, content: { namespace, name: templateName, lang: 'he', params } }),
  });
  if (!res.ok) { console.error('uchat template http', res.status, await res.text().catch(() => '')); return null; }
  const j = await res.json().catch(() => ({}));
  const mid = j?.mid || j?.data?.mid || null;
  if (j?.status === 'ok' && mid) return { ...j, mid };
  console.error('uchat template not ok:', JSON.stringify(j));
  return null;
}
async function uchatSend(base44, phone, tplKey, firstName, params) {
  let p = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (p.startsWith('0')) p = '972' + p.substring(1);
  const tplName = await getUchatTemplateName(base44, tplKey);
  if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
  return !!(await uchatSendTemplate(p, firstName, tplName, params || []));
}

function normalizePhone(raw) {
  let clean = String(raw || '').replace(/[^\d]/g, '');
  if (clean.startsWith('972')) clean = '0' + clean.substring(3);
  if (clean.length === 9 && clean.startsWith('5')) clean = '0' + clean;
  return clean;
}

function toChatId(localPhone) {
  let clean = String(localPhone || '').replace(/[^\d]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return `${clean}@c.us`;
}

function fillTemplate(template, values) {
  return String(template || '')
    .replaceAll('{name}', values.name || '').replaceAll('{date}', values.date || '')
    .replaceAll('{zoom_link}', values.zoom_link || '').replaceAll('{calendar_add_link}', values.calendar_add_link || '')
    .replaceAll('{webinar_title}', values.webinar_title || '');
}

function buildCalendarAddLink(webinarDate, title, details) {
  if (!webinarDate) return '';
  const start = new Date(webinarDate);
  if (isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({ action: 'TEMPLATE', text: title || 'וובינר — קרנות ראמים', dates: `${fmt(start)}/${fmt(end)}`, details: details || '' });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
  if (!res.ok) { console.error('Zoom token error:', await res.text()); return null; }
  return (await res.json()).access_token;
}

async function createShortLink(base44, functionsBase, targetUrl, purpose = '') {
  if (!targetUrl) return '';
  const code = Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  try {
    await base44.asServiceRole.entities.ShortLink.create({ code, target_url: targetUrl, purpose, click_count: 0 });
    return `${functionsBase}/redirectShortLink?code=${code}`;
  } catch (e) { console.warn('createShortLink failed:', e.message); return targetUrl; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const appBaseUrl = req.headers.get('base44-api-url') || 'https://reemim-crm.base44.app';
    const FUNCTIONS_BASE = `${appBaseUrl}/functions`;
    const body = await req.json();
    const { slug, full_name, phone, email } = body;

    if (!slug || !full_name || !phone) return Response.json({ error: 'missing_fields' }, { status: 400 });

    const pages = await base44.asServiceRole.entities.LandingPage.filter({ slug, is_active: true });
    const page = pages[0];
    if (!page) return Response.json({ error: 'page_not_found' }, { status: 404 });

    const localPhone = normalizePhone(phone);
    const cleanEmail = String(email || '').toLowerCase().trim();

    let contacts = await base44.asServiceRole.entities.Contact.filter({ phone: localPhone });
    if (contacts.length === 0 && cleanEmail) contacts = await base44.asServiceRole.entities.Contact.filter({ email: cleanEmail });
    let contact = contacts[0];
    if (!contact) {
      contact = await base44.asServiceRole.entities.Contact.create({ full_name, phone: localPhone, email: cleanEmail || undefined, source: 'webinar', status: 'new_lead' });
    }

    const existingRegs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id, webinar_type: page.webinar_type });
    let regRecord;
    if (existingRegs.length > 0) {
      const existing = existingRegs[0];
      const newWdate = page.webinar_date || new Date().toISOString();
      const dateChanged = (existing.webinar_date || null) !== newWdate;
      regRecord = await base44.asServiceRole.entities.WebinarRegistration.update(existing.id, { webinar_date: newWdate, ...(dateChanged ? { reminder_1h_sent: false, reminder_start_sent: false } : {}) });
    } else {
      regRecord = await base44.asServiceRole.entities.WebinarRegistration.create({ contact_id: contact.id, webinar_type: page.webinar_type, webinar_date: page.webinar_date || new Date().toISOString() });
    }

    let zoomJoinUrl = '';
    const zoomWebinarId = (await base44.asServiceRole.entities.SystemSetting.filter({ key: 'zoom_webinar_id' }))[0]?.value;
    if (zoomWebinarId && cleanEmail) {
      try {
        const zoomToken = await getZoomToken();
        if (zoomToken) {
          const [firstName, ...rest] = String(full_name).trim().split(' ');
          const zr = await fetch(`https://api.zoom.us/v2/webinars/${zoomWebinarId}/registrants`, {
            method: 'POST', headers: { Authorization: `Bearer ${zoomToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, first_name: firstName, last_name: rest.join(' ') || '-' }),
          });
          if (zr.ok) {
            const zrData = await zr.json();
            zoomJoinUrl = zrData.join_url || '';
            await base44.asServiceRole.entities.WebinarRegistration.update(regRecord.id, { zoom_registration_id: String(zrData.registrant_id || ''), zoom_join_url: zoomJoinUrl });
          } else { console.error('Zoom registrant failed:', await zr.text()); }
        }
      } catch (e) { console.error('Zoom registrant error:', e.message); }
    }

    const hasRecording = false;
    const confirmKey = hasRecording ? 'webinar_confirm_recording' : 'webinar_confirm';
    const confirmRecords = await base44.asServiceRole.entities.BotContent.filter({ key: confirmKey, is_active: true });
    const fallbackRecords = confirmRecords.length === 0 && hasRecording ? await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_confirm', is_active: true }) : confirmRecords;
    const confirmTemplate = fallbackRecords[0]?.content || (hasRecording ? 'שלום {name}, נרשמת בהצלחה! צפה בהקלטת הוובינר: {zoom_link}' : 'שלום {name}, נרשמת בהצלחה לוובינר! קישור: {zoom_link}');

    let dateStr = '';
    if (page.webinar_date) {
      const wd = new Date(page.webinar_date);
      const weekday = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long' }).format(wd);
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(wd);
      const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
      dateStr = `${weekday}, ${p.day}/${p.month}/${p.year} בשעה ${p.hour}:${p.minute}`;
    }
    const rawEffectiveLink = hasRecording ? page.recording_url : zoomJoinUrl;
    const effectiveLink = rawEffectiveLink ? await createShortLink(base44, FUNCTIONS_BASE, rawEffectiveLink, 'zoom_join') : '';
    const rawCalendarAddLink = buildCalendarAddLink(page.webinar_date, page.hero_title || 'וובינר — קרנות ראמים', rawEffectiveLink ? `קישור להצטרפות: ${rawEffectiveLink}` : '');
    const calendarAddLink = rawCalendarAddLink ? await createShortLink(base44, FUNCTIONS_BASE, rawCalendarAddLink, 'calendar') : '';
    const message = fillTemplate(confirmTemplate, { name: full_name, date: dateStr, zoom_link: effectiveLink, calendar_add_link: calendarAddLink, webinar_title: page.hero_title || '' });

    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botSettings[0]?.value === 'true';
    const regFirstName = String(full_name).trim().split(' ')[0];

    const landingLink = `${appBaseUrl}/webinar/${page.slug}`;

    let waStatus = 'skipped';
    if (botEnabled) {
      const ok = await uchatSend(base44, localPhone, 'webinar_registration', regFirstName, [
        full_name || '',
        page.hero_title || 'וובינר — קרנות ראמים',
        dateStr || 'יעודכן בהמשך',
        effectiveLink || landingLink,
        calendarAddLink || effectiveLink || landingLink,
      ]);
      waStatus = ok ? 'sent' : 'failed';
    }

    await base44.asServiceRole.entities.Communication.create({
      contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
      content: message.substring(0, 500), sent_by: 'system', is_automated: true, template_id: 'webinar_confirm', status: waStatus,
    });

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
    if (cleanEmail && BREVO_API_KEY) {
      const senderSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' });
      const senderNameSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_name' });
      const senderEmail = senderSettings[0]?.value || '';
      const senderName = senderNameSettings[0]?.value || 'קרנות ראמים';
      if (!senderEmail) { console.error('Missing mailing_sender_email — skipping email'); } else {
        const htmlBody = `<div dir="rtl" style="font-family:Arial;font-size:16px;color:#333"><h2 style="color:#4B2E83">נרשמת בהצלחה לוובינר! 🎓</h2><p>שלום ${full_name},</p><p>${dateStr ? `📅 מועד: ${dateStr}<br/>` : ''}${effectiveLink ? `🔗 <a href="${effectiveLink}" style="color:#4B2E83;font-weight:bold">לחצו כאן להצטרפות לוובינר</a>` : ''}</p>${calendarAddLink ? `<p><a href="${calendarAddLink}" style="display:inline-block;background:#4B2E83;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">📅 הוסף ליומן Google</a></p>` : ''}<p>נתראה! צוות קרנות ראמים</p></div>`;
        let emailOk = false;
        try {
          const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST', headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: { name: senderName, email: senderEmail }, to: [{ email: cleanEmail, name: full_name }], subject: 'אישור הרשמה לוובינר — קרנות ראמים', htmlContent: htmlBody }),
          });
          if (!emailRes.ok) { console.error('Brevo webinar email rejected:', emailRes.status, await emailRes.text().catch(() => '')); } else { emailOk = true; }
        } catch (err) { console.error('Brevo email fetch error:', err.message); }
        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact.id, type: 'email', direction: 'outbound',
          content: `אישור הרשמה לוובינר נשלח למייל ${cleanEmail}`, sent_by: 'system', is_automated: true, template_id: 'webinar_confirm_email', status: emailOk ? 'sent' : 'failed',
        });
      }
    }

    return Response.json({ ok: true, contact_id: contact.id, success_message: page.success_message || '' });
  } catch (error) {
    console.error('registerWebinar error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');
// BREVO_API_KEY is read inside the handler (not module-level) to avoid boot errors

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
    .replaceAll('{name}', values.name || '')
    .replaceAll('{date}', values.date || '')
    .replaceAll('{zoom_link}', values.zoom_link || '')
    .replaceAll('{calendar_add_link}', values.calendar_add_link || '')
    .replaceAll('{webinar_title}', values.webinar_title || '');
}

// בונה קישור "הוסף ליומן Google" אוטומטי מתאריך הוובינר (לא דורש OAuth — עובד לכל אחד)
function buildCalendarAddLink(webinarDate, title, details) {
  if (!webinarDate) return '';
  const start = new Date(webinarDate);
  if (isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 דקות
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'וובינר — קרנות ראמים',
    dates: `${fmt(start)}/${fmt(end)}`,
    details: details || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const ZOOM_SUBTYPE = {
  investments: 'zoom_webinar_investments',
  divorce: 'zoom_webinar_divorce',
  retirement: 'zoom_webinar_retirement',
};

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

async function shortenUrl(url) {
  if (!url) return '';
  // ניסיון 1: cleanuri.com
  try {
    const r = await fetch('https://cleanuri.com/api/v1/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'url=' + encodeURIComponent(url),
    });
    if (r.ok) {
      const data = await r.json();
      if (data?.result_url && data.result_url.startsWith('http')) {
        console.log('shortenUrl: cleanuri OK →', data.result_url);
        return data.result_url;
      }
      console.warn('shortenUrl: cleanuri bad response:', JSON.stringify(data).slice(0, 200));
    } else {
      console.warn('shortenUrl: cleanuri HTTP', r.status, (await r.text()).slice(0, 200));
    }
  } catch (e) {
    console.warn('shortenUrl: cleanuri threw:', e.message);
  }
  // ניסיון 2 (גיבוי): is.gd
  try {
    const r = await fetch('https://is.gd/create.php?format=simple&url=' + encodeURIComponent(url));
    if (r.ok) {
      const s = (await r.text()).trim();
      if (s.startsWith('http')) {
        console.log('shortenUrl: is.gd OK →', s);
        return s;
      }
      console.warn('shortenUrl: is.gd bad response:', s.slice(0, 200));
    } else {
      console.warn('shortenUrl: is.gd HTTP', r.status);
    }
  } catch (e) {
    console.warn('shortenUrl: is.gd threw:', e.message);
  }
  console.warn('shortenUrl: ALL services failed, returning full URL');
  return url;
}

// Public — webinar landing-page registration (no auth required)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { slug, full_name, phone, email } = body;

    if (!slug || !full_name || !phone) {
      return Response.json({ error: 'missing_fields' }, { status: 400 });
    }

    const pages = await base44.asServiceRole.entities.LandingPage.filter({ slug, is_active: true });
    const page = pages[0];
    if (!page) {
      return Response.json({ error: 'page_not_found' }, { status: 404 });
    }

    const localPhone = normalizePhone(phone);
    const cleanEmail = String(email || '').toLowerCase().trim();

    // De-duplicate contact by phone or email
    let contacts = await base44.asServiceRole.entities.Contact.filter({ phone: localPhone });
    if (contacts.length === 0 && cleanEmail) {
      contacts = await base44.asServiceRole.entities.Contact.filter({ email: cleanEmail });
    }
    let contact = contacts[0];
    if (!contact) {
      contact = await base44.asServiceRole.entities.Contact.create({
        full_name,
        phone: localPhone,
        email: cleanEmail || undefined,
        source: 'webinar',
        status: 'new_lead',
      });
    }

    // Create or update webinar registration (avoid duplicates)
    const existingRegs = await base44.asServiceRole.entities.WebinarRegistration.filter({
      contact_id: contact.id,
      webinar_type: page.webinar_type,
    });
    let regRecord;
    if (existingRegs.length > 0) {
      const existing = existingRegs[0];
      const newWdate = page.webinar_date || new Date().toISOString();
      const dateChanged = (existing.webinar_date || null) !== newWdate;
      regRecord = await base44.asServiceRole.entities.WebinarRegistration.update(existing.id, {
        webinar_date: newWdate,
        ...(dateChanged ? { reminder_1h_sent: false, reminder_start_sent: false } : {}),
      });
    } else {
      regRecord = await base44.asServiceRole.entities.WebinarRegistration.create({
        contact_id: contact.id,
        webinar_type: page.webinar_type,
        webinar_date: page.webinar_date || new Date().toISOString(),
      });
    }

    // Register in Zoom and get personal join URL
    let zoomJoinUrl = '';
    const zoomWebinarId = (await base44.asServiceRole.entities.SystemSetting.filter({ key: 'zoom_webinar_id' }))[0]?.value;
    if (zoomWebinarId && cleanEmail) {
      try {
        const zoomToken = await getZoomToken();
        if (zoomToken) {
          const [firstName, ...rest] = String(full_name).trim().split(' ');
          const zr = await fetch(`https://api.zoom.us/v2/webinars/${zoomWebinarId}/registrants`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${zoomToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, first_name: firstName, last_name: rest.join(' ') || '-' }),
          });
          if (zr.ok) {
            const zrData = await zr.json();
            zoomJoinUrl = zrData.join_url || '';
            await base44.asServiceRole.entities.WebinarRegistration.update(regRecord.id, {
              zoom_registration_id: String(zrData.registrant_id || ''),
              zoom_join_url: zoomJoinUrl,
            });
          } else {
            console.error('Zoom registrant failed:', await zr.text());
          }
        }
      } catch (e) { console.error('Zoom registrant error:', e.message); }
    }

    // Resolve content
    const zoomRecords = await base44.asServiceRole.entities.ServiceContent.filter({
      content_type: 'external_link',
      sub_type: ZOOM_SUBTYPE[page.webinar_type],
      is_active: true,
    });
    const zoomLink = zoomRecords[0]?.url || '';

    // אם יש קישור הקלטה — שולחים אותו במקום קישור הזום
    const hasRecording = !!page.recording_url;

    const confirmKey = hasRecording ? 'webinar_confirm_recording' : 'webinar_confirm';
    const confirmRecords = await base44.asServiceRole.entities.BotContent.filter({ key: confirmKey, is_active: true });
    const fallbackRecords = confirmRecords.length === 0 && hasRecording
      ? await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_confirm', is_active: true })
      : confirmRecords;
    const confirmTemplate = fallbackRecords[0]?.content || (hasRecording
      ? 'שלום {name}, נרשמת בהצלחה! צפה בהקלטת הוובינר: {zoom_link}'
      : 'שלום {name}, נרשמת בהצלחה לוובינר! קישור: {zoom_link}');

    const dateStr = page.webinar_date
      ? new Date(page.webinar_date).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'full', timeStyle: 'short' })
      : '';

    const effectiveLink = hasRecording ? page.recording_url : (zoomJoinUrl || zoomLink);

    const rawCalendarLink = buildCalendarAddLink(
      page.webinar_date,
      page.hero_title || 'וובינר — קרנות ראמים',
      effectiveLink ? `קישור להצטרפות: ${effectiveLink}` : ''
    );
    const calendarAddLink = await shortenUrl(rawCalendarLink);

    const message = fillTemplate(confirmTemplate, { name: full_name, date: dateStr, zoom_link: effectiveLink, calendar_add_link: calendarAddLink, webinar_title: page.hero_title || '' });

    // Check bot/green-api enabled
    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const greenSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' });
    const botEnabled = botSettings[0]?.value === 'true';
    const greenEnabled = greenSettings[0]?.value === 'true';

    // Send WhatsApp confirmation
    let waStatus = 'skipped';
    if (botEnabled && greenEnabled) {
      const res = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: toChatId(localPhone), message }),
      });
      waStatus = res.ok ? 'sent' : 'failed';
    } else if (botEnabled) {
      waStatus = 'sent';
    }

    await base44.asServiceRole.entities.Communication.create({
      contact_id: contact.id,
      type: 'whatsapp',
      direction: 'outbound',
      content: message.substring(0, 500),
      sent_by: 'system',
      is_automated: true,
      template_id: 'webinar_confirm',
      status: waStatus,
    });

    // Send email confirmation via Brevo (if email provided)
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
    if (cleanEmail && BREVO_API_KEY) {
      const senderSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' });
      const senderNameSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_name' });
      const senderEmail = senderSettings[0]?.value || '';
      const senderName = senderNameSettings[0]?.value || 'קרנות ראמים';

      if (!senderEmail) {
        console.error('Missing mailing_sender_email in SystemSetting — skipping email');
      } else {
        const htmlBody = `<div dir="rtl" style="font-family:Arial;font-size:16px;color:#333">
          <h2 style="color:#4B2E83">נרשמת בהצלחה לוובינר! 🎓</h2>
          <p>שלום ${full_name},</p>
          <p>${dateStr ? `📅 מועד: ${dateStr}<br/>` : ''}${effectiveLink ? `🔗 קישור להצטרפות: <a href="${effectiveLink}">${effectiveLink}</a>` : ''}</p>
          ${calendarAddLink ? `<p><a href="${calendarAddLink}" style="display:inline-block;background:#4B2E83;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">📅 הוסף ליומן Google</a></p>` : ''}
          <p>נתראה! צוות קרנות ראמים</p>
        </div>`;
        let emailOk = false;
        try {
          const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: { name: senderName, email: senderEmail },
              to: [{ email: cleanEmail, name: full_name }],
              subject: 'אישור הרשמה לוובינר — קרנות ראמים',
              htmlContent: htmlBody,
            }),
          });
          if (!emailRes.ok) {
            const errText = await emailRes.text().catch(() => '');
            console.error('Brevo webinar email rejected:', emailRes.status, errText);
          } else {
            emailOk = true;
          }
        } catch (err) {
          console.error('Brevo email fetch error:', err.message);
        }
        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact.id,
          type: 'email',
          direction: 'outbound',
          content: `אישור הרשמה לוובינר נשלח למייל ${cleanEmail}`,
          sent_by: 'system',
          is_automated: true,
          template_id: 'webinar_confirm_email',
          status: emailOk ? 'sent' : 'failed',
        });
      }
    }

    return Response.json({ ok: true, contact_id: contact.id, success_message: page.success_message || '' });
  } catch (error) {
    console.error('registerWebinar error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');

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
    .replaceAll('{calendar_add_link}', values.calendar_add_link || '');
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

    // Create webinar registration
    await base44.asServiceRole.entities.WebinarRegistration.create({
      contact_id: contact.id,
      webinar_type: page.webinar_type,
      webinar_date: page.webinar_date || new Date().toISOString(),
    });

    // Resolve content
    const zoomRecords = await base44.asServiceRole.entities.ServiceContent.filter({
      content_type: 'external_link',
      sub_type: ZOOM_SUBTYPE[page.webinar_type],
      is_active: true,
    });
    const zoomLink = zoomRecords[0]?.url || '';

    const confirmRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_confirm', is_active: true });
    const confirmTemplate = confirmRecords[0]?.content || 'שלום {name}, נרשמת בהצלחה לוובינר! קישור: {zoom_link}';

    const dateStr = page.webinar_date
      ? new Date(page.webinar_date).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'full', timeStyle: 'short' })
      : '';

    const calendarAddLink = buildCalendarAddLink(
      page.webinar_date,
      page.hero_title || 'וובינר — קרנות ראמים',
      zoomLink ? `קישור להצטרפות: ${zoomLink}` : ''
    );

    const message = fillTemplate(confirmTemplate, { name: full_name, date: dateStr, zoom_link: zoomLink, calendar_add_link: calendarAddLink });

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
    if (cleanEmail && BREVO_API_KEY) {
      const htmlBody = `<div dir="rtl" style="font-family:Arial;font-size:16px;color:#333">
        <h2 style="color:#4B2E83">נרשמת בהצלחה לוובינר! 🎓</h2>
        <p>שלום ${full_name},</p>
        <p>${dateStr ? `📅 מועד: ${dateStr}<br/>` : ''}${zoomLink ? `🔗 קישור להצטרפות: <a href="${zoomLink}">${zoomLink}</a>` : ''}</p>
        ${calendarAddLink ? `<p><a href="${calendarAddLink}" style="display:inline-block;background:#4B2E83;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">📅 הוסף ליומן Google</a></p>` : ''}
        <p>נתראה! צוות קרנות ראמים</p>
      </div>`;
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'קרנות ראמים', email: 'no-reply@kranot-reemim.co.il' },
          to: [{ email: cleanEmail, name: full_name }],
          subject: 'אישור הרשמה לוובינר — קרנות ראמים',
          htmlContent: htmlBody,
        }),
      }).catch(() => {});
    }

    return Response.json({ ok: true, contact_id: contact.id, success_message: page.success_message || '' });
  } catch (error) {
    console.error('registerWebinar error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
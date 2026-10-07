import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// בקשת המלצה במייל (Brevo) — אותו נוסח כמו תבנית המטא reemim_review_request, עם תמונת התודה.
// גוף בקשה: { contact_id } או { data: { contact_id } } (מאוטומציה).
// בדיקה: { contact_id, test_to: "x@y.com" } — שולח רק לכתובת הבדיקה, בלי רישום ובלי בדיקת כפילות.
// לא שולח: בלי מייל / מייל לא תקין / הסיר את עצמו מרשימת התפוצה / כבר קיבל.

let APP_FUNCTIONS_BASE = '';
const REVIEW_URL = 'https://g.page/r/CTq5qwW_7_WrEB0/review';
const IMAGE_URL = 'https://base44.app/api/apps/69f3c646e222353462c92ace/files/mp/public/69f3c646e222353462c92ace/af0583d57_reemim_thank_you.jpg';
const TEMPLATE_ID = 'review_request_email';

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// BEGIN_EMAIL_HTML
function buildEmailHtml({ firstName, unsubscribeUrl }) {
  return `<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td><img src="${IMAGE_URL}" alt="תודה רבה" width="560" style="display:block;width:100%;height:auto;border:0;"></td></tr>
      <tr><td dir="rtl" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.7;color:#2b2b2b;text-align:right;">
        שלום ${esc(firstName)},<br>
        בהמשך לשירות תכנון פרישה שקיבלת במשרדנו, אשמח לקבל ממך חוות דעת אשר תפורסם באינטרנט כהמלצה ללקוחות נוספים 🙏
      </td></tr>
      <tr><td align="center" style="padding:16px 28px 8px;">
        <a href="${REVIEW_URL}" style="display:inline-block;background:#8a6a3f;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;padding:14px 32px;border-radius:8px;">לכתיבת המלצה</a>
      </td></tr>
      <tr><td dir="rtl" style="padding:16px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.7;color:#2b2b2b;text-align:right;">
        במידה ושביעות רצונך גבוהה, ניתן לסמן 5 כוכבים 😊<br>
        מעריכה את שיתוף הפעולה<br>
        <b>בשמת שערי-בלוך וצוות קרנות ראמים</b>
      </td></tr>
    </table>
    <div dir="rtl" style="max-width:560px;padding:14px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a8a8a;text-align:center;">
      ${unsubscribeUrl ? `להסרה מרשימת התפוצה <a href="${unsubscribeUrl}" style="color:#8a8a8a;">לחצו כאן</a>` : ''}
    </div>
  </td></tr>
</table>
</body>
</html>`;
}
// END_EMAIL_HTML

Deno.serve(async (req) => {
  try {
    const reqUrl = new URL(req.url);
    APP_FUNCTIONS_BASE = `${reqUrl.origin}${reqUrl.pathname.replace(/\/sendReviewRequestEmail$/, '')}`;
    const base44 = createClientFromRequest(req);
    // אבטחה: הפונקציה נגישה מבחוץ, ולכן לא סומכים על מה שכתוב בבקשה.
    // • לחיצה מתוך המערכת (משתמשת admin מחוברת): כל לקוח, כולל מייל בדיקה (test_to).
    // • הפעלה אוטומטית (אוטומציה, בלי משתמש): רק לפנייה שבאמת הסתיימה במערכת (status completed),
    //   והמייל נשלח ללקוח של הפנייה. test_to לא מתקבל.
    const user = await base44.auth.me().catch(() => null);
    const isAdmin = user?.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;

    let contactId = '';
    let testTo = '';
    if (isAdmin) {
      contactId = body.contact_id || body.data?.contact_id || '';
      testTo = String(body.test_to || '').trim();
    } else {
      const srId = body.data?.id || body.service_request_id || '';
      const sr = srId ? (await db.ServiceRequest.filter({ id: srId }))[0] : null;
      if (!sr || sr.status !== 'completed') return Response.json({ ok: true, skipped: 'service_not_completed' });
      contactId = sr.contact_id || '';
    }
    if (!contactId) return Response.json({ ok: true, skipped: 'no_contact_id' });

    const contact = (await db.Contact.filter({ id: contactId }))[0];
    if (!contact) return Response.json({ ok: true, skipped: 'contact_not_found' });

    if (!testTo) {
      if (!contact.email || contact.email_invalid) return Response.json({ ok: true, skipped: 'no_valid_email' });
      if (contact.mailing_opt_out) return Response.json({ ok: true, skipped: 'opted_out' });
      const prior = await db.Communication.filter({ contact_id: contact.id, template_id: TEMPLATE_ID });
      if (prior.some((c) => c.status === 'sent')) return Response.json({ ok: true, skipped: 'already_sent' });
    }

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
    if (!BREVO_API_KEY) return Response.json({ ok: false, skipped: 'no_brevo_key' });
    const getSetting = async (key) => (await db.SystemSetting.filter({ key }))[0]?.value || '';
    const senderEmail = await getSetting('mailing_sender_email');
    if (!senderEmail) return Response.json({ ok: false, skipped: 'no_sender_email' });
    const senderName = (await getSetting('mailing_sender_name')) || 'קרנות ראמים';

    let token = contact.unsubscribe_token;
    if (!token && !testTo) {
      token = crypto.randomUUID();
      await db.Contact.update(contact.id, { unsubscribe_token: token });
    }
    const unsubscribeUrl = token ? `${APP_FUNCTIONS_BASE}/unsubscribe?token=${token}` : '';

    const firstName = String(contact.full_name || '').trim().split(/\s+/)[0] || '';
    const html = buildEmailHtml({ firstName, unsubscribeUrl });
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: testTo || contact.email, name: contact.full_name || '' }],
        subject: `תודה רבה${firstName ? `, ${firstName}` : ''} 🙏 נשמח לחוות דעתך`,
        htmlContent: html,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!testTo) {
      await db.Communication.create({
        contact_id: contact.id, type: 'email', direction: 'outbound', sent_by: 'system', is_automated: true,
        status: res.ok ? 'sent' : 'failed', template_id: TEMPLATE_ID,
        content: `נשלחה בקשת המלצה במייל ל-${contact.email}`,
      });
    }
    return Response.json({ ok: res.ok, status: res.status, test: !!testTo, messageId: data.messageId || '' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
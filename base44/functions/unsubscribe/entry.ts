import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ===== דף הסרה מרשימת התפוצה (ציבורי) =====
// GET  ?token=XXX → דף אישור
// POST ?token=XXX → ביצוע ההסרה (mailing_opt_out = true)
// עיצוב לפי מיתוג קרנות ראמים: נייבי #0F173B + זהב #998A64

const NAVY = '#0F173B';
const GOLD = '#998A64';
const BG = '#F7F5F0';
const SITE_URL = 'https://www.reemim.co.il';
const ACTION_URL = 'https://basmat-crm-copy-62c92ace.base44.app/api/apps/69f3c646e222353462c92ace/functions/unsubscribe';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    let token = url.searchParams.get('token');

    if (!token && method === 'POST') {
      try {
        const body = await req.clone().json();
        token = body.token || null;
      } catch { /* לא JSON — ננסה form */ }
      if (!token) {
        try {
          const formData = await req.clone().formData();
          token = formData.get('token') || null;
        } catch { /* לא form */ }
      }
    }

    if (!token) {
      return htmlResponse(renderPage('לינק לא תקין', 'חסר טוקן בלינק ההסרה. אם הגעת לכאן ממייל שלנו — נסו ללחוץ שוב על הלינק.'), 400);
    }

    const reconstructedReq = new Request(req.url, { method: req.method, headers: req.headers });
    const base44 = createClientFromRequest(reconstructedReq);

    const matches = await base44.asServiceRole.entities.Contact.filter({ unsubscribe_token: token });
    const contact = matches?.[0];

    if (!contact) {
      return htmlResponse(renderPage('לינק לא נמצא', 'לא מצאנו את הכתובת ברשימת התפוצה. ייתכן שכבר הוסרת.'), 404);
    }

    if (method === 'GET') {
      if (contact.mailing_opt_out) {
        return htmlResponse(renderPage('כבר הוסרת מהרשימה ✓', 'הכתובת שלך כבר אינה ברשימת התפוצה שלנו.'));
      }
      return htmlResponse(renderConfirmPage(contact, token));
    }

    // POST — ביצוע ההסרה
    await base44.asServiceRole.entities.Contact.update(contact.id, { mailing_opt_out: true });
    await base44.asServiceRole.entities.Communication.create({
      contact_id: contact.id,
      type: 'note',
      direction: 'inbound',
      content: 'הלקוח/ה הסיר/ה את עצמו/ה מרשימת התפוצה דרך לינק ההסרה במייל',
      sent_by: 'system',
      is_automated: true,
      status: 'sent',
    }).catch(() => {});

    console.log(`Unsubscribed: ${contact.email || contact.phone} (token: ${token})`);

    return htmlResponse(renderPage(
      'הוסרת מרשימת התפוצה בהצלחה ✓',
      `<strong>${contact.full_name || contact.email || ''}</strong>, הסרנו אותך מרשימת הדיוור של קרנות ראמים.<br>לא תקבל/י מאיתנו עוד עדכונים שיווקיים.<br><br>הודעות שירות הקשורות לטיפול פעיל ימשיכו להישלח כרגיל.<br>אם ההסרה נעשתה בטעות — אפשר לפנות אלינו דרך <a href="${SITE_URL}" style="color:${GOLD};font-weight:bold;">האתר שלנו</a> ונחזיר אותך לרשימה.`,
    ));
  } catch (error) {
    console.error('unsubscribe error:', error);
    return htmlResponse(renderPage('שגיאה', `אירעה שגיאה. נסו שוב מאוחר יותר או פנו אלינו דרך <a href="${SITE_URL}">האתר</a>.`), 500);
  }
});

function htmlResponse(html, status = 200) {
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

function pageShell(title, inner) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — קרנות ראמים</title>
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:40px 20px; background:${BG}; font-family:'Assistant',Arial,sans-serif; color:#2D2D2D; text-align:center; }
  .card { max-width:520px; margin:60px auto; background:#fff; border-radius:16px; padding:40px 30px; box-shadow:0 4px 20px rgba(15,23,59,0.10); border-top:5px solid ${NAVY}; }
  h1 { color:${NAVY}; margin:0 0 16px; font-size:22px; }
  p { font-size:15px; line-height:1.7; margin:0 0 10px; color:#555; }
  a { color:${GOLD}; }
  .warning { background:#FBF7EE; border:1px solid ${GOLD}55; border-radius:10px; padding:14px; margin:20px 0; }
  .warning p { color:#7a6a45; font-size:13px; margin:0; }
  .buttons { display:flex; gap:12px; justify-content:center; margin-top:24px; flex-wrap:wrap; }
  .btn { display:inline-block; padding:12px 28px; border-radius:50px; font-family:'Assistant',sans-serif; font-size:15px; font-weight:600; text-decoration:none; cursor:pointer; border:none; }
  .btn-danger { background:#B91C1C; color:#fff; }
  .btn-safe { background:${NAVY}; color:#fff; }
  .footer { margin-top:30px; font-size:12px; color:#aaa; }
</style>
</head>
<body>
  <div class="card">
    ${inner}
    <p class="footer">קרנות ראמים — ייעוץ פנסיוני ופיננסי</p>
  </div>
</body>
</html>`;
}

function renderConfirmPage(contact, token) {
  const displayName = contact.full_name || contact.email || '';
  return pageShell('הסרה מרשימת התפוצה', `
    <h1>הסרה מרשימת התפוצה</h1>
    <p>היי${displayName ? ' <strong style="color:' + GOLD + ';">' + displayName + '</strong>' : ''},</p>
    <p>את/ה עומד/ת להסיר את עצמך מרשימת הדיוור של <strong>קרנות ראמים</strong>.<br>לאחר ההסרה לא תקבל/י עוד עדכונים שיווקיים במייל או בוואטסאפ.</p>
    <div class="warning">
      <p>⚠️ שימו לב — אם לחצת בטעות, פשוט סגרו את העמוד.</p>
    </div>
    <div class="buttons">
      <form method="POST" action="${ACTION_URL}?token=${token}" style="display:inline;">
        <input type="hidden" name="token" value="${token}" />
        <button type="submit" class="btn btn-danger">כן, הסירו אותי</button>
      </form>
      <a href="${SITE_URL}" class="btn btn-safe">לא, חזרה לאתר</a>
    </div>
  `);
}

function renderPage(title, body) {
  return pageShell(title, `<h1>${title}</h1><p>${body}</p>`);
}
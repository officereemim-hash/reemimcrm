import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// רשת ביטחון: "לקוח כתב ולא קיבל מענה" (15.10.2026)
// כל 15 דקות משווה בין ההודעות הנכנסות ב-uChat (/subscriber/chat-messages) לבין WhatsAppMessageLog.
// הודעה שלא נקלטה במערכת, ושאף אחד לא ענה אחריה (לא הבוט ולא בשמת מהטלפון):
//   • אישור הגעה לפגישה קרובה → מסמנים attendance_confirmed (בלי מייל ובלי משימה)
//   • "הסר" → מסמנים mailing_opt_out, כמו שהבוט עושה
//   • מענה אוטומטי של עסק → נרשם בלבד
//   • כל השאר → מייל לבשמת "הבוט לא ענה" (מייל אחד ללקוח בכל ריצה)
// לא שולח שום הודעה ללקוחות. בין 21:00 ל-08:00 לא רץ, וההודעות של הלילה נבדקות בבוקר.

const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';
const H = { Authorization: `Bearer ${UCHAT_TOKEN}` };
const DRY_SECRET = 'unanswered_dry_1510';
const WATERMARK_KEY = 'unanswered_sweep_since';
const GRACE_MS = 3 * 60 * 1000; // נותנים לבוט 3 דקות לענות לפני שבודקים
const MATCH_WINDOW_MS = 5 * 60 * 1000; // הודעה נחשבת "נקלטה" אם יש לה רשומה ביומן בטווח הזה
// מספרי הבדיקה של עינת ובשמת (9 ספרות אחרונות) — לא מתריעים עליהם
const TEST_NUMBERS = ['544535688', '546603344', '544405554', '523614032', '546351789', '546888587', '546361789'];
const AUTO_REPLY = /תודה שיצרת|תודה שפנית|תודה על פנייתך|תודה רבה על פנייתך|הודעה אוטומטית|מענה אוטומטי|אינני זמינ|איני זמינ|לא זמינ.{0,10}כרגע|אחזור אליך|נחזור אליך|כרגע בטיפול|שמחה שיצרת|איזה כיף שפנית|איזה כיף שהגעתם|כיצד אוכל לעזור|איך אפשר לעזור|thank you for (contacting|your message)|auto.?reply/i;
const UNSUBSCRIBE = ['הסר', 'הסרה', 'הסירו אותי', 'להסיר אותי', 'תסירו אותי', 'תפסיקו לשלוח', 'stop', 'unsubscribe'];

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const toMs = (d) => { const s = String(d || ''); return s ? new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z').getTime() : 0; };
const norm = (t) => String(t || '').trim().replace(/[*"'״]/g, '').replace(/[!?.,;:🙏🌷👍❤️😊]+$/gu, '').replace(/^[!?.,;:]+/g, '').trim().toLowerCase();
const ilTime = (ms) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
const ilHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const esc = (v) => String(v || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// תודה / ברכה בלבד (למשל תגובה לברכת יום הולדת): לא צריך טיפול של בשמת
const POLITE_WORDS = new Set(['תודה', 'רבה', 'בשמת', 'חג', 'וחג', 'שמח', 'שמחה', 'ושנה', 'שנה', 'טובה', 'גם', 'לך', 'לכם', 'ולך', 'ולכם', 'מועדים', 'לשמחה', 'ומועדים', 'יקרה', 'אמן', 'ובריאות', 'בריאות', 'שבת', 'שלום', 'שבוע', 'טוב', 'מכל', 'הלב', 'מאוד', 'המון', 'סוכות', 'שמח!', 'ו']);
function isPoliteOnly(text) {
  const words = String(text || '').replace(/[^\u0590-\u05FFa-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 8 && words.every((w) => POLITE_WORDS.has(w));
}

// אותו כלל של הבוט (FP-AttendanceConfirm ב-greenApiWebhook)
function isConfirmText(text) {
  const n = norm(text);
  const words = n.split(/\s+/);
  const negative = words.includes('לא') || ['בטל', 'ביטול', 'לדחות', 'לשנות', 'להזיז'].some((k) => n.includes(k));
  if (negative) return { ok: false };
  const shortYes = ['כן', 'בטח', 'כמובן'].includes(n);
  const ok = ['כן', 'מאשר', 'מאשרת', 'מאושר', 'אגיע', 'נגיע', 'בטח', 'כמובן'].includes(n)
    || (words.length <= 5 && ['מגיע', 'מגיעה', 'אגיע', 'מאשר', 'מאשרת', 'אישור'].some((k) => n.includes(k)));
  return { ok, shortYes };
}

async function uchatGet(path) {
  const r = await fetch(`${UCHAT_BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`uChat ${r.status} ${path.split('?')[0]}`);
  return await r.json();
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const dry = url.searchParams.get('dry_run') === '1';
    if (dry && url.searchParams.get('secret') !== DRY_SECRET) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const now = Date.now();
    const hour = ilHour();
    if (!dry && (hour < 8 || hour >= 21)) return Response.json({ ok: true, skipped: 'off_hours' });

    // סימן מים: עד איפה כבר נבדק
    const wmRows = await db.SystemSetting.filter({ key: WATERMARK_KEY });
    let since = toMs(wmRows[0]?.value);
    if (dry && url.searchParams.get('since')) since = toMs(url.searchParams.get('since'));
    if (!since) {
      // הפעלה ראשונה: מתחילים מעכשיו, בלי לסרוק אחורה
      if (!dry) await db.SystemSetting.create({ key: WATERMARK_KEY, value: new Date(now - GRACE_MS).toISOString(), category: 'flow', label: 'רשת ביטחון: נבדק עד' });
      return Response.json({ ok: true, initialized: true });
    }
    // לא סורקים יותר מ-14 שעות אחורה (לילה שלם + מרווח), כדי שריצה אחרי הפסקה ארוכה לא תיתקע על זמן ריצה
    if (!(dry && url.searchParams.get('since'))) since = Math.max(since, now - 14 * 3600e3);
    const cutoff = now - GRACE_MS;

    // 1. מי כתב מאז הבדיקה הקודמת (last_interaction = ההודעה האחרונה של הלקוח, UTC)
    const subs = [];
    for (let page = 1; page <= 15; page++) {
      const j = await uchatGet(`/subscribers?limit=100&page=${page}`);
      const rows = j?.data || [];
      subs.push(...rows.filter((u) => toMs(u.last_interaction) > since - 60e3));
      if (rows.length < 100) break;
    }

    const decisions = [];
    const alerts = []; // { contact, name, local, items: [{ ms, text }] }
    for (const u of subs) {
      const p972 = String(u.user_id || u.phone || '').replace(/\D/g, '');
      if (!p972 || TEST_NUMBERS.includes(last9(p972))) continue;
      const mj = await uchatGet(`/subscriber/chat-messages?user_ns=${u.user_ns}&include_bot=1&start_time=${Math.floor((since - 3600e3) / 1000)}&limit=100`);
      const msgs = (mj?.data || []).map((m) => ({ ...m, ms: (m.ts || 0) * 1000 })).sort((a, b) => a.ms - b.ms);
      const incoming = msgs.filter((m) => m.type === 'in' && m.ms > since && m.ms <= cutoff);
      if (!incoming.length) continue;

      const local = '0' + last9(p972);
      const logs = await db.WhatsAppMessageLog.filter({ phone: p972, direction: 'incoming' }, '-created_date', 50);
      let contact = null;
      for (const ph of [p972, local, '+' + p972]) { contact = (await db.Contact.filter({ phone: ph }))[0]; if (contact) break; }
      const name = contact?.full_name || u.name || local;
      const items = [];

      for (const m of incoming) {
        const mid = `uchat_missed_${u.user_ns}_${m.ts}`;
        // רשומות שרשת הביטחון עצמה כתבה (uchat_missed_) לא נחשבות קליטה של הבוט
        const received = logs.some((l) => !String(l.id_message || '').startsWith('uchat_missed_') && Math.abs(toMs(l.created_date) - m.ms) <= MATCH_WINDOW_MS);
        // מענה = הודעה של הבוט או של בשמת אחרי ההודעה. תבנית מתוזמנת (תזכורת, ברכה) אינה מענה
        const answered = msgs.some((o) => (o.type === 'out' || o.type === 'agent') && o.msg_type !== 'wa_template' && o.ms > m.ms);
        const typeLabel = { image: '[שלח/ה תמונה]', audio: '[שלח/ה הודעה קולית]', video: '[שלח/ה סרטון]', file: '[שלח/ה קובץ]' }[m.msg_type];
        const text = String(m.content ?? m.payload?.text ?? '').trim() || typeLabel || '';
        let action = '';
        if (received) action = 'received';
        else if (answered) action = 'answered_later';
        else if (m.msg_type === 'react' || !text) action = 'reaction_or_empty';
        else if ((await db.WhatsAppMessageLog.filter({ id_message: mid })).length) action = 'already_handled';
        else if (AUTO_REPLY.test(text)) action = 'auto_reply';
        else if (UNSUBSCRIBE.includes(norm(text))) action = 'unsubscribe';
        else if (isPoliteOnly(text)) action = 'polite';
        else {
          const c = isConfirmText(text);
          let meeting = null;
          if (contact && c.ok) {
            const ms = await db.Meeting.filter({ contact_id: contact.id, status: 'scheduled' }, 'scheduled_at', 10);
            meeting = ms.find((x) => { const t = toMs(x.scheduled_at); return t > m.ms && t - m.ms <= 48 * 3600e3 && (x.reminder_d1_sent || x.reminder_h1_sent) && !x.attendance_confirmed; }) || null;
            // "כן" לבד נחשב אישור רק אם ההודעה האחרונה שקיבל לפניו הייתה תזכורת הפגישה
            if (meeting && c.shortYes) {
              const lastOut = [...msgs].reverse().find((o) => (o.type === 'out' || o.type === 'agent') && o.ms < m.ms);
              if (!String(lastOut?.content || '').includes('meeting_reminder')) meeting = null;
            }
          }
          action = meeting ? 'confirm' : 'alert';
          if (meeting) m.meeting = meeting;
        }
        decisions.push({ name, phone: local, at: ilTime(m.ms), text: text.slice(0, 120), action });
        if (dry || ['received', 'answered_later', 'reaction_or_empty', 'already_handled'].includes(action)) continue;
        // polite / auto_reply: נרשמים ביומן בלבד

        // רישום ביומן: גם לתיעוד וגם כדי ש-checkUnconfirmedMeetings ידע שהלקוח כתב. הטקסט מסומן כדי לא להפעיל את ה-loop guard של הבוט
        await db.WhatsAppMessageLog.create({ id_message: mid, phone: p972, direction: 'incoming', text: `[לא נקלט בזמן אמת] ${text}`.substring(0, 500), status: `missed_${action}` });
        if (action === 'confirm' && contact) {
          await db.Meeting.update(m.meeting.id, { attendance_confirmed: true, attendance_confirmed_at: new Date(m.ms).toISOString() });
          await db.Communication.create({ contact_id: contact.id, type: 'whatsapp', direction: 'inbound', sent_by: 'system', is_automated: true, template_id: 'attendance_confirmed', status: 'sent',
            content: `הלקוח/ה אישר/ה הגעה לפגישה ("${text}"). ההודעה לא נקלטה בבוט בזמן אמת, והאישור סומן בבדיקת ההודעות (${ilTime(m.ms)}).` });
        } else if (action === 'unsubscribe' && contact) {
          await db.Contact.update(contact.id, { mailing_opt_out: true });
          await db.Communication.create({ contact_id: contact.id, type: 'whatsapp', direction: 'inbound', sent_by: 'system', is_automated: true, status: 'sent',
            content: `הלקוח/ה ביקש/ה הסרה מרשימת התפוצה ("${text}"). ההודעה לא נקלטה בבוט בזמן אמת, וההסרה סומנה בבדיקת ההודעות (${ilTime(m.ms)}).` });
        } else if (action === 'alert') {
          items.push({ ms: m.ms, text });
        }
      }
      if (items.length) alerts.push({ contact, name, local, items });
    }

    // 2. מייל אחד לכל לקוח שלא נענה
    let emailed = 0;
    if (!dry && alerts.length) {
      const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
      const senderEmail = (await db.SystemSetting.filter({ key: 'mailing_sender_email' }))[0]?.value || '';
      for (const a of alerts) {
        const lines = a.items.map((i) => `• ${ilTime(i.ms)}: "${esc(i.text.substring(0, 500))}"`).join('<br/>');
        const link = a.contact ? `<br/><br/>לכרטיס הלקוח: https://reemim-crm.base44.app/contacts/${a.contact.id}` : '<br/><br/>המספר לא מוכר במערכת.';
        if (BREVO_API_KEY && senderEmail) {
          const r = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: { name: 'קרנות ראמים — בוט', email: senderEmail },
              to: [{ email: 'office.reemim@gmail.com', name: 'משרד ראמים' }, { email: 'bosmat@oryx-alt.com', name: 'בשמת' }],
              subject: `⚠️ הבוט לא ענה — ${a.name}`,
              htmlContent: `<div dir="rtl" style="font-family:Arial;font-size:16px;line-height:1.6">${esc(a.name)} (${esc(a.local)}) כתב/ה בוואטסאפ ולא קיבל/ה מענה:<br/><br/>${lines}<br/><br/>כדאי לחזור ללקוח/ה.${link}</div>`,
            }),
          });
          if (r.ok) emailed++;
          else console.error('brevo', r.status, await r.text().catch(() => ''));
        }
        if (a.contact) {
          await db.Communication.create({ contact_id: a.contact.id, type: 'email', direction: 'outbound', sent_by: 'system', is_automated: true, template_id: 'unanswered_alert', status: 'sent',
            content: `התראה לבשמת: הלקוח/ה כתב/ה ולא קיבל/ה מענה מהבוט: ${a.items.map((i) => `"${i.text.substring(0, 120)}"`).join(' · ')}` });
        }
      }
    }

    if (!dry) {
      const value = new Date(cutoff).toISOString();
      if (wmRows[0]) await db.SystemSetting.update(wmRows[0].id, { value });
      else await db.SystemSetting.create({ key: WATERMARK_KEY, value, category: 'flow', label: 'רשת ביטחון: נבדק עד' });
    }
    return Response.json({ ok: true, dry, since: new Date(since).toISOString(), cutoff: new Date(cutoff).toISOString(), checked_subscribers: subs.length, decisions, alerts: alerts.length, emailed });
  } catch (error) {
    console.error('alertUnansweredWhatsApp error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
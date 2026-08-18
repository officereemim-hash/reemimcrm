import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = 'bot_reemim';

const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';
// ענף זה עובד מול uChat בלבד (אימות Green הוסר) — לכן ברירת המחדל 'uchat' גם בלי env var
const WHATSAPP_PROVIDER = Deno.env.get('WHATSAPP_PROVIDER') || 'uchat';
// cache פר-isolate: טלפון בינלאומי (972...) → user_ns של uChat
const _uchatNsCache = {};

async function uchatResolveNs(phone972) {
  if (!phone972) return null;
  if (_uchatNsCache[phone972]) return _uchatNsCache[phone972];
  try {
    const r = await fetch(`${UCHAT_BASE}/subscriber/get-info-by-user-id?user_id=${phone972}`, {
      headers: { Authorization: `Bearer ${UCHAT_TOKEN}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const ns = j?.user_ns || j?.data?.user_ns || null;
    if (ns) _uchatNsCache[phone972] = ns;
    return ns;
  } catch { return null; }
}

function normalizeLocalPhone(phone) {
  const clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  return clean.startsWith('972') ? '0' + clean.substring(3) : clean;
}

function normalizeIntlPhone(phone) {
  let clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return clean;
}

function extractText(messageData) {
  if (messageData?.typeMessage === 'textMessage') {
    return messageData.textMessageData?.textMessage || '';
  }
  if (messageData?.typeMessage === 'extendedTextMessage') {
    return messageData.extendedTextMessageData?.text || '';
  }
  return '';
}

function normalizeAnswer(text) {
  return String(text || '').trim().replace(/[*"'״]/g, '').replace(/[!?.,;:]+$/g, '').replace(/^[!?.,;:]+/g, '').toLowerCase();
}

function detectServiceType(text) {
  const serviceMap = {
    '1': 'retirement',
    'ייעוץ פרישה': 'retirement',
    'פרישה': 'retirement',
    '2': 'economic_feasibility',
    'התכנות כלכלית': 'economic_feasibility',
    'היתכנות כלכלית': 'economic_feasibility',
    'התכנות': 'economic_feasibility',
    'היתכנות': 'economic_feasibility',
    '3': 'investments',
    'השקעות': 'investments',
    '4': 'divorce_split',
    'איזון אקטוארי': 'divorce_split',
    'גירושין': 'divorce_split',
    'איזון': 'divorce_split',
    '5': 'tax_advisory',
    'ייעוץ מס': 'tax_advisory',
    'מס': 'tax_advisory',
    '6': '__other__',
    'אחר': '__other__',
  };
  const normalized = normalizeAnswer(text);
  return serviceMap[normalized] || serviceMap[String(text || '').trim()] || '';
}

function extractContactDetails(text) {
  const emailMatch = String(text || '').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const compactText = String(text || '').replace(/[\-\s]/g, '');
  const phoneMatch = compactText.match(/05\d{8}/);

  if (!emailMatch || !phoneMatch) return null;

  const email = emailMatch[0].toLowerCase().trim();
  const phone = phoneMatch[0];
  const name = String(text || '')
    .replace(emailMatch[0], '')
    .replace(/0[5]\d[\d\-]{7,11}/g, '')
    .replace(/[,;:]/g, ' ')
    .replace(/(?:^|\s)שמי?(?=\s|$)\s*/gi, ' ')
    .replace(/(?:^|\s)מספרי?(?=\s|$)\s*/gi, ' ')
    .replace(/(?:^|\s)טלפון(?=\s|$)\s*/gi, ' ')
    .replace(/(?:^|\s)מייל(?=\s|$)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length < 2) return null;
  return { name, phone, email };
}

async function sendWhatsApp(chatId, message, botEnabled) {
  if (!chatId || !message || !botEnabled) return null;
  const phone972 = String(chatId).replace('@c.us', '');
  const ns = await uchatResolveNs(phone972);
  if (!ns) { console.log(`uchat: no subscriber for ${phone972} (send-text skipped)`); return null; }
  const res = await fetch(`${UCHAT_BASE}/subscriber/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
    body: JSON.stringify({ user_ns: ns, content: message }), // uChat מצפה ל-content (לא text) — אחרת 422
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  if (j?.status === 'ok') {
    // uChat משהה את האוטומציה כשנשלחת הודעה דרך ה-API (נחשב למענה סוכן) —
    // בלי resume ההודעה הבאה של הפונה לא תפעיל את הזרימה והבוט משתתק.
    // השתקת הבוט במצב נציגה נאכפת ממילא דרך Contact.bot_status='waiting_agent'.
    try {
      await fetch(`${UCHAT_BASE}/subscriber/resume-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
        body: JSON.stringify({ user_ns: ns }),
      });
    } catch (_) {}
    return j;
  }
  return null;
}

async function sendWhatsAppVideo(chatId, videoUrl, caption, botEnabled) {
  if (!chatId || !videoUrl || !botEnabled) return null;
  const phone972 = String(chatId).replace('@c.us', '');
  const ns = await uchatResolveNs(phone972);
  if (!ns) { console.log(`uchat: no subscriber for ${phone972} (video skipped)`); return null; }
  const messages = [];
  if (caption) messages.push({ type: 'text', text: caption });
  messages.push({ type: 'video', url: videoUrl });
  const res = await fetch(`${UCHAT_BASE}/subscriber/send-content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
    body: JSON.stringify({ user_ns: ns, data: { version: 'v1', content: { messages } } }),
  });
  if (!res.ok) { console.error('uchat send-content http', res.status, await res.text().catch(() => '')); return null; }
  const j = await res.json().catch(() => ({}));
  if (j?.status === 'ok') {
    try {
      await fetch(`${UCHAT_BASE}/subscriber/resume-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
        body: JSON.stringify({ user_ns: ns }),
      });
    } catch (_) {}
    return j;
  }
  console.error('uchat send-content not ok:', JSON.stringify(j));
  return null;
}

async function sendWhatsAppFileByUrl(chatId, fileUrl, fileName, caption, botEnabled) {
  if (!chatId || !fileUrl || !botEnabled) return null;
  // שליחת קבצים ב-uChat תיבנה בשלב 2 (endpoint ייעודי). בינתיים — שולחים את ה-caption כטקסט כדי לא לאבד תוכן.
  if (caption) { try { await sendWhatsApp(chatId, caption, botEnabled); } catch (_) {} }
  console.log(`uchat: file send not yet implemented (${fileUrl}) — sent caption only`);
  return null;
}

async function sendTyping(chatId, seconds = 15, botEnabled = false) {
  // אין אינדיקטור הקלדה נפרד ב-uChat
  return;
}

async function getBotContent(base44, key) {
  const records = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
  return records[0]?.content || '';
}

async function getServiceContentUrl(base44, query) {
  const records = await base44.asServiceRole.entities.ServiceContent.filter({ ...query, is_active: true });
  return records[0]?.url || '';
}

async function logIncoming(base44, idMessage, phone, text, chatId, conversationId, status = 'replied') {
  return await base44.asServiceRole.entities.WhatsAppMessageLog.create({
    id_message: idMessage || `wa_${Date.now()}`,
    phone,
    direction: 'incoming',
    text: String(text || '').substring(0, 500),
    status,
    conversation_id: conversationId,
    chat_id: chatId,
  });
}

async function logOutgoing(base44, idMessage, phone, text, chatId, conversationId, status = 'replied') {
  return await base44.asServiceRole.entities.WhatsAppMessageLog.create({
    id_message: idMessage || `out_${Date.now()}`,
    phone,
    direction: 'outgoing',
    text: String(text || '').substring(0, 500),
    status,
    conversation_id: conversationId,
    chat_id: chatId,
  });
}

// תיקון 7: התראת מייל כשהבוט מעביר שיחה לנציגה — מייל בלבד, לעולם לא וואטסאפ
async function notifyHandoffByEmail(base44, contact, reason, lastText) {
  try {
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
    if (!BREVO_API_KEY) return;
    const senderSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' });
    const senderEmail = senderSettings[0]?.value || '';
    if (!senderEmail) return;
    const body = `הבוט העביר שיחה לטיפול נציגה.<br/><br/>לקוח: ${contact?.full_name || 'לא ידוע'} (${contact?.phone || ''})<br/>סיבה: ${reason}<br/>ההודעה האחרונה שכתב: "${String(lastText || '').substring(0, 300)}"`;
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'קרנות ראמים — בוט', email: senderEmail },
        to: [{ email: 'office.reemim@gmail.com', name: 'משרד ראמים' }],
        subject: `📞 שיחה הועברה לנציגה — ${contact?.full_name || contact?.phone || ''}`,
        htmlContent: `<div dir="rtl" style="font-family:Arial;font-size:16px">${body}</div>`,
      }),
    });
    // סמן דדופ משותף עם onContactHandoff — מונע מייל כפול על אותה העברה (האוטומציה על Contact)
    if (contact?.id) {
      const markerKey = 'handoff_alerted_' + contact.id;
      const markers = await base44.asServiceRole.entities.SystemSetting.filter({ key: markerKey });
      if (markers.length > 0) {
        await base44.asServiceRole.entities.SystemSetting.update(markers[0].id, { value: new Date().toISOString() });
      } else {
        await base44.asServiceRole.entities.SystemSetting.create({ key: markerKey, value: new Date().toISOString(), category: 'flow' });
      }
    }
  } catch (e) { console.error('notifyHandoffByEmail failed:', e.message); }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const secretParam = url.searchParams.get('secret') || '';
    let body = await req.json();

    // ─── קליטת פורמט uChat: flow שולח External Request עם {phone, message, first_name, user_ns, secret} ───
    // ממירים למבנה שכל שאר הקוד כבר יודע לקרוא (Green: typeWebhook/senderData/messageData).
    // זיהוי uChat: מזהים לפי קיום phone (בלי דרישה ל-message — לחיצת כפתור עלולה להגיע בשדה אחר/ריק)
    const isUchat = WHATSAPP_PROVIDER === 'uchat' && body && body.phone !== undefined && !body.typeWebhook;
    if (isUchat) {
      // אימות מחמיר: הסוד נקרא מ-header / body / query — אבל בקשה בלי סוד תקין נדחית תמיד.
      const UCHAT_WEBHOOK_SECRET = Deno.env.get('UCHAT_WEBHOOK_SECRET');
      const providedSecret = req.headers.get('x-uchat-secret') || body.secret || secretParam || '';
      const p972 = normalizeIntlPhone(body.phone);
      if (!UCHAT_WEBHOOK_SECRET || providedSecret !== UCHAT_WEBHOOK_SECRET) {
        // לוג אבחון — בלי ערך הסוד עצמו
        console.log(`UCHAT_INBOUND rejected — bad_or_missing_secret (phone=${p972}, hasSecretField=${providedSecret ? 'yes' : 'no'})`);
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // טקסט ההודעה: הקלדה רגילה או payload/label של כפתור (Quick Reply)
      const incomingText = String(
        body.message ?? body.text ?? body.last_text_input ?? body.button_payload ??
        body.payload ?? body.button_text ?? body.title ?? ''
      ).trim();
      // user_ns בכל הווריאציות — לשליחות היוצאות באותה שיחה
      const incomingNs = body.user_ns ?? body.subscriber_ns ?? body.ns ?? null;
      if (incomingNs) _uchatNsCache[p972] = incomingNs;

      console.log(`UCHAT_INBOUND accepted — phone=${p972}, textLen=${incomingText.length}, hasNs=${incomingNs ? 'yes' : 'no'}, text="${incomingText.substring(0, 60)}"`);

      body = {
        typeWebhook: 'incomingMessageReceived',
        idMessage: String(body.idMessage || body.message_id || `uchat_${p972}_${Date.now()}`),
        senderData: { chatId: `${p972}@c.us`, senderName: body.first_name || '' },
        messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: incomingText } },
        instanceData: { idInstance: '' },
      };
    }

    // (Green API webhook secret validation removed — uChat only)

    if (body.typeWebhook !== 'incomingMessageReceived') {
      return Response.json({ ok: true, skipped: true });
    }

    const messageData = body.messageData;
    const senderData = body.senderData;
    const idMessage = body.idMessage || '';
    const chatId = senderData?.chatId || '';

    if (!chatId || !chatId.endsWith('@c.us')) {
      return Response.json({ ok: true, skipped: 'group_chat' });
    }

    const text = extractText(messageData).trim();
    if (!text) {
      return Response.json({ ok: true, skipped: 'non_text_or_empty' });
    }

    const base44 = createClientFromRequest(req);
    const phone = chatId.replace('@c.us', '');
    const localPhone = normalizeLocalPhone(phone);

    const [botEnabledSettings, cachedConversationSettings, blockList, duplicateMessages, testModeSettings] = await Promise.all([
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),  
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'phone_conv_' + phone }),
      base44.asServiceRole.entities.WhatsAppBlockList.list(),
      idMessage ? base44.asServiceRole.entities.WhatsAppMessageLog.filter({ id_message: idMessage }) : Promise.resolve([]),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'test_mode_allowed_numbers' }),
    ]);

    // ===== מצב בדיקה: אם הוגדרה רשימה לבנה — מגיבים רק למספרים שבה =====
    const allowedRaw = String(testModeSettings[0]?.value || '').trim();
    if (allowedRaw) {
      const allowedNumbers = allowedRaw.split(',').map(n => normalizeLocalPhone(n.trim())).filter(Boolean);
      if (!allowedNumbers.includes(localPhone)) {
        return Response.json({ ok: true, skipped: true, reason: 'test_mode_not_allowed' });
      }
    }

    if (duplicateMessages.length > 0) {
      return Response.json({ ok: true, skipped: true, reason: 'duplicate' });
    }

    const blockedPhones = blockList.map(item => String(item.phone || '').replace(/[\s\-\+]/g, ''));
    if (blockedPhones.includes(phone) || blockedPhones.includes(localPhone)) {
      return Response.json({ ok: true, skipped: true, reason: 'blocked' });
    }

    const botEnabled = botEnabledSettings[0]?.value === 'true' || botEnabledSettings[0]?.value === true;
    const outgoingStatus = botEnabled ? 'replied' : 'skipped';

    // אישור מיידי בתחילת שיחה חדשה — לפני האינדיקטור — כדי שהפונה (בעיקר מבוגר) יראה תגובה ודאית מיד
    const isNewConversation = cachedConversationSettings.length === 0;
    if (isNewConversation) {
      const instantAck = await getBotContent(base44, 'instant_ack');
      if (instantAck) {
        await sendWhatsApp(chatId, instantAck, botEnabled);
      }
    }

    // שליחת אינדיקטור "מקליד..." מיד — כדי שהפונה יראה שהבוט מגיב
    await sendTyping(chatId, 15, botEnabled);

    // חיפוש Contact ב-3 פורמטים + בדיקת rate limit — הכל במקביל לחיסכון בזמן
    const [recentLogs, contactsByIntl, contactsByLocal, contactsByPlus] = await Promise.all([
      base44.asServiceRole.entities.WhatsAppMessageLog.filter({ phone }, '-created_date', 30),
      base44.asServiceRole.entities.Contact.filter({ phone }),
      base44.asServiceRole.entities.Contact.filter({ phone: localPhone }),
      base44.asServiceRole.entities.Contact.filter({ phone: '+' + phone }),
    ]);

    const recentOutgoing = recentLogs.filter(log => log.direction === 'outgoing' && Date.now() - new Date(log.created_date).getTime() < 60 * 60 * 1000);
    if (botEnabled && recentOutgoing.length >= 20) {
      await logIncoming(base44, idMessage, phone, text, chatId, cachedConversationSettings[0]?.value || null, 'skipped');
      try {
        const rlAlertKey = 'rate_limit_alerted_' + phone;
        const rlMarkers = await base44.asServiceRole.entities.SystemSetting.filter({ key: rlAlertKey });
        const rlLastAlert = rlMarkers.length > 0 ? new Date(rlMarkers[0].value).getTime() : 0;
        if (Date.now() - rlLastAlert > 60 * 60 * 1000) {
          await sendWhatsApp(chatId, 'קיבלנו את הודעתך 🙏 נציגה תחזור אליך בהמשך', botEnabled);
          const coordSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'coordinator_phone' });
          const coordPhone = normalizeIntlPhone(coordSettings[0]?.value || '');
          if (coordPhone) {
            await sendWhatsApp(`${coordPhone}@c.us`, `⚠️ *Rate Limit*\nהמספר ${phone} שלח מעל 20 הודעות בשעה האחרונה. הבוט הושתק.`, botEnabled);
          }
          if (rlMarkers.length > 0) {
            await base44.asServiceRole.entities.SystemSetting.update(rlMarkers[0].id, { value: new Date().toISOString() });
          } else {
            await base44.asServiceRole.entities.SystemSetting.create({ key: rlAlertKey, value: new Date().toISOString(), category: 'flow' });
          }
        }
      } catch (_) {}
      return Response.json({ ok: true, skipped: true, reason: 'rate_limited' });
    }

    // ===== LOOP GUARD (H11): אותה הודעה נכנסת 3 פעמים ברצף → השתקה + התראה לרכזת =====
    {
      const lgIncoming = recentLogs.filter(log => log.direction === 'incoming').slice(0, 2);
      const lgCurrent = text.substring(0, 500).trim();
      if (lgIncoming.length === 2 &&
          String(lgIncoming[0].text || '').trim() === lgCurrent &&
          String(lgIncoming[1].text || '').trim() === lgCurrent) {
        await logIncoming(base44, idMessage, phone, text, chatId, cachedConversationSettings[0]?.value || null, 'skipped');
        try {
          const lgMarkerKey = 'loop_guard_alerted_' + phone;
          const lgMarkers = await base44.asServiceRole.entities.SystemSetting.filter({ key: lgMarkerKey });
          const lgLastAlert = lgMarkers.length > 0 ? new Date(lgMarkers[0].value).getTime() : 0;
          if (Date.now() - lgLastAlert > 24 * 60 * 60 * 1000) {
            const lgSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'coordinator_phone' });
            const lgCoordinator = normalizeIntlPhone(lgSettings[0]?.value || '');
            if (lgCoordinator) {
              await sendWhatsApp(`${lgCoordinator}@c.us`, `🔁 *Loop Guard — הבוט הושתק למספר*\nהמספר ${phone} שלח את אותה הודעה 3 פעמים ברצף, ולכן הבוט הפסיק לענות לו.\nההודעה: "${text.substring(0, 200)}"\nאם זה מוקד/מענה אוטומטי — מומלץ להוסיף אותו ל-WhatsAppBlockList.`, botEnabled);
            }
            if (lgMarkers.length > 0) {
              await base44.asServiceRole.entities.SystemSetting.update(lgMarkers[0].id, { value: new Date().toISOString() });
            } else {
              await base44.asServiceRole.entities.SystemSetting.create({ key: lgMarkerKey, value: new Date().toISOString(), category: 'flow' });
            }
          }
        } catch (e) { console.error('LOOP_GUARD alert failed:', e.message); }
        console.log(`LOOP_GUARD: muted ${phone} — identical incoming message x3`);
        return Response.json({ ok: true, skipped: true, reason: 'loop_guard' });
      }
    }
    // ===== END LOOP GUARD =====

    const contacts = contactsByIntl.length > 0 ? contactsByIntl : contactsByLocal.length > 0 ? contactsByLocal : contactsByPlus;
    let contact = contacts[0] || null;

    // ===== הסרה מרשימת התפוצה דרך וואטסאפ =====
    const UNSUBSCRIBE_KEYWORDS = ['הסר', 'הסרה', 'הסירו אותי', 'להסיר אותי', 'תסירו אותי', 'תפסיקו לשלוח', 'stop', 'unsubscribe'];
    const normalizedForUnsub = normalizeAnswer(text);
    if (UNSUBSCRIBE_KEYWORDS.includes(normalizedForUnsub)) {
      const unsubContact = contacts[0] || null;
      if (unsubContact) {
        await base44.asServiceRole.entities.Contact.update(unsubContact.id, { mailing_opt_out: true });
        // ביטול תזכורות וובינר עתידיות
        const futureRegs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: unsubContact.id });
        for (const reg of futureRegs) {
          if (reg.webinar_date && new Date(reg.webinar_date).getTime() > Date.now() && reg.attended !== true) {
            await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, { reminder_1h_sent: true, reminder_start_sent: true });
          }
        }
        await base44.asServiceRole.entities.Communication.create({
          contact_id: unsubContact.id,
          type: 'whatsapp',
          direction: 'inbound',
          content: `הלקוח/ה ביקש/ה הסרה מרשימת התפוצה ("${text}")`,
          sent_by: 'system',
          is_automated: true,
          status: 'sent',
        });
      }
      const unsubMessage = await getBotContent(base44, 'unsubscribe_confirm') || 'הוסרת מרשימת התפוצה שלנו ✅';
      await sendWhatsApp(chatId, unsubMessage, botEnabled);
      return Response.json({ ok: true, unsubscribed: true });
    }
    // ===== סוף הסרה מתפוצה =====

    // ===== שער waiting_agent: הבוט שותק כשהשיחה אצל נציגה =====
    if (contact && contact.bot_status === 'waiting_agent') {
      await logIncoming(base44, idMessage, phone, text, chatId, cachedConversationSettings[0]?.value || null, 'skipped');
      return Response.json({ ok: true, skipped: true, reason: 'waiting_agent' });
    }

    // === FP-MissingField: השלמת פרט חסר אחרי ברכת ליד חדש (onNewLeadWelcome) ===
    const missingFieldKey = 'pending_missing_field_' + phone;
    const pendingMissingSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: missingFieldKey });
    if (pendingMissingSettings.length > 0) {
      const pending = JSON.parse(pendingMissingSettings[0].value);
      const fieldValue = text.trim();
      if (fieldValue.length >= 2) {
        // עדכון הפרט ב-Contact
        const updateData = { [pending.field]: fieldValue };
        if (pending.field === 'full_name') updateData.bot_status = 'waiting_user_reply';
        await base44.asServiceRole.entities.Contact.update(pending.contact_id, updateData);
        await base44.asServiceRole.entities.SystemSetting.delete(pendingMissingSettings[0].id);

        // עכשיו שולחים את תפריט השירותים
        const welcomeMsg = await getBotContent(base44, 'new_lead_welcome') || await getBotContent(base44, 'welcome') || 'תודה! במה את/ה מתעניין/ת?\n1. ייעוץ פרישה\n2. היתכנות כלכלית\n3. השקעות\n4. איזון אקטוארי (גירושין)\n5. ייעוץ מס (שכר גבוה)\n6. אחר\n\n👈 השב/י במספר (1-6)';
        // שלוף רק את חלק התפריט (מ"נשמח לכוון" והלאה), או שלח הכל עם השם
        const updatedContacts = await base44.asServiceRole.entities.Contact.filter({ id: pending.contact_id });
        const updatedContact = updatedContacts[0];
        const menuMsg = `תודה ${updatedContact?.full_name || ''} ✅\n\nנשמח לכוון אותך לתחום הנכון — במה את/ה מתעניין/ת?\n1. ייעוץ פרישה\n2. היתכנות כלכלית\n3. השקעות\n4. איזון אקטוארי (גירושין)\n5. ייעוץ מס (שכר גבוה)\n6. אחר\n\n👈 פשוט השב/י במספר המתאים (1-6)`;
        const fpConvId = cachedConversationSettings[0]?.value || null;
        const sent = await sendWhatsApp(chatId, menuMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, fpConvId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_missing`, phone, menuMsg, chatId, fpConvId, outgoingStatus);
        return Response.json({ ok: true, fast_path: 'fp_missing_field_completed', field: pending.field });
      }
    }

    if (contact && (!contact.full_name || !contact.phone || !contact.email)) contact = null;

    let serviceRequest = null;
    if (contact) {
      const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id }, '-created_date', 20);
      serviceRequest = requests.find(request => !['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(request.status)) || requests[0] || null;
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        last_bot_interaction_at: new Date().toISOString(),
        bot_status: contact.bot_status === 'new' ? 'in_conversation' : contact.bot_status,
      });
    }

    // ===== FP-Greeting: פונה מוכר (פרטים מלאים) שפותח בברכה → תפריט השירותים ישירות, לא סוכן =====
    const GREETING_KEYWORDS = ['שלום', 'היי', 'הי', 'אהלן', 'בוקר טוב', 'ערב טוב', 'צהריים טובים', 'hello', 'hi', 'הלו'];
    if (contact && GREETING_KEYWORDS.includes(normalizeAnswer(text))) {
      const greetFirstName = String(contact.full_name || '').trim().split(/\s+/)[0] || '';
      // תיקון 3: לקוח באמצע מסלול פעיל — ברכה מודעת-הקשר במקום תפריט (תפריט + "1" היה משתיק את הבוט)
      const ACTIVE_ROUTE_STATUSES = ['interested', 'quote_sent', 'awaiting_client_decision', 'followup_active',
        'phone_meeting', 'meeting_scheduled', 'meeting_scheduled_frontal', 'meeting_scheduled_zoom'];
      if (serviceRequest && ACTIVE_ROUTE_STATUSES.includes(serviceRequest.status)) {
        const midTpl = await getBotContent(base44, 'greeting_mid_route') || 'שלום {name} 🌿 טוב לשמוע ממך!\nאנחנו באמצע התהליך שלך — אם יש שאלה, פשוט כתוב/י אותה כאן ואשמח לעזור.';
        const midMsg = midTpl.replaceAll('{name}', greetFirstName);
        const midConvId = cachedConversationSettings[0]?.value || null;
        const sentMid = await sendWhatsApp(chatId, midMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, midConvId);
        await logOutgoing(base44, sentMid?.idMessage || `out_${Date.now()}_fp_greeting_mid`, phone, midMsg, chatId, midConvId, outgoingStatus);
        return Response.json({ ok: true, fast_path: 'fp_greeting_mid_route' });
      }
      const greetTpl = await getBotContent(base44, 'greeting_known');
      const greetMenu = (greetTpl && greetTpl.replace('{name}', greetFirstName)) ||
        `שלום ${greetFirstName} 🌿 טוב לשמוע ממך!
במה את/ה מתעניין/ת?
1. ייעוץ פרישה
2. היתכנות כלכלית
3. השקעות
4. איזון אקטוארי (גירושין)
5. ייעוץ מס (שכר גבוה)
6. אחר

👈 פשוט השב/י במספר המתאים (1-6)`;
      const greetConvId = cachedConversationSettings[0]?.value || null;
      const sentGreet = await sendWhatsApp(chatId, greetMenu, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, greetConvId);
      await logOutgoing(base44, sentGreet?.idMessage || `out_${Date.now()}_fp_greeting`, phone, greetMenu, chatId, greetConvId, outgoingStatus);
      return Response.json({ ok: true, fast_path: 'fp_greeting_menu' });
    }

    let conversationId = serviceRequest?.conversation_id || cachedConversationSettings[0]?.value || null;
    let conversation = null;

    if (conversationId) {
      try {
        conversation = await base44.asServiceRole.agents.getConversation(conversationId);
      } catch (error) {
        conversationId = null;
      }
    }

    if (!conversationId) {
      conversation = await base44.asServiceRole.agents.createConversation({
        agent_name: AGENT_NAME,
        metadata: { name: contact?.full_name || phone, phone, source: 'whatsapp' },
      });
      conversationId = conversation.id;
      await base44.asServiceRole.entities.SystemSetting.create({
        key: 'phone_conv_' + phone,
        value: conversationId,
        category: 'flow',
      });
      if (serviceRequest) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { conversation_id: conversationId });
      }
    }

    // ===== FP-WebinarBenefit-UnknownNumber: "לקבלת ההטבה" ממספר שאין לו Contact =====
    // חייב לרוץ *לפני* ברכת ליד-חדש (fp0_greeting) ואיסוף הפרטים (FP-PartialDetails) —
    // אחרת "לקבלת ההטבה" נקלט כשם ("תודה לקבלת ההטבה!") או נשלף תפריט שירות רגיל.
    // תרחיש: משתתף וובינר שכותב ממספר שונה מזה שנרשם בו. מאשרים בעדינות
    // ומעבירים לבשמת לקישור ידני (הצלבה-אוטו-לפי-שם עלולה לקשר לאדם הלא-נכון).
    {
      const _benefitUnknown = ['לקבלת ההטבה', 'לקבלת הטבה', 'הטבה', 'ההטבה'].includes(normalizeAnswer(text))
        || normalizeAnswer(text).includes('לקבלת ההטבה') || normalizeAnswer(text).includes('לקבלת הטבה');
      if (!contact && _benefitUnknown) {
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        const unknownTpl = await getBotContent(base44, 'webinar_benefit_unknown_number')
          || 'נראה שאתה פונה בקשר להטבה מההדרכה 🎁\nמהמספר הזה לא מצאתי את ההרשמה — יתכן שנרשמת ממספר אחר.\nהעברתי את הפנייה לבשמת, והיא תחזור אליך ותמשיך איתך בהקדם 🙏';
        const unknownSent = await sendWhatsApp(chatId, unknownTpl, botEnabled);
        await logOutgoing(base44, unknownSent?.idMessage || `out_${Date.now()}_fp_benefit_unknown`, phone, unknownTpl, chatId, conversationId, outgoingStatus);
        try {
          const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
          const senderSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' });
          const senderEmail = senderSettings[0]?.value || '';
          if (BREVO_API_KEY && senderEmail) {
            const alertHtml = `<div dir="rtl" style="font-family:Arial;font-size:16px">📌 <b>פונה בקשר להטבת וובינר ממספר לא-מוכר</b><br/>טלפון: ${phone}<br/>הטקסט שנשלח: ${String(text || '').substring(0, 200)}<br/><br/>יתכן משתתף שנרשם ממספר אחר — יש לאתר ידנית ולהמשיך את מסלול ההטבה.</div>`;
            await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sender: { name: 'קרנות ראמים — בוט', email: senderEmail },
                to: [{ email: 'office.reemim@gmail.com', name: 'משרד ראמים' }],
                subject: `📌 פניית הטבה ממספר לא-מוכר — ${phone}`,
                htmlContent: alertHtml,
              }),
            });
          }
        } catch (e) { console.error('benefit-unknown admin alert error:', e.message); }
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${unknownTpl}` }); } catch (_) {}
        return Response.json({ ok: true, fast_path: 'fp_webinar_benefit_unknown_number' });
      }
    }

    if (!contact && cachedConversationSettings.length === 0) {
      const greetingMessage = await getBotContent(base44, 'greeting');
      if (greetingMessage) {
        const sent = await sendWhatsApp(chatId, greetingMessage, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp0`, phone, greetingMessage, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${greetingMessage}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp0_greeting' });
      }
    }

    // ===== FP-PartialDetails: איסוף פרטים הדרגתי (שם + מייל; טלפון ידוע מה-chatId) =====
    if (!contact) {
      const settingKey = 'pending_contact_' + phone;
      const existingPendingSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: settingKey });
      const pending = existingPendingSettings.length > 0 ? JSON.parse(existingPendingSettings[0].value) : {};
      const oldPending = { ...pending };

      // חילוץ מה שיש בהודעה הנוכחית
      const emailMatch = String(text || '').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      const compactText = String(text || '').replace(/[\-\s]/g, '');
      const phoneMatch = compactText.match(/05\d{8}/);

      // ניקוי טקסט לחילוץ שם — הסרת מייל וטלפון
      let nameCandidate = String(text || '')
        .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '')
        .replace(/0[5]\d[\d\-]{7,11}/g, '')
        .replace(/[,;:]/g, ' ')
        .replace(/(?:^|\s)שמי?(?=\s|$)\s*/gi, ' ')
        .replace(/(?:^|\s)מספרי?(?=\s|$)\s*/gi, ' ')
        .replace(/(?:^|\s)טלפון(?=\s|$)\s*/gi, ' ')
        .replace(/(?:^|\s)מייל(?=\s|$)\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // מילות מפתח שאסור לקלוט כשם
      const IGNORE_AS_NAME = ['1','2','3','4','5','6','כן','לא','בטח','כמובן','אוקי','ok','סבבה','הסר','הסרה','stop','unsubscribe','נציגה','אמתין','שלום','היי','הי'];
      const isIgnored = IGNORE_AS_NAME.includes(normalizeAnswer(nameCandidate)) || /^\d+$/.test(nameCandidate.trim());
      const hasHebrew = /[\u0590-\u05FF]/.test(nameCandidate);
      // מילות פונקציה — משפט דיבור שמכיל מילה כזו לא יכול להיות שם
      const FUNCTIONAL_WORDS = ['מה','למה','איך','מתי','קורה','כתבתי','אמרתי','שלחתי','אני','אתה','זה','רוצה','צריך','אפשר','תודה','בסדר','שוב','כבר','נתקע','עובד'];
      const hasFunctionalWord = nameCandidate && FUNCTIONAL_WORDS.some(w => nameCandidate.split(/\s+/).includes(w));
      if (isIgnored || nameCandidate.length < 2 || !hasHebrew || hasFunctionalWord) nameCandidate = '';

      // שאלה = כל הודעה עם סימן שאלה → עוברת לסוכן (מייל/טלפון שהופיעו בה כבר נקלטו ל-pending)
      const isQuestion = text.includes('?');
      // שם מתקבל רק אם: אין סימן שאלה, עד 4 מילים
      const nameWordCount = nameCandidate ? nameCandidate.split(/\s+/).length : 0;
      if (isQuestion || nameWordCount > 4) nameCandidate = '';

      // מיזוג לתוך ה-pending — טלפון השולח תמיד קובע
      if (emailMatch) pending.email = emailMatch[0].toLowerCase().trim();
      if (phoneMatch && phoneMatch[0] !== localPhone) {
        pending.extra_phone = phoneMatch[0]; // טלפון שונה שהוקלד — נשמר להערות
      }
      pending.phone = localPhone; // תמיד מספר השולח
      if (nameCandidate) pending.name = nameCandidate;

      // שמירה ב-SystemSetting
      const settingValue = JSON.stringify(pending);
      if (existingPendingSettings.length > 0) {
        await base44.asServiceRole.entities.SystemSetting.update(existingPendingSettings[0].id, { value: settingValue });
      } else {
        await base44.asServiceRole.entities.SystemSetting.create({ key: settingKey, value: settingValue, category: 'flow' });
      }

      // שאלה עם "?" → להעביר לסוכן (מייל/טלפון כבר נקלטו ל-pending, האיסוף ממשיך בהודעה הבאה)
      if (!isQuestion) {
        const missingName = !pending.name;
        const missingEmail = !pending.email;

        let askMessage;
        if (missingName && missingEmail) {
          askMessage = await getBotContent(base44, 'ask_missing_details') || 'כמעט שם! 😊 כדי שנוכל לפתוח לך תיק, נשמח לשם המלא ולכתובת המייל שלך';
        } else if (missingEmail) {
          askMessage = (await getBotContent(base44, 'ask_missing_email') || 'תודה {name}! 😊 נשאר רק פרט אחרון — מה כתובת המייל שלך?')
            .replaceAll('{name}', pending.name || '');
        } else if (missingName) {
          askMessage = await getBotContent(base44, 'ask_missing_name') || 'כמעט סיימנו 😊 מה השם המלא שלך?';
        } else {
          // הכל קיים — בדיקה: האם השתנה פרט ב-pending?
          const changedSomething =
            (emailMatch && pending.email !== oldPending.email) ||
            (phoneMatch && pending.phone !== oldPending.phone) ||
            (nameCandidate && pending.name !== oldPending.name);
          if (changedSomething) {
            // השתנה פרט → שולחים תבנית אישור מעודכנת
            const confirmTemplate = await getBotContent(base44, 'contact_details_confirm');
            askMessage = (confirmTemplate || 'הפרטים שלך:\n📛 שם: {name}\n📱 טלפון: {phone}\n📧 מייל: {email}\n\nהאם הכל נכון? כתוב/י *כן* לאישור.')
              .replaceAll('{name}', pending.name)
              .replaceAll('{phone}', pending.phone)
              .replaceAll('{email}', pending.email);
          } else {
            // מעקף: תשובות פונקציונליות (כן/לא/נציגה) עוברות ישירות לשרשרת — לא נתפסות כאן
            const PASSTHROUGH_ANSWERS = ['כן','כ','נכון','הכל נכון','בטח','כמובן','אוקי','ok','סבבה','👍','✅','לא','נציגה'];
            if (!PASSTHROUGH_ANSWERS.includes(normalizeAnswer(text))) {
              // לא השתנה כלום — בודקים אם כבר שלחנו הכוונה (confirm_nudge)
              const lastOutgoing = await base44.asServiceRole.entities.WhatsAppMessageLog.filter(
                { phone, direction: 'outgoing' }, '-created_date', 1
              );
              const lastOutText = String(lastOutgoing[0]?.text || '');
              const alreadySentNudge = lastOutText.startsWith('רק כדי לוודא');
              if (!alreadySentNudge) {
                // שליחת הכוונה דטרמיניסטית (פעם אחת)
                askMessage = await getBotContent(base44, 'confirm_nudge') || 'רק כדי לוודא 😊\nאם הפרטים שמופיעים למעלה נכונים — כתוב/י *כן*.\nאם יש טעות — פשוט שלח/י את הפרט המתוקן (שם או מייל).';
              }
              // אם כבר שלחנו הכוונה → askMessage נשאר undefined → fall-through לשרשרת
            }
            // PASSTHROUGH → askMessage נשאר undefined → fall-through לשרשרת (FP-Confirm / סוכן)
          }
        }

        if (askMessage) {
          const sent = await sendWhatsApp(chatId, askMessage, botEnabled);
          await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
          await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_partial`, phone, askMessage, chatId, conversationId, outgoingStatus);
          try {
            await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${askMessage}` });
          } catch (error) {}
          return Response.json({ ok: true, fast_path: missingName || missingEmail ? 'fp_partial_details_ask' : 'fp_details_confirm' });
        }
      }
      // isQuestion=true → ממשיכים לסוכן AI
    }

    // FP-Confirm: אישור פרטים ("כן") — בודק pending בלי תלות בקיום Contact (הסוכן עלול ליצור Contact במקביל)
    const positiveAnswers = ['כן', 'כ', 'נכון', 'הכל נכון', 'בטח', 'כמובן', 'אוקי', 'ok', 'סבבה', '👍', '✅'];
    if (positiveAnswers.includes(normalizeAnswer(text))) {
      const settingKey = 'pending_contact_' + phone;
      const pendingSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: settingKey });
      if (pendingSettings.length > 0) {
        const details = JSON.parse(pendingSettings[0].value);
        // חיפוש בכל הפורמטים — הסוכן עלול לשמור עם +972 או 0
        let existingContacts = await base44.asServiceRole.entities.Contact.filter({ phone: details.phone });
        if (existingContacts.length === 0) existingContacts = await base44.asServiceRole.entities.Contact.filter({ phone });
        if (existingContacts.length === 0) existingContacts = await base44.asServiceRole.entities.Contact.filter({ phone: '+' + phone });
        const contactPhone = localPhone; // תמיד מספר השולח
        const extraPhoneNote = details.extra_phone && details.extra_phone !== contactPhone
          ? `מספר נוסף שנמסר בצ'אט: ${details.extra_phone}`
          : '';
        const createdContact = existingContacts[0] || await base44.asServiceRole.entities.Contact.create({
          full_name: details.name,
          phone: contactPhone,
          email: details.email,
          source: 'manual',
          status: 'new_lead',
          ...(extraPhoneNote ? { notes: extraPhoneNote } : {}),
        });

        const serviceRequestData = {
          contact_id: createdContact.id,
          contact_name: details.name,
          contact_phone: contactPhone,
          contact_email: details.email,
          status: 'new',
          source: 'bot',
          conversation_id: conversationId,
        };
        await base44.asServiceRole.entities.ServiceRequest.create(serviceRequestData);
        await base44.asServiceRole.entities.SystemSetting.delete(pendingSettings[0].id);

        const welcomeMessage = await getBotContent(base44, 'welcome') || 'ברוך הבא! במה נוכל לעזור?';
        const sent = await sendWhatsApp(chatId, welcomeMessage, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_saved`, phone, welcomeMessage, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${welcomeMessage}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_details_saved' });
      }
    }

    // ===== FP-WebinarBenefit: "לקבלת ההטבה" (כפתור תבנית התודה) → הודעת פתיחה + 3 האפשרויות =====
    const BENEFIT_KEYWORDS = ['לקבלת ההטבה', 'לקבלת הטבה', 'הטבה', 'ההטבה'];
    // גם ביטוי בתוך משפט ("היי, לקבלת ההטבה בבקשה") — אחרי המעבר מכפתור להקלדה (17.8)
    const benefitTyped = BENEFIT_KEYWORDS.includes(normalizeAnswer(text)) || normalizeAnswer(text).includes('לקבלת ההטבה') || normalizeAnswer(text).includes('לקבלת הטבה');
    if (contact && benefitTyped) {
      const benefitRegs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 5);
      if (benefitRegs.some(r => r.coupon_sent === true)) {
        const introTpl = await getBotContent(base44, 'webinar_post_intro') || 'היי {name}, שמחתי לראות אותך בהדרכה!';
        const optionsTpl = await getBotContent(base44, 'webinar_post_options') || '';
        const [opt1, opt2, opt3] = await Promise.all([
          getServiceContentUrl(base44, { service_type: 'webinar', content_type: 'payment_link', sub_type: 'webinar_option1_digital' }),
          getServiceContentUrl(base44, { service_type: 'webinar', content_type: 'payment_link', sub_type: 'webinar_option2_meeting_program' }),
          getServiceContentUrl(base44, { service_type: 'webinar', content_type: 'payment_link', sub_type: 'webinar_option3_full_personal' }),
        ]);
        const introMsg = introTpl.replaceAll('{name}', contact.full_name || '');
        const optionsMsg = optionsTpl
          .replaceAll('{name}', contact.full_name || '')
          .replaceAll('{option1_link}', opt1)
          .replaceAll('{option2_link}', opt2)
          .replaceAll('{option3_link}', opt3);

        const sentIntro = await sendWhatsApp(chatId, introMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sentIntro?.idMessage || `out_${Date.now()}_fp_benefit_intro`, phone, introMsg, chatId, conversationId, outgoingStatus);

        let sentOptions = null;
        if (optionsMsg) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          sentOptions = await sendWhatsApp(chatId, optionsMsg, botEnabled);
          await logOutgoing(base44, sentOptions?.idMessage || `out_${Date.now()}_fp_benefit_options`, phone, optionsMsg, chatId, conversationId, outgoingStatus);
        }

        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
          content: (introMsg + '\n---\n' + optionsMsg).substring(0, 500),
          sent_by: 'bot', is_automated: true, template_id: 'webinar_post_options',
          status: botEnabled ? 'sent' : 'skipped',
        });
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${introMsg}\n\n${optionsMsg}` }); } catch (_) {}
        return Response.json({ ok: true, fast_path: 'fp_webinar_benefit_options' });
      }
    }

    // ===== FP-WebinarPostMeeting: "פגישה" → קישור תשלום (Part 4) =====
    // לא יוצרים/מעדכנים SR כאן — זה קורה ב-"שילמתי" (Part 5).
    if (contact && normalizeAnswer(text) === 'פגישה') {
      const webinarRegs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 5);
      const activeReg = webinarRegs.find(r => r.coupon_sent === true);
      if (activeReg) {
        const PAY_SUBTYPE = { retirement: 'payment_webinar_retirement', investments: 'payment_webinar_investments', divorce: 'payment_webinar_divorce' };
        const paymentLink = await getServiceContentUrl(base44, { content_type: 'payment_link', sub_type: PAY_SUBTYPE[activeReg.webinar_type] || 'payment_webinar_retirement' });
        const payTpl = await getBotContent(base44, 'webinar_payment_intro') || '';
        const payMsg = payTpl.replaceAll('{name}', contact.full_name || '').replaceAll('{payment_link}', paymentLink);
        const sent = await sendWhatsApp(chatId, payMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_webinar_pay`, phone, payMsg, chatId, conversationId, outgoingStatus);
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${payMsg}` }); } catch (_) {}
        return Response.json({ ok: true, fast_path: 'fp_webinar_payment_link' });
      }
    }

    // ===== FP-WebinarPaid: "שילמתי" → SR interested + בחירת מיקום (Part 5) =====
    // החלטת בשמת: לא מעכבים עד אימות תשלום — הצוות מאמת בנפרד.
    if (contact && (normalizeAnswer(text).startsWith('שילמתי') || normalizeAnswer(text) === 'שולם')) {
      const regsByContact = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 10);
      const reg = regsByContact.find(r => r.coupon_sent === true || r.pending_payment === true || r.payment_completed === true);
      if (reg) {
        const svcType = reg.webinar_type === 'retirement' ? 'retirement' : reg.webinar_type === 'investments' ? 'investments' : 'divorce_split';
        let sr = serviceRequest;
        if (!sr || ['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(sr?.status)) {
          sr = await base44.asServiceRole.entities.ServiceRequest.create({
            contact_id: contact.id, contact_name: contact.full_name, contact_phone: contact.phone, contact_email: contact.email,
            status: 'interested', source: 'webinar', conversation_id: conversationId, service_type: svcType,
          });
        } else {
          await base44.asServiceRole.entities.ServiceRequest.update(sr.id, { status: 'interested', source: 'webinar', service_type: sr.service_type || svcType });
        }
        await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, { service_request_id: sr.id });
        const locTpl = await getBotContent(base44, 'webinar_location_choice') || '';
        const locMsg = locTpl.replaceAll('{name}', contact.full_name || '');
        const sent = await sendWhatsApp(chatId, locMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_paid`, phone, locMsg, chatId, conversationId, outgoingStatus);
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${locMsg}` }); } catch (_) {}
        return Response.json({ ok: true, fast_path: 'fp_webinar_paid_to_scheduling' });
      }
    }

    // ===== FP-ServiceClarify: מענה על בירור תחום (כשהשאלון לא נשלח כי התחום לא זוהה) =====
    if (contact && serviceRequest && serviceRequest.pending_service_clarify) {
      const clarifiedType = detectServiceType(text);
      const SHORANSS_SUBTYPE = {
        retirement: 'shoranss_retirement',
        economic_feasibility: 'shoranss_economic',
        investments: 'shoranss_investments',
        divorce_split: 'shoranss_divorce',
        tax_advisory: 'shoranss_tax',
      };
      const clarifySubType = SHORANSS_SUBTYPE[clarifiedType];

      if (clarifiedType && clarifySubType) {
        // זוהה תחום — שולחים את השאלון הנכון
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
          service_type: clarifiedType,
          pending_service_clarify: false,
        });
        const questionnaireUrl = await getServiceContentUrl(base44, { content_type: 'questionnaire', sub_type: clarifySubType });
        const questionnaireTemplate = await getBotContent(base44, 'questionnaire_request');
        const message = (questionnaireTemplate || 'מצורף שאלון קצר למילוי לקראת הפגישה:\n{questionnaire_link}')
          .replaceAll('{name}', contact.full_name || '')
          .replaceAll('{questionnaire_link}', questionnaireUrl);
        const sent = await sendWhatsApp(chatId, message, botEnabled);
        await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_user_reply', shoranss_questionnaire: 'sent' });
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_clarify`, phone, message, chatId, conversationId, outgoingStatus);
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${message}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_service_clarified', service_type: clarifiedType });
      }

      // עדיין לא זוהה תחום — העברה לנציגה
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { pending_service_clarify: false });
      await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_agent', conversation_owner: 'bar' });
      await notifyHandoffByEmail(base44, contact, 'תחום השירות לא זוהה גם אחרי שאלת בירור', text);
      const escalateMessage = await getBotContent(base44, 'escalate_to_agent') || 'מעבירים את הפנייה לנציגת שירות, נחזור אליך בהקדם 🙏';
      const sent = await sendWhatsApp(chatId, escalateMessage, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_clarify_esc`, phone, escalateMessage, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${escalateMessage}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_service_clarify_escalated' });
    }

    const selectedServiceType = detectServiceType(text);

    // "6" / "אחר" → בירור תחום במקום פתיחת שירות שנתי
    if (selectedServiceType === '__other__' && contact) {
      if (!serviceRequest || ['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(serviceRequest?.status)) {
        serviceRequest = await base44.asServiceRole.entities.ServiceRequest.create({
          contact_id: contact.id, contact_name: contact.full_name, contact_phone: contact.phone,
          contact_email: contact.email, status: 'new', source: 'bot', conversation_id: conversationId,
          pending_service_clarify: true,
        });
      } else {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { pending_service_clarify: true });
      }
      const clarifyMsg = await getBotContent(base44, 'service_type_clarify') || 'כדי שנוכל לכוון אותך נכון — מה התחום שמעניין אותך?\n1. ייעוץ פרישה\n2. היתכנות כלכלית\n3. תכנון השקעות\n4. איזון אקטוארי בגירושין\n5. ייעוץ מס';
      const sent = await sendWhatsApp(chatId, clarifyMsg, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_other`, phone, clarifyMsg, chatId, conversationId, outgoingStatus);
      try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${clarifyMsg}` }); } catch (_) {}
      return Response.json({ ok: true, fast_path: 'fp_other_clarify' });
    }

    // FP-ServiceChoice: "1"/"2" כאשר כבר יש SR עם service_type (תפריט ההמתנה) — תיקון 2: "2" לא ייפול יותר לבחירת שירות בלולאה
    if (selectedServiceType && contact && serviceRequest && serviceRequest.service_type && ['1', '2'].includes(normalizeAnswer(text))) {
      if (normalizeAnswer(text) === '2') {
        // "2" = תיאום עצמאי — קישור המתאמת, בלי השתקת הבוט
        const selfCalLink = await getServiceContentUrl(base44, { service_type: 'general', content_type: 'calendar_link', sub_type: 'coordinator_calendar' });
        const selfTpl = await getBotContent(base44, 'self_schedule_ack') || 'מצוין! הנה הקישור לתיאום שיחה עם המתאמת שלנו 📅\n{calendar_link}\n\nאחרי שתקבע/י — פשוט כתוב/י כאן "קבעתי" ונמשיך משם 🙂';
        const selfMsg = selfTpl.replaceAll('{calendar_link}', selfCalLink);
        const sentSelf = await sendWhatsApp(chatId, selfMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sentSelf?.idMessage || `out_${Date.now()}_fp_2_self`, phone, selfMsg, chatId, conversationId, outgoingStatus);
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${selfMsg}` }); } catch (_) {}
        return Response.json({ ok: true, fast_path: 'fp_2_self_schedule' });
      }
      await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_agent' });
      await notifyHandoffByEmail(base44, contact, 'הלקוח בחר להמתין לחזרת נציגה (תפריט ההמתנה)', text);
      const ackMsg = await getBotContent(base44, 'wait_coordinator_ack') || 'מעולה! נציגה תחזור אלייך בהקדם 🙏';
      const sent = await sendWhatsApp(chatId, ackMsg, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_1_wait`, phone, ackMsg, chatId, conversationId, outgoingStatus);
      try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${ackMsg}` }); } catch (_) {}
      return Response.json({ ok: true, fast_path: 'fp_1_wait_coordinator' });
    }

    if (selectedServiceType && selectedServiceType !== '__other__' && contact) {
      // אם אין SR פעיל — יוצרים אחד (ליד חדש שבחר שירות ישירות מהתפריט)
      if (!serviceRequest || ['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(serviceRequest?.status)) {
        serviceRequest = await base44.asServiceRole.entities.ServiceRequest.create({
          contact_id: contact.id,
          contact_name: contact.full_name,
          contact_phone: contact.phone,
          contact_email: contact.email,
          service_type: selectedServiceType,
          status: 'new',
          source: 'bot',
          conversation_id: conversationId,
        });
      } else if (!serviceRequest.service_type) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { service_type: selectedServiceType });
      }

      const SERVICE_NAME_LABELS = {
        retirement: 'ייעוץ פרישה',
        economic_feasibility: 'היתכנות כלכלית',
        investments: 'תכנון השקעות',
        divorce_split: 'איזון אקטוארי (גירושין)',
        tax_advisory: 'ייעוץ מס',
      };
      const [waitMessageTemplate, calendarLink, serviceVideoUrl] = await Promise.all([
        getBotContent(base44, 'after_choice_wait'),
        getServiceContentUrl(base44, { service_type: 'general', content_type: 'calendar_link', sub_type: 'coordinator_calendar' }),
        getServiceContentUrl(base44, { service_type: selectedServiceType, content_type: 'video', sub_type: 'service_intro_video' }),
      ]);

      if (waitMessageTemplate && calendarLink) {
        const message = waitMessageTemplate
          .replaceAll('{calendar_link}', calendarLink)
          .replaceAll('{service_name}', SERVICE_NAME_LABELS[selectedServiceType] || 'השירות שבחרת');
        const sent = await sendWhatsApp(chatId, message, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_service`, phone, message, chatId, conversationId, outgoingStatus);
        // סרטון אודות השירות — הודעה נפרדת (אם הועלה קובץ לשירות הזה)
        if (serviceVideoUrl) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const videoCaption = await getBotContent(base44, 'service_video_caption') || 'לצפיה בסרטון קצר אודות השירות 🎬';
          const videoSent = await sendWhatsAppVideo(chatId, serviceVideoUrl, videoCaption, botEnabled);
          await logOutgoing(base44, videoSent ? `out_${Date.now()}_fp_service_video` : `out_${Date.now()}_fp_service_video_fail`, phone, `${videoCaption}\n[סרטון: ${SERVICE_NAME_LABELS[selectedServiceType] || selectedServiceType}]`, chatId, conversationId, videoSent ? outgoingStatus : 'error');
        }
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${message}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_service_choice', service_type: selectedServiceType });
      }
    }

    // ===== FP-WaitCoordinator: הלקוח בחר להמתין לנציגה =====
    const waitAnswers = ['אמתין', 'אמתין לנציגה', 'אחכה לנציגה', 'שתחזרו אליי', 'שתחזרו אלי', 'תחזרו אליי', 'תחזרו אלי', 'נציגה', 'מחכה לשיחה'];
    // "1" = המתנה לנציגה רק כשעוד לא נשלח תפריט הפגישות (בסטטוס interested "1" = זום)
    if (contact && serviceRequest && waitAnswers.includes(normalizeAnswer(text))) {
      await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_agent' });
      await notifyHandoffByEmail(base44, contact, 'הלקוח ביקש שנציגה תחזור אליו', text);
      const ackMessage = await getBotContent(base44, 'wait_coordinator_ack') || 'מעולה! נציגה תחזור אלייך בהקדם 🙏';
      const sent = await sendWhatsApp(chatId, ackMessage, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_wait`, phone, ackMessage, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${ackMessage}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_wait_coordinator' });
    }

    // ===== FP-AwaitingDecision: ניתוב תגובת לקוח כשהפנייה בסטטוס "ממתין להחלטה" =====
    if (contact && serviceRequest && serviceRequest.status === 'awaiting_client_decision') {
      const answer = normalizeAnswer(text);
      const noKeywords = ['לא מעוניין', 'לא מעוניינת', 'לא רוצה', 'לא מתאים', 'לא בטוח', 'לא בטוחה', 'לא מוכן', 'לא כרגע', 'לא עכשיו'];
      const thinkKeywords = ['אחשוב', 'עוד לחשוב', 'צריך לחשוב', 'אחשוב על זה'];
      const wantExact = ['כן', 'בטח', 'כמובן'];
      const wantIncludes = ['מעוניין', 'מעוניינת', 'רוצה להתקדם', 'להתקדם', 'רוצה'];

      if (noKeywords.some(k => answer.includes(k))) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { status: 'closed_lost', closed_reason: 'lost_not_interested' });
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text }); } catch (e) {}
        return Response.json({ ok: true, fast_path: 'fp_awaiting_to_closed_lost' });
      }
      const isShort = answer.split(/\s+/).length <= 3;
      const hasQuestion = text.includes('?');
      if (wantExact.some(k => answer === k) || (isShort && !hasQuestion && wantIncludes.some(k => answer.includes(k)))) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { status: 'interested' });
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text }); } catch (e) {}
        return Response.json({ ok: true, fast_path: 'fp_awaiting_to_interested' });
      }
      if (thinkKeywords.some(k => answer.includes(k) || answer === k)) {
        const thinkMsg = await getBotContent(base44, 'awaiting_think_ack') || 'בסדר גמור, קח/י את הזמן 🙏 ניצור קשר שוב בקרוב.';
        const sent = await sendWhatsApp(chatId, thinkMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_think`, phone, thinkMsg, chatId, conversationId, outgoingStatus);
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${thinkMsg}` }); } catch (e) {}
        return Response.json({ ok: true, fast_path: 'fp_awaiting_think' });
      }
      // תשובה לא מוכרת — ממשיכים לסוכן AI
    }

    // ===== FP-MeetingChoice: בחירת מיקום פגישה אחרי שהלקוח מעוניין (interested) =====
    if (contact && serviceRequest && serviceRequest.status === 'interested') {
      // אפשרות "שיחת טלפון" לפגישה הוסרה (החלטת עינת 17.8) — שיחת התיאום עם המתאמת היא זרימה נפרדת ולא הושפעה
      const locationMap = {
        'א': 'zoom', 'ב': 'modiin', 'ג': 'petah_tikva_wednesday',
        'זום': 'zoom', 'zoom': 'zoom', 'בזום': 'zoom',
        'מודיעין': 'modiin', 'במודיעין': 'modiin',
        'פתח תקווה': 'petah_tikva_wednesday', 'פתח-תקווה': 'petah_tikva_wednesday', 'פת': 'petah_tikva_wednesday', 'בפתח תקווה': 'petah_tikva_wednesday',
      };
      const chosenLocation = locationMap[normalizeAnswer(text)];
      if (chosenLocation) {
        // === תיקון 2: שאלת הבהרה כשמחליפים מיקום ===
        const LOCATION_LABEL = { zoom: 'זום', modiin: 'מודיעין', petah_tikva_wednesday: 'פתח תקווה', phone: 'שיחת טלפון' };
        const prevLocation = serviceRequest.last_appointment_type;
        const isChange = prevLocation && prevLocation !== chosenLocation && !serviceRequest.pending_location_confirm;

        if (isChange) {
          await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { pending_location_confirm: true });
          const clarifyTemplate = await getBotContent(base44, 'location_change_confirm') ||
            'רק כדי לוודא 😊 קודם בחרת {prev} ועכשיו {new} — איפה נקיים את הפגישה?\nא) זום\nב) מודיעין\nג) פתח תקווה\n\n👈 השב/י באות המתאימה ואשלח את הקישור הנכון';
          const clarifyMsg = clarifyTemplate
            .replaceAll('{prev}', LOCATION_LABEL[prevLocation] || prevLocation)
            .replaceAll('{new}', LOCATION_LABEL[chosenLocation] || chosenLocation);
          const sent = await sendWhatsApp(chatId, clarifyMsg, botEnabled);
          await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
          await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_loc_confirm`, phone, clarifyMsg, chatId, conversationId, outgoingStatus);
          try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${clarifyMsg}` }); } catch (_) {}
          return Response.json({ ok: true, fast_path: 'fp_location_change_confirm' });
        }
        // === סוף תיקון 2: שאלת הבהרה ===

        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { last_appointment_type: chosenLocation, pending_location_confirm: false });

        let calendarQuery;
        if (serviceRequest.service_type === 'divorce_split') {
          calendarQuery = { service_type: 'divorce_split', content_type: 'calendar_link', sub_type: 'divorce_calendar' };
        } else if (serviceRequest.service_type === 'annual_service_call') {
          calendarQuery = { service_type: 'annual_service_call', content_type: 'calendar_link', sub_type: 'annual_service_calendar' };
        } else {
          const subTypeMap = {
            zoom: 'zoom_calendar',
            modiin: 'modiin_calendar',
            petah_tikva_wednesday: 'petah_tikva_calendar',
            phone: 'phone_calendar',
          };
          calendarQuery = { service_type: 'general', content_type: 'calendar_link', sub_type: subTypeMap[chosenLocation] };
        }

        const calendarUrl = await getServiceContentUrl(base44, calendarQuery);
        if (calendarUrl) {
          // תיקון 5א: הקישור נשלח עם הסבר והנחיה לכתוב "קבעתי" — זה מה שפותח את חלון 24 השעות להמשך המסלול
          const calIntroTpl = await getBotContent(base44, 'calendar_link_intro') || 'מצוין! הנה הקישור לבחירת מועד 📅\n{calendar_link}\n\n👈 חשוב: אחרי שתבחר/י מועד — כתוב/י לי כאן "קבעתי", ואשלח לך את כל הפרטים.';
          const calMsg = calIntroTpl.replaceAll('{calendar_link}', calendarUrl);
          const sent = await sendWhatsApp(chatId, calMsg, botEnabled);
          await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
          await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_meeting`, phone, calMsg, chatId, conversationId, outgoingStatus);
          try {
            await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${calMsg}` });
          } catch (error) {}
          return Response.json({ ok: true, fast_path: 'fp_meeting_choice', location: chosenLocation });
        }
      }
    }

    // ===== FP-Reschedule: בקשת שינוי/ביטול מועד (פגישה או וובינר) → העברה לנציגה =====
    const rescheduleKeywords = ['להחליף מועד', 'להחליף את המועד', 'לשנות מועד', 'לשנות את המועד', 'שינוי מועד', 'החלפת מועד', 'לדחות את הפגישה', 'להזיז את הפגישה', 'לשנות את הפגישה', 'לבטל את הפגישה', 'לבטל פגישה', 'ביטול פגישה', 'להקדים את הפגישה', 'לדחות את הוובינר', 'להחליף וובינר', 'מועד אחר לוובינר'];
    if (contact && rescheduleKeywords.some(k => normalizeAnswer(text).includes(k))) {
      const meetingStatusesForReschedule = ['phone_meeting', 'meeting_scheduled', 'meeting_scheduled_frontal', 'meeting_scheduled_zoom'];
      const hasMeetingContext = serviceRequest && (serviceRequest.meeting_id || meetingStatusesForReschedule.includes(serviceRequest.status));
      const regsForReschedule = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 5);
      const hasWebinarContext = regsForReschedule.some(r => r.webinar_date && new Date(r.webinar_date).getTime() > Date.now() && r.attended !== true);

      if (hasMeetingContext || hasWebinarContext) {
        const ackKey = (!hasMeetingContext && hasWebinarContext) ? 'webinar_reschedule_ack' : 'reschedule_request_ack';
        const ackFallback = (!hasMeetingContext && hasWebinarContext)
          ? 'מבינה {name} 🙏 מעבירה את הבקשה לנציגה שלנו — היא תחזור אלייך בהקדם עם מועד וובינר חלופי או קישור להקלטה.'
          : 'אין שום בעיה {name} 🙏\nמעבירה את הבקשה לנציגה שלנו — היא תחזור אלייך בהקדם לתיאום המועד מחדש.';
        await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_agent', conversation_owner: 'bar' });
        await notifyHandoffByEmail(base44, contact, 'בקשת שינוי/ביטול מועד (פגישה או וובינר)', text);
        const ackMsg = (await getBotContent(base44, ackKey) || ackFallback).replaceAll('{name}', contact.full_name || '');
        const sent = await sendWhatsApp(chatId, ackMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_reschedule`, phone, ackMsg, chatId, conversationId, outgoingStatus);
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${ackMsg}` }); } catch (_) {}
        return Response.json({ ok: true, fast_path: 'fp_reschedule_to_agent', context: hasMeetingContext ? 'meeting' : 'webinar' });
      }
    }

    // ===== FP-Kavati: "קבעתי" — אישור קצר בלבד (היצירה בפועל דרך Cal.com webhook) =====
    if (normalizeAnswer(text) === 'קבעתי') {
      // תיקון 5ב: שולפים את הפגישה בפועל; תמיד עונים ותמיד return — לא נופלים לסוכן
      const kavatiMeetings = contact ? await base44.asServiceRole.entities.Meeting.filter({ contact_id: contact.id }, '-scheduled_at', 1) : [];
      const kavatiMeeting = kavatiMeetings[0] || null;
      let confirmedMessage;
      let kavatiFastPath;
      if (kavatiMeeting) {
        const KAVATI_LOCATION_LABELS = { modiin: 'מודיעין — המעיין 44, מתחם M.dot', petah_tikva_wednesday: 'פתח תקווה — השחם 1, בניין C', zoom: 'פגישת זום', phone: 'שיחת טלפון' };
        const kavatiTimeStr = kavatiMeeting.scheduled_at
          ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'full', timeStyle: 'short' }).format(new Date(kavatiMeeting.scheduled_at))
          : '';
        const kavatiTpl = await getBotContent(base44, 'appointment_confirmed') || 'מצוין {name}, הפגישה נקבעה ✅\n📅 {time}\n📍 {location}\n\nנשלח לך בהמשך את כל מה שצריך להכנה. נתראה!';
        confirmedMessage = kavatiTpl
          .replaceAll('{name}', contact?.full_name || '')
          .replaceAll('{time}', kavatiTimeStr)
          .replaceAll('{location}', KAVATI_LOCATION_LABELS[kavatiMeeting.location] || kavatiMeeting.location || '');
        kavatiFastPath = 'fp_appointment_confirmed';
      } else {
        // ה-webhook של Cal.com עדיין לא נקלט — הודעת המתנה במקום שתיקה
        confirmedMessage = await getBotContent(base44, 'appointment_pending_ack') || 'תודה! אני בודקת את פרטי הפגישה ואחזור אלייך עם האישור המלא תוך כמה דקות 🙏';
        kavatiFastPath = 'fp_appointment_pending';
      }
      const sent = await sendWhatsApp(chatId, confirmedMessage, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_kavati`, phone, confirmedMessage, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${confirmedMessage}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: kavatiFastPath });
    }

    // ===== FP-IDDetails: קליטת ת.ז. + תאריך לידה אחרי מילוי שאלון =====
    if (serviceRequest && serviceRequest.current_step === 'waiting_id_details' && contact) {
      // חילוץ ת.ז. (9 ספרות) ותאריך לידה (DD/MM/YYYY או DD.MM.YYYY או DD-MM-YYYY)
      const idMatch = text.match(/\b(\d{9})\b/);
      const dateMatch = text.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);

      if (idMatch && dateMatch) {
        const idNumber = idMatch[1];
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        let year = dateMatch[3];
        if (year.length === 2) { year = parseInt(year) >= 30 ? '19' + year : '20' + year; }
        const birthDate = `${year}-${month}-${day}`;

        // חילוץ מייל מהטקסט (אם חסר ב-Contact)
        const idEmailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        const contactUpdate = {
          id_number: idNumber,
          birth_date: birthDate,
          bot_status: 'waiting_user_reply',
          last_bot_interaction_at: new Date().toISOString(),
        };
        if (idEmailMatch && !contact.email) {
          contactUpdate.email = idEmailMatch[0].toLowerCase().trim();
        }

        // שמירה ב-Contact
        await base44.asServiceRole.entities.Contact.update(contact.id, contactUpdate);

        // אישור קבלה + שליחת בקשת מסמכים
        const ackMessage = await getBotContent(base44, 'id_details_received_ack') || 'תודה רבה! קיבלנו את הפרטים ✅';
        const sent = await sendWhatsApp(chatId, ackMessage, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_id_ack`, phone, ackMessage, chatId, conversationId, outgoingStatus);

        // שליחת בקשת מסמכים
        // תיקון 6: רשימת מסמכים לפי סוג שירות, עם נפילה חזרה לגנרי (רשומה ריקה נופלת אוטומטית לגנרי)
        const docsKey = serviceRequest.service_type ? `documents_request_${serviceRequest.service_type}` : '';
        const docsTemplate = (docsKey ? await getBotContent(base44, docsKey) : '')
          || await getBotContent(base44, 'documents_request') || '';
        if (docsTemplate) {
          await new Promise(resolve => setTimeout(resolve, 1200));
          const docsMessage = docsTemplate.replaceAll('{name}', contact.full_name || '');
          const docsSent = await sendWhatsApp(chatId, docsMessage, botEnabled);
          await logOutgoing(base44, docsSent?.idMessage || `out_${Date.now()}_fp_id_docs`, phone, docsMessage, chatId, conversationId, outgoingStatus);
        }

        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
          current_step: 'waiting_documents',
        });

        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${ackMessage}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_id_details_received', id_number: idNumber, birth_date: birthDate });
      }

      // הקלט הוא שאלה ולא נתון — לא נחשב ניסיון כושל; הסוכן יענה ויחזיר לבקשת הפרטים
      const ID_QUESTION_WORDS = ['מה', 'למה', 'איך', 'מתי', 'איפה', 'האם', 'כמה', 'מי', 'אפשר'];
      const isIdQuestion = text.includes('?') || ID_QUESTION_WORDS.includes(normalizeAnswer(text.trim().split(/\s+/)[0]));

      if (!isIdQuestion) {
      // לא הצליח לחלץ — בדיקת מספר ניסיונות
      const retryKey = 'id_retry_' + phone;
      const retrySettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: retryKey });
      const retryCount = retrySettings.length > 0 ? parseInt(retrySettings[0].value || '0') : 0;
      if (retryCount >= 2) {
        // 2 כישלונות — הסלמה לנציגה
        if (retrySettings.length > 0) await base44.asServiceRole.entities.SystemSetting.delete(retrySettings[0].id);
        await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_agent', conversation_owner: 'bar' });
        await notifyHandoffByEmail(base44, contact, 'קליטת ת.ז. ותאריך לידה נכשלה פעמיים', text);
        const escalateMsg = await getBotContent(base44, 'escalate_to_agent') || 'מעבירים את הפנייה לנציגת שירות, נחזור אליך בהקדם 🙏';
        const sent = await sendWhatsApp(chatId, escalateMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_id_esc`, phone, escalateMsg, chatId, conversationId, outgoingStatus);
        try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${escalateMsg}` }); } catch (_) {}
        return Response.json({ ok: true, fast_path: 'fp_id_details_escalated' });
      }
      // עדכון מונה ניסיונות
      if (retrySettings.length > 0) {
        await base44.asServiceRole.entities.SystemSetting.update(retrySettings[0].id, { value: String(retryCount + 1) });
      } else {
        await base44.asServiceRole.entities.SystemSetting.create({ key: retryKey, value: '1', category: 'flow' });
      }
      const retryMessage = await getBotContent(base44, 'id_details_retry') || 'לא הצלחתי לזהות את הפרטים. נא לשלוח בהודעה אחת את מספר תעודת הזהות (9 ספרות) ותאריך לידה (DD/MM/YYYY)';
      const sent = await sendWhatsApp(chatId, retryMessage, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_id_retry`, phone, retryMessage, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${retryMessage}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_id_details_retry' });
      }
      // שאלה בשלב איסוף הפרטים — ממשיכים לסוכן AI
    }

    // ===== FP-DocsSent: "שלחתי" אחרי מילוי שאלון — אישור + סגירה חמה מיידית =====
    // שחרור צומת (17.8): לא ממתינים לסימון אדמין — הפונה מסיים את המסלול בתוך חלון 24 השעות.
    // האימות של הצוות נמשך ברקע (documents_received נשאר false עד סימון אמיתי).
    if (serviceRequest && (serviceRequest.questionnaire_completed || serviceRequest.current_step === 'waiting_documents' || serviceRequest.current_step === 'waiting_id_details') && !serviceRequest.documents_received && normalizeAnswer(text).startsWith('שלחתי') && normalizeAnswer(text).split(/\s+/).length <= 3) {
      const docsAckMessage = await getBotContent(base44, 'documents_sent_ack') || 'תודה ששלחת! 🙏 הצוות שלנו יעבור על המסמכים ויוודא שהכל התקבל.';
      const sent = await sendWhatsApp(chatId, docsAckMessage, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_docs`, phone, docsAckMessage, chatId, conversationId, outgoingStatus);
      // סגירה חמה מיד — הפונה לא ממתין לאף אחד
      await new Promise(resolve => setTimeout(resolve, 2500));
      const closingMsg = await getBotContent(base44, 'preparation_complete_closing') || 'תודה רבה {name}! 🌿\nההכנה לפגישה הושלמה — את/ה מוזמן/ת להגיע מוכן/ה ורגוע/ה.\nנשמח לראותך בפגישה עם בשמת! 💜';
      const closingFilled = closingMsg.replaceAll('{name}', contact?.full_name || '');
      const closingSent = await sendWhatsApp(chatId, closingFilled, botEnabled);
      await logOutgoing(base44, closingSent?.idMessage || `out_${Date.now()}_fp_docs_closing`, phone, closingFilled, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact?.id, type: 'whatsapp', direction: 'outbound',
          content: closingFilled.substring(0, 500), sent_by: 'bot', is_automated: true,
          template_id: 'preparation_complete_closing', status: botEnabled ? 'sent' : 'skipped',
        });
      } catch (_) {}
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'prep_completed' });
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${docsAckMessage}\n\n${closingFilled}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_documents_sent_closed' });
    }

    // ===== FP-QuestionnaireSelfReport: לקוח אומר "מילאתי" — אישור המתנה (האימות בשורנס בלבד) =====
    const questionnaireStatuses = ['meeting_scheduled', 'meeting_scheduled_frontal', 'meeting_scheduled_zoom'];
    const filledKeywords = ['מילאתי', 'מלאתי', 'סיימתי את השאלון', 'סיימתי שאלון', 'שלחתי את השאלון', 'מילאתי את השאלון'];
    if (contact && serviceRequest && questionnaireStatuses.includes(serviceRequest.status) && !serviceRequest.questionnaire_completed && serviceRequest.current_step !== 'waiting_id_details' && serviceRequest.current_step !== 'prep_completed') {
      const normalizedText = normalizeAnswer(text);
      if (filledKeywords.some(kw => normalizedText.includes(kw))) {
        // שחרור צומת (17.8): לא ממתינים לאישור שורנס — ממשיכים מיד לבקשת ת"ז; האימות נמשך ברקע
        const ackTemplate = await getBotContent(base44, 'questionnaire_ack_continue') || 'תודה {name}! 🙏 השאלון נקלט — הצוות יוודא אותו ברקע, ואנחנו ממשיכים 🙂';
        const ackMsg = ackTemplate.replaceAll('{name}', contact.full_name || '');
        const sent = await sendWhatsApp(chatId, ackMsg, botEnabled);
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
        await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_q_ack`, phone, ackMsg, chatId, conversationId, outgoingStatus);
        // בקשת ת"ז + תאריך לידה (ומייל אם חסר) — מיד, בלי עצירה
        const qNeedsEmail = !contact.email;
        let idReqTpl = await getBotContent(base44, qNeedsEmail ? 'questionnaire_id_email_request' : 'questionnaire_id_request');
        if (!idReqTpl && qNeedsEmail) {
          idReqTpl = await getBotContent(base44, 'questionnaire_id_request');
          if (idReqTpl) idReqTpl += '\n\n📧 וגם — מה כתובת המייל שלך?';
        }
        if (!idReqTpl) idReqTpl = 'אשמח לקראת הפגישה שתכתוב/י לנו את *מספר תעודת הזהות* ו*תאריך הלידה*.\n\n👈 בהודעה אחת, לדוגמה: 123456789 01/01/1960';
        await new Promise(resolve => setTimeout(resolve, 2500));
        const idReqMsg = idReqTpl.replaceAll('{name}', contact.full_name || '');
        const idReqSent = await sendWhatsApp(chatId, idReqMsg, botEnabled);
        await logOutgoing(base44, idReqSent?.idMessage || `out_${Date.now()}_fp_q_idreq`, phone, idReqMsg, chatId, conversationId, outgoingStatus);
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'waiting_id_details' });
        await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_user_reply', shoranss_questionnaire: 'filled', last_bot_interaction_at: new Date().toISOString() });
        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${ackMsg}\n\n${idReqMsg}` });
        } catch (error) {}
        return Response.json({ ok: true, fast_path: 'fp_questionnaire_continue_to_id' });
      }
    }

    // ===== FP-CarPlate: מספר רכב / "אין צורך" → הנחיות חניה → ואז השאלון (מודיעין + פתח תקווה) =====
    if (contact && serviceRequest && serviceRequest.current_step === 'waiting_car_plate') {
      const normalizedCar = normalizeAnswer(text);
      // זיהוי "אין רכב" — גם בתוך משפט. 17.8: התאמה-מלאה בלבד (.includes על מערך) פספסה ניסוחים
      // כמו "אין צורך ברכב" / "לא, אני מגיעה באוטובוס" והפילה אותם ל-LLM עם חיווי צעד-הבא שגוי.
      // "לא"/"אין" בודדים נשארים התאמה-מלאה בלבד — עמומים מדי להכלה ("לא הבנתי מה עם החניה").
      const NO_CAR_EXACT = ['לא', 'אין'];
      const NO_CAR_SUBSTR = ['אין צורך', 'לא צריך', 'לא צריכה', 'אין רכב', 'אין לי רכב', 'בלי רכב', 'ללא רכב', 'לא מגיע עם רכב', 'לא מגיעה עם רכב', 'לא ברכב', 'לא באוטו', 'בתחבורה ציבורית', 'תחבורה ציבורית', 'באוטובוס', 'ברכבת', 'ברגל'];
      const isNoCar = NO_CAR_EXACT.includes(normalizedCar) || NO_CAR_SUBSTR.some((kw) => normalizedCar.includes(kw));
      const carPlateMatch = text.match(/\b\d{5,8}\b/);

      if (isNoCar || carPlateMatch) {
        const apptType = serviceRequest.last_appointment_type || '';
        const isPetahTikva = apptType.includes('petah_tikva');
        await logIncoming(base44, idMessage, phone, text, chatId, conversationId);

        if (carPlateMatch && !isNoCar) {
          const plateNumber = carPlateMatch[0];
          await base44.asServiceRole.entities.Contact.update(contact.id, { car_plate: plateNumber });

          const thanksMsg = await getBotContent(base44, 'car_plate_thanks') || 'תודה! צוות ראמים עודכן במספר הרכב ✅';
          const thanksSent = await sendWhatsApp(chatId, thanksMsg, botEnabled);
          await logOutgoing(base44, thanksSent?.idMessage || `out_${Date.now()}_fp_car_thanks`, phone, thanksMsg, chatId, conversationId, outgoingStatus);

          const alertTemplate = await getBotContent(base44, 'car_plate_admin_alert') || '🚗 *יש לארגן חניה*\nשם לקוח: {name}\nמספר רכב: {car_plate}\nמועד פגישה: {time}';
          const alertMsg = alertTemplate
            .replaceAll('{name}', contact.full_name || '')
            .replaceAll('{car_plate}', plateNumber)
            .replaceAll('{time}', serviceRequest.last_appointment_time_str || '');
          try {
            const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
            const senderSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' });
            const senderEmail = senderSettings[0]?.value || '';
            if (BREVO_API_KEY && senderEmail) {
              await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sender: { name: 'קרנות ראמים — בוט', email: senderEmail },
                  to: [{ email: 'office.reemim@gmail.com', name: 'משרד ראמים' }],
                  subject: `🚗 חניה לארגן — ${contact.full_name || ''} — רכב ${plateNumber}`,
                  htmlContent: `<div dir="rtl" style="font-family:Arial;font-size:16px">${alertMsg.replace(/\n/g, '<br/>')}</div>`,
                }),
              });
            }
          } catch (e) { console.error('Car plate email error:', e.message); }
        }

        // תמונת מיקום והנחיות חניה — רק למי שמגיע עם רכב (תיקון 17.8: "אין צורך" קיבל חניה מיותרת)
        let parkingMsg = '';
        if (!isNoCar) {
          const officeImageUrl = await getServiceContentUrl(base44, { content_type: 'image', sub_type: isPetahTikva ? 'petah_tikva_office_image' : 'modiin_office_image' });
          if (officeImageUrl) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendWhatsAppFileByUrl(chatId, officeImageUrl, 'office.png', '', botEnabled);
          }
          parkingMsg = await getBotContent(base44, isPetahTikva ? 'parking_instructions_petah_tikva' : 'parking_instructions_modiin');
          if (parkingMsg) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const parkingSent = await sendWhatsApp(chatId, parkingMsg, botEnabled);
            await logOutgoing(base44, parkingSent?.idMessage || `out_${Date.now()}_fp_car_parking`, phone, parkingMsg, chatId, conversationId, outgoingStatus);
          }
        }

        // ואז השאלון — בקשה אחת בכל פעם, עם חיווי צעד הבא
        const CAR_SHORANSS_SUBTYPE = {
          retirement: 'shoranss_retirement',
          economic_feasibility: 'shoranss_economic',
          investments: 'shoranss_investments',
          divorce_split: 'shoranss_divorce',
          tax_advisory: 'shoranss_tax',
          annual_service_call: 'shoranss_retirement',
        };
        const qSubType = CAR_SHORANSS_SUBTYPE[serviceRequest.service_type];
        const questionnaireUrl = qSubType ? await getServiceContentUrl(base44, { content_type: 'questionnaire', sub_type: qSubType }) : '';
        await new Promise(resolve => setTimeout(resolve, 2000));
        let followupMsg = '';
        if (questionnaireUrl) {
          const qTpl = await getBotContent(base44, 'questionnaire_request') || 'לקראת הפגישה, נשמח שתמלא/י את השאלון:\n{questionnaire_link}\n\n👈 לאחר המילוי — השב/י כאן "מילאתי" ונמשיך 🙂';
          followupMsg = qTpl.replaceAll('{name}', contact.full_name || '').replaceAll('{questionnaire_link}', questionnaireUrl);
          await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'waiting_questionnaire' });
          await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_user_reply', shoranss_questionnaire: 'sent' });
        } else {
          followupMsg = await getBotContent(base44, 'service_type_clarify') || 'כדי שנוכל לכוון אותך נכון — מה התחום שמעניין אותך?\n1. ייעוץ פרישה\n2. היתכנות כלכלית\n3. תכנון השקעות\n4. איזון אקטוארי בגירושין\n5. ייעוץ מס\n\n👈 השב/י במספר המתאים';
          await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: '', pending_service_clarify: true });
          await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_user_reply' });
        }
        const followupSent = await sendWhatsApp(chatId, followupMsg, botEnabled);
        await logOutgoing(base44, followupSent?.idMessage || `out_${Date.now()}_fp_car_next`, phone, followupMsg, chatId, conversationId, outgoingStatus);

        try {
          await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${parkingMsg || ''}\n\n${followupMsg}` });
        } catch (_) {}
        return Response.json({ ok: true, fast_path: 'fp_car_plate_then_questionnaire', location: isPetahTikva ? 'petah_tikva' : 'modiin' });
      }
      // לא מספר רכב ולא "אין צורך" — שאלה או הבהרה: ממשיכים לסוכן AI (בלי לספור ניסיון כושל)
    }

    // ===== FP-Polite: תגובת נימוס קצרה במצב המתנה — מענה קצר בלי סוכן =====
    const politeAnswers = ['תודה', 'תודה רבה', 'מעולה', 'אחלה', 'סבבה', 'יופי', 'מושלם', 'בסדר', 'בסדר גמור', '👍', '🙏', '❤️', '😊'];
    const waitingStatuses = ['phone_meeting', 'meeting_scheduled', 'meeting_scheduled_frontal', 'meeting_scheduled_zoom', 'interested', 'in_progress', 'awaiting_client_decision'];
    // גם לקוח וובינר (יש לו WebinarRegistration עם coupon_sent/pending_payment/payment_completed) נחשב במצב המתנה
    const isWebinarLead = contact && !serviceRequest && (await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id }, '-created_date', 5))
      .some(r => r.coupon_sent === true || r.pending_payment === true || r.payment_completed === true);
    const inWaitingState = (serviceRequest && waitingStatuses.includes(serviceRequest.status)) || isWebinarLead;
    if (inWaitingState && politeAnswers.includes(normalizeAnswer(text))) {
      const politeReply = await getBotContent(base44, 'polite_ack') || 'בשמחה 🙂';
      const sent = await sendWhatsApp(chatId, politeReply, botEnabled);
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_polite`, phone, politeReply, chatId, conversationId, outgoingStatus);
      try {
        await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `[לקוח כתב]: ${text}\n\n${politeReply}` });
      } catch (error) {}
      return Response.json({ ok: true, fast_path: 'fp_polite_ack' });
    }

    const goodbyeAnswers = ['סיום', 'סיום שיחה', 'ביי', 'להתראות', 'תודה סיום', 'סיימנו', 'זהו'];
    if (goodbyeAnswers.includes(normalizeAnswer(text))) {
      const goodbyeMessage = await getBotContent(base44, 'goodbye') || 'שמחנו לשוחח! שיהיה לך יום נפלא 🙏';
      const sent = await sendWhatsApp(chatId, goodbyeMessage, botEnabled);
      if (serviceRequest) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { status: 'completed' });
      }
      await logIncoming(base44, idMessage, phone, text, chatId, conversationId);
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}_fp_goodbye`, phone, goodbyeMessage, chatId, conversationId, outgoingStatus);
      return Response.json({ ok: true, fast_path: 'fp_goodbye' });
    }

    const incomingLog = await logIncoming(base44, idMessage, phone, text, chatId, conversationId, 'pending_reply');
    // ספירה *לפני* הוספת הודעת המשתמש (+1 עליה) — סוכן מהיר עלול לענות לפני ספירה מאוחרת והתשובה "תיבלע".
    // הד ישן נמנע ממילא: סורקים רק הודעות שאחרי הודעת המשתמש (אינדקס messageCountBefore ואילך).
    const freshConvForCount = await base44.asServiceRole.agents.getConversation(conversationId);
    const messageCountBefore = (freshConvForCount.messages || []).length + 1; // +1 = הודעת המשתמש שנוספת עכשיו
    await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
    await base44.asServiceRole.entities.WhatsAppMessageLog.update(incomingLog.id, { message_count_at_send: messageCountBefore });

    let agentReply = '';
    const pollStart = Date.now();
    let lastTypingRefresh = pollStart;
    let sentReassurance = false;

    while (Date.now() - pollStart < 25000) {
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!sentReassurance && Date.now() - pollStart > 15000) {
        sentReassurance = true;
        const patienceMessage = await getBotContent(base44, 'patience_message') || 'עוד רגע ואחזור אליך 😊';
        await sendWhatsApp(chatId, patienceMessage, botEnabled);
      }

      if (Date.now() - lastTypingRefresh > 6000) {
        lastTypingRefresh = Date.now();
        await sendTyping(chatId, 8, botEnabled);
      }

      const freshConversation = await base44.asServiceRole.agents.getConversation(conversationId);
      const messages = freshConversation.messages || [];
      if (messages.length > messageCountBefore) {
        for (let index = messages.length - 1; index >= messageCountBefore; index--) {
          if (messages[index].role === 'assistant' && messages[index].content && messages[index].content !== '<empty message>') {
            agentReply = messages[index].content;
            break;
          }
        }
        if (agentReply) break;
      }
    }

    if (agentReply) {
      const sent = await sendWhatsApp(chatId, agentReply, botEnabled);
      await base44.asServiceRole.entities.WhatsAppMessageLog.update(incomingLog.id, { status: 'replied' });
      await logOutgoing(base44, sent?.idMessage || `out_${Date.now()}`, phone, agentReply, chatId, conversationId, outgoingStatus);
      return Response.json({ ok: true, conversationId, replied: true });
    }

    // ===== Agent Timeout Fallback: הסוכן לא ענה תוך 25 שניות =====
    const timeoutMsg = await getBotContent(base44, 'agent_timeout_fallback') || 'מצטערת על ההמתנה 🙏 אני בודקת את זה ואחזור אלייך ממש בקרוב.\nאם זה דחוף — אפשר לכתוב "נציגה" ואדאג שיחזרו אלייך.';
    const timeoutSent = await sendWhatsApp(chatId, timeoutMsg, botEnabled);
    await base44.asServiceRole.entities.WhatsAppMessageLog.update(incomingLog.id, { status: 'timeout_fallback' });
    await logOutgoing(base44, timeoutSent?.idMessage || `out_${Date.now()}_timeout`, phone, timeoutMsg, chatId, conversationId, outgoingStatus);

    // טריגר לא-חוסם ל-processWhatsAppReplies — איסוף תשובת הסוכן שתגיע בהמשך
    try {
      const u = new URL(req.url);
      const sweepUrl = `${u.origin}${u.pathname.replace(/\/greenApiWebhook$/, '')}/processWhatsAppReplies?secret=pwr_scheduled_run_2026&chain=1`;
      await Promise.race([fetch(sweepUrl, { method: 'POST' }), new Promise(r => setTimeout(r, 5000))]);
    } catch (e) { console.error('sweep trigger failed:', e.message); }

    return Response.json({ ok: true, conversationId, timeout_fallback: true });
  } catch (error) {
    console.error('greenApiWebhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
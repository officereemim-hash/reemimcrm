import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ===== מערכת דיוור — שליחת קמפיין (מייל דרך Brevo + וואטסאפ דרך Green API) =====
// נקרא מה-UI (ComposeDialog). יוצר Campaign + שורות CampaignQueue לכל נמען,
// שולח מנה ראשונה של מיילים מיידית, והשאר (כולל כל הוואטסאפ) נשלח בהדרגה
// ע"י processCampaignQueue שרץ כל 5 דקות.

const APP_FUNCTIONS_BASE = 'https://basmat-crm-copy-62c92ace.base44.app/api/apps/69f3c646e222353462c92ace/functions';
const EMAIL_INLINE_BATCH = 15; // כמה מיילים לשלוח מיידית לפני שהתור ממשיך
const WA_UNSUB_FOOTER = '\n\nלהסרה מרשימת התפוצה השיבו "הסר"';

const AUDIENCE_FILTERS = {
  all_active: (c) => c.status === 'active_client',
  completed: (c) => c.status === 'completed',
  in_progress: (c) => ['in_progress', 'quote_sent'].includes(c.status),
  new_leads: (c) => c.status === 'new_lead',
};

function normalizePhone(phone) {
  let p = (phone || '').replace(/[\s\-()]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = '972' + p.slice(1);
  return p;
}

function personalize(text, contact, unsubscribeUrl) {
  return (text || '')
    .replaceAll('{{name}}', contact.full_name || '')
    .replaceAll('{שם}', contact.full_name || '')
    .replaceAll('{name}', contact.full_name || '')
    .replaceAll('{{unsubscribe_link}}', unsubscribeUrl);
}

async function getSetting(base44, key, fallback = '') {
  const rows = await base44.asServiceRole.entities.SystemSetting.filter({ key });
  return rows.length > 0 ? rows[0].value : fallback;
}

async function sendViaBrevo({ apiKey, senderName, senderEmail, toEmail, toName, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: toEmail, name: toName || '' }],
      subject,
      htmlContent: html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Brevo error: ${JSON.stringify(data)}`);
  }
  return data.messageId || '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'שליחת דיוור מותרת למנהלת בלבד' }, { status: 403 });
    }

    const payload = await req.json();
    const {
      type = 'newsletter',
      channel = 'email',          // email | whatsapp | both
      audience = 'all_active',    // all_active | completed | in_progress | new_leads | single
      contact_ids = null,         // נדרש כש-audience === 'single'
      subject = '',
      email_html = '',            // HTML מלא עם {{name}} ו-{{unsubscribe_link}}
      whatsapp_message = '',      // טקסט עם {{name}}
      campaign_name = '',
    } = payload;

    const wantsEmail = channel === 'email' || channel === 'both';
    const wantsWhatsApp = channel === 'whatsapp' || channel === 'both';

    if (wantsEmail && (!subject || !email_html)) {
      return Response.json({ error: 'חסר נושא או תוכן מייל' }, { status: 400 });
    }
    if (wantsWhatsApp && !whatsapp_message) {
      return Response.json({ error: 'חסרה הודעת וואטסאפ' }, { status: 400 });
    }

    // --- הגדרות מערכת ---
    const emailLive = (await getSetting(base44, 'email_live_mode', 'false')) === 'true';
    const whatsappLive = (await getSetting(base44, 'whatsapp_live_mode', 'false')) === 'true';
    const senderName = await getSetting(base44, 'mailing_sender_name', 'קרנות ראמים');
    const senderEmail = await getSetting(base44, 'mailing_sender_email', '');
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';

    if (wantsEmail && emailLive && (!BREVO_API_KEY || !senderEmail)) {
      return Response.json({
        error: 'מצב שליחה אמיתית פעיל אך חסר BREVO_API_KEY או mailing_sender_email',
      }, { status: 500 });
    }

    // --- בחירת נמענים ---
    const allContacts = await base44.asServiceRole.entities.Contact.list(null, 2000);
    let recipients;
    if (audience === 'single' && Array.isArray(contact_ids) && contact_ids.length > 0) {
      recipients = allContacts.filter((c) => contact_ids.includes(c.id));
    } else {
      const filter = AUDIENCE_FILTERS[audience];
      if (!filter) return Response.json({ error: `קהל יעד לא מוכר: ${audience}` }, { status: 400 });
      recipients = allContacts.filter(filter);
    }
    // הסרה מתפוצה — לעולם לא שולחים למי שהוסר
    recipients = recipients.filter((c) => !c.mailing_opt_out);

    if (recipients.length === 0) {
      return Response.json({ error: 'אין נמענים מתאימים (ייתכן שכולם הוסרו מהתפוצה)' }, { status: 400 });
    }

    // --- יצירת קמפיין ---
    const campaign = await base44.asServiceRole.entities.Campaign.create({
      name: campaign_name || subject || `דיוור ${type}`,
      type,
      channel,
      audience,
      subject,
      recipients_count: recipients.length,
      status: 'in_progress',
      content_snapshot: wantsEmail ? email_html : whatsapp_message,
      sent_at: new Date().toISOString(),
      sent_by: user.full_name || user.email,
    });

    // --- יצירת שורות תור לכל נמען ---
    const queueItems = [];
    for (const contact of recipients) {
      // טוקן הסרה — נוצר פעם אחת לכל איש קשר
      let token = contact.unsubscribe_token;
      if (!token) {
        token = crypto.randomUUID();
        await base44.asServiceRole.entities.Contact.update(contact.id, { unsubscribe_token: token });
      }
      const unsubscribeUrl = `${APP_FUNCTIONS_BASE}/unsubscribe?token=${token}`;

      if (wantsEmail) {
        const hasValidEmail = contact.email && !contact.email_invalid;
        queueItems.push(await base44.asServiceRole.entities.CampaignQueue.create({
          campaign_id: campaign.id,
          contact_id: contact.id,
          contact_name: contact.full_name || '',
          channel: 'email',
          recipient: contact.email || '',
          subject: personalize(subject, contact, unsubscribeUrl),
          content: hasValidEmail ? personalize(email_html, contact, unsubscribeUrl) : '',
          status: hasValidEmail ? (emailLive ? 'pending' : 'skipped') : 'skipped',
          error_message: hasValidEmail ? (emailLive ? '' : 'מצב לוג בלבד — לא נשלח בפועל') : 'אין כתובת מייל תקינה',
        }));
      }

      if (wantsWhatsApp) {
        const phone = normalizePhone(contact.phone);
        queueItems.push(await base44.asServiceRole.entities.CampaignQueue.create({
          campaign_id: campaign.id,
          contact_id: contact.id,
          contact_name: contact.full_name || '',
          channel: 'whatsapp',
          recipient: phone,
          content: phone ? personalize(whatsapp_message, contact, unsubscribeUrl) + WA_UNSUB_FOOTER : '',
          status: phone ? (whatsappLive ? 'pending' : 'skipped') : 'skipped',
          error_message: phone ? (whatsappLive ? '' : 'מצב לוג בלבד — לא נשלח בפועל') : 'אין מספר טלפון',
        }));
      }
    }

    // --- שליחה מיידית של מנת מיילים ראשונה ---
    let emailSentNow = 0;
    let emailFailedNow = 0;
    const pendingEmails = queueItems.filter((q) => q.channel === 'email' && q.status === 'pending');
    for (const item of pendingEmails.slice(0, EMAIL_INLINE_BATCH)) {
      try {
        const messageId = await sendViaBrevo({
          apiKey: BREVO_API_KEY,
          senderName,
          senderEmail,
          toEmail: item.recipient,
          toName: item.contact_name,
          subject: item.subject,
          html: item.content,
        });
        await base44.asServiceRole.entities.CampaignQueue.update(item.id, {
          status: 'sent',
          brevo_message_id: messageId,
          sent_at: new Date().toISOString(),
        });
        await base44.asServiceRole.entities.Communication.create({
          contact_id: item.contact_id,
          type: 'email',
          direction: 'outbound',
          content: `[דיוור] נושא: ${item.subject}`,
          sent_by: 'basmat',
          is_automated: false,
          template_id: `campaign_${campaign.id}`,
          status: 'sent',
        });
        emailSentNow++;
      } catch (err) {
        await base44.asServiceRole.entities.CampaignQueue.update(item.id, {
          status: 'failed',
          error_message: String(err.message || err).slice(0, 500),
        });
        emailFailedNow++;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // --- עדכון מונים ראשוני בקמפיין ---
    const emailQueued = queueItems.filter((q) => q.channel === 'email' && q.status === 'pending').length - emailSentNow - emailFailedNow;
    const whatsappQueued = queueItems.filter((q) => q.channel === 'whatsapp' && q.status === 'pending').length;
    const stillPending = emailQueued > 0 || whatsappQueued > 0;

    await base44.asServiceRole.entities.Campaign.update(campaign.id, {
      email_sent: emailSentNow,
      email_failed: emailFailedNow,
      status: stillPending ? 'in_progress' : (emailFailedNow > 0 ? 'partial' : 'completed'),
    });

    return Response.json({
      success: true,
      campaign_id: campaign.id,
      recipients: recipients.length,
      email_sent_now: emailSentNow,
      email_failed_now: emailFailedNow,
      email_queued: emailQueued,
      whatsapp_queued: whatsappQueued,
      live_mode: { email: emailLive, whatsapp: whatsappLive },
      message: stillPending
        ? 'הקמפיין נוצר. יתרת ההודעות תישלח בהדרגה (כל 5 דקות) ע"י מעבד התור.'
        : 'הקמפיין נשלח במלואו.',
    });
  } catch (error) {
    console.error('sendCampaign error:', error);
    return Response.json({ error: String(error.message || error) }, { status: 500 });
  }
});
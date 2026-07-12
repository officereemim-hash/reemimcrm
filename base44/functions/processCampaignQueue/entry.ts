import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ===== מעבד תור הדיוור — רץ כל 5 דקות (Scheduled Function) =====
// מיילים: עד 40 בכל ריצה דרך Brevo.
// וואטסאפ: עד 8 בכל ריצה, רק בין 09:00-20:00 שעון ישראל, עם מרווח 12 שניות
// בין הודעות ומגבלה יומית (ברירת מחדל 100) — כדי לא להיחסם ע"י WhatsApp.

const EMAIL_BATCH = 40;
const EMAIL_DELAY_MS = 250;
const WHATSAPP_BATCH = 8;
const WHATSAPP_DELAY_MS = 12000;
const TIME_ZONE = 'Asia/Jerusalem';
const SEND_WINDOW_START = 9;
const SEND_WINDOW_END = 20;

function israelParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}
function israelDateKey(date = new Date()) {
  const p = israelParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}
function isWithinWindow() {
  const hour = Number(israelParts().hour);
  return hour >= SEND_WINDOW_START && hour < SEND_WINDOW_END;
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
  if (!res.ok) throw new Error(`Brevo error: ${JSON.stringify(data)}`);
  return data.messageId || '';
}

async function sendViaGreenApi({ instanceId, token, phone, message }) {
  const res = await fetch(
    `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: `${phone}@c.us`, message, typingTime: 3000 }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Green API error: ${JSON.stringify(data)}`);
  return data.idMessage || '';
}

async function logCommunication(base44, item, type, ok, errorMsg = '') {
  try {
    await base44.asServiceRole.entities.Communication.create({
      contact_id: item.contact_id,
      type,
      direction: 'outbound',
      content: type === 'email' ? `[דיוור] נושא: ${item.subject}` : `[דיוור] ${(item.content || '').slice(0, 200)}`,
      sent_by: 'system',
      is_automated: true,
      template_id: `campaign_${item.campaign_id}`,
      status: ok ? 'sent' : 'failed',
      error_detail: errorMsg || undefined,
    });
  } catch (e) {
    console.error('logCommunication failed:', e.message);
  }
}

// עדכון סטטוס ומונים של הקמפיינים שטופלו בריצה הזו
async function refreshCampaigns(base44, campaignIds) {
  for (const cid of campaignIds) {
    const items = await base44.asServiceRole.entities.CampaignQueue.filter({ campaign_id: cid }, null, 2000);
    const count = (ch, statuses) => items.filter((i) => i.channel === ch && statuses.includes(i.status)).length;
    const pending = items.filter((i) => i.status === 'pending').length;
    const emailFailed = count('email', ['failed', 'bounced']);
    const whatsappFailed = count('whatsapp', ['failed']);
    await base44.asServiceRole.entities.Campaign.update(cid, {
      email_sent: count('email', ['sent', 'delivered', 'opened', 'clicked']),
      email_failed: emailFailed,
      whatsapp_sent: count('whatsapp', ['sent', 'delivered']),
      whatsapp_failed: whatsappFailed,
      status: pending > 0 ? 'in_progress' : (emailFailed + whatsappFailed > 0 ? 'partial' : 'completed'),
    });
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // בדיקת מתגי כיבוי — וואטסאפ ומיילים נבדקים בנפרד
  const [botRow, greenRow] = await Promise.all([
    base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
    base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' }),
  ]);
  const botEnabled = botRow[0]?.value === 'true';
  const greenEnabled = greenRow[0]?.value === 'true';

  const summary = { email_sent: 0, email_failed: 0, whatsapp_sent: 0, whatsapp_failed: 0, whatsapp_delayed: false };
  const touchedCampaigns = new Set();

  // אפשרות עקיפת חלון השליחה — לבדיקות ידניות בלבד
  let forceWindow = false;
  try {
    const body = await req.json();
    forceWindow = body?.force_window === true;
  } catch (_) {}

  try {
    const senderName = await getSetting(base44, 'mailing_sender_name', 'קרנות ראמים');
    const senderEmail = await getSetting(base44, 'mailing_sender_email', '');
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
    const GREEN_ID = Deno.env.get('GREEN_API_INSTANCE_ID') || '';
    const GREEN_TOKEN = Deno.env.get('GREEN_API_TOKEN') || '';

    // ===== 1. מיילים ממתינים =====
    const pendingEmails = await base44.asServiceRole.entities.CampaignQueue.filter(
      { status: 'pending', channel: 'email' }, 'created_date', EMAIL_BATCH,
    );
    for (const item of pendingEmails || []) {
      touchedCampaigns.add(item.campaign_id);
      if (!BREVO_API_KEY || !senderEmail) {
        await base44.asServiceRole.entities.CampaignQueue.update(item.id, {
          status: 'failed', error_message: 'חסר BREVO_API_KEY או mailing_sender_email',
        });
        summary.email_failed++;
        continue;
      }
      try {
        const messageId = await sendViaBrevo({
          apiKey: BREVO_API_KEY, senderName, senderEmail,
          toEmail: item.recipient, toName: item.contact_name,
          subject: item.subject, html: item.content,
        });
        await base44.asServiceRole.entities.CampaignQueue.update(item.id, {
          status: 'sent', brevo_message_id: messageId, sent_at: new Date().toISOString(),
        });
        await logCommunication(base44, item, 'email', true);
        summary.email_sent++;
      } catch (err) {
        await base44.asServiceRole.entities.CampaignQueue.update(item.id, {
          status: 'failed', error_message: String(err.message || err).slice(0, 500),
        });
        await logCommunication(base44, item, 'email', false, String(err.message || err).slice(0, 200));
        summary.email_failed++;
      }
      await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
    }

    // ===== 2. וואטסאפ ממתינים =====
    if (!botEnabled || !greenEnabled) {
      summary.whatsapp_delayed = true;
      summary.whatsapp_delay_reason = 'בוט או Green API כבויים';
    } else if (!isWithinWindow() && !forceWindow) {
      summary.whatsapp_delayed = true;
      summary.whatsapp_delay_reason = 'מחוץ לחלון השליחה (09:00-20:00)';
    } else {
      const dailyLimit = Number(await getSetting(base44, 'whatsapp_daily_limit', '100')) || 100;
      const recentSent = await base44.asServiceRole.entities.CampaignQueue.filter(
        { channel: 'whatsapp', status: 'sent' }, '-sent_at', 500,
      );
      const todayKey = israelDateKey();
      const sentToday = (recentSent || []).filter(
        (i) => i.sent_at && israelDateKey(new Date(i.sent_at)) === todayKey,
      ).length;

      if (sentToday >= dailyLimit) {
        summary.whatsapp_delayed = true;
        summary.whatsapp_delay_reason = `הגעת למגבלה היומית (${dailyLimit})`;
      } else {
        const allowedNow = Math.min(WHATSAPP_BATCH, dailyLimit - sentToday);
        const pendingWA = await base44.asServiceRole.entities.CampaignQueue.filter(
          { status: 'pending', channel: 'whatsapp' }, 'created_date', allowedNow,
        );
        for (const item of pendingWA || []) {
          touchedCampaigns.add(item.campaign_id);
          if (!GREEN_ID || !GREEN_TOKEN) {
            await base44.asServiceRole.entities.CampaignQueue.update(item.id, {
              status: 'failed', error_message: 'חסרים פרטי Green API',
            });
            summary.whatsapp_failed++;
            continue;
          }
          try {
            await sendViaGreenApi({
              instanceId: GREEN_ID, token: GREEN_TOKEN,
              phone: item.recipient, message: item.content,
            });
            await base44.asServiceRole.entities.CampaignQueue.update(item.id, {
              status: 'sent', sent_at: new Date().toISOString(),
            });
            await logCommunication(base44, item, 'whatsapp', true);
            if (item.contact_id) {
              await base44.asServiceRole.entities.Contact.update(item.contact_id, {
                last_contact_date: new Date().toISOString().split('T')[0],
              }).catch(() => {});
            }
            summary.whatsapp_sent++;
          } catch (err) {
            await base44.asServiceRole.entities.CampaignQueue.update(item.id, {
              status: 'failed', error_message: String(err.message || err).slice(0, 500),
            });
            await logCommunication(base44, item, 'whatsapp', false, String(err.message || err).slice(0, 200));
            summary.whatsapp_failed++;
          }
          await new Promise((r) => setTimeout(r, WHATSAPP_DELAY_MS));
        }
      }
    }

    // ===== 3. עדכון סטטוס הקמפיינים =====
    await refreshCampaigns(base44, touchedCampaigns);

    return Response.json({ success: true, ...summary });
  } catch (error) {
    console.error('processCampaignQueue error:', error);
    return Response.json({ success: false, error: String(error.message || error), ...summary }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

const EMAIL_BATCH = 40;
const EMAIL_DELAY_MS = 250;
const WHATSAPP_BATCH = 40;
const WHATSAPP_DELAY_MS = 2000;
const TIME_ZONE = 'Asia/Jerusalem';

function israelParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}
function israelDateKey(date = new Date()) { const p = israelParts(date); return `${p.year}-${p.month}-${p.day}`; }

async function getSetting(base44, key, fallback = '') {
  const rows = await base44.asServiceRole.entities.SystemSetting.filter({ key });
  return rows.length > 0 ? rows[0].value : fallback;
}

async function sendViaBrevo({ apiKey, senderName, senderEmail, toEmail, toName, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { name: senderName, email: senderEmail }, to: [{ email: toEmail, name: toName || '' }], subject, htmlContent: html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo error: ${JSON.stringify(data)}`);
  return data.messageId || '';
}

async function sendViaGreenApi({ instanceId, token, phone, message }) {
  const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: `${phone}@c.us`, message, typingTime: 3000 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Green API error: ${JSON.stringify(data)}`);
  return data.idMessage || '';
}

async function logCommunication(base44, item, type, ok, errorMsg = '') {
  try {
    await base44.asServiceRole.entities.Communication.create({
      contact_id: item.contact_id, type, direction: 'outbound',
      content: type === 'email' ? `[דיוור] נושא: ${item.subject}` : `[דיוור] ${(item.content || '').slice(0, 200)}`,
      sent_by: 'system', is_automated: true, template_id: `campaign_${item.campaign_id}`,
      status: ok ? 'sent' : 'failed', error_detail: errorMsg || undefined,
    });
  } catch (e) { console.error('logCommunication failed:', e.message); }
}

async function refreshCampaigns(base44, campaignIds) {
  for (const cid of campaignIds) {
    const items = await base44.asServiceRole.entities.CampaignQueue.filter({ campaign_id: cid }, null, 2000);
    const count = (ch, statuses) => items.filter((i) => i.channel === ch && statuses.includes(i.status)).length;
    const pending = items.filter((i) => i.status === 'pending').length;
    const emailFailed = count('email', ['failed', 'bounced']);
    const whatsappFailed = count('whatsapp', ['failed']);
    await base44.asServiceRole.entities.Campaign.update(cid, {
      email_sent: count('email', ['sent', 'delivered', 'opened', 'clicked']),
      email_failed: emailFailed, whatsapp_sent: count('whatsapp', ['sent', 'delivered']),
      whatsapp_failed: whatsappFailed,
      status: pending > 0 ? 'in_progress' : (emailFailed + whatsappFailed > 0 ? 'partial' : 'completed'),
    });
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const [botRow, greenRow] = await Promise.all([
    base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
    base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' }),
  ]);
  const botEnabled = botRow[0]?.value === 'true';
  const greenEnabled = greenRow[0]?.value === 'true';

  const summary = { email_sent: 0, email_failed: 0, whatsapp_sent: 0, whatsapp_failed: 0, whatsapp_delayed: false };
  const touchedCampaigns = new Set();

  try {
    const senderName = await getSetting(base44, 'mailing_sender_name', 'קרנות ראמים');
    const senderEmail = await getSetting(base44, 'mailing_sender_email', '');
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
    const GREEN_ID = Deno.env.get('GREEN_API_INSTANCE_ID') || '';
    const GREEN_TOKEN = Deno.env.get('GREEN_API_TOKEN') || '';

    // ===== 1. מיילים ממתינים =====
    const pendingEmails = await base44.asServiceRole.entities.CampaignQueue.filter({ status: 'pending', channel: 'email' }, 'created_date', EMAIL_BATCH);
    for (const item of pendingEmails || []) {
      touchedCampaigns.add(item.campaign_id);
      if (!BREVO_API_KEY || !senderEmail) {
        await base44.asServiceRole.entities.CampaignQueue.update(item.id, { status: 'failed', error_message: 'חסר BREVO_API_KEY או mailing_sender_email' });
        summary.email_failed++; continue;
      }
      try {
        const messageId = await sendViaBrevo({ apiKey: BREVO_API_KEY, senderName, senderEmail, toEmail: item.recipient, toName: item.contact_name, subject: item.subject, html: item.content });
        await base44.asServiceRole.entities.CampaignQueue.update(item.id, { status: 'sent', brevo_message_id: messageId, sent_at: new Date().toISOString() });
        await logCommunication(base44, item, 'email', true);
        summary.email_sent++;
      } catch (err) {
        await base44.asServiceRole.entities.CampaignQueue.update(item.id, { status: 'failed', error_message: String(err.message || err).slice(0, 500) });
        await logCommunication(base44, item, 'email', false, String(err.message || err).slice(0, 200));
        summary.email_failed++;
      }
      await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
    }

    // ===== 2. וואטסאפ ממתינים =====
    const whatsappAllowed = botEnabled && (WHATSAPP_PROVIDER === 'uchat' || greenEnabled);
    if (!whatsappAllowed) {
      summary.whatsapp_delayed = true;
      summary.whatsapp_delay_reason = 'בוט או ספק WhatsApp כבויים';
    } else {
      const dailyLimit = Number(await getSetting(base44, 'whatsapp_daily_limit', '250')) || 250;
      const recentSent = await base44.asServiceRole.entities.CampaignQueue.filter({ channel: 'whatsapp', status: 'sent' }, '-sent_at', 500);
      const todayKey = israelDateKey();
      const sentToday = (recentSent || []).filter((i) => i.sent_at && israelDateKey(new Date(i.sent_at)) === todayKey).length;

      if (sentToday >= dailyLimit) {
        summary.whatsapp_delayed = true;
        summary.whatsapp_delay_reason = `הגעת למגבלה היומית (${dailyLimit})`;
      } else {
        const allowedNow = Math.min(WHATSAPP_BATCH, dailyLimit - sentToday);
        const pendingWA = await base44.asServiceRole.entities.CampaignQueue.filter({ status: 'pending', channel: 'whatsapp' }, 'created_date', allowedNow);
        for (const item of pendingWA || []) {
          touchedCampaigns.add(item.campaign_id);
          try {
            if (WHATSAPP_PROVIDER === 'uchat') {
              const ok = await uchatSend(base44, item.recipient, 'campaign_broadcast', item.contact_name || '', [item.contact_name || '', item.content || '']);
              if (!ok) throw new Error('uchat send failed');
            } else {
              if (!GREEN_ID || !GREEN_TOKEN) throw new Error('חסרים פרטי Green API');
              await sendViaGreenApi({ instanceId: GREEN_ID, token: GREEN_TOKEN, phone: item.recipient, message: item.content });
            }
            await base44.asServiceRole.entities.CampaignQueue.update(item.id, { status: 'sent', sent_at: new Date().toISOString() });
            await logCommunication(base44, item, 'whatsapp', true);
            if (item.contact_id) {
              await base44.asServiceRole.entities.Contact.update(item.contact_id, { last_contact_date: new Date().toISOString().split('T')[0] }).catch(() => {});
            }
            summary.whatsapp_sent++;
          } catch (err) {
            await base44.asServiceRole.entities.CampaignQueue.update(item.id, { status: 'failed', error_message: String(err.message || err).slice(0, 500) });
            await logCommunication(base44, item, 'whatsapp', false, String(err.message || err).slice(0, 200));
            summary.whatsapp_failed++;
          }
          await new Promise((r) => setTimeout(r, WHATSAPP_DELAY_MS));
        }
      }
    }

    await refreshCampaigns(base44, touchedCampaigns);
    return Response.json({ success: true, ...summary });
  } catch (error) {
    console.error('processCampaignQueue error:', error);
    return Response.json({ success: false, error: String(error.message || error), ...summary }, { status: 500 });
  }
});
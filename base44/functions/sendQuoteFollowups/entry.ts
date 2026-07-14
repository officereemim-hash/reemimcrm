import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

// ─── ספק שליחה: Green ↔ uChat (רדום תחת WHATSAPP_PROVIDER) ───
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

const TEMPLATE_BY_STAGE = {
  'T+7': 'היי {שם}! 😊 רק לוודא שקיבלת את ההצעה שלנו. יש שאלות? נשמח לעזור! קרנות ראמים',
  'T+14': 'היי {שם}, חזרנו לבדוק 🌱 האם הגעת להחלטה? אנחנו כאן לכל שאלה. קרנות ראמים',
  'T+21': 'היי {שם} 🙏 עדיין פתוחים לשאלות לפני שנסגור את הפנייה. קרנות ראמים',
};

function daysSince(dateString) {
  const start = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function getNextStage(request, days) {
  const stage = request.followup_stage || 'none';
  if (days >= 30 && stage === 'T+21') return 'escalated';
  if (days >= 21 && stage === 'T+14') return 'T+21';
  if (days >= 14 && stage === 'T+7') return 'T+14';
  if (days >= 7 && stage === 'none') return 'T+7';
  return null;
}

function fillMessage(template, request, contact) {
  return template
    .replaceAll('{שם}', contact?.full_name || request.contact_name || '')
    .replaceAll('{name}', contact?.full_name || request.contact_name || '')
    .replaceAll('{link}', request.quote_pdf_url || '');
}

async function sendWhatsApp(base44, phone, message, tplKey, firstName, params) {
  let cleanPhone = phone.replace(/[\s\-\+\(\)]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  if (WHATSAPP_PROVIDER === 'uchat') {
    const tplName = await getUchatTemplateName(base44, tplKey);
    if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
    const r = await uchatSendTemplate(cleanPhone, firstName, tplName, params || []);
    return !!r;
  }
  const chatId = `${cleanPhone}@c.us`;
  const res = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message, typingTime: 3000 }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const [botRow, greenRow] = await Promise.all([
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' }),
    ]);
    if (botRow[0]?.value !== 'true' || (WHATSAPP_PROVIDER !== 'uchat' && greenRow[0]?.value !== 'true')) {
      return Response.json({ ok: true, skipped: 'bot_or_green_disabled' });
    }

    const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ quote_sent: true, quote_approved: false });
    const templates = TEMPLATE_BY_STAGE;

    let sent = 0;
    let failed = 0;
    let escalated = 0;
    let skipped = 0;

    for (const requestItem of requests) {
      if (requestItem.closed_at || !requestItem.quote_sent_at) {
        skipped++;
        continue;
      }

      const days = daysSince(requestItem.quote_sent_at);
      const nextStage = getNextStage(requestItem, days);
      if (!nextStage) {
        skipped++;
        continue;
      }

      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: requestItem.contact_id });
      const contact = contacts[0];

      if (nextStage === 'escalated') {
        await base44.asServiceRole.entities.ServiceRequest.update(requestItem.id, { followup_stage: 'escalated' });
        await base44.asServiceRole.entities.Task.create({
          contact_id: requestItem.contact_id,
          service_request_id: requestItem.id,
          title: `פולו-אפ דחוף — ${contact?.full_name || requestItem.contact_name || 'לקוח'}`,
          type: 'followup',
          category: 'sales',
          status: 'open',
          priority: 'urgent',
          assigned_to: 'basmat',
          auto_generated: true,
        });
        escalated++;
        continue;
      }

      const template = templates[nextStage];
      if (!template || !contact?.phone) {
        skipped++;
        continue;
      }

      const message = fillMessage(template, requestItem, contact);
      const uchatTplKey = 'quote_followup_' + nextStage.replace('+', '');
      const ok = await sendWhatsApp(base44, contact.phone, message, uchatTplKey, contact?.full_name || requestItem.contact_name || '', [contact?.full_name || requestItem.contact_name || '']);

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: message,
        sent_by: 'system',
        is_automated: true,
        template_id: nextStage,
        status: ok ? 'sent' : 'failed',
      });

      if (ok) {
        await base44.asServiceRole.entities.ServiceRequest.update(requestItem.id, { followup_stage: nextStage });
        sent++;
      } else {
        failed++;
      }
    }

    return Response.json({ success: true, sent, failed, escalated, skipped, total: requests.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
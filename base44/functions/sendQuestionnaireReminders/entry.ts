import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

const MEETING_STATUSES = ['meeting_scheduled', 'meeting_scheduled_frontal', 'meeting_scheduled_zoom'];

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
async function uchatSend(base44, phone, tplKey, firstName, params) {
  let p = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (p.startsWith('0')) p = '972' + p.substring(1);
  const tplName = await getUchatTemplateName(base44, tplKey);
  if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
  return !!(await uchatSendTemplate(p, firstName, tplName, params || []));
}

function normalizePhone(phone) {
  let cleanPhone = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  return cleanPhone;
}

// Naive UTC timestamps from the API must not be parsed as local time
function toUtcTime(value) {
  if (!value) return 0;
  const s = String(value);
  return new Date(/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`).getTime();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const getSetting = async (key) => {
      const records = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      return records[0]?.value || '';
    };
    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';
    const greenApiEnabled = (await getSetting('green_api_enabled')) === 'true';

    const templates = await base44.asServiceRole.entities.BotContent.filter({ key: 'questionnaire_reminder', is_active: true });
    const template = templates[0]?.content || '';
    if (!template) return Response.json({ ok: true, skipped: 'no_template' });

    const questionnaires = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'questionnaire', is_active: true });
    const SHORANSS_SUBTYPE = {
      retirement: 'shoranss_retirement',
      economic_feasibility: 'shoranss_economic',
      investments: 'shoranss_investments',
      divorce_split: 'shoranss_divorce',
      tax_advisory: 'shoranss_tax',
      annual_service_call: 'shoranss_retirement',
    };
    const urlBySubType = {};
    for (const q of questionnaires) urlBySubType[q.sub_type] = q.url || '';

    let sent = 0;
    let skipped = 0;

    for (const status of MEETING_STATUSES) {
      const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ status, questionnaire_completed: false });

      for (const requestItem of requests) {
        if (!requestItem.contact_id) { skipped++; continue; }

        // מתי נשלח השאלון?
        const sentMsgs = await base44.asServiceRole.entities.Communication.filter(
          { contact_id: requestItem.contact_id, template_id: 'questionnaire_request' }, '-created_date', 1
        );
        const questionnaireSentAt = toUtcTime(sentMsgs[0]?.created_date);
        if (!questionnaireSentAt) { skipped++; continue; }

        // עבר יום מאז השליחה?
        if (Date.now() - questionnaireSentAt < 24 * 60 * 60 * 1000) { skipped++; continue; }

        // תזכורת כבר נשלחה אחרי השאלון? (שולחים פעם אחת בלבד)
        const reminders = await base44.asServiceRole.entities.Communication.filter(
          { contact_id: requestItem.contact_id, template_id: 'questionnaire_reminder' }, '-created_date', 1
        );
        if (reminders[0] && toUtcTime(reminders[0].created_date) > questionnaireSentAt) { skipped++; continue; }

        const contacts = await base44.asServiceRole.entities.Contact.filter({ id: requestItem.contact_id });
        const contact = contacts[0];
        if (!contact?.phone) { skipped++; continue; }

        const questionnaireUrl = urlBySubType[SHORANSS_SUBTYPE[requestItem.service_type]] || '';

        const message = template
          .replaceAll('{name}', contact.full_name || '')
          .replaceAll('{שם}', contact.full_name || '')
          .replaceAll('{questionnaire_link}', questionnaireUrl);

        let result = { status: 'skipped', errorDetail: 'log_only_whatsapp_bot_disabled' };
        if (botEnabled && WHATSAPP_PROVIDER === 'uchat') {
          const ok = await uchatSend(base44, contact.phone, 'questionnaire_reminder', contact.full_name || '', [contact.full_name || '', questionnaireUrl]);
          result = { status: ok ? 'sent' : 'failed', errorDetail: ok ? '' : 'uchat_send_failed' };
        } else if (botEnabled && !greenApiEnabled) {
          result = { status: 'sent', errorDetail: 'simulated_green_api_disabled' };
        } else if (botEnabled && greenApiEnabled) {
          const chatId = `${normalizePhone(contact.phone)}@c.us`;
          const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message, typingTime: 3000 }),
          });
          result = {
            status: response.ok ? 'sent' : 'failed',
            errorDetail: response.ok ? '' : (await response.text()).substring(0, 500),
          };
        }

        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact.id,
          type: 'whatsapp',
          direction: 'outbound',
          content: message.substring(0, 500),
          sent_by: 'system',
          is_automated: true,
          template_id: 'questionnaire_reminder',
          status: result.status,
          error_detail: result.errorDetail,
        });

        if (result.status === 'sent') sent++;
      }
    }

    return Response.json({ ok: true, sent, skipped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
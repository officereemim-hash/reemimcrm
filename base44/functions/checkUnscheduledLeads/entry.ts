import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');
const WAIT_MINUTES = 30;

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

const SERVICE_LABELS = {
  retirement: 'ייעוץ פרישה',
  economic_feasibility: 'היתכנות כלכלית',
  investments: 'השקעות',
  divorce_split: 'איזון אקטוארי',
  tax_advisory: 'ייעוץ מס',
  annual_service: 'שירות שנתי',
  annual_service_call: 'שיחת שירות שנתית',
};

function normalizeIntlPhone(phone) {
  let clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return clean;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    async function getSetting(key) {
      const records = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      return records[0]?.value || '';
    }

    const coordinatorPhone = await getSetting('coordinator_phone');
    if (!coordinatorPhone) return Response.json({ ok: true, skipped: 'no_coordinator_phone' });

    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';
    const greenApiEnabled = (await getSetting('green_api_enabled')) === 'true';

    const templates = await base44.asServiceRole.entities.BotContent.filter({ key: 'coordinator_no_response', is_active: true });
    const template = templates[0]?.content || '';
    if (!template) return Response.json({ ok: true, skipped: 'no_template' });

    const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ status: 'new', source: 'bot' }, '-updated_date', 100);
    let alerted = 0;

    for (const sr of requests) {
      if (!sr.service_type || sr.coordinator_alert_sent || sr.meeting_id) continue;
      const ageMinutes = (Date.now() - new Date(sr.updated_date).getTime()) / 60000;
      if (ageMinutes < WAIT_MINUTES) continue;

      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: sr.contact_id });
      const contact = contacts[0];
      if (!contact) continue;
      if (['waiting_agent', 'escalated_to_agent'].includes(contact.bot_status)) continue;

      const serviceLabel = SERVICE_LABELS[sr.service_type] || sr.service_type;
      const message = template
        .replaceAll('{name}', contact.full_name || '')
        .replaceAll('{phone}', contact.phone || '')
        .replaceAll('{service_type}', serviceLabel);

      let result = { status: 'skipped', errorDetail: 'log_only_whatsapp_bot_disabled' };
      if (botEnabled && WHATSAPP_PROVIDER === 'uchat') {
        const ok = await uchatSend(base44, coordinatorPhone, 'coordinator_no_response', 'רכזת', [contact.full_name || '', contact.phone || '', serviceLabel]);
        result = { status: ok ? 'sent' : 'failed', errorDetail: ok ? '' : 'uchat_send_failed' };
      } else if (botEnabled) {
        if (!greenApiEnabled) {
          result = { status: 'sent', errorDetail: 'simulated_green_api_disabled' };
        } else {
          const chatId = `${normalizeIntlPhone(coordinatorPhone)}@c.us`;
          const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message }),
          });
          const responseText = await response.text();
          result = { status: response.ok ? 'sent' : 'failed', errorDetail: response.ok ? '' : responseText.substring(0, 500) };
        }
      }

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: message.substring(0, 500),
        sent_by: 'system',
        is_automated: true,
        template_id: 'coordinator_no_response',
        status: result.status,
        error_detail: result.errorDetail || '',
      });

      await base44.asServiceRole.entities.ServiceRequest.update(sr.id, { coordinator_alert_sent: true });
      alerted++;
    }

    return Response.json({ ok: true, alerted });
  } catch (error) {
    console.error('checkUnscheduledLeads error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
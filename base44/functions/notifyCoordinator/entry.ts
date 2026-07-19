import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
    const body = await req.json();
    const contact = body.data;
    const oldContact = body.old_data || {};

    if (!contact?.id) return Response.json({ ok: true, skipped: 'no_record' });
    if (contact.bot_status !== 'waiting_agent' || oldContact.bot_status === 'waiting_agent') {
      return Response.json({ ok: true, skipped: 'not_new_waiting_agent' });
    }

    async function getSetting(key) {
      const records = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      return records[0]?.value || '';
    }

    const coordinatorPhone = await getSetting('coordinator_phone');
    if (!coordinatorPhone) return Response.json({ ok: true, skipped: 'no_coordinator_phone' });

    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';

    const templates = await base44.asServiceRole.entities.BotContent.filter({ key: 'coordinator_notify', is_active: true });
    const template = templates[0]?.content || '';
    if (!template) return Response.json({ ok: true, skipped: 'no_template' });

    const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id }, '-created_date', 10);
    const serviceRequest = requests.find(r => !['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(r.status)) || requests[0] || null;

    // חסימת כפילות רק לתיאום שיחה טלפונית (שם ההתראה כבר נשלחת ממסלול הפגישה).
    // הסלמות אחרי שפגישה נקבעה — כן מודיעים לנציגה.
    if (serviceRequest && serviceRequest.status === 'phone_meeting') {
      return Response.json({ ok: true, skipped: 'phone_meeting_already_notified' });
    }

    const serviceLabel = SERVICE_LABELS[serviceRequest?.service_type] || serviceRequest?.service_type || 'שירות';

    const message = template
      .replaceAll('{name}', contact.full_name || '')
      .replaceAll('{phone}', contact.phone || '')
      .replaceAll('{service_type}', serviceLabel);

    let result = { status: 'skipped', errorDetail: 'log_only_whatsapp_bot_disabled' };
    if (botEnabled) {
      const ok = await uchatSend(base44, coordinatorPhone, 'coordinator_notify', 'רכזת', [contact.full_name || '', contact.phone || '', serviceLabel]);
      result = { status: ok ? 'sent' : 'failed', errorDetail: ok ? '' : 'uchat_send_failed' };
    }

    await base44.asServiceRole.entities.Communication.create({
      contact_id: contact.id,
      type: 'whatsapp',
      direction: 'outbound',
      content: message.substring(0, 500),
      sent_by: 'system',
      is_automated: true,
      template_id: 'coordinator_notify',
      status: result.status,
      error_detail: result.errorDetail || '',
    });

    if (serviceRequest) {
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { coordinator_alert_sent: true });
    }

    return Response.json({ ok: true, notified: true, result });
  } catch (error) {
    console.error('notifyCoordinator error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
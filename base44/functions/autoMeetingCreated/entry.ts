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

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const values = new Uint8Array(32);
  crypto.getRandomValues(values);
  return Array.from(values, value => chars[value % chars.length]).join('');
}

function normalizePhone(phone) {
  let cleanPhone = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  return cleanPhone;
}

async function sendWhatsApp(base44, phone, message, tplKey, firstName, params) {
  const cleanP = normalizePhone(phone);
  if (WHATSAPP_PROVIDER === 'uchat') {
    const tplName = await getUchatTemplateName(base44, tplKey);
    if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
    return !!(await uchatSendTemplate(cleanP, firstName, tplName, params || []));
  }
  const chatId = `${cleanP}@c.us`;
  const greenSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' });
  const greenApiEnabled = greenSettings.length > 0 && greenSettings[0].value === 'true';
  if (!greenApiEnabled) return true;

  const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  return response.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const meeting = payload.data;

    if (!meeting?.id) return Response.json({ error: 'Missing meeting data' }, { status: 400 });
    if (meeting.scheduling_token) return Response.json({ success: true, skipped: true, reason: 'token_exists' });

    const token = generateToken();
    await base44.asServiceRole.entities.Meeting.update(meeting.id, { scheduling_token: token });

    // ה-URL של האפליקציה — עדכן כאן לכתובת הפאבליש של בשמת
    const appUrl = Deno.env.get('BASE44_APP_URL') || 'https://reemimcrm.base44.app';

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id });
    const contact = contacts[0];
    if (!contact?.phone) return Response.json({ success: true, token_created: true, whatsapp_sent: false, note: 'Contact phone missing' });

    const scheduleUrl = `${appUrl.replace(/\/$/, '')}/schedule?token=${token}`;
    const message = `שלום ${contact.full_name || ''}! לתיאום הפגישה שלנו לחצי כאן:\n${scheduleUrl}`;
    const ok = await sendWhatsApp(base44, contact.phone, message, 'meeting_schedule_link', contact.full_name || '', [contact.full_name || '', scheduleUrl]);

    await base44.asServiceRole.entities.Communication.create({
      contact_id: contact.id,
      type: 'whatsapp',
      direction: 'outbound',
      content: message,
      sent_by: 'system',
      is_automated: true,
      status: ok ? 'sent' : 'failed',
    });

    return Response.json({ success: true, token_created: true, whatsapp_sent: ok });
  } catch (error) {
    console.error('autoMeetingCreated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
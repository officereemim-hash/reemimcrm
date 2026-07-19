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

async function sendWhatsApp(base44, phone, message, tplKey, firstName, params) {
  let cleanPhone = phone.replace(/[\s\-\+]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  const tplName = await getUchatTemplateName(base44, tplKey);
  if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
  const r = await uchatSendTemplate(cleanPhone, firstName, tplName, params || []);
  return !!r;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const botRow = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    if (botRow[0]?.value !== 'true') {
      return Response.json({ ok: true, skipped: 'bot_disabled' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();

    const contacts = await base44.asServiceRole.entities.Contact.list();

    const dueContacts = contacts.filter(c =>
      c.annual_followup_date === todayStr &&
      c.status === 'completed' &&
      !['closed', 'not_relevant'].includes(c.bot_status)
    );

    let tasksCreated = 0;
    let whatsappSent = 0;
    let whatsappFailed = 0;

    for (const contact of dueContacts) {
      // Create task for bar regardless of WhatsApp success
      await base44.asServiceRole.entities.Task.create({
        contact_id: contact.id,
        title: `שיחת שירות שנתית — ${contact.full_name}`,
        type: 'annual_followup',
        category: 'sales',
        status: 'open',
        priority: 'high',
        assigned_to: 'bar',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        auto_generated: true,
      });
      tasksCreated++;

      if (!contact.phone) continue;

      const message = `שלום ${contact.full_name}! 🌿 עבר שנה מאז הטיפול שלנו. נשמח לשיחת שירות שנתית. נקבע?`;

      const ok = await sendWhatsApp(base44, contact.phone, message, 'annual_followup', contact.full_name || '', [contact.full_name || '']);

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: message,
        sent_by: 'system',
        is_automated: true,
        template_id: 'annual_v1',
        status: ok ? 'sent' : 'failed',
      });

      if (ok) {
        await base44.asServiceRole.entities.Contact.update(contact.id, {
          bot_status: 'waiting_user_reply',
          last_bot_interaction_at: now.toISOString(),
        });
        whatsappSent++;
      } else {
        console.error(`Failed to send annual followup WhatsApp to ${contact.phone}`);
        whatsappFailed++;
      }
    }

    return Response.json({ success: true, tasksCreated, whatsappSent, whatsappFailed, total: dueContacts.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
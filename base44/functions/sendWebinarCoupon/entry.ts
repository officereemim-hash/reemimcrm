import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

// ─── ספק שליחה: Green ↔ uChat ───
const WHATSAPP_PROVIDER = Deno.env.get('WHATSAPP_PROVIDER') || 'green';
const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';
async function getUchatTemplateName(base44, key) { const r = await base44.asServiceRole.entities.SystemSetting.filter({ key: `uchat_tpl_${key}` }); return r[0]?.value || ''; }
async function uchatTemplateNamespace(templateName) {
  const listOnce = async () => { try { const r = await fetch(`${UCHAT_BASE}/whatsapp-template/list`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } }); if (!r.ok) return null; const j = await r.json(); const arr = j?.data || j?.templates || j || []; const t = (Array.isArray(arr) ? arr : []).find(x => x?.name === templateName || x?.template_name === templateName); return t?.namespace || null; } catch { return null; } };
  let ns = await listOnce(); if (!ns) { try { await fetch(`${UCHAT_BASE}/whatsapp-template/sync`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } }); } catch {} ns = await listOnce(); } return ns;
}
async function uchatSendTemplate(phone972, firstName, templateName, bodyParams) {
  const namespace = await uchatTemplateNamespace(templateName); if (!namespace) { console.error(`uchat: template '${templateName}' not found/synced`); return null; }
  const params = {}; (bodyParams || []).forEach((v, i) => { params[`BODY_{{${i + 1}}}`] = String(v ?? ''); });
  const res = await fetch(`${UCHAT_BASE}/subscriber/send-whatsapp-template-by-user-id`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` }, body: JSON.stringify({ user_id: phone972, create_if_not_found: 'yes', contact: { first_name: firstName || '' }, content: { namespace, name: templateName, lang: 'he', params } }) });
  if (!res.ok) { console.error('uchat template http', res.status, await res.text().catch(() => '')); return null; }
  const j = await res.json().catch(() => ({})); const mid = j?.mid || j?.data?.mid || null; if (j?.status === 'ok' && mid) return { ...j, mid }; console.error('uchat template not ok:', JSON.stringify(j)); return null;
}
async function uchatSend(base44, phone, tplKey, firstName, params) {
  let p = String(phone || '').replace(/[\s\-\+\(\)]/g, ''); if (p.startsWith('0')) p = '972' + p.substring(1);
  const tplName = await getUchatTemplateName(base44, tplKey); if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
  return !!(await uchatSendTemplate(p, firstName, tplName, params || []));
}

function toChatId(localPhone) { let clean = String(localPhone || '').replace(/[^\d]/g, ''); if (clean.startsWith('0')) clean = '972' + clean.substring(1); return `${clean}@c.us`; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { webinar_type, webinar_date, registration_ids } = body;

    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const greenSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' });
    const botEnabled = botSettings[0]?.value === 'true';
    const greenEnabled = greenSettings[0]?.value === 'true';

    const introRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_post_intro', is_active: true });
    const optionsRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'webinar_post_options', is_active: true });
    const introTemplate = introRecords[0]?.content || 'היי {name}, שמחנו לראות אותך בהדרכה!';
    const optionsTemplate = optionsRecords[0]?.content || '';

    const [sc1, sc2, sc3] = await Promise.all([
      base44.asServiceRole.entities.ServiceContent.filter({ sub_type: 'webinar_option1_digital', is_active: true }),
      base44.asServiceRole.entities.ServiceContent.filter({ sub_type: 'webinar_option2_meeting_program', is_active: true }),
      base44.asServiceRole.entities.ServiceContent.filter({ sub_type: 'webinar_option3_full_personal', is_active: true }),
    ]);
    const option1Link = sc1[0]?.url || '';
    const option2Link = sc2[0]?.url || '';
    const option3Link = sc3[0]?.url || '';

    let regs = [];
    if (Array.isArray(registration_ids) && registration_ids.length > 0) {
      for (const id of registration_ids) { const r = await base44.asServiceRole.entities.WebinarRegistration.filter({ id }); if (r[0]) regs.push(r[0]); }
    } else if (webinar_type) {
      const all = await base44.asServiceRole.entities.WebinarRegistration.filter({ webinar_type });
      let filtered = all;
      if (webinar_date) { const targetDay = webinar_date.substring(0, 10); filtered = all.filter(r => r.webinar_date && r.webinar_date.substring(0, 10) === targetDay); }
      regs = filtered.filter(r => !r.coupon_sent);
    } else { return Response.json({ error: 'missing_target' }, { status: 400 }); }

    let sent = 0, skipped = 0;
    for (const reg of regs) {
      if (reg.coupon_sent) { skipped++; continue; }
      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) { skipped++; continue; }

      const chatId = toChatId(contact.phone);
      const name = contact.full_name || '';
      const contactFirstName = name.split(' ')[0];

      const introMessage = introTemplate.replaceAll('{name}', name);
      const optionsMessage = optionsTemplate.replaceAll('{name}', name).replaceAll('{option1_link}', option1Link).replaceAll('{option2_link}', option2Link).replaceAll('{option3_link}', option3Link);

      let status = 'skipped';
      if (botEnabled && WHATSAPP_PROVIDER === 'uchat') {
        const ok1 = await uchatSend(base44, contact.phone, 'webinar_post_intro', contactFirstName, [name]);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const ok2 = await uchatSend(base44, contact.phone, 'webinar_post_options', contactFirstName, [name, option1Link, option2Link, option3Link]);
        status = (ok1 && ok2) ? 'sent' : 'failed';
      } else if (botEnabled && greenEnabled) {
        const res1 = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: introMessage, typingTime: 3000 }) });
        await new Promise(resolve => setTimeout(resolve, 3000));
        const res2 = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: optionsMessage, typingTime: 3000 }) });
        status = (res1.ok && res2.ok) ? 'sent' : 'failed';
      } else if (botEnabled) { status = 'sent'; }

      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, { coupon_sent: true, coupon_sent_at: new Date().toISOString().split('T')[0], attended: true });
      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
        content: (introMessage + '\n---\n' + optionsMessage).substring(0, 500),
        sent_by: 'system', is_automated: true, template_id: 'webinar_post_options', status,
      });
      sent++;
    }

    return Response.json({ ok: true, sent, skipped });
  } catch (error) {
    console.error('sendWebinarCoupon error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
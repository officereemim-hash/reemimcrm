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

function fillTemplate(template, values) {
  return String(template || '').replaceAll('{name}', values.name || '').replaceAll('{landing_link}', values.landing_link || '');
}

const TYPE_LABELS = { investments: 'השקעות', divorce: 'גירושין / איזון', retirement: 'פרישה' };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const reg = body.data || body.record || body;

    if (!reg?.id || !reg?.contact_id) return Response.json({ ok: true, skipped: 'no_record' });

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id }).catch(() => []);
    const contact = contacts[0];
    if (!contact?.phone) return Response.json({ ok: true, skipped: 'no_phone' });

    const existingConfirm = await base44.asServiceRole.entities.Communication.filter({ contact_id: reg.contact_id, template_id: 'webinar_confirm' }, '-created_date', 1);
    if (existingConfirm.length > 0) return Response.json({ ok: true, skipped: 'already_registered_via_landing' });
    const existingIntro = await base44.asServiceRole.entities.Communication.filter({ contact_id: reg.contact_id, template_id: 'webinar_lead_intro' }, '-created_date', 1);
    if (existingIntro.length > 0) return Response.json({ ok: true, skipped: 'intro_already_sent' });

    async function getContent(key) { const r = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true }); return r[0]?.content || ''; }
    async function getUrl(subType) { const r = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'external_link', sub_type: subType, is_active: true }); return r[0]?.url || ''; }
    async function getSetting(key) { const r = await base44.asServiceRole.entities.SystemSetting.filter({ key }); return r[0]?.value || ''; }

    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';
    const greenEnabled = (await getSetting('green_api_enabled')) === 'true';
    const contactFirstName = (contact.full_name || '').split(' ')[0];

    async function sendWhatsApp(message, uchatTplKey, uchatParams) {
      if (!message) return 'skipped';
      if (botEnabled && WHATSAPP_PROVIDER === 'uchat' && uchatTplKey) {
        const ok = await uchatSend(base44, contact.phone, uchatTplKey, contactFirstName, uchatParams || []);
        return ok ? 'sent' : 'failed';
      }
      if (botEnabled && greenEnabled) {
        const res = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: toChatId(contact.phone), message }),
        });
        return res.ok ? 'sent' : 'failed';
      }
      return botEnabled ? 'sent' : 'skipped';
    }

    async function log(content, templateId, status) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id: reg.contact_id, type: 'whatsapp', direction: 'outbound',
        content: String(content || '').substring(0, 500), sent_by: 'system', is_automated: true, template_id: templateId, status,
      });
    }

    const landingBase = await getUrl('webinar_landing_base');
    const webinarType = reg.webinar_type;
    const landingLink = landingBase ? `${landingBase.replace(/\/$/, '')}/${webinarType}?t=${reg.id}` : '';

    if (!webinarType) {
      const clarifyTemplate = await getContent('webinar_type_clarify');
      const msg = fillTemplate(clarifyTemplate || 'שלום {name}! לאיזה וובינר נרשמת?\n1) השקעות\n2) גירושין / איזון\n3) פרישה\n\nהשיבו במספר ונשלח לך קישור להרשמה 🙏', { name: contact.full_name });
      const status = await sendWhatsApp(msg, 'webinar_type_clarify', [contact.full_name || '']);
      await log(msg, 'webinar_type_clarify', status);
      return Response.json({ ok: true, action: 'clarify_sent' });
    }

    const introTemplate = await getContent('webinar_lead_intro');
    const message = fillTemplate(
      introTemplate || 'שלום {name}! 🎓\nראינו שהתעניינת בוובינר {webinar_label} של קרנות ראמים.\nלהשלמת ההרשמה ושמירת מקומך — הירשמו כאן:\n{landing_link}\n\nנתראה בוובינר! 🙏',
      { name: contact.full_name, landing_link: landingLink }
    ).replaceAll('{webinar_label}', TYPE_LABELS[webinarType] || '');
    const status = await sendWhatsApp(message, 'webinar_lead_welcome', [contact.full_name || '', landingLink]);
    await log(message, 'webinar_lead_intro', status);

    await base44.asServiceRole.entities.Contact.update(contact.id, { last_bot_interaction_at: new Date().toISOString() });

    return Response.json({ ok: true, action: 'intro_sent', webinar_type: webinarType });
  } catch (error) {
    console.error('onWebinarLeadCreated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
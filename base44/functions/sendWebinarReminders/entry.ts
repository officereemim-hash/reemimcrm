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
  return String(template || '').replaceAll('{name}', values.name || '').replaceAll('{zoom_link}', values.zoom_link || '').replaceAll('{webinar_title}', values.webinar_title || '');
}

const ZOOM_SUBTYPE = { investments: 'zoom_webinar_investments', divorce: 'zoom_webinar_divorce', retirement: 'zoom_webinar_retirement' };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const greenSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' });
    const botEnabled = botSettings[0]?.value === 'true';
    const greenEnabled = greenSettings[0]?.value === 'true';

    async function getContent(key) { const r = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true }); return r[0]?.content || ''; }
    async function getZoom(type) { const r = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'external_link', sub_type: ZOOM_SUBTYPE[type], is_active: true }); return r[0]?.url || ''; }

    const now = Date.now();
    const regs = await base44.asServiceRole.entities.WebinarRegistration.list('-created_date', 500);

    const tpl1h = await getContent('webinar_reminder_1h');
    const tplStart = await getContent('webinar_reminder_start');
    const zoomCache = {};
    const titleCache = {};

    let sent1h = 0, sentStart = 0;

    for (const reg of regs) {
      if (!reg.webinar_date || reg.attended) continue;
      const start = new Date(reg.webinar_date).getTime();
      const minsToStart = (start - now) / 60000;

      let phase = null;
      if (minsToStart <= 60 && minsToStart > 45 && !reg.reminder_1h_sent) phase = '1h';
      else if (minsToStart <= 10 && minsToStart > -10 && !reg.reminder_start_sent) phase = 'start';
      if (!phase) continue;

      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) continue;

      if (zoomCache[reg.webinar_type] === undefined) zoomCache[reg.webinar_type] = await getZoom(reg.webinar_type);
      const zoomLink = reg.zoom_join_url || zoomCache[reg.webinar_type];
      const contactFirstName = (contact.full_name || '').split(' ')[0];

      // שליפת כותרת הוובינר מדף הנחיתה (cache פר-סוג)
      if (titleCache[reg.webinar_type] === undefined) {
        const lps = await base44.asServiceRole.entities.LandingPage.filter({ webinar_type: reg.webinar_type, is_active: true }, '-created_date', 1);
        const TYPE_LABEL = { investments: 'וובינר השקעות', divorce: 'וובינר גירושין', retirement: 'וובינר פרישה' };
        titleCache[reg.webinar_type] = lps[0]?.hero_title || TYPE_LABEL[reg.webinar_type] || 'וובינר — קרנות ראמים';
      }
      const webinarTitle = titleCache[reg.webinar_type];

      const template = phase === '1h' ? tpl1h : tplStart;
      const message = fillTemplate(template, { name: contact.full_name, zoom_link: zoomLink, webinar_title: webinarTitle });
      if (!message) continue;

      const uchatTplKey = phase === '1h' ? 'webinar_reminder_1h' : 'webinar_reminder_start';
      let status = 'skipped';
      if (botEnabled && WHATSAPP_PROVIDER === 'uchat') {
        const uchatParams = phase === '1h'
          ? [contact.full_name || '', webinarTitle, zoomLink]
          : [zoomLink];
        const ok = await uchatSend(base44, contact.phone, uchatTplKey, contactFirstName, uchatParams);
        status = ok ? 'sent' : 'failed';
      } else if (botEnabled && greenEnabled) {
        const res = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: toChatId(contact.phone), message, typingTime: 3000 }),
        });
        status = res.ok ? 'sent' : 'failed';
      } else if (botEnabled) { status = 'sent'; }

      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, phase === '1h' ? { reminder_1h_sent: true } : { reminder_start_sent: true });
      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
        content: message.substring(0, 500), sent_by: 'system', is_automated: true,
        template_id: phase === '1h' ? 'webinar_reminder_1h' : 'webinar_reminder_start', status,
      });

      if (phase === '1h') sent1h++; else sentStart++;
    }

    return Response.json({ ok: true, sent1h, sentStart });
  } catch (error) {
    console.error('sendWebinarReminders error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
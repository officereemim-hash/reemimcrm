import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

import { uchatSend } from '../../shared/uchat.ts';


async function createShortLink(base44, functionsBase, targetUrl, purpose = '') {
  if (!targetUrl) return '';
  const code = Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  try {
    await base44.asServiceRole.entities.ShortLink.create({ code, target_url: targetUrl, purpose, click_count: 0 });
    return `${functionsBase}/redirectShortLink?code=${code}`;
  } catch (e) { console.warn('createShortLink failed:', e.message); return targetUrl; }
}

const FUNCTIONS_BASE = 'https://reemim-crm.base44.app/functions';

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
    const botEnabled = botSettings[0]?.value === 'true';

    async function getContent(key) { const r = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true }); return r[0]?.content || ''; }
    // קישור הזום לוובינר הוא קבוע (recurring) — לכן לא מסננים לפי is_active,
    // כדי שכיבוי דגל "פעיל" בשוגג לא יייצר פרמטר ריק בתבנית (131008 — 16.8).
    async function getZoom(type) {
      const r = await base44.asServiceRole.entities.ServiceContent.filter({ sub_type: ZOOM_SUBTYPE[type] });
      return (r.find(x => x.is_active) || r[0])?.url || '';
    }

    const now = Date.now();
    const regs = await base44.asServiceRole.entities.WebinarRegistration.list('-created_date', 500);

    const tpl1h = await getContent('webinar_reminder_1h');
    const tplStart = await getContent('webinar_reminder_start');
    const zoomCache = {};
    const titleCache = {};
    const lpCache = {};

    let sent1h = 0, sentStart = 0;

    for (const reg of regs) {
      if (!reg.webinar_date || reg.attended) continue;
      const start = new Date(reg.webinar_date).getTime();
      const minsToStart = (start - now) / 60000;

      let phase = null;
      if (minsToStart <= 63 && minsToStart > 55 && !reg.reminder_1h_sent) phase = '1h';
      else if (minsToStart <= 3 && minsToStart > -6 && !reg.reminder_start_sent) phase = 'start';
      if (!phase) continue;

      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) continue;

      if (zoomCache[reg.webinar_type] === undefined) zoomCache[reg.webinar_type] = await getZoom(reg.webinar_type);
      const contactFirstName = (contact.full_name || '').split(' ')[0];

      // שליפת כותרת הוובינר ודף הנחיתה (cache פר-סוג)
      if (titleCache[reg.webinar_type] === undefined) {
        const lps = await base44.asServiceRole.entities.LandingPage.filter({ webinar_type: reg.webinar_type, is_active: true }, '-created_date', 1);
        const TYPE_LABEL = { investments: 'וובינר השקעות', divorce: 'וובינר גירושין', retirement: 'וובינר פרישה' };
        titleCache[reg.webinar_type] = lps[0]?.hero_title || TYPE_LABEL[reg.webinar_type] || 'וובינר — קרנות ראמים';
        lpCache[reg.webinar_type] = lps[0]?.slug ? `https://reemim-crm.base44.app/webinar/${lps[0].slug}` : '';
      }
      const webinarTitle = titleCache[reg.webinar_type];

      // הקישור לתזכורת: קישור אישי אם קיים, אחרת קישור הזום הקבוע, ורק בשעת חירום דף הנחיתה.
      const zoomLink = reg.zoom_join_url || zoomCache[reg.webinar_type] || lpCache[reg.webinar_type];
      if (!zoomLink) {
        // משתנה חובה ריק → לא שולחים תבנית פגומה (מטא מחזירה 131008),
        // לא מסמנים "נשלח" — כדי שהתזכורת תצא אוטומטית מיד כשהקישור יתוקן.
        console.error(`webinar reminder skipped — missing zoom link (type=${reg.webinar_type}, reg=${reg.id})`);
        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact.id, type: 'whatsapp', direction: 'outbound',
          content: `לא נשלחה תזכורת ${phase === '1h' ? 'שעה לפני' : 'תחילת ההדרכה'} — פרמטר חסר: קישור זום (${reg.webinar_type})`,
          sent_by: 'system', is_automated: true,
          template_id: phase === '1h' ? 'webinar_reminder_1h' : 'webinar_reminder_start',
          status: 'failed', error_detail: 'missing_param_zoom_link',
        });
        continue;
      }
      const shortZoom = await createShortLink(base44, FUNCTIONS_BASE, zoomLink, 'zoom_join');

      const template = phase === '1h' ? tpl1h : tplStart;
      const message = fillTemplate(template, { name: contact.full_name, zoom_link: shortZoom, webinar_title: webinarTitle });
      if (!message) continue;

      const uchatTplKey = phase === '1h' ? 'webinar_reminder_1h' : 'webinar_reminder_start';
      let status = 'skipped';
      if (botEnabled) {
        const uchatParams = phase === '1h'
          ? [contact.full_name || '', webinarTitle, shortZoom]
          : [shortZoom];
        const ok = await uchatSend(base44, contact.phone, uchatTplKey, contactFirstName, uchatParams);
        status = ok ? 'sent' : 'failed';
      }

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
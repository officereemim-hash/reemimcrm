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
async function uchatSendTemplate(phone972, firstName, templateName, bodyParams, base44) {
  const namespace = await uchatTemplateNamespace(templateName);
  if (!namespace) { console.error(`uchat: template '${templateName}' not found/synced`); return null; }
  const params = {};
  (bodyParams || []).forEach((v, i) => { params[`BODY_{{${i + 1}}}`] = String(v ?? ''); });
  try {
    if (base44) {
      const imgSetting = await base44.asServiceRole.entities.SystemSetting.filter({ key: `uchat_tpl_img_${templateName}` });
      if (imgSetting[0]?.value) params['HEADER_IMAGE'] = imgSetting[0].value;
    }
  } catch (_) { /* בלי תמונה — שולחים כרגיל */ }
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

// ===== תזכורת פגישה — תבנית מטא אחת: reemim_meeting_reminder (מיפוי: uchat_tpl_meeting_reminder) =====
// 5 משתנים, אף אחד לא ריק ובלי ירידות שורה (מטא דוחה \n בפרמטר):
// {{1}} שם פרטי · {{2}} תאריך · {{3}} שעה · {{4}} מיקום · {{5}} קישור/פרט לפי סוג הפגישה
const TEMPLATE_KEY = 'meeting_reminder';

async function getSetting(base44, key) {
  const r = await base44.asServiceRole.entities.SystemSetting.filter({ key });
  return r[0]?.value || '';
}

async function getExternalLink(base44, subType) {
  const r = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'external_link', sub_type: subType, is_active: true });
  return r[0]?.url || '';
}

function normalizePhone972(phone) {
  let p = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (p.startsWith('0')) p = '972' + p.substring(1);
  return p;
}

function formatDate(date) {
  const weekday = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long' }).format(date);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: '2-digit' }).formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value || '';
  return `${weekday}, ${get('day')}/${get('month')}/${get('year')}`;
}

function formatTime(date) {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

// {{4}}+{{5}} לפי Meeting.location (modiin / petah_tikva_* / phone / zoom)
async function buildLocation(base44, meeting) {
  const loc = String(meeting.location || '');
  if (loc === 'modiin') {
    const address = (await getSetting(base44, 'address_modiin')) || 'משרד קרנות ראמים, מודיעין';
    const waze = await getExternalLink(base44, 'waze_modiin');
    return { location: address, detail: waze ? `🔗 ניווט: ${waze}` : 'נשמח לראותך במשרד' };
  }
  if (loc.startsWith('petah_tikva')) {
    const address = (await getSetting(base44, 'address_petah_tikva')) || 'משרד קרנות ראמים, פתח תקווה';
    const waze = await getExternalLink(base44, 'waze_petah_tikva');
    return { location: address, detail: waze ? `🔗 ניווט: ${waze}` : 'נשמח לראותך במשרד' };
  }
  if (loc === 'phone') {
    return { location: 'שיחה טלפונית', detail: 'בשמת תתקשר אליך במועד הפגישה' };
  }
  const link = String(meeting.calendar_link || '').includes('zoom.us')
    ? meeting.calendar_link
    : await getExternalLink(base44, 'zoom_personal_room');
  return { location: 'פגישת Zoom', detail: link ? `🔗 קישור לפגישה: ${link}` : 'קישור לפגישה יישלח בנפרד' };
}

// אותו שער כמו autoServiceRequestUpdated: כל עוד test_mode_allowed_numbers לא ריק —
// שולחים רק למספרי בדיקה או לנרשמי וובינר. ריקון הרשימה = פתיחה לכולם.
async function passesTestModeGate(base44, contact) {
  const raw = String(await getSetting(base44, 'test_mode_allowed_numbers')).trim();
  if (!raw) return true;
  const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
  if (raw.split(',').map(last9).filter(Boolean).includes(last9(contact.phone))) return true;
  const regs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id });
  return regs.length > 0;
}

async function sendMeetingReminder(base44, contact, meeting) {
  const scheduled = new Date(meeting.scheduled_at);
  const firstName = String(contact.full_name || meeting.contact_name || '').trim().split(' ')[0] || 'שלום';
  const { location, detail } = await buildLocation(base44, meeting);
  const params = [firstName, formatDate(scheduled), formatTime(scheduled), location, detail];

  const tplName = await getUchatTemplateName(base44, TEMPLATE_KEY);
  if (!tplName) {
    console.log(`uchat: שם תבנית ל-'${TEMPLATE_KEY}' לא מוגדר (uchat_tpl_${TEMPLATE_KEY})`);
    return { ok: false, params, error: 'template_not_mapped' };
  }
  const r = await uchatSendTemplate(normalizePhone972(contact.phone), firstName, tplName, params, base44);
  return { ok: !!r, params, error: r ? '' : 'uchat_template_failed' };
}

function renderForLog(params) {
  const [name, date, time, location, detail] = params;
  return `[תבנית reemim_meeting_reminder] שלום ${name}, תזכורת לפגישתך עם בשמת.\n📅 ${date} · 🕐 ${time}\n📍 ${location}\n${detail}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toIsraelDateString(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if ((await getSetting(base44, 'whatsapp_bot_enabled')) !== 'true') {
      return Response.json({ ok: true, skipped: 'bot_disabled' });
    }

    const tomorrow = toIsraelDateString(addDays(new Date(), 1));
    const meetings = await base44.asServiceRole.entities.Meeting.filter({ status: 'scheduled', reminder_d1_sent: false });

    let sent = 0, failed = 0, skipped = 0;

    for (const meeting of meetings) {
      if (!meeting.scheduled_at || toIsraelDateString(new Date(meeting.scheduled_at)) !== tomorrow) { skipped++; continue; }

      const contact = (await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id }))[0];
      if (!contact?.phone || contact.mailing_opt_out === true) { skipped++; continue; }
      if (!(await passesTestModeGate(base44, contact))) { skipped++; continue; }

      const result = await sendMeetingReminder(base44, contact, meeting);

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: renderForLog(result.params),
        sent_by: 'system',
        is_automated: true,
        template_id: 'pre_meeting_reminder',
        status: result.ok ? 'sent' : 'failed',
        error_detail: result.error,
      });

      if (result.ok) {
        await base44.asServiceRole.entities.Meeting.update(meeting.id, { reminder_d1_sent: true });
        sent++;
      } else {
        failed++;
      }
    }

    return Response.json({ success: true, sent, failed, skipped, total: meetings.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
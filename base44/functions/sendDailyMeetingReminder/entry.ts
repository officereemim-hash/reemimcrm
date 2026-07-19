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

function toIsraelDateString(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function fillMessage(template, contact, meeting) {
  const scheduled = meeting.scheduled_at ? new Date(meeting.scheduled_at) : null;
  const time = scheduled ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(scheduled) : '';
  return template
    .replaceAll('{שם}', contact?.full_name || meeting.contact_name || '')
    .replaceAll('{name}', contact?.full_name || meeting.contact_name || '')
    .replaceAll('{time}', time)
    .replaceAll('{location}', meeting.location || '')
    .replaceAll('{location_details}', meeting.location || '');
}

async function sendWhatsApp(base44, phone, message, tplKey, firstName, params) {
  let cleanPhone = phone.replace(/[\s\-\+\(\)]/g, '');
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

    const template = 'מחר בשעה {time} הפגישה שלנו! 📍 {location}\nנתראה, קרנות ראמים 🌿';

    const tomorrow = toIsraelDateString(addDays(new Date(), 1));
    const meetings = await base44.asServiceRole.entities.Meeting.filter({ status: 'scheduled', reminder_d1_sent: false });

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const meeting of meetings) {
      if (!meeting.scheduled_at || toIsraelDateString(new Date(meeting.scheduled_at)) !== tomorrow) {
        skipped++;
        continue;
      }

      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) {
        skipped++;
        continue;
      }

      const message = fillMessage(template, contact, meeting);
      const _sched = meeting.scheduled_at ? new Date(meeting.scheduled_at) : null;
      const _time = _sched ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(_sched) : '';
      const ok = await sendWhatsApp(base44, contact.phone, message, 'meeting_reminder_d1', contact?.full_name || meeting.contact_name || '', [contact?.full_name || meeting.contact_name || '', _time, meeting.location || '']);

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: message,
        sent_by: 'system',
        is_automated: true,
        template_id: 'pre_meeting_reminder',
        status: ok ? 'sent' : 'failed',
      });

      if (ok) {
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
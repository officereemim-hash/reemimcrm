import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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


function fillTemplate(template, values) {
  return String(template || '').replaceAll('{name}', values.name || '').replaceAll('{coupon_code}', values.coupon_code || '').replaceAll('{discount}', values.discount || '').replaceAll('{amount}', values.amount || '').replaceAll('{payment_link}', values.payment_link || '').replaceAll('{recording_link}', values.recording_link || '');
}

const PAYMENT_SUBTYPE = { investments: 'payment_webinar_investments', divorce: 'payment_webinar_divorce', retirement: 'payment_webinar_retirement' };
const RECORDING_SUBTYPE = { investments: 'recording_webinar_investments', divorce: 'recording_webinar_divorce', retirement: 'recording_webinar_retirement' };

function genCoupon(type, customPrefix) {
  const prefix = customPrefix || { investments: 'INV', divorce: 'DIV', retirement: 'RET' }[type] || 'WEB';
  return `${prefix}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const reg = body.data || body.record || body;
    const prev = body.old_data || body.previous || {};

    if (!reg?.id || !reg?.contact_id) return Response.json({ ok: true, skipped: 'no_record' });

    const attendedNow = reg.attended === true && prev.attended !== true;
    const paidNow = reg.payment_completed === true && prev.payment_completed !== true;
    const meetingNow = reg.meeting_scheduled === true && prev.meeting_scheduled !== true;

    if (!attendedNow && !paidNow && !meetingNow) return Response.json({ ok: true, skipped: 'no_relevant_change' });

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id }).catch(() => []);
    const contact = contacts[0];
    if (!contact?.phone) return Response.json({ ok: true, skipped: 'no_phone' });

    const contactFirstName = (contact.full_name || '').split(' ')[0];

    async function getContent(key) { const r = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true }); return r[0]?.content || ''; }
    async function getUrl(subType) { const r = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'external_link', sub_type: subType, is_active: true }); return r[0]?.url || ''; }
    async function getPaymentUrl(subType) { const r = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'payment_link', sub_type: subType, is_active: true }); return r[0]?.url || ''; }
    async function getSetting(key) { const r = await base44.asServiceRole.entities.SystemSetting.filter({ key }); return r[0]?.value || ''; }

    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';

    async function sendWhatsApp(message, uchatTplKey, uchatParams) {
      if (!message || !botEnabled) return 'skipped';
      if (uchatTplKey) {
        const ok = await uchatSend(base44, contact.phone, uchatTplKey, contactFirstName, uchatParams || []);
        return ok ? 'sent' : 'failed';
      }
      return 'skipped';
    }

    async function log(content, templateId, status) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id: reg.contact_id, type: 'whatsapp', direction: 'outbound',
        content: String(content || '').substring(0, 500), sent_by: 'system', is_automated: true, template_id: templateId, status,
      });
    }

    const values = { name: contact.full_name || '' };

    if (attendedNow) {
      if (reg.coupon_sent) return Response.json({ ok: true, skipped: 'coupon_already_sent' });
      const couponSettings = await base44.asServiceRole.entities.WebinarCouponSetting.filter({ webinar_type: reg.webinar_type });
      const cfg = couponSettings[0] || {};
      const couponCode = reg.coupon_code || genCoupon(reg.webinar_type, cfg.coupon_prefix);
      const paymentLink = await getPaymentUrl(PAYMENT_SUBTYPE[reg.webinar_type]);
      const couponTemplate = await getContent('webinar_coupon');
      const couponMessage = fillTemplate(couponTemplate || 'תודה {name}! קוד ההטבה שלך: {coupon_code}', {
        ...values, coupon_code: couponCode,
        discount: cfg.discount_percent != null ? String(cfg.discount_percent) : '',
        amount: cfg.amount != null ? String(cfg.amount) : '', payment_link: paymentLink,
      });
      const couponStatus = await sendWhatsApp(couponMessage, 'webinar_coupon', [contact.full_name || '', couponCode, paymentLink]);
      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, { coupon_code: couponCode, coupon_sent: true, coupon_sent_at: new Date().toISOString().split('T')[0] });
      await log(couponMessage, 'webinar_coupon', couponStatus);

      const recordingLink = await getUrl(RECORDING_SUBTYPE[reg.webinar_type]);
      if (recordingLink) {
        const recTemplate = await getContent('webinar_recording');
        const recMessage = fillTemplate(recTemplate || 'הנה הקלטת הוובינר לצפייה חוזרת:\n{recording_link}', { ...values, recording_link: recordingLink });
        await new Promise(resolve => setTimeout(resolve, 1200));
        const recStatus = await sendWhatsApp(recMessage, 'webinar_recording', [contact.full_name || '', recordingLink]);
        await log(recMessage, 'webinar_recording', recStatus);
      }

      await base44.asServiceRole.entities.Contact.update(contact.id, { last_bot_interaction_at: new Date().toISOString() });
      return Response.json({ ok: true, action: 'attended_coupon_recording', recording: !!recordingLink });
    }

    if (paidNow) {
      const locTemplate = await getContent('webinar_location_choice');
      const locMessage = fillTemplate(locTemplate || 'מעולה {name}! איך תרצו לקיים את הפגישה?\nא) זום\nב) מודיעין\nג) פתח תקווה\nד) שיחת טלפון', values);
      const status = await sendWhatsApp(locMessage, 'webinar_location_choice', [contact.full_name || '']);
      await log(locMessage, 'webinar_location_choice', status);

      const existingSRs = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id }, '-created_date', 5);
      const openSR = existingSRs.find(sr => !['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(sr.status));
      let sr;
      if (openSR) { sr = await base44.asServiceRole.entities.ServiceRequest.update(openSR.id, { status: 'interested', source: 'webinar' }); }
      else { sr = await base44.asServiceRole.entities.ServiceRequest.create({ contact_id: contact.id, contact_name: contact.full_name || '', contact_phone: contact.phone || '', contact_email: contact.email || '', status: 'interested', source: 'webinar' }); }
      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, { service_request_id: sr.id });
      await base44.asServiceRole.entities.Contact.update(contact.id, { last_bot_interaction_at: new Date().toISOString(), current_service_request_id: sr.id });
      return Response.json({ ok: true, action: 'paid_location_choice', service_request_id: sr.id });
    }

    if (meetingNow) {
      const recentConfirms = await base44.asServiceRole.entities.Communication.filter({ contact_id: reg.contact_id }, '-created_date', 10);
      const confirmTemplates = ['meeting_scheduled_zoom', 'meeting_scheduled_modiin', 'meeting_scheduled_petah_tikva', 'meeting_scheduled_phone', 'meeting_scheduled_divorce_split', 'meeting_scheduled_annual_service', 'conversation_closing', 'webinar_meeting_confirmed'];
      const justConfirmed = recentConfirms.some(c => confirmTemplates.includes(c.template_id) && Date.now() - new Date(c.created_date).getTime() < 5 * 60 * 1000);
      if (justConfirmed) return Response.json({ ok: true, skipped: 'meeting_already_confirmed_recently' });
      const confirmTemplate = await getContent('webinar_meeting_confirmed');
      const confirmMessage = fillTemplate(confirmTemplate || '{name}, הפגישה נקבעה בהצלחה! נשלח לך תזכורת לפני המועד 🙏', values);
      const status = await sendWhatsApp(confirmMessage, 'webinar_meeting_confirmed', [contact.full_name || '']);
      await log(confirmMessage, 'webinar_meeting_confirmed', status);
      await base44.asServiceRole.entities.Contact.update(contact.id, { last_bot_interaction_at: new Date().toISOString() });
      return Response.json({ ok: true, action: 'meeting_confirmed' });
    }

    return Response.json({ ok: true, skipped: 'no_action' });
  } catch (error) {
    console.error('autoWebinarRegistrationUpdated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
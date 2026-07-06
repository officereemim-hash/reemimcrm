import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function toChatId(localPhone) {
  let clean = String(localPhone || '').replace(/[^\d]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return `${clean}@c.us`;
}

function fillTemplate(template, values) {
  return String(template || '')
    .replaceAll('{name}', values.name || '')
    .replaceAll('{coupon_code}', values.coupon_code || '')
    .replaceAll('{discount}', values.discount || '')
    .replaceAll('{amount}', values.amount || '')
    .replaceAll('{payment_link}', values.payment_link || '')
    .replaceAll('{recording_link}', values.recording_link || '');
}

const PAYMENT_SUBTYPE = {
  investments: 'payment_webinar_investments',
  divorce: 'payment_webinar_divorce',
  retirement: 'payment_webinar_retirement',
};

function genCoupon(type, customPrefix) {
  const prefix = customPrefix || { investments: 'INV', divorce: 'DIV', retirement: 'RET' }[type] || 'WEB';
  return `${prefix}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}

const RECORDING_SUBTYPE = {
  investments: 'recording_webinar_investments',
  divorce: 'recording_webinar_divorce',
  retirement: 'recording_webinar_retirement',
};

// Automation (WebinarRegistration update): connects the table checkboxes to bot messages.
// attended → coupon + recording link | payment_completed → meeting location choice | meeting_scheduled → confirmation
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const reg = body.data || body.record || body;
    const prev = body.old_data || body.previous || {};

    if (!reg?.id || !reg?.contact_id) {
      return Response.json({ ok: true, skipped: 'no_record' });
    }

    const attendedNow = reg.attended === true && prev.attended !== true;
    const paidNow = reg.payment_completed === true && prev.payment_completed !== true;
    const meetingNow = reg.meeting_scheduled === true && prev.meeting_scheduled !== true;

    if (!attendedNow && !paidNow && !meetingNow) {
      return Response.json({ ok: true, skipped: 'no_relevant_change' });
    }

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id }).catch(() => []);
    const contact = contacts[0];
    if (!contact?.phone) {
      return Response.json({ ok: true, skipped: 'no_phone' });
    }

    async function getContent(key) {
      const r = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
      return r[0]?.content || '';
    }
    async function getUrl(subType) {
      const r = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'external_link', sub_type: subType, is_active: true });
      return r[0]?.url || '';
    }
    async function getPaymentUrl(subType) {
      const r = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'payment_link', sub_type: subType, is_active: true });
      return r[0]?.url || '';
    }
    async function getSetting(key) {
      const r = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      return r[0]?.value || '';
    }

    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';
    const greenEnabled = (await getSetting('green_api_enabled')) === 'true';

    async function sendWhatsApp(message) {
      if (!message) return 'skipped';
      if (botEnabled && greenEnabled) {
        const res = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: toChatId(contact.phone), message }),
        });
        return res.ok ? 'sent' : 'failed';
      }
      return botEnabled ? 'sent' : 'skipped';
    }

    async function log(content, templateId, status) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id: reg.contact_id, type: 'whatsapp', direction: 'outbound',
        content: String(content || '').substring(0, 500), sent_by: 'system',
        is_automated: true, template_id: templateId, status,
      });
    }

    const values = { name: contact.full_name || '' };

    // ===== השתתף → קופון + (אם קיים) קישור הקלטה =====
    if (attendedNow) {
      if (reg.coupon_sent) {
        return Response.json({ ok: true, skipped: 'coupon_already_sent' });
      }
      const couponSettings = await base44.asServiceRole.entities.WebinarCouponSetting.filter({ webinar_type: reg.webinar_type });
      const cfg = couponSettings[0] || {};
      const couponCode = reg.coupon_code || genCoupon(reg.webinar_type, cfg.coupon_prefix);

      const paymentLink = await getPaymentUrl(PAYMENT_SUBTYPE[reg.webinar_type]);
      const couponTemplate = await getContent('webinar_coupon');
      const couponMessage = fillTemplate(couponTemplate || 'תודה {name}! קוד ההטבה שלך: {coupon_code}', {
        ...values,
        coupon_code: couponCode,
        discount: cfg.discount_percent != null ? String(cfg.discount_percent) : '',
        amount: cfg.amount != null ? String(cfg.amount) : '',
        payment_link: paymentLink,
      });
      const couponStatus = await sendWhatsApp(couponMessage);
      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, {
        coupon_code: couponCode,
        coupon_sent: true,
        coupon_sent_at: new Date().toISOString().split('T')[0],
      });
      await log(couponMessage, 'webinar_coupon', couponStatus);

      // קישור הקלטה/וובינר — נשלח רק אם הוגדר קישור פעיל
      const recordingLink = await getUrl(RECORDING_SUBTYPE[reg.webinar_type]);
      if (recordingLink) {
        const recTemplate = await getContent('webinar_recording');
        const recMessage = fillTemplate(recTemplate || 'הנה הקלטת הוובינר לצפייה חוזרת:\n{recording_link}', { ...values, recording_link: recordingLink });
        await new Promise(resolve => setTimeout(resolve, 1200));
        const recStatus = await sendWhatsApp(recMessage);
        await log(recMessage, 'webinar_recording', recStatus);
      }

      await base44.asServiceRole.entities.Contact.update(contact.id, { last_bot_interaction_at: new Date().toISOString() });
      return Response.json({ ok: true, action: 'attended_coupon_recording', recording: !!recordingLink });
    }

    // ===== שילם → בחירת מיקום פגישה + יצירת ServiceRequest =====
    if (paidNow) {
      const locTemplate = await getContent('webinar_location_choice');
      const locMessage = fillTemplate(locTemplate || 'מעולה {name}! איך תרצו לקיים את הפגישה?\nא) זום\nב) מודיעין\nג) פתח תקווה\nד) שיחת טלפון', values);
      const status = await sendWhatsApp(locMessage);
      await log(locMessage, 'webinar_location_choice', status);

      // יצירת פניית שירות עם סטטוס interested כדי ש-FP-MeetingChoice ב-greenApiWebhook יתפוס
      const existingSRs = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id }, '-created_date', 5);
      const openSR = existingSRs.find(sr => !['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(sr.status));
      let sr;
      if (openSR) {
        sr = await base44.asServiceRole.entities.ServiceRequest.update(openSR.id, { status: 'interested', source: 'webinar' });
      } else {
        sr = await base44.asServiceRole.entities.ServiceRequest.create({
          contact_id: contact.id,
          contact_name: contact.full_name || '',
          contact_phone: contact.phone || '',
          contact_email: contact.email || '',
          status: 'interested',
          source: 'webinar',
        });
      }
      // שמירת קישור ל-WebinarRegistration
      await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, { service_request_id: sr.id });

      await base44.asServiceRole.entities.Contact.update(contact.id, { last_bot_interaction_at: new Date().toISOString(), current_service_request_id: sr.id });
      return Response.json({ ok: true, action: 'paid_location_choice', service_request_id: sr.id });
    }

    // ===== פגישה נקבעה → אישור (עם דדופ — תיקון 4) =====
    if (meetingNow) {
      const recentConfirms = await base44.asServiceRole.entities.Communication.filter(
        { contact_id: reg.contact_id }, '-created_date', 10
      );
      const confirmTemplates = ['meeting_scheduled_zoom', 'meeting_scheduled_modiin', 'meeting_scheduled_petah_tikva', 'meeting_scheduled_phone', 'meeting_scheduled_divorce_split', 'meeting_scheduled_annual_service', 'conversation_closing', 'webinar_meeting_confirmed'];
      const justConfirmed = recentConfirms.some(c =>
        confirmTemplates.includes(c.template_id) &&
        Date.now() - new Date(c.created_date).getTime() < 5 * 60 * 1000
      );
      if (justConfirmed) {
        return Response.json({ ok: true, skipped: 'meeting_already_confirmed_recently' });
      }
      const confirmTemplate = await getContent('webinar_meeting_confirmed');
      const confirmMessage = fillTemplate(confirmTemplate || '{name}, הפגישה נקבעה בהצלחה! נשלח לך תזכורת לפני המועד 🙏', values);
      const status = await sendWhatsApp(confirmMessage);
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
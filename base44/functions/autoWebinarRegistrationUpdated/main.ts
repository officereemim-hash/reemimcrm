import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

import { uchatSend } from '../../shared/uchat.ts';


function fillTemplate(template, values) {
  return String(template || '').replaceAll('{name}', values.name || '').replaceAll('{coupon_code}', values.coupon_code || '').replaceAll('{discount}', values.discount || '').replaceAll('{amount}', values.amount || '').replaceAll('{payment_link}', values.payment_link || '').replaceAll('{recording_link}', values.recording_link || '');
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
      // מודל חדש (28.7, יושם 13.8): בלי קופון ובלי הקלטה — שולחים את תבנית ה"תודה" (reemim_webinar_thankyou)
      // עם כפתור "לקבלת ההטבה"; המשך המסלול בטקסט חופשי דרך greenApiWebhook.
      // דגל coupon_sent נשמר כמנגנון אנטי-כפילות בלבד (לפי message-to-builder-reemim-2026-07-28).
      if (reg.coupon_sent) return Response.json({ ok: true, skipped: 'thankyou_already_sent' });
      // נעילת חלון זמן: שני טריגרים מקבילים (קריאה מ-zoomWebhook + אוטומציית עדכון) רצו לפני כתיבת הדגל.
      const recentTy = await base44.asServiceRole.entities.Communication.filter({ contact_id: reg.contact_id, template_id: 'webinar_thankyou' }, '-created_date', 1);
      if (recentTy[0] && Date.now() - new Date(recentTy[0].created_date).getTime() < 10 * 60 * 1000) {
        return Response.json({ ok: true, skipped: 'thankyou_sent_recently' });
      }
      const lp = (await base44.asServiceRole.entities.LandingPage.filter({ webinar_type: reg.webinar_type, is_active: true }, '-created_date', 1))[0];
      const webinarTitle = lp?.hero_title || 'ההדרכה';
      const tyStatus = await sendWhatsApp(`תבנית תודה — ${webinarTitle}`, 'webinar_thankyou', [contactFirstName, webinarTitle]);
      if (tyStatus === 'sent') {
        await base44.asServiceRole.entities.WebinarRegistration.update(reg.id, { coupon_sent: true, coupon_sent_at: new Date().toISOString().split('T')[0] });
      }
      await log(`תבנית תודה (reemim_webinar_thankyou) — ${webinarTitle}`, 'webinar_thankyou', tyStatus);
      await base44.asServiceRole.entities.Contact.update(contact.id, { last_bot_interaction_at: new Date().toISOString() });
      return Response.json({ ok: true, action: 'attended_thankyou', sent: tyStatus });
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
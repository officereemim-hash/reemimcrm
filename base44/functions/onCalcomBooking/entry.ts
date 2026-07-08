import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');
const WEBHOOK_SECRET = Deno.env.get('CALCOM_WEBHOOK_SECRET');

function normalizePhone(phone) {
  let cleanPhone = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  return cleanPhone;
}

function getPayload(reqBody) {
  return reqBody.payload || reqBody.data || reqBody;
}

function getEventType(reqBody) {
  return reqBody.triggerEvent || reqBody.event_type || reqBody.type || reqBody.eventType || '';
}

function getSlug(payload) {
  const raw = payload.eventType?.slug || payload.eventTypeSlug || payload.event_type_slug || payload.slug || payload.eventType?.url || payload.url || '';
  // Cal.com שולח את שם סוג האירוע גם בשדות type / eventTitle / title
  const extra = [payload.type, payload.eventTitle, payload.title, payload.eventType?.title].filter(Boolean).join(' ');
  return decodeURIComponent(String(raw)) + ' ' + String(extra);
}

function getAttendee(payload) {
  const attendees = payload.attendees || payload.booking?.attendees || [];
  const attendee = attendees[0] || payload.attendee || payload.responses || {};
  return {
    name: attendee.name || attendee.full_name || payload.name || payload.title || '',
    email: attendee.email || payload.email || '',
    phone: attendee.phone || attendee.phoneNumber || attendee.phone_number || payload.phone || payload.phoneNumber || '',
  };
}

function detectMeeting(slug) {
  const result = { location: 'zoom', serviceType: '', meetingType: 'advisory', isCoordinatorCall: false };

  if (slug.includes('מודיעין')) result.location = 'modiin';
  if (slug.includes('פתח-תקווה') || slug.includes('פתח תקווה')) result.location = 'petah_tikva_wednesday';
  if (slug.includes('פגישת-עבודה') || slug.includes('פגישת עבודה')) result.location = 'zoom';
  if (slug.includes('שיחת-טלפון') || slug.includes('שיחת טלפון')) {
    result.location = 'phone';
    result.meetingType = 'followup';
  }
  if (slug.includes('איזון')) {
    result.location = 'zoom';
    result.serviceType = 'divorce_split';
  }
  if (slug.includes('שירות-שנתי') || slug.includes('שירות שנתיות') || slug.includes('שנתיות')) {
    result.serviceType = 'annual_service_call';
    result.meetingType = 'annual_service';
  }
  if (slug.includes('מתאמת') || slug.includes('coordinator') || slug.includes('שיחה-מקדימה') || slug.includes('שיחה טלפונית') || slug.includes('15min') || slug.includes('15 min') || slug.includes('15-min')) {
    result.location = 'phone';
    result.meetingType = 'intro_sale';
    result.isCoordinatorCall = true;
  }

  return result;
}

function formatDateTime(dateString) {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(dateString));
}

function chooseTemplateKey(location, serviceType) {
  if (serviceType === 'divorce_split') return 'meeting_scheduled_divorce_split';
  if (serviceType === 'annual_service_call') return 'meeting_scheduled_annual_service';
  if (location === 'modiin') return 'meeting_scheduled_modiin';
  if (location === 'petah_tikva_wednesday') return 'meeting_scheduled_petah_tikva';
  if (location === 'phone') return 'meeting_scheduled_phone';
  return 'meeting_scheduled_zoom';
}

async function getServiceUrl(base44, subType) {
  const records = await base44.asServiceRole.entities.ServiceContent.filter({ sub_type: subType, is_active: true });
  return records[0]?.url || '';
}

async function getTemplate(base44, key) {
  const records = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
  return records[0]?.content || '';
}

async function getSetting(base44, key) {
  const records = await base44.asServiceRole.entities.SystemSetting.filter({ key });
  return records[0]?.value || '';
}

function fillTemplate(template, values) {
  return String(template || '')
    .replaceAll('{name}', values.name || '')
    .replaceAll('{שם}', values.name || '')
    .replaceAll('{time}', values.time || '')
    .replaceAll('{location}', values.location || '')
    .replaceAll('{address}', values.address || '')
    .replaceAll('{caller_phone}', values.caller_phone || '')
    .replaceAll('{waze_link}', values.waze_link || '')
    .replaceAll('{zoom_link}', values.zoom_link || '')
    .replaceAll('{calendar_link}', values.calendar_link || '')
    .replaceAll('{meeting_link}', values.meeting_link || '');
}

async function sendWhatsApp(phone, message) {
  if (!phone || !message) return false;
  const chatId = `${normalizePhone(phone)}@c.us`;
  const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  return response.ok;
}

async function findContact(base44, attendee) {
  // 1. חיפוש לפי מייל
  if (attendee.email) {
    const byEmail = await base44.asServiceRole.entities.Contact.filter({ email: attendee.email.toLowerCase().trim() });
    if (byEmail[0]) return byEmail[0];
  }

  // 2. חיפוש לפי טלפון — בכל הפורמטים
  if (attendee.phone) {
    const clean = normalizePhone(attendee.phone);
    const local = clean.startsWith('972') ? '0' + clean.substring(3) : clean;
    for (const variant of [clean, `+${clean}`, local]) {
      const found = await base44.asServiceRole.entities.Contact.filter({ phone: variant });
      if (found[0]) return found[0];
    }
  }

  // 3. Fallback — חיפוש לפי שם מלא (רק התאמה מדויקת)
  if (attendee.name) {
    const trimmedName = attendee.name.trim();
    if (trimmedName.length >= 3) {
      const byName = await base44.asServiceRole.entities.Contact.filter({ full_name: trimmedName });
      if (byName.length === 1) return byName[0]; // רק אם יש התאמה יחידה — למנוע בלבול
    }
  }

  return null;
}

async function findServiceRequest(base44, contactId, serviceType) {
  const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contactId }, '-updated_date', 20);
  const open = requests.find(request => !['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(request.status));
  if (open) return open;
  if (requests[0]) return requests[0];

  const requestData = {
    contact_id: contactId,
    source: 'bot',
    status: 'new',
  };
  if (serviceType) requestData.service_type = serviceType;
  return await base44.asServiceRole.entities.ServiceRequest.create(requestData);
}

async function createGoogleCalendarEvent(base44, meeting, contact, detected) {
  try {
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    const startTime = new Date(meeting.scheduled_at);
    const endTime = new Date(startTime.getTime() + meeting.duration_minutes * 60000);

    const locationMap = {
      modiin: 'המעיין 44, קומה 1, מתחם M.dot, מודיעין',
      petah_tikva_wednesday: 'השחם 1, פתח תקווה, בניין C, קומה 6',
      zoom: 'ישיבה דרך Zoom',
      phone: 'שיחת טלפון',
    };

    const eventBody = {
      summary: `פגישה - ${contact.full_name || 'לקוח'} (${detected.meetingType})`,
      description: `זימון פגישה דרך Cal.com\n${contact.full_name || ''}\n${contact.phone || ''}\n${contact.email || ''}`,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      location: locationMap[detected.location] || '',
      attendees: contact.email ? [{ email: contact.email }] : [],
    };

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });

    if (response.ok) return (await response.json()).id;
    console.warn('Google Calendar failed:', await response.text());
    return null;
  } catch (error) {
    console.warn('Google Calendar error:', error.message);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const rawBody = await req.text();

    if (WEBHOOK_SECRET) {
      const providedSecret = req.headers.get('x-cal-secret') || req.headers.get('x-webhook-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
      let valid = providedSecret === WEBHOOK_SECRET;

      // Cal.com שולח חתימת HMAC-SHA256 של גוף הבקשה בכותרת x-cal-signature-256
      const signature = req.headers.get('x-cal-signature-256');
      if (!valid && signature) {
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(WEBHOOK_SECRET),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        );
        const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
        const expected = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
        valid = signature.toLowerCase() === expected;
      }

      if (!valid) {
        return Response.json({ error: 'Invalid webhook secret' }, { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);
    const eventType = getEventType(body);

    // === תיקון 3ג: טיפול ב-RESCHEDULED / CANCELLED ===
    if (eventType === 'BOOKING_RESCHEDULED') {
      const payload = getPayload(body);
      const calcomId = payload.uid || payload.id || payload.bookingId || payload.booking?.uid || payload.booking?.id;
      if (!calcomId) return Response.json({ ok: true, skipped: 'no_calcom_id' });
      const meetings = await base44.asServiceRole.entities.Meeting.filter({ calcom_event_id: String(calcomId) });
      if (meetings.length === 0) return Response.json({ ok: true, skipped: 'meeting_not_found' });
      const meeting = meetings[0];
      const newStart = payload.startTime || payload.start_time || payload.start || payload.booking?.startTime;
      if (!newStart) return Response.json({ ok: true, skipped: 'no_start_time' });
      const newEnd = payload.endTime || payload.end_time || payload.end || payload.booking?.endTime;
      const newDuration = newStart && newEnd ? Math.max(15, Math.round((new Date(newEnd).getTime() - new Date(newStart).getTime()) / 60000)) : meeting.duration_minutes || 60;
      await base44.asServiceRole.entities.Meeting.update(meeting.id, { scheduled_at: new Date(newStart).toISOString(), duration_minutes: newDuration });
      if (meeting.service_request_id) {
        const srUpdate = { last_appointment_time_str: formatDateTime(newStart) };
        if (meeting.location === 'zoom' || meeting.location === 'phone') srUpdate.scheduled_date_whatsapp = new Date(newStart).toISOString();
        else srUpdate.scheduled_date_clinic = new Date(newStart).toISOString();
        await base44.asServiceRole.entities.ServiceRequest.update(meeting.service_request_id, srUpdate);
      }
      const contacts = meeting.contact_id ? await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id }) : [];
      const rContact = contacts[0];
      if (rContact?.phone) {
        const reschTemplate = await getTemplate(base44, 'meeting_rescheduled_ack') || 'המועד עודכן בהצלחה ✅ הפגישה החדשה: {time}';
        const reschMsg = reschTemplate.replaceAll('{time}', formatDateTime(newStart)).replaceAll('{name}', rContact.full_name || '');
        await sendWhatsApp(rContact.phone, reschMsg);
        await base44.asServiceRole.entities.Communication.create({
          contact_id: rContact.id, type: 'whatsapp', direction: 'outbound',
          content: reschMsg.substring(0, 500), sent_by: 'system', is_automated: true, template_id: 'meeting_rescheduled_ack', status: 'sent',
        });
      }
      return Response.json({ ok: true, action: 'rescheduled', meeting_id: meeting.id });
    }

    if (eventType === 'BOOKING_CANCELLED') {
      const payload = getPayload(body);
      const calcomId = payload.uid || payload.id || payload.bookingId || payload.booking?.uid || payload.booking?.id;
      if (!calcomId) return Response.json({ ok: true, skipped: 'no_calcom_id' });
      const meetings = await base44.asServiceRole.entities.Meeting.filter({ calcom_event_id: String(calcomId) });
      if (meetings.length === 0) return Response.json({ ok: true, skipped: 'meeting_not_found' });
      const meeting = meetings[0];
      await base44.asServiceRole.entities.Meeting.update(meeting.id, { status: 'cancelled' });
      if (meeting.service_request_id) {
        await base44.asServiceRole.entities.ServiceRequest.update(meeting.service_request_id, { status: 'interested' });
      }
      const contacts = meeting.contact_id ? await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id }) : [];
      const cContact = contacts[0];
      const coordPhone = await getSetting(base44, 'coordinator_phone');
      if (coordPhone) {
        await sendWhatsApp(coordPhone, `⚠️ הפגישה של ${cContact?.full_name || 'לקוח'} בוטלה בקלקום. יש לטפל ידנית.`);
      }
      if (cContact) {
        await base44.asServiceRole.entities.Communication.create({
          contact_id: cContact.id, type: 'system_error', direction: 'inbound',
          content: `פגישה בוטלה בקלקום (calcom_id=${calcomId}). הסטטוס חזר ל-interested.`, sent_by: 'system', is_automated: true, status: 'sent',
        });
      }
      return Response.json({ ok: true, action: 'cancelled', meeting_id: meeting.id });
    }

    if (eventType && eventType !== 'BOOKING_CREATED') {
      return Response.json({ ok: true, skipped: true, eventType });
    }

    const payload = getPayload(body);
    const slug = getSlug(payload);
    const attendee = getAttendee(payload);
    const detected = detectMeeting(slug);
    const contact = await findContact(base44, attendee);

    if (!contact) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id: 'unknown',
        type: 'system_error',
        direction: 'inbound',
        content: `Cal.com booking — איש קשר לא נמצא: ${attendee.email || attendee.phone || attendee.name || 'ללא פרטים'}`,
        sent_by: 'system',
        is_automated: true,
        status: 'failed',
      });
      return Response.json({ error: 'Contact not found' }, { status: 404 });
    }

    const serviceRequest = await findServiceRequest(base44, contact.id, detected.serviceType || contact.service_type);
    const finalServiceType = detected.serviceType || serviceRequest.service_type || contact.service_type;
    const startTime = payload.startTime || payload.start_time || payload.start || payload.booking?.startTime;
    const endTime = payload.endTime || payload.end_time || payload.end || payload.booking?.endTime;
    const duration = startTime && endTime ? Math.max(15, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)) : 60;
    const calcomId = payload.uid || payload.id || payload.bookingId || payload.booking?.id;
    const meetingUrl = payload.conferenceUrl || payload.meetingUrl || payload.videoCallUrl || payload.location?.link || '';
    if (!startTime) return Response.json({ error: 'Missing startTime' }, { status: 400 });

    const existingMeetings = calcomId ? await base44.asServiceRole.entities.Meeting.filter({ calcom_event_id: String(calcomId) }) : [];
    const meetingData = {
      contact_id: contact.id,
      service_request_id: serviceRequest.id,
      type: detected.meetingType,
      meeting_source: 'bot',
      location: detected.location,
      scheduled_at: new Date(startTime).toISOString(),
      duration_minutes: duration,
      calcom_event_id: calcomId ? String(calcomId) : '',
      calendar_link: meetingUrl || await getServiceUrl(base44, detected.location === 'phone' ? 'phone_calendar' : detected.location === 'modiin' ? 'modiin_calendar' : detected.location === 'petah_tikva_wednesday' ? 'petah_tikva_calendar' : 'zoom_personal_room'),
      status: 'scheduled',
    };

    let meeting = existingMeetings[0]
      ? await base44.asServiceRole.entities.Meeting.update(existingMeetings[0].id, meetingData)
      : await base44.asServiceRole.entities.Meeting.create(meetingData);

    if (!meeting.google_event_id) {
      const googleEventId = await createGoogleCalendarEvent(base44, meeting, contact, detected);
      if (googleEventId) meeting = await base44.asServiceRole.entities.Meeting.update(meeting.id, { google_event_id: googleEventId });
    }

    // פגישות ממסלול וובינר — לא נחשבות coordinator call גם אם ה-slug מכיל מילים דומות
    const isWebinarSource = serviceRequest.source === 'webinar';

    if (detected.isCoordinatorCall && !isWebinarSource) {
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
        status: 'phone_meeting',
        meeting_id: meeting.id,
        scheduled_date_whatsapp: new Date(startTime).toISOString(),
        last_appointment_time_str: formatDateTime(startTime),
        last_appointment_type: 'phone',
      });
      await base44.asServiceRole.entities.Contact.update(contact.id, { bot_status: 'waiting_agent', last_bot_interaction_at: new Date().toISOString() });
      await base44.asServiceRole.entities.Task.create({
        contact_id: contact.id,
        service_request_id: serviceRequest.id,
        title: `שיחת מכירה — ${contact.full_name || attendee.name} — ${formatDateTime(startTime)}`,
        type: 'followup',
        category: 'sales',
        assigned_to: 'bar',
        due_date: new Date(startTime).toISOString().split('T')[0],
        auto_generated: true,
      });
      return Response.json({ success: true, type: 'coordinator_call', meeting_id: meeting.id, status_updated: 'phone_meeting' });
    }

    const meetingStatus = ['modiin', 'petah_tikva_wednesday'].includes(detected.location)
      ? 'meeting_scheduled_frontal'
      : 'meeting_scheduled_zoom';

    await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
      status: meetingStatus,
      meeting_id: meeting.id,
      scheduled_date_clinic: ['modiin', 'petah_tikva_wednesday'].includes(detected.location) ? new Date(startTime).toISOString() : serviceRequest.scheduled_date_clinic,
      scheduled_date_whatsapp: detected.location === 'zoom' ? new Date(startTime).toISOString() : serviceRequest.scheduled_date_whatsapp,
      last_appointment_time_str: formatDateTime(startTime),
      last_appointment_type: detected.location,
    });

    await base44.asServiceRole.entities.Contact.update(contact.id, {
      bot_status: 'closed',
      last_bot_interaction_at: new Date().toISOString(),
      current_service_request_id: serviceRequest.id,
    });

    await base44.asServiceRole.entities.ServiceRequestTimeline.create({
      service_request_id: serviceRequest.id,
      event_type: 'status_change',
      description: `פגישה נקבעה דרך Cal.com ל-${formatDateTime(startTime)}`,
      old_value: serviceRequest.status || '',
      new_value: meetingStatus,
      metadata: JSON.stringify({ calcom_event_id: calcomId, slug, location: detected.location }),
    });

    // ההודעות נשלחות ע"י אוטומציית שינוי הסטטוס (autoServiceRequestUpdated) —
    // עדכון הסטטוס ל-meeting_scheduled למעלה מפעיל את רצף ההודעות.

    // אם הפגישה מגיעה ממסלול וובינר — סימון meeting_scheduled על ה-WebinarRegistration
    const webinarRegs = await base44.asServiceRole.entities.WebinarRegistration.filter({ contact_id: contact.id, service_request_id: serviceRequest.id });
    if (webinarRegs.length > 0 && !webinarRegs[0].meeting_scheduled) {
      await base44.asServiceRole.entities.WebinarRegistration.update(webinarRegs[0].id, {
        meeting_scheduled: true,
        meeting_id: meeting.id,
      });
    }

    return Response.json({ success: true, meeting_id: meeting.id, service_request_id: serviceRequest.id, messages_via: 'status_automation' });
  } catch (error) {
    console.error('onCalcomBooking error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
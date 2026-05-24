import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MEETING_TYPE_LABELS = {
  intro_sale: 'פגישת היכרות',
  advisory: 'פגישת ייעוץ',
  annual_service: 'שיחת שירות שנתית',
  zoom: 'פגישת Zoom',
  followup: 'פולו-אפ',
};

const LOCATION_LABELS = {
  modiin: 'מודיעין',
  petah_tikva_wednesday: 'פתח תקווה',
  zoom: 'Zoom',
  phone: 'טלפון',
};

function formatDateTime(dateString) {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(dateString));
}

function buildEvent(meeting, contact) {
  const start = new Date(meeting.scheduled_at);
  const end = new Date(start.getTime() + (meeting.duration_minutes || 60) * 60 * 1000);
  const typeLabel = MEETING_TYPE_LABELS[meeting.type] || meeting.type || 'פגישה';
  const locationLabel = LOCATION_LABELS[meeting.location] || meeting.location || '';

  return {
    summary: `${typeLabel} — ${contact?.full_name || ''}`.trim(),
    location: locationLabel,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

async function saveGoogleEvent(base44, meeting, contact) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
  const eventBody = buildEvent(meeting, contact);
  const existingEventId = meeting.google_event_id;
  const url = existingEventId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existingEventId)}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  const response = await fetch(url, {
    method: existingEventId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
  });

  const result = await response.json();
  if (!response.ok) throw new Error(`Google Calendar failed: ${JSON.stringify(result)}`);
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const meeting = payload.data;

    if (!meeting?.id || !meeting.scheduled_at) return Response.json({ success: true, skipped: true });
    if (meeting.calcom_event_id) {
      return Response.json({ success: true, skipped: true, reason: 'calcom_meeting_uses_outlook' });
    }

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id });
    const contact = contacts[0];
    const calendarEvent = await saveGoogleEvent(base44, meeting, contact);

    if (!meeting.google_event_id && calendarEvent.id) {
      await base44.asServiceRole.entities.Meeting.update(meeting.id, { google_event_id: calendarEvent.id });
    }

    if (contact?.email) {
      const isUpdate = !!meeting.google_event_id;
      const subject = isUpdate ? 'המועד עודכן — קרנות ראמים' : 'אישור פגישה — קרנות ראמים';
      const htmlBody = isUpdate
        ? `שלום ${contact.full_name || ''},<br />המועד עודכן ל-${formatDateTime(meeting.scheduled_at)}. נתראה!`
        : `שלום ${contact.full_name || ''},<br />פגישתך נקבעה ל-${formatDateTime(meeting.scheduled_at)}. נתראה!`;

      await base44.functions.invoke('sendEmailToContact', {
        contact_id: contact.id,
        subject,
        html_body: htmlBody,
        template_id: isUpdate ? 'meeting_updated' : 'meeting_confirmed',
      });
    }

    return Response.json({ success: true, google_event_id: calendarEvent.id });
  } catch (error) {
    console.error('autoMeetingUpdated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
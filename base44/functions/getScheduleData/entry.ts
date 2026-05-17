import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MEETING_TYPE_LABELS: Record<string, string> = {
  intro_sale: 'פגישת היכרות',
  advisory: 'ייעוץ',
  annual_service: 'שירות שנתי',
  zoom: 'פגישת זום',
  followup: 'פולו-אפ',
};

const LOCATION_LABELS: Record<string, string> = {
  modiin: 'מודיעין',
  petah_tikva_wednesday: 'פתח תקווה (רביעי)',
  zoom: 'זום',
  phone: 'טלפון',
};

// Public endpoint — no auth required
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();

    if (!token) return Response.json({ error: 'Missing token' }, { status: 400 });

    const meetings = await base44.asServiceRole.entities.Meeting.filter({ scheduling_token: token });
    const meeting = meetings[0];
    if (!meeting) return Response.json({ error: 'not_found' }, { status: 404 });

    if (meeting.status === 'completed' || meeting.status === 'cancelled') {
      return Response.json({ error: 'meeting_closed', status: meeting.status }, { status: 410 });
    }

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id });
    const contact = contacts[0];

    return Response.json({
      meeting_id: meeting.id,
      type: meeting.type,
      type_label: MEETING_TYPE_LABELS[meeting.type] || meeting.type,
      duration: meeting.duration_minutes || 60,
      location: meeting.location || '',
      location_label: LOCATION_LABELS[meeting.location] || meeting.location || '',
      scheduled_at: meeting.scheduled_at || null,
      client_name: contact?.full_name || '',
    });
  } catch (error) {
    console.error('getScheduleData error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

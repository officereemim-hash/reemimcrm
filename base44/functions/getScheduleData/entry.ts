import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Public endpoint — no auth required
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();

    if (!token) return Response.json({ error: 'Missing token' }, { status: 400 });

    const meetings = await base44.asServiceRole.entities.Meeting.filter({ scheduling_token: token });
    const meeting = meetings[0];
    if (!meeting) return Response.json({ error: 'not_found' }, { status: 404 });

    if (meeting.scheduled_at && meeting.status === 'scheduled') {
      return Response.json({ error: 'already_scheduled', scheduled_at: meeting.scheduled_at }, { status: 409 });
    }

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id });
    const contact = contacts[0];

    return Response.json({
      meeting: {
        id: meeting.id,
        type: meeting.type,
        location: meeting.location,
        duration_minutes: meeting.duration_minutes || 60,
        status: meeting.status,
      },
      contact: contact
        ? { full_name: contact.full_name }
        : null,
    });
  } catch (error) {
    console.error('getScheduleData error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

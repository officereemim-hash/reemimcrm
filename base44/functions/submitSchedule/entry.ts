import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Public endpoint — no auth required
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token, scheduled_at } = await req.json();

    if (!token || !scheduled_at) {
      return Response.json({ error: 'Missing token or scheduled_at' }, { status: 400 });
    }

    const meetings = await base44.asServiceRole.entities.Meeting.filter({ scheduling_token: token });
    const meeting = meetings[0];
    if (!meeting) return Response.json({ error: 'not_found' }, { status: 404 });

    if (meeting.status === 'scheduled' && meeting.scheduled_at) {
      return Response.json({ error: 'already_scheduled' }, { status: 409 });
    }

    // Check Google Calendar for conflicts
    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
      const startTime = new Date(scheduled_at);
      const endTime = new Date(startTime.getTime() + (meeting.duration_minutes || 60) * 60 * 1000);

      const params = new URLSearchParams({
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: 'true',
      });
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const calData = await calRes.json();
      const conflicts = (calData.items || []).filter((e: any) => e.status !== 'cancelled');

      if (conflicts.length > 0) {
        return Response.json({ error: 'conflict' }, { status: 409 });
      }
    } catch (calErr) {
      // If Google Calendar check fails, log but don't block — admin will see it
      console.warn('submitSchedule: calendar conflict check failed:', calErr.message);
    }

    await base44.asServiceRole.entities.Meeting.update(meeting.id, {
      scheduled_at: new Date(scheduled_at).toISOString(),
      status: 'scheduled',
    });

    return Response.json({ status: 'ok' });
  } catch (error) {
    console.error('submitSchedule error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

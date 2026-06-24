import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Automation (LandingPage update): sync webinar_date to all registrations of the current cycle
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const page = body.data || body.record || body;
    const prev = body.old_data || body.previous || {};

    if (!page?.webinar_type) return Response.json({ ok: true, skipped: 'no_type' });

    const newDate = page.webinar_date || null;
    const oldDate = prev.webinar_date || null;
    if (newDate === oldDate) return Response.json({ ok: true, skipped: 'date_unchanged' });

    // Only update registrations from the current cycle (same old date)
    const regs = await base44.asServiceRole.entities.WebinarRegistration.filter({ webinar_type: page.webinar_type });
    const targets = regs.filter(r => (r.webinar_date || null) === oldDate);

    let synced = 0;
    for (const r of targets) {
      await base44.asServiceRole.entities.WebinarRegistration.update(r.id, {
        webinar_date: newDate,
        reminder_1h_sent: false,
        reminder_start_sent: false,
      });
      synced++;
    }

    return Response.json({ ok: true, synced });
  } catch (error) {
    console.error('onLandingPageDateSync error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
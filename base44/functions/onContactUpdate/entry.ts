import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data, old_data } = body;

    if (event?.type !== 'update' || !data) {
      return Response.json({ ok: true, skipped: true });
    }

    const contactId = event.entity_id;
    const nameChanged = data.full_name !== old_data?.full_name;
    const phoneChanged = data.phone !== old_data?.phone;
    const emailChanged = data.email !== old_data?.email;

    if (!nameChanged && !phoneChanged && !emailChanged) {
      return Response.json({ ok: true, skipped: true, reason: 'no_relevant_changes' });
    }

    // Find all ServiceRequests linked to this contact
    const serviceRequests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contactId });

    if (serviceRequests.length === 0) {
      return Response.json({ ok: true, skipped: true, reason: 'no_service_requests' });
    }

    const updates = {};
    if (nameChanged && data.full_name) updates.contact_name = data.full_name;
    if (phoneChanged && data.phone) updates.contact_phone = data.phone;
    if (emailChanged && data.email) updates.contact_email = data.email;

    let updatedCount = 0;
    for (const sr of serviceRequests) {
      await base44.asServiceRole.entities.ServiceRequest.update(sr.id, updates);
      updatedCount++;
    }

    console.log(`Synced contact ${contactId} to ${updatedCount} service requests:`, updates);
    return Response.json({ ok: true, updatedCount, updates });
  } catch (error) {
    console.error('Error in onContactUpdate:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
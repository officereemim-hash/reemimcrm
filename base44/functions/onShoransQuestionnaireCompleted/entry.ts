import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const phone = body.phone || body.Phone || body.mobile;
    const status = body.questionnaire_status || body.status;

    if (!phone || status !== 'completed') {
      return Response.json({ ok: true, skipped: true });
    }

    let cleanPhone = phone.replace(/[\s\-\+\(\)]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);

    const contacts = await base44.asServiceRole.entities.Contact.filter({ phone: cleanPhone });
    if (contacts.length === 0) {
      return Response.json({ ok: false, error: 'contact_not_found' });
    }

    const contact = contacts[0];
    await base44.asServiceRole.entities.Contact.update(contact.id, {
      shoranss_status: 'questionnaire_completed',
      ...(body.id_number ? { id_number: body.id_number } : {}),
      ...(body.birth_date ? { birth_date: body.birth_date } : {}),
    });

    return Response.json({ ok: true, contact_id: contact.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Public — no auth required, protected by registration token
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const t = body.t;

    if (!t) {
      return Response.json({ error: 'missing_token' }, { status: 400 });
    }

    const regs = await base44.asServiceRole.entities.WebinarRegistration.filter({ id: t });
    const reg = regs[0];
    if (!reg) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id });
    const c = contacts[0] || {};

    return Response.json({
      full_name: c.full_name || '',
      phone: c.phone || '',
      email: c.email || '',
    });
  } catch (error) {
    console.error('getWebinarPrefill error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
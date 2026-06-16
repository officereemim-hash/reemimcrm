import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Public — returns a landing page by slug for rendering (no auth required)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const slug = body.slug;

    if (!slug) {
      return Response.json({ error: 'missing_slug' }, { status: 400 });
    }

    const pages = await base44.asServiceRole.entities.LandingPage.filter({ slug, is_active: true });
    const page = pages[0];

    if (!page) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    return Response.json({ page });
  } catch (error) {
    console.error('getLandingPage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
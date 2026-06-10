import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');
    if (!instanceId || !token) {
      return Response.json({ ok: false, error: 'Missing GREEN_API_INSTANCE_ID or GREEN_API_TOKEN' });
    }

    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/getStateInstance/${token}`);
    const data = await res.json().catch(() => null);

    return Response.json({
      ok: res.ok,
      httpStatus: res.status,
      instanceIdLength: instanceId.length,
      state: data?.stateInstance || data,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});
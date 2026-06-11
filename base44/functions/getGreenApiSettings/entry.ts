import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const apiToken = Deno.env.get('GREEN_API_TOKEN');

    const res = await fetch(`https://api.green-api.com/waInstance${instanceId}/getSettings/${apiToken}`);
    const settings = await res.json();

    return Response.json({
      ok: res.ok,
      webhookUrl: settings.webhookUrl || '(לא מוגדר)',
      incomingWebhook: settings.incomingWebhook,
      outgoingWebhook: settings.outgoingWebhook,
      stateWebhook: settings.stateWebhook,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
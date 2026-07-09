import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// פונקציה חד-פעמית — מגדירה מרווח בין הודעות ברמת האינסטנס של Green API.
// ⚠️ שינוי ההגדרה מאתחל את האינסטנס לכמה שניות — לא להריץ באמצע שליחה.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
    const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');
    if (!INSTANCE_ID || !API_TOKEN) {
      return Response.json({ error: 'Missing GREEN_API credentials' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const delayMs = body.delay_ms || 8000; // ברירת מחדל 8 שניות

    const response = await fetch(
      `https://api.green-api.com/waInstance${INSTANCE_ID}/setSettings/${API_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delaySendMessagesMilliseconds: delayMs }),
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return Response.json({ error: 'Green API setSettings failed', details: result }, { status: 500 });
    }

    return Response.json({
      ok: true,
      message: `delaySendMessagesMilliseconds set to ${delayMs}ms`,
      green_api_response: result,
    });
  } catch (error) {
    console.error('configureGreenApiSafety error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
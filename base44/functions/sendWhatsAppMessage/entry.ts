import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phone, message } = await req.json();
    if (!phone || !message) {
      return Response.json({ error: 'Missing phone or message' }, { status: 400 });
    }

    // Normalize phone — remove leading 0, ensure country code
    let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '972' + normalizedPhone.slice(1);
    }
    if (normalizedPhone.startsWith('+')) {
      normalizedPhone = normalizedPhone.slice(1);
    }

    const chatId = `${normalizedPhone}@c.us`;

    const url = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    });

    const result = await response.json();

    if (!response.ok) {
      return Response.json({ error: 'Green API error', details: result }, { status: 500 });
    }

    return Response.json({ ok: true, idMessage: result.idMessage, chatId });
  } catch (error) {
    console.error('sendWhatsAppMessage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
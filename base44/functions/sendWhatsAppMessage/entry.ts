import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phone, message, fileUrl, fileName } = await req.json();
    if (!phone || (!message && !fileUrl)) {
      return Response.json({ error: 'Missing phone and (message or fileUrl)' }, { status: 400 });
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

    const greenSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' });
    const greenApiEnabled = greenSettings.length > 0 && greenSettings[0].value === 'true';
    if (!greenApiEnabled) {
      return Response.json({ ok: true, simulated: true, chatId });
    }

    const results = {};

    // שליחת קובץ (PDF / תמונה / וידאו) — אם סופק fileUrl
    if (fileUrl) {
      const fileApiUrl = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendFileByUrl/${API_TOKEN}`;
      const fileResponse = await fetch(fileApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, urlFile: fileUrl, fileName: fileName || 'file', caption: message || '' }),
      });
      const fileResult = await fileResponse.json();
      if (!fileResponse.ok) {
        return Response.json({ error: 'Green API file error', details: fileResult }, { status: 500 });
      }
      results.fileIdMessage = fileResult.idMessage;
      // קובץ נשלח עם caption — אין צורך לשלוח שוב את הטקסט בנפרד
      return Response.json({ ok: true, ...results, chatId });
    }

    // שליחת הודעת טקסט רגילה
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
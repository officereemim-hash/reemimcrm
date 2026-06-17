import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Uploads the testing plan as a Google Doc to the user's Drive root (My Drive).
// Receives { title, content } (plain text) from the frontend so the plan stays a single source of truth.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { title, content } = await req.json().catch(() => ({}));
    if (!content) return Response.json({ error: 'missing_content' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const fileName = title || `תכנית בדיקות — קרנות ראמים (${new Date().toLocaleDateString('he-IL')})`;

    // Multipart upload: metadata + plain text body, converted to a Google Doc.
    const boundary = '-------base44boundary' + Date.now();
    const metadata = {
      name: fileName,
      mimeType: 'application/vnd.google-apps.document', // convert text → Google Doc
    };

    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      `--${boundary}\r\n` +
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
      content + '\r\n' +
      `--${boundary}--`;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data.error?.message || 'drive_upload_failed' }, { status: 500 });
    }

    return Response.json({ ok: true, fileId: data.id, link: data.webViewLink });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
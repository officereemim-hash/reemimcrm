import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);
    const { token, signer_name, signature_data } = body;

    if (!token || !signer_name || !signature_data) {
      return Response.json({ error: 'missing_fields' }, { status: 400 });
    }

    // Find document by token
    let docs = await base44.asServiceRole.entities.Document.filter({ signature_token: token });
    if (!docs?.length) {
      const pending = await base44.asServiceRole.entities.Document.filter({ signature_status: 'pending' });
      docs = pending.filter(d => d.signature_token === token);
    }
    if (!docs?.length) return Response.json({ error: 'not_found' }, { status: 404 });
    const doc = docs[0];
    if (doc.signature_status === 'signed') return Response.json({ error: 'already_signed' }, { status: 410 });

    const signedAt = new Date().toISOString();
    const signedAtDisplay = new Date().toLocaleString('he-IL');

    // Convert base64 data URL to Uint8Array and upload
    const base64Content = signature_data.split(',')[1];
    const binaryStr = atob(base64Content);
    const sigBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      sigBytes[i] = binaryStr.charCodeAt(i);
    }
    const sigBlob = new Blob([sigBytes], { type: 'image/png' });
    const sigFile = new File([sigBlob], 'signature.png', { type: 'image/png' });
    const uploadSigResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: sigFile });
    const signatureImageUrl = uploadSigResult?.file_url;

    if (!signatureImageUrl) {
      return Response.json({ error: 'signature_upload_failed' }, { status: 500 });
    }

    let signedPdfUrl = doc.file_url;

    if (doc.file_url) {
      try {
        const pdfRes = await fetch(doc.file_url);
        if (!pdfRes.ok) throw new Error(`PDF fetch failed: ${pdfRes.status}`);

        const existingPdfBytes = await pdfRes.arrayBuffer();
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pages = pdfDoc.getPages();
        const lastOrigPage = pages[pages.length - 1];
        const { width: origW, height: origH } = lastOrigPage.getSize();

        // Add new page if >=2 pages, else use last page
        let lastPage;
        if (pages.length >= 2) {
          lastPage = pdfDoc.addPage([origW, origH]);
        } else {
          lastPage = pages[0];
        }
        const { width } = lastPage.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Fetch uploaded signature image
        const imgRes = await fetch(signatureImageUrl);
        const sigImageBytes = new Uint8Array(await imgRes.arrayBuffer());
        const sigImage = await pdfDoc.embedPng(sigImageBytes);

        const sigW = 160, sigH = 60;
        const sigX = width - sigW - 40;
        const sigY = 60;

        lastPage.drawRectangle({
          x: sigX - 5, y: sigY - 18,
          width: sigW + 10, height: sigH + 28,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: rgb(0.75, 0.75, 0.75),
          borderWidth: 0.5,
        });
        lastPage.drawImage(sigImage, { x: sigX, y: sigY, width: sigW, height: sigH });
        lastPage.drawLine({
          start: { x: sigX - 2, y: sigY - 2 },
          end: { x: sigX + sigW + 2, y: sigY - 2 },
          thickness: 0.7, color: rgb(0.4, 0.4, 0.4),
        });
        lastPage.drawText('Digital Signature', {
          x: sigX, y: sigY + sigH + 5,
          size: 7, font, color: rgb(0.65, 0.65, 0.65),
        });
        lastPage.drawText('Signed: ' + new Date().toLocaleDateString('en-GB'), {
          x: sigX, y: sigY - 14,
          size: 8, font, color: rgb(0.4, 0.4, 0.4),
        });

        const signedPdfBytes = await pdfDoc.save();
        const blob = new Blob([signedPdfBytes], { type: 'application/pdf' });
        const file = new File([blob], `signed_${(doc.name || 'document').replace(/\s/g, '_')}.pdf`, { type: 'application/pdf' });
        const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
        if (uploadResult?.file_url) signedPdfUrl = uploadResult.file_url;
      } catch (pdfErr) {
        console.error('PDF embedding failed:', pdfErr.message);
      }
    }

    await base44.asServiceRole.entities.Document.update(doc.id, {
      signature_status: 'signed',
      signed_at: signedAt,
      signer_name,
      signature_data: signatureImageUrl,
      file_url: signedPdfUrl,
    });

    if (doc.contact_id) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id: doc.contact_id,
        type: 'bot_event',
        direction: 'inbound',
        content: `מסמך "${doc.name}" נחתם דיגיטלית על ידי ${signer_name} ב-${signedAtDisplay}`,
        sent_by: 'system',
        is_automated: true,
        status: 'sent',
      });
    }

    // Notify admin via Brevo
    try {
      const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
      if (BREVO_API_KEY) {
        const senderSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'brevo_sender_email' });
        const senderNameSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'brevo_sender_name' });
        const senderEmail = senderSettings[0]?.value || 'noreply@kranot-reemim.co.il';
        const senderName = senderNameSettings[0]?.value || 'קרנות ראמים';

        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: senderEmail }],
            subject: `✍️ מסמך נחתם: ${doc.name}`,
            htmlContent: `<div dir="rtl" style="font-family:Arial,sans-serif;padding:20px;">
              <h2 style="color:#4A2C78;">מסמך נחתם ✍️</h2>
              <p><strong>${doc.name}</strong> נחתם על ידי <strong>${signer_name}</strong> ב-${signedAtDisplay}</p>
              ${signedPdfUrl ? `<p style="margin-top:16px;"><a href="${signedPdfUrl}" style="background:#4A2C78;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">צפה במסמך החתום ←</a></p>` : ''}
            </div>`
          })
        });
      }
    } catch (_) { /* notification failure should not block */ }

    return Response.json({ ok: true, file_url: signedPdfUrl });
  } catch (err) {
    console.error('submitSignature error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
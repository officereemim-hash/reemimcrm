import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);
    const { token, signer_name, signature_image_url } = body;

    if (!token || !signer_name || !signature_image_url) {
      return Response.json({ error: 'missing_fields' }, { status: 400 });
    }

    const docs = await base44.asServiceRole.entities.Document.filter({ signature_token: token });
    if (!docs?.length) return Response.json({ error: 'not_found' }, { status: 404 });
    const doc = docs[0];
    if (doc.signature_status === 'signed') return Response.json({ error: 'already_signed' }, { status: 410 });

    const signedAt = new Date().toISOString();
    const signedAtDisplay = new Date().toLocaleString('he-IL');

    let signedPdfUrl = doc.file_url;

    if (doc.file_url) {
      try {
        const pdfRes = await fetch(doc.file_url);
        const existingPdfBytes = await pdfRes.arrayBuffer();
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width } = lastPage.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // KEY: signature_image_url is HTTPS — fetch() works in Deno
        const imgRes = await fetch(signature_image_url);
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
      signature_image_url,
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

    return Response.json({ ok: true, file_url: signedPdfUrl });
  } catch (err) {
    console.error('submitSignature error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
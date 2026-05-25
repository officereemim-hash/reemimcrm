import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { token, signature_data, signer_name } = body;

    if (!token || !signature_data || !signer_name) {
      return Response.json({ error: 'missing_fields: token, signature_data, signer_name required' }, { status: 400 });
    }

    const docs = await base44.asServiceRole.entities.Document.filter({ signature_token: token });
    if (!docs || docs.length === 0) return Response.json({ error: 'not_found' }, { status: 404 });
    const doc = docs[0];
    if (doc.signature_status === 'signed') return Response.json({ error: 'already_signed' }, { status: 410 });

    let updatedFileUrl = doc.file_url;

    if (doc.file_url) {
      try {
        const pdfRes = await fetch(doc.file_url);
        const contentType = pdfRes.headers.get('content-type') || '';

        if (contentType.includes('pdf') || doc.file_url.toLowerCase().includes('.pdf')) {
          const existingPdfBytes = await pdfRes.arrayBuffer();
          const pdfDoc = await PDFDocument.load(existingPdfBytes);
          const pages = pdfDoc.getPages();
          const lastPage = pages[pages.length - 1];
          const { width } = lastPage.getSize();
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

          const base64Data = signature_data.split(',')[1];
          const binary = atob(base64Data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const sigImage = await pdfDoc.embedPng(bytes.buffer);

          const sigW = 160;
          const sigH = 60;
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

          lastPage.drawText(signer_name.trim(), {
            x: sigX, y: sigY - 14, size: 9, font, color: rgb(0.15, 0.15, 0.15),
          });

          lastPage.drawText(new Date().toLocaleDateString('he-IL'), {
            x: sigX + sigW - 50, y: sigY - 14, size: 9, font, color: rgb(0.5, 0.5, 0.5),
          });

          lastPage.drawText('Digital Signature', {
            x: sigX, y: sigY + sigH + 5, size: 7, font, color: rgb(0.65, 0.65, 0.65),
          });

          const signedPdfBytes = await pdfDoc.save();
          const blob = new Blob([signedPdfBytes], { type: 'application/pdf' });
          const file = new File([blob], `signed_${doc.name || 'document'}.pdf`, { type: 'application/pdf' });
          const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          if (uploadResult?.file_url) updatedFileUrl = uploadResult.file_url;
        }
      } catch (pdfErr) {
        console.error('PDF embedding failed:', pdfErr.message);
      }
    }

    await base44.asServiceRole.entities.Document.update(doc.id, {
      signature_data,
      signer_name: signer_name.trim(),
      signed_at: new Date().toISOString(),
      signature_status: 'signed',
      file_url: updatedFileUrl,
    });

    if (doc.contact_id) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id: doc.contact_id,
        type: 'bot_event',
        direction: 'inbound',
        content: `מסמך "${doc.name}" נחתם דיגיטלית על ידי ${signer_name}`,
        sent_by: 'system',
        is_automated: true,
        status: 'sent',
      });
    }

    return Response.json({ ok: true, file_url: updatedFileUrl });
  } catch (error) {
    console.error('submitSignature error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { token, signature_data, signer_name, signed_pdf_base64 } = body;

    if (!token || !signature_data || !signer_name) {
      return Response.json({ error: 'missing_fields: token, signature_data, signer_name required' }, { status: 400 });
    }

    const docs = await base44.asServiceRole.entities.Document.filter({ signature_token: token });
    if (!docs || docs.length === 0) return Response.json({ error: 'not_found' }, { status: 404 });
    const doc = docs[0];
    if (doc.signature_status === 'signed') return Response.json({ error: 'already_signed' }, { status: 410 });

    let updatedFileUrl = doc.file_url;

    if (signed_pdf_base64) {
      const bytes = Uint8Array.from(atob(signed_pdf_base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const file = new File([blob], `signed_${doc.name || 'document'}.pdf`, { type: 'application/pdf' });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      if (uploadResult?.file_url) updatedFileUrl = uploadResult.file_url;
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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const token = body?.token;

    if (!token) {
      return Response.json({ error: 'missing_token' }, { status: 400 });
    }

    const docs = await base44.asServiceRole.entities.Document.filter({
      signature_token: token,
    });

    if (!docs || docs.length === 0) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const doc = docs[0];

    if (doc.signature_status === 'signed') {
      return Response.json({ error: 'already_signed' }, { status: 410 });
    }

    return Response.json({
      document_name: doc.name || 'מסמך לחתימה',
      agreement_text: doc.agreement_text || '',
      signature_status: doc.signature_status || 'pending',
      file_url: doc.file_url || '',
    });
  } catch (error) {
    console.error('getAgreementData error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
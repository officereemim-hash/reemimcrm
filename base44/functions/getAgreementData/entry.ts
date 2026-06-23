import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const token = body?.token;

    if (!token) {
      return Response.json({ error: 'missing_token' }, { status: 400 });
    }

    // Try direct filter first
    let docs = await base44.asServiceRole.entities.Document.filter({ signature_token: token });

    // Fallback: search in all pending documents
    if (!docs || docs.length === 0) {
      const pending = await base44.asServiceRole.entities.Document.filter({ signature_status: 'pending' });
      docs = pending.filter(d => d.signature_token === token);
    }

    if (!docs || docs.length === 0) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const doc = docs[0];

    if (doc.signature_status === 'signed') {
      return Response.json({ error: 'already_signed' }, { status: 410 });
    }

    // Get contact name for display
    let contactName = '';
    if (doc.contact_id) {
      try {
        const contacts = await base44.asServiceRole.entities.Contact.filter({ id: doc.contact_id });
        contactName = contacts[0]?.full_name || '';
      } catch (_) { /* ignore */ }
    }

    return Response.json({
      document_name: doc.name || 'מסמך לחתימה',
      agreement_text: doc.agreement_text || '',
      signature_status: doc.signature_status || 'pending',
      file_url: doc.file_url || '',
      contact_name: contactName,
    });
  } catch (error) {
    console.error('getAgreementData error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
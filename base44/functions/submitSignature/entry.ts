import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { token, signature_data, signer_name } = body;

    if (!token || !signature_data || !signer_name) {
      return Response.json({ error: 'missing_fields: token, signature_data, signer_name required' }, { status: 400 });
    }

    // מציאת המסמך לפי טוקן
    const docs = await base44.asServiceRole.entities.Document.filter({
      signature_token: token,
    });

    if (!docs || docs.length === 0) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const doc = docs[0];

    // בדיקה שלא נחתם כבר
    if (doc.signature_status === 'signed') {
      return Response.json({ error: 'already_signed' }, { status: 410 });
    }

    // שמירת החתימה
    await base44.asServiceRole.entities.Document.update(doc.id, {
      signature_data,
      signer_name: signer_name.trim(),
      signed_at: new Date().toISOString(),
      signature_status: 'signed',
    });

    // לוג בתקשורת אם יש contact_id
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

    return Response.json({ ok: true });
  } catch (error) {
    console.error('submitSignature error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

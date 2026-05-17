import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import MailComposer from 'npm:nodemailer@6.9.16/lib/mail-composer/index.js';

function base64UrlFromBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function buildEmail(to, subject, body) {
  const composer = new MailComposer({
    to,
    subject,
    text: body,
  });
  const message = await composer.compile().build();
  return base64UrlFromBytes(message);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { contact_id, subject, body } = await req.json();
    if (!contact_id || !subject || !body) {
      return Response.json({ error: 'Missing contact_id, subject or body' }, { status: 400 });
    }

    const contact = await base44.asServiceRole.entities.Contact.get(contact_id);
    if (!contact?.email) return Response.json({ error: 'Contact email is missing' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const raw = await buildEmail(contact.email, subject, body);

    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    const result = await gmailResponse.json();
    const ok = gmailResponse.ok;

    await base44.asServiceRole.entities.Communication.create({
      contact_id: contact.id,
      type: 'email',
      direction: 'outbound',
      content: body,
      sent_by: 'system',
      is_automated: false,
      status: ok ? 'sent' : 'failed',
      error_detail: ok ? null : JSON.stringify(result),
    });

    if (!ok) return Response.json({ error: 'Gmail send failed', details: result }, { status: 500 });

    return Response.json({ success: true, message_id: result.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
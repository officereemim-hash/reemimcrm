import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function sendEmailViaGmail(
  base44: any,
  toEmail: string,
  subject: string,
  htmlBody: string,
): Promise<string> {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');

  // RFC 2047 encoding for Hebrew subjects
  const subjectEncoded = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  const emailRaw = [
    `From: "קרנות ראמים" <me>`,
    `To: ${toEmail}`,
    `Subject: ${subjectEncoded}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    htmlBody,
  ].join('\r\n');

  const raw = btoa(unescape(encodeURIComponent(emailRaw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  const result = await res.json();
  if (!res.ok) {
    throw new Error(`Gmail send failed: ${JSON.stringify(result)}`);
  }
  return result.id || '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { contact_id, subject, html_body, template_id } = await req.json();

    if (!contact_id || !subject || !html_body) {
      return Response.json({ error: 'Missing contact_id, subject or html_body' }, { status: 400 });
    }

    // Contact.filter() — Base44 SDK does not support .get() by id
    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: contact_id });
    const contact = contacts[0];
    if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 });
    if (!contact.email) return Response.json({ error: 'Contact has no email' }, { status: 400 });

    const messageId = await sendEmailViaGmail(base44, contact.email, subject, html_body);

    await base44.asServiceRole.entities.Communication.create({
      contact_id,
      type: 'email',
      direction: 'outbound',
      content: html_body.replace(/<[^>]+>/g, '').substring(0, 500),
      sent_by: user.email || 'system',
      is_automated: false,
      status: 'sent',
      ...(template_id ? { template_id } : {}),
    });

    return Response.json({ success: true, message_id: messageId });
  } catch (error) {
    console.error('sendEmailToContact error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

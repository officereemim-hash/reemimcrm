import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { contact_id, subject, html_body, template_id } = await req.json();

    if (!contact_id || !subject || !html_body) {
      return Response.json({ error: 'Missing contact_id, subject or html_body' }, { status: 400 });
    }

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
    if (!BREVO_API_KEY) {
      return Response.json({ error: 'BREVO_API_KEY not configured' }, { status: 500 });
    }

    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: contact_id });
    const contact = contacts[0];
    if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 });
    if (!contact.email) return Response.json({ error: 'Contact has no email' }, { status: 400 });

    const [senderEmailSettings, senderNameSettings] = await Promise.all([
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_name' }),
    ]);
    const senderEmail = senderEmailSettings[0]?.value || 'office.reemim@gmail.com';
    const senderName = senderNameSettings[0]?.value || 'קרנות ראמים';

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: contact.email, name: contact.full_name || '' }],
        subject,
        htmlContent: html_body,
      }),
    });

    if (!brevoRes.ok) {
      const errBody = await brevoRes.text();
      console.error('Brevo rejected:', errBody);
      throw new Error(`Brevo error: ${errBody}`);
    }

    const brevoData = await brevoRes.json().catch(() => ({}));
    const messageId = brevoData.messageId || '';

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
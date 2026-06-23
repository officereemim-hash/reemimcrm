import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contact_id, contact_name, contact_email, document_name, sign_url } = await req.json();

    if (!contact_email || !sign_url || !document_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
    if (!BREVO_API_KEY) {
      return Response.json({ error: 'BREVO_API_KEY not configured' }, { status: 500 });
    }

    // Use same sender settings as the mailing center (processCampaignQueue)
    const senderSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' });
    const senderNameSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_name' });
    const senderEmail = senderSettings[0]?.value || 'office.reemim@gmail.com';
    const senderName = senderNameSettings[0]?.value || 'קרנות ראמים';

    console.log('Signature email sender:', senderEmail, '| name:', senderName, '| to:', contact_email);

    const htmlBody = `
      <div dir="rtl" style="font-family: 'Heebo', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #faf8f5; border-radius: 12px; overflow: hidden;">
        <div style="background: #4A2C78; padding: 20px 30px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🌿 קרנות ראמים</h1>
          <p style="color: #d4c5f0; margin: 4px 0 0; font-size: 13px;">חתימה דיגיטלית על מסמך</p>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          <p style="font-size: 15px; line-height: 1.8; color: #2c2c2c;">
            שלום ${contact_name || ''},
          </p>
          <p style="font-size: 15px; line-height: 1.8; color: #2c2c2c;">
            מצורף קישור לחתימה דיגיטלית על המסמך <strong>"${document_name}"</strong>.
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${sign_url}" style="background: #4A2C78; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-size: 16px; font-weight: 600;">
              ✍️ לחתימה על המסמך
            </a>
          </div>
          <p style="font-size: 13px; color: #888; text-align: center;">
            אם הכפתור לא עובד, העתיקי את הקישור:<br/>
            <a href="${sign_url}" style="color: #4A2C78;">${sign_url}</a>
          </p>
        </div>
        <div style="padding: 16px 30px; background: #f5f0ea; text-align: center; font-size: 12px; color: #999;">
          <p style="margin: 0;">קרנות ראמים | בשמת שערי בלוך</p>
        </div>
      </div>
    `;

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: contact_email, name: contact_name || '' }],
        subject: `✍️ חתימה על מסמך — ${document_name}`,
        htmlContent: htmlBody,
      }),
    });

    if (!brevoRes.ok) {
      const errBody = await brevoRes.text();
      console.error('Brevo rejected:', errBody);
      throw new Error(`Brevo error: ${errBody}`);
    }

    const brevoData = await brevoRes.json().catch(() => ({}));
    console.log('Brevo response:', JSON.stringify(brevoData));

    // Log communication
    if (contact_id) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id,
        type: 'email',
        direction: 'outbound',
        content: `נשלח מייל לחתימה על מסמך "${document_name}"`,
        sent_by: 'system',
        is_automated: false,
        status: 'sent',
        template_id: 'document_signature',
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('sendSignatureEmail error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
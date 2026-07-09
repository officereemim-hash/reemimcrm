import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');

function normalizePhone(phone) {
  let clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return clean;
}

async function sendWhatsApp(phone, message) {
  const cleanPhone = normalizePhone(phone);
  const chatId = `${cleanPhone}@c.us`;
  const res = await fetch(
    `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message, typingTime: 3000 }),
    }
  );
  return res.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Israel time for accurate day matching
    const now = new Date();
    const ilDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const todayMonth = ilDate.getMonth() + 1;
    const todayDay = ilDate.getDate();

    const contacts = await base44.asServiceRole.entities.Contact.list();

    const birthdayContacts = contacts.filter(c => {
      if (!c.birth_date) return false;
      if (['archived', 'not_relevant'].includes(c.status)) return false;
      if (c.mailing_opt_out) return false;
      const bd = new Date(c.birth_date);
      return bd.getMonth() + 1 === todayMonth && bd.getDate() === todayDay;
    });

    // Load template and sender settings
    const [templateRecords, senderEmailSettings, senderNameSettings, botSettings, greenSettings] = await Promise.all([
      base44.asServiceRole.entities.BotContent.filter({ key: 'birthday_greeting', is_active: true }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_name' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'green_api_enabled' }),
    ]);

    const waTemplate = templateRecords[0]?.content || 'יום הולדת שמח {name}! 🎂 מאחלים לך יום מיוחד ומלא שמחה. צוות קרנות ראמים';
    const senderEmail = senderEmailSettings[0]?.value || 'office.reemim@gmail.com';
    const senderName = senderNameSettings[0]?.value || 'קרנות ראמים';
    const botEnabled = botSettings[0]?.value === 'true';
    const greenEnabled = greenSettings[0]?.value === 'true';

    let waSent = 0;
    let waFailed = 0;
    let emailSent = 0;
    let emailFailed = 0;

    for (const contact of birthdayContacts) {
      const message = waTemplate.replaceAll('{name}', contact.full_name || '');

      // WhatsApp
      if (contact.phone && botEnabled && greenEnabled) {
        const ok = await sendWhatsApp(contact.phone, message);
        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact.id,
          type: 'whatsapp',
          direction: 'outbound',
          content: message.substring(0, 500),
          sent_by: 'system',
          is_automated: true,
          template_id: 'birthday_greeting',
          status: ok ? 'sent' : 'failed',
        });
        if (ok) waSent++;
        else waFailed++;
      }

      // Email
      if (contact.email && !contact.email_invalid && BREVO_API_KEY) {
        const htmlBody = `<div dir="rtl" style="font-family:'Heebo',Arial,sans-serif;max-width:600px;margin:0 auto;background:#faf8f5;border-radius:12px;overflow:hidden">
          <div style="background:#4A2C78;padding:20px 30px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">🎂 יום הולדת שמח!</h1>
          </div>
          <div style="padding:30px;background:#fff">
            <p style="font-size:16px;line-height:1.8;color:#2c2c2c">${message}</p>
          </div>
          <div style="padding:16px 30px;background:#f5f0ea;text-align:center;font-size:12px;color:#999">
            <p style="margin:0">קרנות ראמים | בשמת שערי בלוך</p>
          </div>
        </div>`;
        const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: contact.email, name: contact.full_name || '' }],
            subject: `יום הולדת שמח ${contact.full_name || ''}! 🎂`,
            htmlContent: htmlBody,
          }),
        }).catch(() => null);

        const emailOk = emailRes && emailRes.ok;
        await base44.asServiceRole.entities.Communication.create({
          contact_id: contact.id,
          type: 'email',
          direction: 'outbound',
          content: `ברכת יום הולדת נשלחה למייל ${contact.email}`,
          sent_by: 'system',
          is_automated: true,
          template_id: 'birthday_greeting_email',
          status: emailOk ? 'sent' : 'failed',
        });
        if (emailOk) emailSent++;
        else emailFailed++;
      }

      // Update last contact date
      if (contact.phone || contact.email) {
        await base44.asServiceRole.entities.Contact.update(contact.id, {
          last_contact_date: ilDate.toISOString().split('T')[0],
          last_bot_interaction_at: now.toISOString(),
        });
      }
    }

    return Response.json({ success: true, total: birthdayContacts.length, waSent, waFailed, emailSent, emailFailed });
  } catch (error) {
    console.error('sendBirthdayGreetings error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// אוטומציה על עדכון Contact: כשbot_status עובר ל-waiting_agent (מהסוכן, מהצוות או מכל מקור)
// — שליחת מייל התראה ל-office.reemim@gmail.com. מייל בלבד, לעולם לא וואטסאפ.
// דדופ של שעה לפי Contact.id, במפתח משותף עם notifyHandoffByEmail שב-greenApiWebhook
// כדי למנוע מייל כפול על אותה העברה.

function normalizeIntlPhone(phone) {
  let clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return clean;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const contact = body.data || {};
    const oldContact = body.old_data || {};
    const contactId = contact.id || body.event?.entity_id || '';

    if (!contactId || contact.bot_status !== 'waiting_agent' || oldContact.bot_status === 'waiting_agent') {
      return Response.json({ ok: true, skipped: 'not_a_handoff_transition' });
    }

    // דדופ של שעה — מפתח משותף עם ההתראות שנשלחות ישירות מ-greenApiWebhook
    const alertKey = 'handoff_alerted_' + contactId;
    const markers = await base44.asServiceRole.entities.SystemSetting.filter({ key: alertKey });
    const lastAlert = markers.length > 0 ? new Date(markers[0].value).getTime() : 0;
    if (Date.now() - lastAlert < 60 * 60 * 1000) {
      return Response.json({ ok: true, skipped: 'deduped' });
    }

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
    if (!BREVO_API_KEY) return Response.json({ ok: true, skipped: 'no_brevo_key' });
    const senderSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' });
    const senderEmail = senderSettings[0]?.value || '';
    if (!senderEmail) return Response.json({ ok: true, skipped: 'no_sender_email' });

    // ההודעה האחרונה שהלקוח כתב (לפי הטלפון בפורמט בינלאומי)
    let lastText = '';
    if (contact.phone) {
      const intlPhone = normalizeIntlPhone(contact.phone);
      const logs = await base44.asServiceRole.entities.WhatsAppMessageLog.filter(
        { phone: intlPhone, direction: 'incoming' }, '-created_date', 1
      );
      lastText = logs[0]?.text || '';
    }

    const emailBody = `הבוט/הצוות העביר שיחה לטיפול נציגה (עדכון סטטוס).<br/><br/>לקוח: ${contact.full_name || 'לא ידוע'} (${contact.phone || ''})<br/>סיבה: עדכון סטטוס להמתנה לנציגה (דרך הסוכן או ידנית)<br/>ההודעה האחרונה שכתב: "${String(lastText).substring(0, 300)}"`;
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'קרנות ראמים — בוט', email: senderEmail },
        to: [{ email: 'office.reemim@gmail.com', name: 'משרד ראמים' }],
        subject: `📞 שיחה הועברה לנציגה — ${contact.full_name || contact.phone || ''}`,
        htmlContent: `<div dir="rtl" style="font-family:Arial;font-size:16px">${emailBody}</div>`,
      }),
    });

    // עדכון סמן הדדופ (SystemSetting בלבד — לא נוגעים ב-Contact כדי לא להפעיל את האוטומציה שוב)
    if (markers.length > 0) {
      await base44.asServiceRole.entities.SystemSetting.update(markers[0].id, { value: new Date().toISOString() });
    } else {
      await base44.asServiceRole.entities.SystemSetting.create({ key: alertKey, value: new Date().toISOString(), category: 'flow' });
    }

    return Response.json({ ok: true, sent: true });
  } catch (error) {
    console.error('onContactHandoff error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
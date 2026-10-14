import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// 3 שעות אחרי תזכורת פגישה בלי שום תגובה בוואטסאפ → משימה לבשמת + מייל ללקוח (פעם אחת לכל פגישה)
const SIGNATURE = 'בשמת שערי-בלוך, קרנות ראמים';
const toMs = (d) => { const s = String(d || ''); return s ? new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z').getTime() : 0; };
const intlPhone = (p) => { let c = String(p || '').replace(/[\s\-\+\(\)]/g, ''); if (c.startsWith('0')) c = '972' + c.substring(1); return c; };
const fmt = (d) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'full', timeStyle: 'short' }).format(new Date(d));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const now = Date.now();
    const meetings = await db.Meeting.filter({ status: 'scheduled', reminder_d1_sent: true, attendance_confirmed: false }, 'scheduled_at', 100);
    let handled = 0;

    for (const m of meetings) {
      if (!m.scheduled_at || toMs(m.scheduled_at) < now) continue;
      const markerId = `unconfirmed_fallback_${m.id}`;
      if ((await db.Communication.filter({ template_id: markerId }, '-created_date', 1)).length) continue;
      const reminder = (await db.Communication.filter({ contact_id: m.contact_id, template_id: 'pre_meeting_reminder' }, '-created_date', 1))[0];
      const remAt = toMs(reminder?.created_date);
      if (!remAt || now - remAt < 3 * 60 * 60 * 1000) continue;
      const contact = (await db.Contact.filter({ id: m.contact_id }))[0];
      if (!contact) continue;
      const incoming = await db.WhatsAppMessageLog.filter({ phone: intlPhone(contact.phone), direction: 'incoming' }, '-created_date', 1);
      if (incoming[0] && toMs(incoming[0].created_date) > remAt) continue;

      const timeStr = fmt(m.scheduled_at);
      await db.Task.create({
        contact_id: contact.id, service_request_id: m.service_request_id || undefined,
        title: `לא הגיב/ה לתזכורת — להתקשר: ${contact.full_name || ''} ${contact.phone || ''} (פגישה ${timeStr})`,
        type: 'followup', category: 'operational', priority: 'high', assigned_to: 'basmat', auto_generated: true,
        due_date: new Date().toISOString().split('T')[0],
        notes: `נושא: ${m.calcom_subject || '—'}\nמייל: ${contact.email || 'אין'}`,
      });

      let emailStatus = 'skipped';
      const BREVO = Deno.env.get('BREVO_API_KEY') || '';
      const sender = (await db.SystemSetting.filter({ key: 'mailing_sender_email' }))[0]?.value || '';
      if (contact.email && !contact.email_invalid && BREVO && sender) {
        const tpl = (await db.BotContent.filter({ key: 'unconfirmed_meeting_email', is_active: true }))[0]?.content
          || `שלום {name},\nרצינו לוודא שהפגישה שלך ב-{time} עדיין בתוקף. נשמח לאישור הגעה.\n\n${SIGNATURE}`;
        let body = tpl.replaceAll('{name}', contact.full_name || '').replaceAll('{time}', timeStr);
        if (!body.includes(SIGNATURE)) body += `\n\n${SIGNATURE}`;
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST', headers: { 'api-key': BREVO, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'בשמת שערי-בלוך, קרנות ראמים', email: sender },
            to: [{ email: contact.email, name: contact.full_name || '' }],
            subject: `אישור הגעה לפגישה — ${timeStr}`,
            htmlContent: `<div dir="rtl" style="font-family:Arial;font-size:16px;line-height:1.6">${body.replace(/\n/g, '<br/>')}</div>`,
          }),
        });
        emailStatus = r.ok ? 'sent' : 'failed';
      }
      await db.Communication.create({
        contact_id: contact.id, type: 'email', direction: 'outbound', sent_by: 'system', is_automated: true,
        template_id: markerId, status: emailStatus,
        content: `לא התקבלה תגובה לתזכורת הפגישה (${timeStr}) — נפתחה משימה לבשמת${emailStatus === 'sent' ? ' ונשלח מייל ללקוח' : ''}`,
      });
      handled++;
    }
    return Response.json({ ok: true, handled });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
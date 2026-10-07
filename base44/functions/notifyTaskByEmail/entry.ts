import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// מייל לבשמת על כל משימה חדשה במערכת (אוטומציה: Task — on create)
// שליחה דרך Brevo, באותה תבנית כמו notifyHandoffByEmail ב-greenApiWebhook.

const ASSIGNEE_LABEL = { bar: 'א. תיאום', yael: 'א. מכירות', basmat: 'בשמת' };
const APP_URL = 'https://reemim-crm.base44.app';

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    // אבטחה: הפונקציה נגישה מבחוץ. לא סומכים על תוכן הבקשה — טוענים את המשימה מהמערכת לפי המזהה,
    // ושולחים רק על משימה שנוצרה ב-10 הדקות האחרונות (האוטומציה רצה מיד כשמשימה נוצרת).
    const taskId = body.data?.id || body.event?.entity_id || '';
    if (!taskId) return Response.json({ ok: true, skipped: 'no_task_id' });
    const task = (await base44.asServiceRole.entities.Task.filter({ id: taskId }))[0];
    if (!task?.title) return Response.json({ ok: true, skipped: 'task_not_found' });
    const created = String(task.created_date || '');
    const createdMs = new Date(/Z$|[+-]\d\d:?\d\d$/.test(created) ? created : created + 'Z').getTime();
    if (!(Date.now() - createdMs < 10 * 60 * 1000)) return Response.json({ ok: true, skipped: 'task_not_new' });

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
    if (!BREVO_API_KEY) return Response.json({ ok: false, skipped: 'no_brevo_key' });
    const senderSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'mailing_sender_email' });
    const senderEmail = senderSettings[0]?.value || '';
    if (!senderEmail) return Response.json({ ok: false, skipped: 'no_sender_email' });

    let contactLine = '';
    if (task.contact_id) {
      const c = (await base44.asServiceRole.entities.Contact.filter({ id: task.contact_id }))[0];
      if (c) contactLine = `לקוח: <a href="${APP_URL}/contacts/${c.id}">${esc(c.full_name || c.phone || '')}</a> ${esc(c.phone || '')}<br/>`;
    }
    const who = ASSIGNEE_LABEL[task.assigned_to] || task.assigned_to || '';
    const html = `<div dir="rtl" style="font-family:Arial;font-size:16px;line-height:1.6">
      <b>${esc(task.title)}</b><br/><br/>
      ${contactLine}
      ${who ? `באחריות: ${esc(who)}<br/>` : ''}
      ${task.due_date ? `תאריך יעד: ${esc(task.due_date)}<br/>` : ''}
      ${task.notes ? `<br/>${esc(task.notes).replace(/\n/g, '<br/>')}` : ''}
      <br/><br/><a href="${APP_URL}/">לפתיחת המערכת</a>
    </div>`;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'קרנות ראמים — מערכת', email: senderEmail },
        to: [{ email: 'bosmat@oryx-alt.com', name: 'בשמת' }],
        subject: `📋 משימה חדשה: ${task.title}`,
        htmlContent: html,
      }),
    });
    return Response.json({ ok: res.ok, status: res.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
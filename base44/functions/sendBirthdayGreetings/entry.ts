import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { getSetting, listAll, firstName, normalizePhone, isEligible, israelClock, israelDateOf, acquireLock, releaseLock, appendQueue } from '../../shared/greetingQueue.ts';
import birthdayEmail from '../../shared/birthdayEmail.ts';

export default async function(req) {
  let base44, lock;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json();
    const clock = await israelClock(base44);
    const [contacts, templates, templateName, bot, live, sender] = await Promise.all([
      listAll(base44.asServiceRole.entities.Contact), base44.asServiceRole.entities.BotContent.filter({ key: 'birthday_greeting', is_active: true }),
      getSetting(base44, 'uchat_tpl_birthday'), getSetting(base44, 'whatsapp_bot_enabled'), getSetting(base44, 'whatsapp_live_mode'), getSetting(base44, 'mailing_sender_email'),
    ]);
    const birthdays = contacts.filter(c => isEligible(c) && String(c.birth_date || '').slice(5, 10) === `${clock.month}-${clock.day}`);
    const waEnabled = bot === 'true' && live === 'true' && !!templateName.trim();
    const emailEnabled = !!(secrets.get('BREVO_API_KEY') && sender);
    const summary = { success: true, date: clock.date, total: birthdays.length, whatsapp_enabled: waEnabled, whatsapp_template_configured: !!templateName.trim(), email_enabled: emailEnabled, whatsapp_queued: 0, email_queued: 0 };
    if (body.dry_run === true) return Response.json({ ...summary, dry_run: true, message: 'בדיקת הגדרות בלבד — אין כתיבה לתור ואין שליחה' });
    lock = await acquireLock(base44, 'greeting_enqueue_lock');
    if (!lock) return Response.json({ ...summary, skipped: 'enqueue_in_progress' });
    const existing = await listAll(base44.asServiceRole.entities.CampaignQueue, { greeting_date: clock.date });
    const keys = new Set(existing.map(q => q.deduplication_key));
    const recentLogs = await listAll(base44.asServiceRole.entities.Communication, { template_id: { $in: ['birthday_greeting', 'birthday_greeting_email'] }, status: { $in: ['sent', 'delivered', 'read'] }, created_date: { $gte: new Date(new Date(clock.iso).getTime() - 26 * 3600000).toISOString() } });
    const alreadySent = new Set(recentLogs.filter(l => israelDateOf(l.created_date) === clock.date).map(l => `${l.contact_id}:${l.type}`));
    const blockedPhones = new Set(contacts.filter(c => c.mailing_opt_out).map(c => normalizePhone(c.phone)));
    const waText = templates[0]?.content || 'יום הולדת שמח {name}! 🎂 מאחלים לך יום מיוחד ומלא שמחה. צוות קרנות ראמים';
    const rows = [];
    for (const c of birthdays) {
      const name = firstName(c.full_name);
      const phone = normalizePhone(c.phone);
      const email = String(c.email || '').trim();
      const waKey = `birthday:${clock.date}:whatsapp:${phone}`;
      const emailKey = `birthday:${clock.date}:email:${email.toLowerCase()}`;
      const common = { contact_id: c.id, contact_name: c.full_name || '', greeting_date: clock.date, status: 'pending' };
      if (waEnabled && phone && name && !blockedPhones.has(phone) && !keys.has(waKey) && !alreadySent.has(`${c.id}:whatsapp`)) {
        rows.push({ ...common, channel: 'whatsapp', recipient: phone, whatsapp_template_key: 'birthday', deduplication_key: waKey, content: `ברכת יום הולדת — נוסח מאושר במטא; שם פרטי: ${name}` });
        keys.add(waKey); summary.whatsapp_queued++;
      }
      if (emailEnabled && email && !c.email_invalid && !keys.has(emailKey) && !alreadySent.has(`${c.id}:email`)) {
        const message = waText.replaceAll('{name}', c.full_name || '');
        rows.push({ ...common, channel: 'email', recipient: email, deduplication_key: emailKey, subject: `יום הולדת שמח ${c.full_name || ''}! 🎂`, content: birthdayEmail(message) });
        keys.add(emailKey); summary.email_queued++;
      }
    }
    if (!rows.length) return Response.json({ ...summary, message: 'אין ברכות חדשות להוספה לתור' });
    const campaign = await base44.asServiceRole.entities.Campaign.create({ name: `ברכות יום הולדת — ${clock.date}`, type: 'birthday', greeting_key: 'birthday', channel: summary.whatsapp_queued && summary.email_queued ? 'both' : summary.whatsapp_queued ? 'whatsapp' : 'email', audience: 'birthday', recipients_count: new Set(rows.map(r => r.contact_id)).size, status: 'in_progress', whatsapp_snapshot: templateName ? `תבנית מאושרת: ${templateName}; שלום {{1}} — שם פרטי בלבד; כפתור הסר` : '', sent_at: clock.iso, sent_by: 'system' });
    await appendQueue(base44, campaign, rows, lock);
    return Response.json({ ...summary, campaign_id: campaign.id, message: 'הברכות נוספו לתור הדיוור המוגן; המייל נשמר ללא תלות במיפוי WhatsApp' });
  } catch (error) {
    console.error('sendBirthdayGreetings:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  } finally { if (base44 && lock) await releaseLock(base44, lock); }
}
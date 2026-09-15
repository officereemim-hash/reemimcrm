import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { getSetting, listAll, israelClock, israelDateOf, acquireLock, releaseLock, refreshCampaign } from '../../shared/greetingQueue.ts';
import { claimItem, skipItem, deliverItem, checkRecipient } from '../../shared/campaignDelivery.ts';

export default async function(req) {
  let base44, lock;
  const summary = { email_sent: 0, email_failed: 0, whatsapp_sent: 0, whatsapp_failed: 0, skipped: 0, whatsapp_delayed: false };
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json();
    const clock = await israelClock(base44);
    const [enabled, live, limitSetting] = await Promise.all([getSetting(base44, 'whatsapp_bot_enabled'), getSetting(base44, 'whatsapp_live_mode'), getSetting(base44, 'whatsapp_daily_limit', '100')]);
    const dailyLimit = Math.max(0, Math.min(100, Number.isFinite(Number(limitSetting)) ? Math.floor(Number(limitSetting)) : 100));
    if (body.dry_run === true) return Response.json({ success: true, dry_run: true, date: clock.date, daily_limit: dailyLimit, whatsapp_live: live === 'true' && enabled === 'true', message: 'בדיקת הגדרות בלבד — ללא שליחת הודעות או שינוי התור' });
    lock = await acquireLock(base44, 'campaign_dispatch_lock');
    if (!lock) return Response.json({ success: true, skipped: 'another_run_active' });
    const stopAt = Date.now() + 60000;
    const queue = base44.asServiceRole.entities.CampaignQueue;
    const touched = new Set();
    const recent = await listAll(queue, { channel: 'whatsapp', $or: [{ dispatch_day: clock.date }, { sent_at: { $gte: new Date(new Date(clock.iso).getTime() - 26 * 3600000).toISOString() } }] });
    // Reserve quota BEFORE the network call. Failed/uncertain attempts consume a slot too.
    let usedToday = recent.filter(i => i.dispatch_day === clock.date || (i.sent_at && israelDateOf(i.sent_at) === clock.date)).length;
    for (const channel of ['email', 'whatsapp']) {
      const pending = await queue.filter({ status: 'pending', channel }, 'created_date', 10);
      for (const item of pending) {
        if (Date.now() >= stopAt || israelDateOf(new Date().toISOString()) !== clock.date) break;
        touched.add(item.campaign_id);
        const { contact, reason } = await checkRecipient(base44, item, clock.date);
        if (reason) { await skipItem(base44, item, reason); summary.skipped++; continue; }
        if (channel === 'whatsapp') {
          const [botNow, liveNow] = await Promise.all([getSetting(base44, 'whatsapp_bot_enabled'), getSetting(base44, 'whatsapp_live_mode')]);
          if (botNow !== 'true' || liveNow !== 'true' || usedToday >= dailyLimit) {
            summary.whatsapp_delayed = true;
            summary.whatsapp_delay_reason = usedToday >= dailyLimit ? 'מכסת הדיוור היומית נוצלה; התור ימתין ליום הבא' : 'שליחת WhatsApp או מצב שליחה אמיתית כבויים';
            break;
          }
          if (!(await getSetting(base44, `uchat_tpl_${item.whatsapp_template_key || 'campaign_broadcast'}`)).trim()) {
            await queue.update(item.id, { error_message: 'ממתין למיפוי תבנית מאושרת — לא נשלחה בקשה למטא' });
            summary.whatsapp_delayed = true; continue;
          }
        }
        if (!(await claimItem(base44, item, lock, clock.date))) continue;
        if (channel === 'whatsapp') usedToday++;
        try {
          await deliverItem(base44, item, contact, clock.date);
          summary[`${channel}_sent`]++;
        } catch (error) {
          const current = await queue.get(item.id);
          if (current.status === 'sent') {
            // A logging/contact-update failure must not relabel a successfully accepted send.
            summary[`${channel}_sent`]++;
            console.error('post_send_recording_failed:', item.id, error.message);
          } else {
            await queue.update(item.id, { status: 'failed', error_message: `${error.message}; ללא ניסיון חוזר אוטומטי`.slice(0, 500) });
            await base44.asServiceRole.entities.Communication.create({ contact_id: item.contact_id, type: channel, direction: 'outbound', content: `[דיוור] ${(item.subject || item.content || '').slice(0, 200)}`, sent_by: 'system', is_automated: true, template_id: `campaign_${item.campaign_id}`, status: 'failed', error_detail: String(error.message).slice(0, 500) });
            summary[`${channel}_failed`]++;
          }
        }
        await new Promise(resolve => setTimeout(resolve, channel === 'whatsapp' ? 2000 : 250));
      }
    }
    for (const campaignId of touched) await refreshCampaign(base44, campaignId);
    // No self-calls: the scheduled workflow resumes pending work, including after midnight.
    return Response.json({ success: true, ...summary, daily_limit: dailyLimit, whatsapp_attempts_today: usedToday });
  } catch (error) {
    console.error('processCampaignQueue:', error.message);
    return Response.json({ success: false, error: error.message, ...summary }, { status: 500 });
  } finally { if (base44 && lock) await releaseLock(base44, lock); }
}
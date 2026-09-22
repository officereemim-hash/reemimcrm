import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { getSetting, listAll, firstName, normalizePhone, isEligible, israelClock, acquireLock, releaseLock, appendQueue } from '../../shared/greetingQueue.ts';

const HOLIDAY = 'general_holiday';
const HOLIDAY_LABEL = 'ברכת חגים כללית';
const AUDIENCE_EVERYONE = () => true;
const TARGET_DATE = '2026-09-22';
const FLAG_KEY = 'holiday_broadcast_2026_enqueued';

export default async function(req) {
  let base44, lock;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const clock = await israelClock(base44);

    // שומר תאריך: רץ רק ב-22.9.2026 (Asia/Jerusalem). לפני/אחרי — יוצא בלי פעולה.
    if (clock.date !== TARGET_DATE) {
      return Response.json({ success: true, skipped: 'wrong_date', israel_date: clock.date, target: TARGET_DATE });
    }

    // שומר אידמפוטנטיות: אם כבר רץ — לא פעם נוספת.
    const flagRows = await base44.asServiceRole.entities.SystemSetting.filter({ key: FLAG_KEY });
    if (flagRows.length > 0 && flagRows[0].value === 'true') {
      return Response.json({ success: true, skipped: 'already_enqueued', message: 'ברכת החגים 2026 כבר הוכנסה לתור בהרצה קודמת.' });
    }

    lock = await acquireLock(base44, 'greeting_enqueue_lock');
    if (!lock) return Response.json({ success: true, skipped: 'another_enqueue_active' });

    const [template, live, enabled, limitSetting, contacts, queued] = await Promise.all([
      getSetting(base44, `uchat_tpl_${HOLIDAY}`), getSetting(base44, 'whatsapp_live_mode'), getSetting(base44, 'whatsapp_bot_enabled'), getSetting(base44, 'whatsapp_daily_limit', '100'),
      listAll(base44.asServiceRole.entities.Contact), listAll(base44.asServiceRole.entities.CampaignQueue, { whatsapp_template_key: HOLIDAY }),
    ]);
    const dailyLimit = Math.max(0, Math.min(150, Number.isFinite(Number(limitSetting)) ? Math.floor(Number(limitSetting)) : 150));
    const existing = new Set(queued.map(q => q.deduplication_key));
    const optedOutPhones = new Set(contacts.filter(c => c.mailing_opt_out).map(c => normalizePhone(c.phone)));
    const selected = new Map();
    for (const c of contacts) {
      const phone = normalizePhone(c.phone);
      const key = `holiday:${HOLIDAY}:${clock.year}:${phone}`;
      if (isEligible(c) && AUDIENCE_EVERYONE(c) && phone && firstName(c.full_name) && !optedOutPhones.has(phone) && !existing.has(key) && !selected.has(phone)) selected.set(phone, { c, phone, key });
    }
    const recipients = [...selected.values()];
    const liveMode = live === 'true' && enabled === 'true';

    if (!template.trim() || !liveMode || !dailyLimit || !recipients.length) {
      return Response.json({ success: false, skipped: 'preconditions_not_met', recipients: recipients.length, template_mapped: Boolean(template.trim()), live_mode: liveMode, daily_limit: dailyLimit });
    }

    const campaign = await base44.asServiceRole.entities.Campaign.create({
      name: `ברכת ${HOLIDAY_LABEL} ${clock.year}`, type: 'newsletter', greeting_key: HOLIDAY, channel: 'whatsapp', audience: 'everyone',
      recipients_count: recipients.length, status: 'in_progress', whatsapp_snapshot: `תבנית מאושרת: ${template}; שלום {{1}} — שם פרטי בלבד; כפתור הסר`, sent_at: clock.iso, sent_by: 'scheduled',
    });
    await appendQueue(base44, campaign, recipients.map(({ c, phone, key }) => ({ contact_id: c.id, contact_name: c.full_name || '', channel: 'whatsapp', recipient: phone, whatsapp_template_key: HOLIDAY, deduplication_key: key, content: `ברכת ${HOLIDAY_LABEL} — נוסח מאושר במטא; שם פרטי: ${firstName(c.full_name)}`, status: 'pending' })), lock);

    // סימון אידמפוטנטיות — מונע הרצה כפולה אם הטריגר יירוץ שוב.
    if (flagRows.length > 0) {
      await base44.asServiceRole.entities.SystemSetting.update(flagRows[0].id, { value: 'true' });
    } else {
      await base44.asServiceRole.entities.SystemSetting.create({ key: FLAG_KEY, value: 'true', category: 'flow' });
    }

    return Response.json({ success: true, campaign_id: campaign.id, recipients: recipients.length, live_mode: true, daily_limit: dailyLimit, message: `נוספו ${recipients.length} נמענים לתור. השליחה תתבצע בהדרגה עד ${dailyLimit} הודעות ביום ע"י processCampaignQueue.` });
  } catch (error) {
    console.error('scheduledHolidayEnqueue:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  } finally { if (base44 && lock) await releaseLock(base44, lock); }
}
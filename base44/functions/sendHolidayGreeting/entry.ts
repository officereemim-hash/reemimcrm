import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { getSetting, listAll, firstName, normalizePhone, isEligible, israelClock, acquireLock, releaseLock, hashPreview, appendQueue } from '../../shared/greetingQueue.ts';

const HOLIDAYS = { rosh_hashana: 'ראש השנה', pesach: 'פסח' };
const AUDIENCES = { everyone: () => true, all_active: c => c.status === 'active_client', completed: c => c.status === 'completed', in_progress: c => ['in_progress', 'quote_sent'].includes(c.status), new_leads: c => c.status === 'new_lead' };

export default async function(req) {
  let base44, lock;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'שליחת ברכות מותרת למנהלת בלבד' }, { status: 403 });
    const { holiday, audience = 'all_active', action = 'preview', preview_token } = await req.json();
    if (!Object.hasOwn(HOLIDAYS, holiday) || !Object.hasOwn(AUDIENCES, audience) || !['preview', 'send'].includes(action)) return Response.json({ error: 'חג, קהל או פעולה לא תקינים' }, { status: 400 });
    if (action === 'send') {
      lock = await acquireLock(base44, 'greeting_enqueue_lock');
      if (!lock) return Response.json({ error: 'יצירת דיוור כבר מתבצעת. נסי שוב בעוד רגע.' }, { status: 409 });
    }
    const clock = await israelClock(base44);
    const [template, live, enabled, limitSetting, contacts, queued] = await Promise.all([
      getSetting(base44, `uchat_tpl_${holiday}`), getSetting(base44, 'whatsapp_live_mode'), getSetting(base44, 'whatsapp_bot_enabled'), getSetting(base44, 'whatsapp_daily_limit', '100'),
      listAll(base44.asServiceRole.entities.Contact), listAll(base44.asServiceRole.entities.CampaignQueue, { whatsapp_template_key: holiday }),
    ]);
    const dailyLimit = Math.max(0, Math.min(150, Number.isFinite(Number(limitSetting)) ? Math.floor(Number(limitSetting)) : 150));
    const existing = new Set(queued.map(q => q.deduplication_key));
    const optedOutPhones = new Set(contacts.filter(c => c.mailing_opt_out).map(c => normalizePhone(c.phone)));
    const selected = new Map();
    for (const c of contacts) {
      const phone = normalizePhone(c.phone);
      const key = `holiday:${holiday}:${clock.year}:${phone}`;
      if (isEligible(c) && AUDIENCES[audience](c) && phone && firstName(c.full_name) && !optedOutPhones.has(phone) && !existing.has(key) && !selected.has(phone)) selected.set(phone, { c, phone, key });
    }
    const recipients = [...selected.values()];
    const liveMode = live === 'true' && enabled === 'true';
    const token = await hashPreview([holiday, audience, clock.year, template, liveMode, dailyLimit, recipients.map(r => [r.c.id, r.phone, firstName(r.c.full_name)]).sort()]);
    const canSend = Boolean(template.trim() && liveMode && dailyLimit > 0 && recipients.length);
    const message = !template.trim() ? 'חסר מיפוי לתבנית מאושרת בהגדרות — לא תתבצע שליחה.' : !liveMode ? 'שליחת WhatsApp או מצב שליחה אמיתית כבויים — לא תתבצע שליחה.' : !dailyLimit ? 'מכסת הדיוור מוגדרת לאפס — לא תתבצע שליחה.' : !recipients.length ? 'אין נמענים חדשים מתאימים; מי שכבר בתור או קיבל ברכה לחג השנה לא נוסף שוב.' : 'הנמענים נבדקו. נדרש אישור שלך להוספה לתור.';
    const preview = { holiday, holiday_label: HOLIDAYS[holiday], audience, recipients: recipients.length, live_mode: liveMode, daily_limit: dailyLimit, can_send: canSend, template, preview_token: token, message };
    if (action === 'preview') return Response.json(preview);
    if (!canSend) return Response.json({ ...preview, error: message }, { status: 400 });
    if (!preview_token || preview_token !== token) return Response.json({ error: 'הקהל או ההגדרות השתנו. הציגי שוב את מספר הנמענים ואשרי מחדש.' }, { status: 409 });
    const campaign = await base44.asServiceRole.entities.Campaign.create({
      name: `ברכת ${HOLIDAYS[holiday]} ${clock.year}`, type: 'newsletter', greeting_key: holiday, channel: 'whatsapp', audience,
      recipients_count: recipients.length, status: 'in_progress', whatsapp_snapshot: `תבנית מאושרת: ${template}; שלום {{1}} — שם פרטי בלבד; כפתור הסר`, sent_at: clock.iso, sent_by: user.full_name || user.email,
    });
    await appendQueue(base44, campaign, recipients.map(({ c, phone, key }) => ({ contact_id: c.id, contact_name: c.full_name || '', channel: 'whatsapp', recipient: phone, whatsapp_template_key: holiday, deduplication_key: key, content: `ברכת ${HOLIDAYS[holiday]} — נוסח מאושר במטא; שם פרטי: ${firstName(c.full_name)}`, status: 'pending' })), lock);
    return Response.json({ success: true, campaign_id: campaign.id, recipients: recipients.length, live_mode: true, message: `נוספו ${recipients.length} נמענים לתור. השליחה תתבצע בהדרגה, עד ${dailyLimit} הודעות דיוור ביום.` });
  } catch (error) {
    console.error('sendHolidayGreeting:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  } finally { if (base44 && lock) await releaseLock(base44, lock); }
}
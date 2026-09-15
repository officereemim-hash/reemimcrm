// Helpers for greetings only. The existing uchat.ts and webinar senders are deliberately unchanged.
export async function getSetting(base44, key, fallback = '') {
  const rows = await base44.asServiceRole.entities.SystemSetting.filter({ key });
  return rows[0]?.value ?? fallback;
}
export async function listAll(entity, query = {}) {
  const rows = [];
  for (let skip = 0; ; skip += 200) {
    const page = await entity.filter(query, 'id', 200, skip);
    rows.push(...page);
    if (page.length < 200) return rows;
  }
}
export function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
export function normalizePhone(phone) {
  let p = String(phone || '').replace(/[\s+().-]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '972' + p.slice(1);
  return /^\d{8,15}$/.test(p) ? p : '';
}
export function isEligible(contact) {
  return contact && !contact.mailing_opt_out && !['archived', 'not_relevant'].includes(contact.status);
}
export async function israelClock(base44) {
  const { data } = await base44.functions.invoke('getIsraelTime', {});
  if (!data?.date || !data?.iso_utc) throw new Error('לא ניתן לקבל את השעה בישראל');
  const [day, month, year] = data.date.split('.');
  return { date: `${year}-${month}-${day}`, day, month, year, iso: data.iso_utc };
}
export function israelDateOf(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export async function acquireLock(base44, key) {
  const entity = base44.asServiceRole.entities.SystemSetting;
  const rows = await entity.filter({ key });
  if (rows.length !== 1) throw new Error('הגנת הדיוור אינה מוגדרת באופן תקין');
  const row = rows[0];
  const previous = row.value || '';
  if (previous && Number(previous.split('|')[0]) > Date.now()) return null;
  const expires = Date.now() + 15 * 60 * 1000;
  const value = `${expires}|${crypto.randomUUID()}`;
  const result = await entity.updateMany({ id: row.id, value: row.value }, { $set: { value } });
  if (result.updated !== 1) return null;
  return { id: row.id, value, expires };
}
export async function assertLock(base44, lock) {
  if (Date.now() > lock.expires - 60000) throw new Error('ההרצה נעצרה לפני תפוגת נעילת הדיוור');
  const row = await base44.asServiceRole.entities.SystemSetting.get(lock.id);
  if (row.value !== lock.value) throw new Error('נעילת הדיוור הוחלפה — ההרצה נעצרה');
}
export async function releaseLock(base44, lock) {
  if (lock) await base44.asServiceRole.entities.SystemSetting.updateMany({ id: lock.id, value: lock.value }, { $set: { value: '' } });
}
export async function hashPreview(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2, '0')).join('');
}
export async function appendQueue(base44, campaign, rows, lock) {
  // Serial enqueue lock + stable per-recipient keys prevent duplicate batches after retry.
  for (let i = 0; i < rows.length; i += 100) {
    await assertLock(base44, lock);
    await base44.asServiceRole.entities.CampaignQueue.bulkCreate(rows.slice(i, i + 100).map(row => ({ ...row, campaign_id: campaign.id })));
  }
}
export async function refreshCampaign(base44, campaignId) {
  const items = await listAll(base44.asServiceRole.entities.CampaignQueue, { campaign_id: campaignId });
  const count = (channel, statuses) => items.filter(i => i.channel === channel && statuses.includes(i.status)).length;
  const pending = items.some(i => ['pending', 'processing'].includes(i.status));
  const failed = items.some(i => ['failed', 'bounced'].includes(i.status));
  const sent = items.filter(i => ['sent', 'delivered', 'opened', 'clicked'].includes(i.status)).length;
  await base44.asServiceRole.entities.Campaign.update(campaignId, {
    email_sent: count('email', ['sent', 'delivered', 'opened', 'clicked']), email_failed: count('email', ['failed', 'bounced']),
    whatsapp_sent: count('whatsapp', ['sent', 'delivered', 'read']), whatsapp_failed: count('whatsapp', ['failed']),
    status: pending ? 'in_progress' : failed ? (sent ? 'partial' : 'failed') : 'completed',
  });
}
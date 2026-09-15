import { secrets } from 'base44:runtime';
import { uchatSend } from './uchat.ts';
import { firstName, getSetting, isEligible, normalizePhone, assertLock } from './greetingQueue.ts';

export async function claimItem(base44, item, lock, day) {
  await assertLock(base44, lock);
  const result = await base44.asServiceRole.entities.CampaignQueue.updateMany({ id: item.id, status: 'pending' }, { $set: {
    status: 'processing', claim_token: lock.value, claimed_at: new Date().toISOString(),
    ...(item.channel === 'whatsapp' ? { dispatch_day: day } : {}),
    error_message: 'השליחה בטיפול. אם ההרצה נעצרה, אין לנסות מחדש לפני בירור המסירה.',
  } });
  return result.updated === 1;
}
export async function skipItem(base44, item, reason) {
  await base44.asServiceRole.entities.CampaignQueue.updateMany({ id: item.id, status: 'pending' }, { $set: { status: 'skipped', error_message: reason } });
}
export async function deliverItem(base44, item, contact, day) {
  let messageId = '';
  if (item.channel === 'whatsapp') {
    const name = firstName(contact.full_name);
    const key = item.whatsapp_template_key || 'campaign_broadcast';
    const params = item.whatsapp_template_key ? [name] : [item.contact_name || '', item.content || ''];
    // No text fallback, no changes to the approved greeting/button; uchatSend resumes the bot.
    const ok = await uchatSend(base44, item.recipient, key, name, params);
    if (!ok) throw new Error('uChat לא אישר את השליחה; לא יבוצע ניסיון חוזר אוטומטי');
  } else {
    const key = secrets.get('BREVO_API_KEY');
    const senderEmail = await getSetting(base44, 'mailing_sender_email');
    const senderName = await getSetting(base44, 'mailing_sender_name', 'קרנות ראמים');
    if (!key || !senderEmail) throw new Error('חסרות הגדרות שולח המייל');
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: senderName, email: senderEmail }, to: [{ email: item.recipient, name: item.contact_name || '' }], subject: item.subject, htmlContent: item.content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Brevo: ${res.status} ${data.message || ''}`);
    messageId = data.messageId || '';
  }
  await base44.asServiceRole.entities.CampaignQueue.update(item.id, { status: 'sent', sent_at: new Date().toISOString(), error_message: '', ...(messageId ? { brevo_message_id: messageId } : {}) });
  await base44.asServiceRole.entities.Communication.create({
    contact_id: item.contact_id, type: item.channel, direction: 'outbound', content: item.channel === 'email' ? `[דיוור] נושא: ${item.subject}` : `[דיוור] ${item.content || ''}`,
    sent_by: 'system', is_automated: true, template_id: item.whatsapp_template_key === 'birthday' ? 'birthday_greeting' : item.deduplication_key?.startsWith('birthday:') && item.channel === 'email' ? 'birthday_greeting_email' : `campaign_${item.campaign_id}`, status: 'sent',
  });
  await base44.asServiceRole.entities.Contact.update(contact.id, { last_contact_date: day });
}
export async function checkRecipient(base44, item, day) {
  const rows = item.contact_id ? await base44.asServiceRole.entities.Contact.filter({ id: item.contact_id }) : [];
  const contact = rows[0];
  if (!contact || contact.mailing_opt_out) return { reason: 'איש הקשר הוסר מהתפוצה או אינו קיים' };
  if (item.deduplication_key && !isEligible(contact)) return { reason: 'איש הקשר אינו מתאים עוד לקבלת ברכה' };
  if (item.greeting_date && item.greeting_date !== day) return { reason: 'מועד ברכת יום ההולדת חלף — לא נשלחת ברכה באיחור' };
  if (item.channel === 'email' && (contact.email_invalid || contact.email !== item.recipient)) return { reason: 'כתובת המייל השתנתה או אינה תקינה' };
  if (item.channel === 'whatsapp' && (normalizePhone(contact.phone) !== item.recipient || !normalizePhone(item.recipient))) return { reason: 'מספר הטלפון השתנה או אינו תקין' };
  if (item.whatsapp_template_key && !firstName(contact.full_name)) return { reason: 'חסר שם פרטי לתבנית הברכה' };
  return { contact };
}
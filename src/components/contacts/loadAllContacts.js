import { base44 } from '@/api/base44Client';

export default async function loadAllContacts() {
  const contacts = [];
  for (let skip = 0; ; skip += 200) {
    const page = await base44.entities.Contact.filter({}, '-id', 200, skip);
    contacts.push(...page);
    if (page.length < 200) break;
  }
  return [...new Map(contacts.map(contact => [contact.id, contact])).values()]
    .sort((a, b) => (b.created_date || '').localeCompare(a.created_date || '') || b.id.localeCompare(a.id));
}
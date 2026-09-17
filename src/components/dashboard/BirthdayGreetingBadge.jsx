import { CheckCircle2, Clock3, AlertCircle } from 'lucide-react';

const SENT = ['sent', 'delivered', 'opened', 'clicked'];
const PENDING = ['pending', 'processing'];

export default function BirthdayGreetingBadge({ status }) {
  if (!status) return null;
  if (SENT.includes(status)) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success"><CheckCircle2 size={13} />ברכת יום הולדת נשלחה</span>;
  }
  if (PENDING.includes(status)) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-1 text-xs font-medium text-gold"><Clock3 size={13} />הברכה ממתינה לשליחה</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"><AlertCircle size={13} />הברכה לא נשלחה</span>;
}
import { AlertTriangle } from 'lucide-react';

const TYPE_LABELS = {
  newsletter: 'ניוזלטר',
  birthday: 'ברכת יום הולדת',
  google_review: 'בקשת המלצה',
  followup_after_meeting: 'פולו-אפ אחרי פגישה',
  annual_reminder: 'תזכורת שנתית',
};

export default function WhatsAppTemplateWarning({ type }) {
  const label = TYPE_LABELS[type] || 'הודעה זו';
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-800">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>שליחת {label} ב-WhatsApp אינה אפשרית כעת במסגרת Meta הרשמית, מאחר והתבנית אינה מאושרת.</span>
    </div>
  );
}
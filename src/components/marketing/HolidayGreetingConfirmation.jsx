import { Button } from '@/components/ui/button';
export default function HolidayGreetingConfirmation({ preview, busy, onConfirm }) {
  if (!preview) return null;
  return <div className="rounded-lg border bg-muted/40 p-4 space-y-3" aria-live="polite">
    <p className="font-semibold">ברכת {preview.holiday_label} — {preview.recipients} נמענים</p>
    <p className="text-sm text-muted-foreground">נוסח התבנית המאושרת בלבד, עם שם פרטי וכפתור ״הסר״; ללא שינוי הנוסח.</p>
    <p className="text-sm">{preview.message}</p>
    <p className="text-xs text-muted-foreground">עד {preview.daily_limit} הודעות דיוור ביום, עם השהיה בין שליחות. לחיצה על האישור מוסיפה לתור השליחה.</p>
    <Button onClick={onConfirm} disabled={busy || !preview.can_send}>{busy ? 'מוסיף לתור...' : 'שלח עכשיו (סופי)'}</Button>
  </div>;
}
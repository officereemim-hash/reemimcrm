import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export default function HolidayGreetingForm({ holiday, audience, onChange, onPreview, busy }) {
  return <div className="space-y-4">
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="space-y-2"><Label>חג</Label><Select value={holiday} onValueChange={value => onChange('holiday', value)} disabled={busy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general_holiday">ברכת חגים כללית</SelectItem><SelectItem value="rosh_hashana">ראש השנה</SelectItem><SelectItem value="pesach">פסח</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label>קהל יעד</Label><Select value={audience} onValueChange={value => onChange('audience', value)} disabled={busy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all_active">לקוחות פעילים</SelectItem><SelectItem value="everyone">כולם</SelectItem><SelectItem value="completed">לקוחות שסיימו טיפול</SelectItem><SelectItem value="in_progress">לקוחות בטיפול / הצעת מחיר</SelectItem><SelectItem value="new_leads">לידים חדשים</SelectItem></SelectContent></Select></div>
    </div>
    <Button variant="outline" onClick={onPreview} disabled={busy}>{busy ? 'טוען...' : 'הצגת מספר נמענים'}</Button>
  </div>;
}
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TYPE_OPTIONS = [
  { value: 'followup', label: 'פולו-אפ' },
  { value: 'pre_meeting_checklist', label: 'צ׳ק ליסט לפני פגישה' },
  { value: 'post_meeting_checklist', label: 'צ׳ק ליסט אחרי פגישה' },
  { value: 'document_collection', label: 'איסוף מסמכים' },
  { value: 'shoranss_transfer', label: 'העברה לשורנס' },
  { value: 'annual_followup', label: 'פולו-אפ שנתי' },
  { value: 'sla_followup', label: 'מעקב SLA' },
  { value: 'no_response_escalation', label: 'הסלמה — חוסר מענה' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'נמוכה' },
  { value: 'normal', label: 'רגילה' },
  { value: 'high', label: 'גבוהה' },
  { value: 'urgent', label: 'דחוף' },
];

const STATUS_OPTIONS = [
  { value: 'open', label: 'פתוח' },
  { value: 'in_progress', label: 'בביצוע' },
  { value: 'done', label: 'הושלם' },
  { value: 'cancelled', label: 'בוטל' },
];

export default function TaskFormDialog({ open, onClose, onSave, contacts, editItem }) {
  const [form, setForm] = useState({
    title: '', type: 'followup', priority: 'normal', status: 'open',
    contact_id: '', assigned_to: '', due_date: '', notes: '',
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        title: editItem.title || '', type: editItem.type || 'followup',
        priority: editItem.priority || 'normal', status: editItem.status || 'open',
        contact_id: editItem.contact_id || '', assigned_to: editItem.assigned_to || '',
        due_date: editItem.due_date || '', notes: editItem.notes || '',
      });
    } else {
      setForm({ title: '', type: 'followup', priority: 'normal', status: 'open', contact_id: '', assigned_to: '', due_date: '', notes: '' });
    }
  }, [editItem, open]);

  const handleSubmit = () => {
    if (!form.title) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editItem ? 'עריכת משימה' : 'משימה חדשה'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>כותרת *</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="תיאור המשימה" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>סוג</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>עדיפות</Label>
              <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>איש קשר</Label>
            <Select value={form.contact_id} onValueChange={v => setForm({ ...form, contact_id: v })}>
              <SelectTrigger><SelectValue placeholder="בחר (אופציונלי)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>ללא</SelectItem>
                {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>הקצאה ל</Label>
              <Input value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} placeholder="בר / יעל / בשמת" />
            </div>
            <div>
              <Label>תאריך יעד</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          {editItem && (
            <div>
              <Label>סטטוס</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={!form.title}>{editItem ? 'עדכן' : 'צור משימה'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
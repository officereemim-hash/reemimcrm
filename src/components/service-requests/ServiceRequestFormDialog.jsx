import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SERVICE_TYPE_LABELS, SOURCE_LABELS } from '@/components/StatusBadge';

const SR_STATUS_OPTIONS = [
  { value: 'new', label: 'חדש' },
  { value: 'in_progress', label: 'בטיפול' },
  { value: 'interested', label: 'מעוניין (תיאום פגישה)' },
  { value: 'quote_sent', label: 'הצעה נשלחה' },
  { value: 'awaiting_client_decision', label: 'ממתין להחלטה' },
  { value: 'followup_active', label: 'פולו-אפ פעיל' },
  { value: 'phone_meeting', label: 'נקבעה שיחה טלפונית' },
  { value: 'meeting_scheduled', label: 'פגישה נקבעה' },
  { value: 'meeting_scheduled_frontal', label: 'נקבעה פגישה פרונטאלית' },
  { value: 'meeting_scheduled_zoom', label: 'נקבעה פגישת זום' },
  { value: 'completed', label: 'הושלם' },
  { value: 'cancelled', label: 'בוטל' },
  { value: 'followup_closed', label: 'פולו-אפ נסגר' },
  { value: 'closed_lost', label: 'נסגר — אבוד' },
];

const SOURCE_OPTIONS = [
  { value: 'bot', label: 'בוט' },
  { value: 'bar_call', label: 'שיחת בר' },
  { value: 'excel_import', label: 'ייבוא אקסל' },
  { value: 'manual', label: 'ידני' },
  { value: 'webinar', label: 'וובינר' },
];

export default function ServiceRequestFormDialog({ open, onClose, onSave, contacts, editItem }) {
  const [form, setForm] = useState({
    contact_id: '',
    service_type: 'retirement',
    status: 'new',
    source: 'manual',
    notes: '',
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        contact_id: editItem.contact_id || '',
        service_type: editItem.service_type || 'retirement',
        status: editItem.status || 'new',
        source: editItem.source || 'manual',
        notes: editItem.notes || '',
      });
    } else {
      setForm({ contact_id: '', service_type: 'retirement', status: 'new', source: 'manual', notes: '' });
    }
  }, [editItem, open]);

  const handleSubmit = () => {
    if (!form.contact_id) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editItem ? 'עריכת פנייה' : 'פנייה חדשה'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>איש קשר *</Label>
            <Select value={form.contact_id} onValueChange={v => setForm({ ...form, contact_id: v })}>
              <SelectTrigger><SelectValue placeholder="בחר איש קשר" /></SelectTrigger>
              <SelectContent>
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone ? `(${c.phone})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>סוג שירות *</Label>
            <Select value={form.service_type} onValueChange={v => setForm({ ...form, service_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {editItem && (
            <div>
              <Label>סטטוס</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SR_STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>מקור</Label>
            <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={!form.contact_id}>{editItem ? 'עדכן' : 'צור פנייה'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
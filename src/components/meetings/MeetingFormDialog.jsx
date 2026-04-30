import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TYPE_OPTIONS = [
  { value: 'intro_sale', label: 'שיחת היכרות / מכירה' },
  { value: 'advisory', label: 'ייעוץ' },
  { value: 'annual_service', label: 'שירות שנתי' },
  { value: 'zoom', label: 'פגישת זום' },
  { value: 'followup', label: 'פולו-אפ' },
];

const LOCATION_OPTIONS = [
  { value: 'modiin', label: 'מודיעין' },
  { value: 'petah_tikva_wednesday', label: 'פתח תקווה (רביעי)' },
  { value: 'zoom', label: 'זום' },
  { value: 'phone', label: 'טלפון' },
];

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'מתוכנן' },
  { value: 'completed', label: 'התקיים' },
  { value: 'cancelled', label: 'בוטל' },
  { value: 'no_show', label: 'לא הגיע' },
  { value: 'rescheduled', label: 'תואם מחדש' },
];

export default function MeetingFormDialog({ open, onClose, onSave, contacts, editItem }) {
  const [form, setForm] = useState({
    contact_id: '', type: 'intro_sale', location: 'modiin',
    scheduled_at: '', status: 'scheduled', summary: '',
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        contact_id: editItem.contact_id || '',
        type: editItem.type || 'intro_sale',
        location: editItem.location || 'modiin',
        scheduled_at: editItem.scheduled_at ? editItem.scheduled_at.slice(0, 16) : '',
        status: editItem.status || 'scheduled',
        summary: editItem.summary || '',
      });
    } else {
      setForm({ contact_id: '', type: 'intro_sale', location: 'modiin', scheduled_at: '', status: 'scheduled', summary: '' });
    }
  }, [editItem, open]);

  const handleSubmit = () => {
    if (!form.contact_id || !form.scheduled_at) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editItem ? 'עריכת פגישה' : 'פגישה חדשה'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>איש קשר *</Label>
            <Select value={form.contact_id} onValueChange={v => setForm({ ...form, contact_id: v })}>
              <SelectTrigger><SelectValue placeholder="בחר איש קשר" /></SelectTrigger>
              <SelectContent>
                {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone ? `(${c.phone})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>תאריך ושעה *</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>סוג פגישה</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>מיקום</Label>
              <Select value={form.location} onValueChange={v => setForm({ ...form, location: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LOCATION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
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
            <Label>סיכום</Label>
            <Textarea value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={!form.contact_id || !form.scheduled_at}>{editItem ? 'עדכן' : 'צור פגישה'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
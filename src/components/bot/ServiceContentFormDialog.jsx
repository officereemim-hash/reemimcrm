import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const CONTENT_TYPES = [
  { value: 'video', label: 'סרטון' },
  { value: 'pdf', label: 'PDF' },
  { value: 'questionnaire', label: 'שאלון' },
  { value: 'payment_link', label: 'קישור תשלום' },
  { value: 'external_link', label: 'קישור חיצוני' },
  { value: 'agreement', label: 'הסכם' },
  { value: 'calendar_link', label: 'קישור יומן' },
];

const SERVICE_TYPES = [
  { value: 'general', label: 'כללי' },
  { value: 'retirement', label: 'פרישה' },
  { value: 'economic_feasibility', label: 'היתכנות כלכלית' },
  { value: 'investments', label: 'השקעות' },
  { value: 'divorce_split', label: 'גירושין' },
  { value: 'tax_advisory', label: 'ייעוץ מס' },
  { value: 'annual_service', label: 'שירות שנתי' },
  { value: 'webinar', label: 'וובינר' },
];

export { CONTENT_TYPES, SERVICE_TYPES };

const EMPTY = { title: '', content_type: 'external_link', service_type: 'general', url: '', description: '', sub_type: '', is_active: true, sort_order: 0 };

export default function ServiceContentFormDialog({ open, onClose, item, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (item) {
      setForm({
        title: item.title || '', content_type: item.content_type || 'external_link',
        service_type: item.service_type || 'general', url: item.url || '',
        description: item.description || '', sub_type: item.sub_type || '',
        is_active: item.is_active !== false, sort_order: item.sort_order || 0,
      });
    } else {
      setForm(EMPTY);
    }
  }, [item, open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item?.id ? 'עריכת תוכן' : 'תוכן חדש'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label>כותרת *</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>סוג תוכן</Label>
              <Select value={form.content_type} onValueChange={v => setForm({ ...form, content_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONTENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>שיוך שירות</Label>
              <Select value={form.service_type} onValueChange={v => setForm({ ...form, service_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>קישור / URL</Label>
            <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label>תת-סוג (מפתח)</Label>
            <Input value={form.sub_type} onChange={e => setForm({ ...form, sub_type: e.target.value })} placeholder="modiin_calendar" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label>תיאור</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
            <Label className="text-sm">פעיל</Label>
          </div>
        </div>
        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={() => onSave(form)} disabled={!form.title || saving}>{saving ? 'שומר...' : 'שמור'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
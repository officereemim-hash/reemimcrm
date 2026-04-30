import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import EmojiPicker from '@/components/marketing/EmojiPicker';

const CATEGORIES = [
  { value: 'welcome', label: 'קבלת פנים' },
  { value: 'menu', label: 'תפריט' },
  { value: 'followup', label: 'פולו-אפ' },
  { value: 'reminder', label: 'תזכורת' },
  { value: 'closing', label: 'סגירה' },
  { value: 'error', label: 'שגיאה' },
  { value: 'escalation', label: 'הסלמה' },
];

const FLOWS = [
  { value: 'general', label: 'כללי' },
  { value: 'retirement', label: 'פרישה' },
  { value: 'economic_feasibility', label: 'היתכנות כלכלית' },
  { value: 'investments', label: 'השקעות' },
  { value: 'divorce_split', label: 'גירושין' },
  { value: 'tax_advisory', label: 'ייעוץ מס' },
  { value: 'annual_service', label: 'שירות שנתי' },
  { value: 'webinar', label: 'וובינר' },
];

const EMPTY = { key: '', title: '', content: '', category: 'welcome', service_type_flow: 'general', step_label: '', is_active: true };

export default function BotContentFormDialog({ open, onClose, item, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (item) {
      setForm({
        key: item.key || '', title: item.title || '', content: item.content || '',
        category: item.category || 'welcome', service_type_flow: item.service_type_flow || 'general',
        step_label: item.step_label || '', is_active: item.is_active !== false,
      });
    } else {
      setForm(EMPTY);
    }
  }, [item, open]);

  const canSave = form.key && form.title && form.content;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item?.id ? 'עריכת הודעה' : 'הודעה חדשה'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>מפתח *</Label>
              <Input value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} placeholder="welcome" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>קטגוריה</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>מסלול שירות</Label>
              <Select value={form.service_type_flow} onValueChange={v => setForm({ ...form, service_type_flow: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FLOWS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>שלב</Label>
              <Input value={form.step_label} onChange={e => setForm({ ...form, step_label: e.target.value })} placeholder="שלב 3 — שאלון" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>כותרת *</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>תוכן ההודעה *</Label>
              <EmojiPicker onSelect={emoji => setForm({ ...form, content: form.content + emoji })} />
            </div>
            <Textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={5} placeholder="היי {שם}! 👋..." />
            <p className="text-xs text-muted-foreground">השתמש ב-{'{שם}'} לשם פרסונלי</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
            <Label className="text-sm">פעיל</Label>
          </div>
        </div>
        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={() => onSave(form)} disabled={!canSave || saving}>{saving ? 'שומר...' : 'שמור'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const TYPE_OPTIONS = [
  { value: 'investments', label: 'השקעות' },
  { value: 'divorce', label: 'גירושין / איזון' },
  { value: 'retirement', label: 'פרישה' },
];

export default function WebinarFormDialog({ open, onClose, onSave, contacts, editItem }) {
  const [form, setForm] = useState({
    contact_id: '', webinar_type: 'investments', webinar_date: '',
    attended: false, coupon_code: '', coupon_sent: false,
    payment_completed: false, payment_amount: '', meeting_scheduled: false,
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        contact_id: editItem.contact_id || '',
        webinar_type: editItem.webinar_type || 'investments',
        webinar_date: editItem.webinar_date ? editItem.webinar_date.slice(0, 16) : '',
        attended: editItem.attended || false,
        coupon_code: editItem.coupon_code || '',
        coupon_sent: editItem.coupon_sent || false,
        payment_completed: editItem.payment_completed || false,
        payment_amount: editItem.payment_amount || '',
        meeting_scheduled: editItem.meeting_scheduled || false,
      });
    } else {
      setForm({ contact_id: '', webinar_type: 'investments', webinar_date: '', attended: false, coupon_code: '', coupon_sent: false, payment_completed: false, payment_amount: '', meeting_scheduled: false });
    }
  }, [editItem, open]);

  const handleSubmit = () => {
    if (!form.contact_id || !form.webinar_type) return;
    const data = { ...form };
    if (data.payment_amount) data.payment_amount = Number(data.payment_amount);
    else delete data.payment_amount;
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editItem ? 'עריכת רישום' : 'רישום חדש לוובינר'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>איש קשר *</Label>
            <Select value={form.contact_id} onValueChange={v => setForm({ ...form, contact_id: v })}>
              <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
              <SelectContent>
                {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone ? `(${c.phone})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>סוג וובינר *</Label>
              <Select value={form.webinar_type} onValueChange={v => setForm({ ...form, webinar_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>תאריך וובינר</Label>
              <Input type="datetime-local" value={form.webinar_date} onChange={e => setForm({ ...form, webinar_date: e.target.value })} />
            </div>
          </div>
          {editItem && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <Label>השתתף</Label>
                  <Switch checked={form.attended} onCheckedChange={v => setForm({ ...form, attended: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>קופון נשלח</Label>
                  <Switch checked={form.coupon_sent} onCheckedChange={v => setForm({ ...form, coupon_sent: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>שילם</Label>
                  <Switch checked={form.payment_completed} onCheckedChange={v => setForm({ ...form, payment_completed: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>פגישה נקבעה</Label>
                  <Switch checked={form.meeting_scheduled} onCheckedChange={v => setForm({ ...form, meeting_scheduled: v })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>קוד קופון</Label>
                  <Input value={form.coupon_code} onChange={e => setForm({ ...form, coupon_code: e.target.value })} />
                </div>
                <div>
                  <Label>סכום תשלום</Label>
                  <Input type="number" value={form.payment_amount} onChange={e => setForm({ ...form, payment_amount: e.target.value })} />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={!form.contact_id}>{editItem ? 'עדכן' : 'צור רישום'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
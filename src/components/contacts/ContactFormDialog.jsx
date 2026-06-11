import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function ContactFormDialog({ contact, onClose, onSave }) {
  const [form, setForm] = useState(contact || {
    full_name: '', phone: '', email: '', status: 'new_lead',
    source: 'manual', service_type: '', assigned_to: '',
    lead_temperature: 'warm', notes: '', bot_status: 'new',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    if (contact?.id) {
      await base44.entities.Contact.update(contact.id, form);
    } else {
      await base44.entities.Contact.create(form);
    }
    onSave();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{contact ? 'עריכת איש קשר' : 'לקוח/ה חדש'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>שם מלא *</Label>
              <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="שם מלא" />
            </div>
            <div className="space-y-1">
              <Label>טלפון / WhatsApp *</Label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+972..." dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>אימייל</Label>
              <Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>סטטוס</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_lead">ליד חדש</SelectItem>
                  <SelectItem value="in_progress">בטיפול</SelectItem>
                  <SelectItem value="quote_sent">הצעה נשלחה</SelectItem>
                  <SelectItem value="active_client">לקוח פעיל</SelectItem>
                  <SelectItem value="completed">הושלם</SelectItem>
                  <SelectItem value="not_relevant">לא רלוונטי</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>מקור</Label>
              <Select value={form.source} onValueChange={v => set('source', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="facebook">פייסבוק</SelectItem>
                  <SelectItem value="website">אתר</SelectItem>
                  <SelectItem value="webinar">קמפיין מטא</SelectItem>
                  <SelectItem value="referral">הפניה</SelectItem>
                  <SelectItem value="manual">ידני</SelectItem>
                  <SelectItem value="excel_import">ייבוא אקסל</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>סוג שירות</Label>
              <Select value={form.service_type || ''} onValueChange={v => set('service_type', v)}>
                <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retirement">ייעוץ פרישה</SelectItem>
                  <SelectItem value="economic_feasibility">היתכנות כלכלית</SelectItem>
                  <SelectItem value="investments">השקעות</SelectItem>
                  <SelectItem value="divorce_split">איזון אקטוארי</SelectItem>
                  <SelectItem value="tax_advisory">ייעוץ מס</SelectItem>
                  <SelectItem value="annual_service">שירות שנתי</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>חום ליד</Label>
              <Select value={form.lead_temperature || 'warm'} onValueChange={v => set('lead_temperature', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hot">🔥 חם</SelectItem>
                  <SelectItem value="warm">☀️ פושר</SelectItem>
                  <SelectItem value="cold">❄️ קר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>משויך/ת ל</Label>
              <Select value={form.assigned_to || ''} onValueChange={v => set('assigned_to', v)}>
                <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">בר</SelectItem>
                  <SelectItem value="yael">יעל</SelectItem>
                  <SelectItem value="basmat">בשמת</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>תאריך לידה</Label>
              <Input type="date" value={form.birth_date || ''} onChange={e => set('birth_date', e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>הערות</Label>
              <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={3} placeholder="הערות פנימיות..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSave} disabled={saving || !form.full_name || !form.phone}>
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
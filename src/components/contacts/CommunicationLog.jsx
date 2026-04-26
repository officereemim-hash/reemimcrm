import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Phone, Mail, MessageSquare, Bot, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const TYPE_ICONS = {
  whatsapp: MessageSquare,
  call: Phone,
  email: Mail,
  bot_event: Bot,
  system_error: AlertCircle,
  note: MessageSquare,
};

const TYPE_LABELS = {
  whatsapp: 'WhatsApp',
  call: 'שיחה',
  email: 'מייל',
  bot_event: 'אירוע בוט',
  system_error: 'שגיאת מערכת',
  note: 'הערה',
};

export default function CommunicationLog({ contactId, communications, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'call', direction: 'inbound', content: '', sent_by: 'bar' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    await base44.entities.Communication.create({ ...form, contact_id: contactId, is_automated: false });
    setShowForm(false);
    onRefresh();
    setSaving(false);
  };

  const sorted = [...communications].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">לוג תקשורת ({communications.length})</h3>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
          <Plus size={14} />
          תיעוד ידני
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center text-muted-foreground py-10 text-sm">אין תקשורת מתועדת</div>
      ) : (
        <div className="space-y-2">
          {sorted.map(comm => {
            const Icon = TYPE_ICONS[comm.type] || MessageSquare;
            const isError = comm.type === 'system_error';
            return (
              <div key={comm.id} className={`flex gap-3 p-3 rounded-lg border ${isError ? 'border-destructive/30 bg-destructive/5' : 'bg-white'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isError ? 'bg-destructive/10' : 'bg-muted'}`}>
                  <Icon size={14} className={isError ? 'text-destructive' : 'text-muted-foreground'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{TYPE_LABELS[comm.type]}</span>
                    <span className="text-xs text-muted-foreground">
                      {comm.direction === 'inbound' ? '← נכנס' : '→ יוצא'}
                    </span>
                    {comm.sent_by && <span className="text-xs text-muted-foreground">ע"י: {comm.sent_by}</span>}
                    {comm.is_automated && <span className="text-xs bg-muted px-1.5 rounded">אוטומטי</span>}
                  </div>
                  <p className="text-sm mt-1 text-foreground break-words">{comm.content}</p>
                  <span className="text-xs text-muted-foreground">
                    {comm.created_date ? format(new Date(comm.created_date), 'dd/MM/yyyy HH:mm') : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>תיעוד תקשורת ידני</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>סוג</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">שיחה</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">מייל</SelectItem>
                      <SelectItem value="note">הערה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>כיוון</Label>
                  <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">נכנס</SelectItem>
                      <SelectItem value="outbound">יוצא</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>תוכן / סיכום *</Label>
                <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={4} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
                <Button onClick={handleCreate} disabled={saving || !form.content}>{saving ? 'שומר...' : 'שמור'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
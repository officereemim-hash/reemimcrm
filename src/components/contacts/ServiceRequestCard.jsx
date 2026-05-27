import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SRStatusBadge, SERVICE_TYPE_LABELS } from '@/components/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const STATUS_OPTIONS = [
  { value: 'new', label: 'חדש' },
  { value: 'in_progress', label: 'בטיפול' },
  { value: 'quote_sent', label: 'הצעה נשלחה' },
  { value: 'awaiting_client_decision', label: 'ממתין להחלטה' },
  { value: 'followup_active', label: 'פולו-אפ פעיל' },
  { value: 'meeting_scheduled', label: 'פגישה נקבעה' },
  { value: 'completed', label: 'הושלם' },
  { value: 'cancelled', label: 'בוטל' },
  { value: 'followup_closed', label: 'פולו-אפ נסגר' },
  { value: 'closed_lost', label: 'נסגר — אבוד' },
];

export default function ServiceRequestCard({ contactId, serviceRequests, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({ service_type: '', status: 'new', source: 'manual', notes: '' });
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingItem(null);
    setForm({ service_type: '', status: 'new', source: 'manual', notes: '' });
    setShowForm(true);
  };

  const openEdit = (sr) => {
    setEditingItem(sr);
    setForm({ service_type: sr.service_type || '', status: sr.status || 'new', source: sr.source || 'manual', notes: sr.notes || '' });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    if (editingItem) await base44.entities.ServiceRequest.update(editingItem.id, form);
    else await base44.entities.ServiceRequest.create({ ...form, contact_id: contactId });
    setShowForm(false);
    setEditingItem(null);
    setSelectedIds([]);
    onRefresh();
    setSaving(false);
  };

  const deleteItem = async (sr) => {
    if (!confirm(`למחוק את הפנייה "${SERVICE_TYPE_LABELS[sr.service_type] || sr.service_type}"?`)) return;
    await base44.entities.ServiceRequest.delete(sr.id);
    setSelectedIds(ids => ids.filter(id => id !== sr.id));
    onRefresh();
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || !confirm(`למחוק ${selectedIds.length} פניות?`)) return;
    await Promise.all(selectedIds.map(id => base44.entities.ServiceRequest.delete(id)));
    setSelectedIds([]);
    onRefresh();
  };

  const toggleSelected = (id) => setSelectedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h3 className="font-semibold">פניות שירות</h3>
        <div className="flex gap-2">
          {selectedIds.length > 0 && <Button size="sm" variant="destructive" onClick={deleteSelected}>מחיקת נבחרים ({selectedIds.length})</Button>}
          <Button size="sm" onClick={openCreate} className="gap-1"><Plus size={14} />פנייה חדשה</Button>
        </div>
      </div>

      {serviceRequests.length === 0 ? <div className="text-center text-muted-foreground py-10 text-sm">אין פניות שירות</div> : serviceRequests.map(sr => (
        <Card key={sr.id} className="border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={selectedIds.includes(sr.id)} onChange={() => toggleSelected(sr.id)} />
                <span className="font-medium text-sm">{SERVICE_TYPE_LABELS[sr.service_type] || sr.service_type}</span>
                <SRStatusBadge status={sr.status} />
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(sr)}><Edit size={14} /></Button>
                <Button size="icon" variant="ghost" onClick={() => deleteItem(sr)} className="text-destructive"><Trash2 size={14} /></Button>
              </div>
            </div>
            {sr.followup_stage !== 'none' && <div className="text-xs text-muted-foreground">שלב פולו-אפ: {sr.followup_stage}</div>}
            {sr.notes && <p className="text-sm text-muted-foreground">{sr.notes}</p>}
          </CardContent>
        </Card>
      ))}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editingItem ? 'עריכת פנייה' : 'פנייה חדשה'}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label>סוג שירות *</Label>
                <Select value={form.service_type} onValueChange={v => setForm(f => ({ ...f, service_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
                  <SelectContent>{Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>סטטוס</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>מקור</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">ידני</SelectItem><SelectItem value="bot">בוט</SelectItem><SelectItem value="bar_call">שיחת בר</SelectItem><SelectItem value="webinar">וובינר</SelectItem><SelectItem value="excel_import">ייבוא אקסל</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>הערות</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
                <Button onClick={handleSave} disabled={saving || !form.service_type}>{saving ? 'שומר...' : editingItem ? 'עדכן' : 'צור פנייה'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Calendar, MapPin, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MeetingStatusBadge } from '@/components/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';

const LOCATION_LABELS = { modiin: 'מודיעין', petah_tikva_wednesday: 'פתח תקווה (רביעי בלבד)', zoom: 'זום', phone: 'טלפון' };
const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'מתוכנן' }, { value: 'completed', label: 'התקיים' }, { value: 'cancelled', label: 'בוטל' }, { value: 'no_show', label: 'לא הגיע' }, { value: 'rescheduled', label: 'תואם מחדש' },
];

export default function MeetingsList({ contactId, meetings, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({ type: 'intro_sale', location: 'zoom', scheduled_at: '', meeting_source: 'agent', status: 'scheduled', summary: '' });
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingItem(null);
    setForm({ type: 'intro_sale', location: 'zoom', scheduled_at: '', meeting_source: 'agent', status: 'scheduled', summary: '' });
    setShowForm(true);
  };

  const openEdit = (meeting) => {
    setEditingItem(meeting);
    setForm({
      type: meeting.type || 'intro_sale',
      location: meeting.location || 'zoom',
      scheduled_at: meeting.scheduled_at ? meeting.scheduled_at.slice(0, 16) : '',
      meeting_source: meeting.meeting_source || 'agent',
      status: meeting.status || 'scheduled',
      summary: meeting.summary || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    if (editingItem) await base44.entities.Meeting.update(editingItem.id, form);
    else await base44.entities.Meeting.create({ ...form, contact_id: contactId });
    setShowForm(false);
    setEditingItem(null);
    setSelectedIds([]);
    onRefresh();
    setSaving(false);
  };

  const deleteItem = async (meeting) => {
    if (!confirm('למחוק את הפגישה?')) return;
    await base44.entities.Meeting.delete(meeting.id);
    setSelectedIds(ids => ids.filter(id => id !== meeting.id));
    onRefresh();
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || !confirm(`למחוק ${selectedIds.length} פגישות?`)) return;
    await Promise.all(selectedIds.map(id => base44.entities.Meeting.delete(id)));
    setSelectedIds([]);
    onRefresh();
  };

  const toggleSelected = (id) => setSelectedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  const sorted = [...meetings].sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h3 className="font-semibold">פגישות ({meetings.length})</h3>
        <div className="flex gap-2">
          {selectedIds.length > 0 && <Button size="sm" variant="destructive" onClick={deleteSelected}>מחיקת נבחרים ({selectedIds.length})</Button>}
          <Button size="sm" onClick={openCreate} className="gap-1"><Plus size={14} />פגישה חדשה</Button>
        </div>
      </div>

      {sorted.length === 0 ? <div className="text-center text-muted-foreground py-10 text-sm">אין פגישות</div> : sorted.map(m => (
        <Card key={m.id}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggleSelected(m.id)} />
                <Calendar size={15} className="text-primary" />
                <span className="font-medium text-sm">{m.scheduled_at ? format(new Date(m.scheduled_at), 'dd/MM/yyyy HH:mm') : '—'}</span>
              </div>
              <div className="flex items-center gap-1">
                <MeetingStatusBadge status={m.status} />
                <Button size="icon" variant="ghost" onClick={() => openEdit(m)}><Edit size={14} /></Button>
                <Button size="icon" variant="ghost" onClick={() => deleteItem(m)} className="text-destructive"><Trash2 size={14} /></Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin size={13} />{LOCATION_LABELS[m.location] || m.location}</div>
            {m.summary && <p className="text-sm text-muted-foreground">{m.summary}</p>}
            {m.calendar_link && <a href={m.calendar_link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">קישור לפגישה</a>}
          </CardContent>
        </Card>
      ))}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editingItem ? 'עריכת פגישה' : 'פגישה חדשה'}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1"><Label>מועד הפגישה *</Label><Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>סוג פגישה</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="intro_sale">היכרות / מכירה</SelectItem><SelectItem value="advisory">ייעוץ</SelectItem><SelectItem value="annual_service">שירות שנתי</SelectItem><SelectItem value="zoom">זום</SelectItem><SelectItem value="followup">פולו-אפ</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>מיקום</Label>
                  <Select value={form.location} onValueChange={v => setForm(f => ({ ...f, location: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="zoom">זום</SelectItem><SelectItem value="modiin">מודיעין</SelectItem><SelectItem value="petah_tikva_wednesday">פתח תקווה (רביעי)</SelectItem><SelectItem value="phone">טלפון</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>סטטוס</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>סיכום</Label><Textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} rows={2} /></div>
              <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button><Button onClick={handleSave} disabled={saving || !form.scheduled_at}>{saving ? 'שומר...' : editingItem ? 'עדכן' : 'צור פגישה'}</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
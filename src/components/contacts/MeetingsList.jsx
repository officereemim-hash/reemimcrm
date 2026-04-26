import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MeetingStatusBadge } from '@/components/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

const LOCATION_LABELS = {
  modiin: 'מודיעין',
  petah_tikva_wednesday: 'פתח תקווה (רביעי בלבד)',
  zoom: 'זום',
  phone: 'טלפון',
};

export default function MeetingsList({ contactId, meetings, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'intro_sale', location: 'zoom', scheduled_at: '', meeting_source: 'agent' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    await base44.entities.Meeting.create({ ...form, contact_id: contactId });
    setShowForm(false);
    onRefresh();
    setSaving(false);
  };

  const updateStatus = async (meeting, status) => {
    await base44.entities.Meeting.update(meeting.id, { status });
    onRefresh();
  };

  const sorted = [...meetings].sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">פגישות ({meetings.length})</h3>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
          <Plus size={14} />
          פגישה חדשה
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center text-muted-foreground py-10 text-sm">אין פגישות</div>
      ) : (
        sorted.map(m => (
          <Card key={m.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar size={15} className="text-primary" />
                  <span className="font-medium text-sm">
                    {m.scheduled_at ? format(new Date(m.scheduled_at), 'dd/MM/yyyy HH:mm') : '—'}
                  </span>
                </div>
                <MeetingStatusBadge status={m.status} />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin size={13} />
                {LOCATION_LABELS[m.location] || m.location}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {m.checklist_pre_completed ? (
                  <span className="text-success">✓ צ׳ק ליסט לפני</span>
                ) : (
                  <span className="text-coral">✗ צ׳ק ליסט לא הושלם</span>
                )}
                {m.reminder_d1_sent && <span className="text-muted-foreground">תזכורת D-1 נשלחה</span>}
              </div>
              {m.status === 'scheduled' && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => updateStatus(m, 'completed')}>התקיים</Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(m, 'no_show')}>לא הגיע</Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(m, 'cancelled')}>ביטול</Button>
                </div>
              )}
              {m.calendar_link && (
                <a href={m.calendar_link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                  קישור לפגישה
                </a>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>פגישה חדשה</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label>מועד הפגישה *</Label>
                <Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>סוג פגישה</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intro_sale">היכרות / מכירה</SelectItem>
                      <SelectItem value="advisory">ייעוץ</SelectItem>
                      <SelectItem value="annual_service">שירות שנתי</SelectItem>
                      <SelectItem value="zoom">זום</SelectItem>
                      <SelectItem value="followup">פולו-אפ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>מיקום</Label>
                  <Select value={form.location} onValueChange={v => setForm(f => ({ ...f, location: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zoom">זום</SelectItem>
                      <SelectItem value="modiin">מודיעין</SelectItem>
                      <SelectItem value="petah_tikva_wednesday">פתח תקווה (רביעי)</SelectItem>
                      <SelectItem value="phone">טלפון</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
                <Button onClick={handleCreate} disabled={saving || !form.scheduled_at}>{saving ? 'שומר...' : 'צור פגישה'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
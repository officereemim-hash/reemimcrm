import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TaskStatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';

export default function TaskCard({ contactId, tasks, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'followup', category: 'operational', priority: 'normal', assigned_to: 'bar', due_date: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    await base44.entities.Task.create({ ...form, contact_id: contactId });
    setShowForm(false);
    onRefresh();
    setSaving(false);
  };

  const markDone = async (task) => {
    await base44.entities.Task.update(task.id, { status: 'done', completed_at: new Date().toISOString().split('T')[0] });
    onRefresh();
  };

  const open = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">משימות ({open.length} פתוחות)</h3>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
          <Plus size={14} />
          משימה חדשה
        </Button>
      </div>

      {open.length === 0 && done.length === 0 && (
        <div className="text-center text-muted-foreground py-10 text-sm">אין משימות</div>
      )}

      {open.map(task => (
        <Card key={task.id} className={task.priority === 'urgent' ? 'border-coral/40 bg-coral/5' : ''}>
          <CardContent className="p-3 flex items-start gap-3">
            <button
              onClick={() => markDone(task)}
              className="mt-0.5 w-5 h-5 rounded border-2 border-muted-foreground hover:border-primary hover:bg-primary/10 transition-colors flex-shrink-0"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{task.title}</span>
                <TaskStatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {task.assigned_to && <span>מטופל/ת: {task.assigned_to}</span>}
                {task.due_date && <span>יעד: {format(new Date(task.due_date), 'dd/MM/yyyy')}</span>}
                {task.category && <span className="px-1.5 py-0.5 bg-muted rounded">{task.category === 'operational' ? 'תפעולי' : 'מכירות'}</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {done.length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">הושלמו ({done.length})</summary>
          <div className="mt-2 space-y-1">
            {done.map(t => (
              <div key={t.id} className="text-xs line-through px-3 py-1 bg-muted/50 rounded">{t.title}</div>
            ))}
          </div>
        </details>
      )}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>משימה חדשה</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label>כותרת *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>סוג</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="followup">פולו-אפ</SelectItem>
                      <SelectItem value="pre_meeting_checklist">צ׳ק ליסט לפני פגישה</SelectItem>
                      <SelectItem value="post_meeting_checklist">צ׳ק ליסט אחרי פגישה</SelectItem>
                      <SelectItem value="document_collection">איסוף מסמכים</SelectItem>
                      <SelectItem value="annual_followup">פולו-אפ שנתי</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>קטגוריה</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operational">תפעולי</SelectItem>
                      <SelectItem value="sales">מכירות</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>עדיפות</Label>
                  <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">נמוכה</SelectItem>
                      <SelectItem value="normal">רגילה</SelectItem>
                      <SelectItem value="high">גבוהה</SelectItem>
                      <SelectItem value="urgent">דחוף</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>משויך/ת ל</Label>
                  <Select value={form.assigned_to} onValueChange={v => setForm(f => ({ ...f, assigned_to: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bar">בר</SelectItem>
                      <SelectItem value="yael">יעל</SelectItem>
                      <SelectItem value="basmat">בשמת</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>תאריך יעד</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
                <Button onClick={handleCreate} disabled={saving || !form.title}>{saving ? 'שומר...' : 'צור משימה'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
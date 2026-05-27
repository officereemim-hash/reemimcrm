import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Check, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TaskStatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';

const STATUS_OPTIONS = [
  { value: 'open', label: 'פתוח' }, { value: 'in_progress', label: 'בביצוע' }, { value: 'done', label: 'הושלם' }, { value: 'cancelled', label: 'בוטל' },
];

export default function TaskCard({ contactId, tasks, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({ title: '', type: 'followup', category: 'operational', priority: 'normal', status: 'open', assigned_to: 'bar', due_date: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingItem(null);
    setForm({ title: '', type: 'followup', category: 'operational', priority: 'normal', status: 'open', assigned_to: 'bar', due_date: '', notes: '' });
    setShowForm(true);
  };

  const openEdit = (task) => {
    setEditingItem(task);
    setForm({
      title: task.title || '', type: task.type || 'followup', category: task.category || 'operational',
      priority: task.priority || 'normal', status: task.status || 'open', assigned_to: task.assigned_to || '',
      due_date: task.due_date || '', notes: task.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, completed_at: form.status === 'done' ? (editingItem?.completed_at || new Date().toISOString().split('T')[0]) : '' };
    if (editingItem) await base44.entities.Task.update(editingItem.id, data);
    else await base44.entities.Task.create({ ...data, contact_id: contactId });
    setShowForm(false);
    setEditingItem(null);
    setSelectedIds([]);
    onRefresh();
    setSaving(false);
  };

  const markDone = async (task) => {
    await base44.entities.Task.update(task.id, { status: 'done', completed_at: new Date().toISOString().split('T')[0] });
    onRefresh();
  };

  const deleteItem = async (task) => {
    if (!confirm(`למחוק את המשימה "${task.title}"?`)) return;
    await base44.entities.Task.delete(task.id);
    setSelectedIds(ids => ids.filter(id => id !== task.id));
    onRefresh();
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || !confirm(`למחוק ${selectedIds.length} משימות?`)) return;
    await Promise.all(selectedIds.map(id => base44.entities.Task.delete(id)));
    setSelectedIds([]);
    onRefresh();
  };

  const toggleSelected = (id) => setSelectedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  const open = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const done = tasks.filter(t => t.status === 'done');

  const renderTask = (task, compact = false) => (
    <Card key={task.id} className={task.priority === 'urgent' ? 'border-coral/40 bg-coral/5' : ''}>
      <CardContent className="p-3 flex items-start gap-3">
        <input type="checkbox" checked={selectedIds.includes(task.id)} onChange={() => toggleSelected(task.id)} className="mt-1" />
        {!compact && <button onClick={() => markDone(task)} className="mt-0.5 w-5 h-5 rounded border-2 border-muted-foreground hover:border-primary hover:bg-primary/10 transition-colors flex-shrink-0"><Check size={12} className="opacity-0" /></button>}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${compact ? 'line-through text-muted-foreground' : ''}`}>{task.title}</span>
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {task.assigned_to && <span>מטופל/ת: {task.assigned_to}</span>}
            {task.due_date && <span>יעד: {format(new Date(task.due_date), 'dd/MM/yyyy')}</span>}
            {task.category && <span className="px-1.5 py-0.5 bg-muted rounded">{task.category === 'operational' ? 'תפעולי' : 'מכירות'}</span>}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => openEdit(task)}><Edit size={14} /></Button>
        <Button size="icon" variant="ghost" onClick={() => deleteItem(task)} className="text-destructive"><Trash2 size={14} /></Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h3 className="font-semibold">משימות ({open.length} פתוחות)</h3>
        <div className="flex gap-2">
          {selectedIds.length > 0 && <Button size="sm" variant="destructive" onClick={deleteSelected}>מחיקת נבחרים ({selectedIds.length})</Button>}
          <Button size="sm" onClick={openCreate} className="gap-1"><Plus size={14} />משימה חדשה</Button>
        </div>
      </div>

      {open.length === 0 && done.length === 0 && <div className="text-center text-muted-foreground py-10 text-sm">אין משימות</div>}
      {open.map(task => renderTask(task))}
      {done.length > 0 && <details className="text-sm text-muted-foreground"><summary className="cursor-pointer hover:text-foreground">הושלמו ({done.length})</summary><div className="mt-2 space-y-2">{done.map(t => renderTask(t, true))}</div></details>}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editingItem ? 'עריכת משימה' : 'משימה חדשה'}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1"><Label>כותרת *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>סוג</Label><Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="followup">פולו-אפ</SelectItem><SelectItem value="pre_meeting_checklist">צ׳ק ליסט לפני פגישה</SelectItem><SelectItem value="post_meeting_checklist">צ׳ק ליסט אחרי פגישה</SelectItem><SelectItem value="document_collection">איסוף מסמכים</SelectItem><SelectItem value="annual_followup">פולו-אפ שנתי</SelectItem><SelectItem value="sla_followup">מעקב SLA</SelectItem><SelectItem value="no_response_escalation">הסלמה — חוסר מענה</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>קטגוריה</Label><Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="operational">תפעולי</SelectItem><SelectItem value="sales">מכירות</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>עדיפות</Label><Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">נמוכה</SelectItem><SelectItem value="normal">רגילה</SelectItem><SelectItem value="high">גבוהה</SelectItem><SelectItem value="urgent">דחוף</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>סטטוס</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="space-y-1"><Label>משויך/ת ל</Label><Input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} /></div>
              <div className="space-y-1"><Label>תאריך יעד</Label><Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
              <div className="space-y-1"><Label>הערות</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
              <div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button><Button onClick={handleSave} disabled={saving || !form.title}>{saving ? 'שומר...' : editingItem ? 'עדכן' : 'צור משימה'}</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
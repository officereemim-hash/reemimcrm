import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MeetingStatusBadge, TaskStatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import ViewToggle from '@/components/shared/ViewToggle';
import BulkDeleteBar from '@/components/shared/BulkDeleteBar';
import MeetingsTable from '@/components/meetings/MeetingsTable';
import TasksTable from '@/components/meetings/TasksTable';
import MeetingFormDialog from '@/components/meetings/MeetingFormDialog';
import TaskFormDialog from '@/components/meetings/TaskFormDialog';

const LOCATION_LABELS = { modiin: 'מודיעין', petah_tikva_wednesday: 'פ"ת', zoom: 'זום', phone: 'טלפון' };

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('meetings');
  const [viewMode, setViewMode] = useState('table');
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editMeeting, setEditMeeting] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteType, setDeleteType] = useState(null);
  const [selectedMeetings, setSelectedMeetings] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.Meeting.list('-scheduled_at', 200),
      base44.entities.Task.list('-created_date', 200),
      base44.entities.Contact.list(),
    ]).then(([m, t, c]) => {
      setMeetings(m); setTasks(t); setContacts(c); setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const getContact = id => contacts.find(c => c.id === id);

  const handleSaveMeeting = async (data) => {
    if (editMeeting) await base44.entities.Meeting.update(editMeeting.id, data);
    else await base44.entities.Meeting.create(data);
    setShowMeetingForm(false); setEditMeeting(null); load();
  };

  const handleSaveTask = async (data) => {
    if (editTask) await base44.entities.Task.update(editTask.id, data);
    else await base44.entities.Task.create(data);
    setShowTaskForm(false); setEditTask(null); load();
  };

  const handleMarkDone = async (task) => {
    await base44.entities.Task.update(task.id, { status: 'done', completed_at: new Date().toISOString().split('T')[0] });
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteType === 'meeting') await base44.entities.Meeting.delete(deleteTarget.id);
    else await base44.entities.Task.delete(deleteTarget.id);
    setDeleteTarget(null); setDeleteType(null); load();
  };

  const toggleId = (id, selected, setSelected) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAll = (items, selected, setSelected) => {
    setSelected(selected.length === items.length ? [] : items.map(i => i.id));
  };

  const handleBulkDelete = async (ids, entity, setSelected) => {
    setBulkDeleting(true);
    for (const id of ids) await entity.delete(id);
    setSelected([]);
    setBulkDeleting(false);
    load();
  };

  const todayMeetings = meetings.filter(m => m.scheduled_at && isToday(parseISO(m.scheduled_at)));
  const tomorrowMeetings = meetings.filter(m => m.scheduled_at && isTomorrow(parseISO(m.scheduled_at)));
  const upcomingMeetings = meetings.filter(m => {
    if (!m.scheduled_at) return false;
    const d = parseISO(m.scheduled_at);
    return !isToday(d) && !isTomorrow(d) && d > new Date() && m.status === 'scheduled';
  });
  const openTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">פגישות ומשימות</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
          {activeTab === 'meetings' && (
            <Button size="sm" className="gap-2" onClick={() => { setEditMeeting(null); setShowMeetingForm(true); }}>
              <Plus size={16} />פגישה חדשה
            </Button>
          )}
          {activeTab === 'tasks' && (
            <Button size="sm" className="gap-2" onClick={() => { setEditTask(null); setShowTaskForm(true); }}>
              <Plus size={16} />משימה חדשה
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-border pb-0">
        {[{ key: 'meetings', label: `פגישות (${meetings.length})` }, { key: 'tasks', label: `משימות (${openTasks.length} פתוחות)` }].map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedMeetings([]); setSelectedTasks([]); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >{tab.label}</button>
        ))}
      </div>

      {activeTab === 'meetings' && (
        <BulkDeleteBar count={selectedMeetings.length} label="פגישות" deleting={bulkDeleting}
          onDelete={() => handleBulkDelete(selectedMeetings, base44.entities.Meeting, setSelectedMeetings)} />
      )}
      {activeTab === 'tasks' && (
        <BulkDeleteBar count={selectedTasks.length} label="משימות" deleting={bulkDeleting}
          onDelete={() => handleBulkDelete(selectedTasks, base44.entities.Task, setSelectedTasks)} />
      )}

      {activeTab === 'meetings' && viewMode === 'table' && (
        <MeetingsTable meetings={meetings} contacts={contacts}
          onEdit={m => { setEditMeeting(m); setShowMeetingForm(true); }}
          onDelete={m => { setDeleteTarget(m); setDeleteType('meeting'); }}
          selectedIds={selectedMeetings}
          onToggle={id => toggleId(id, selectedMeetings, setSelectedMeetings)}
          onToggleAll={items => toggleAll(items, selectedMeetings, setSelectedMeetings)}
        />
      )}

      {activeTab === 'meetings' && viewMode === 'cards' && (
        <div className="space-y-6">
          <MeetingCardGroup title="היום" meetings={todayMeetings} getContact={getContact}
            onEdit={m => { setEditMeeting(m); setShowMeetingForm(true); }} onDelete={m => { setDeleteTarget(m); setDeleteType('meeting'); }} />
          <MeetingCardGroup title="מחר" meetings={tomorrowMeetings} getContact={getContact}
            onEdit={m => { setEditMeeting(m); setShowMeetingForm(true); }} onDelete={m => { setDeleteTarget(m); setDeleteType('meeting'); }} />
          <MeetingCardGroup title="קרובות" meetings={upcomingMeetings.slice(0, 20)} getContact={getContact}
            onEdit={m => { setEditMeeting(m); setShowMeetingForm(true); }} onDelete={m => { setDeleteTarget(m); setDeleteType('meeting'); }} />
          {todayMeetings.length === 0 && tomorrowMeetings.length === 0 && upcomingMeetings.length === 0 && (
            <div className="text-center text-muted-foreground py-16">אין פגישות קרובות</div>
          )}
        </div>
      )}

      {activeTab === 'tasks' && viewMode === 'table' && (
        <TasksTable tasks={tasks} contacts={contacts}
          onEdit={t => { setEditTask(t); setShowTaskForm(true); }}
          onDelete={t => { setDeleteTarget(t); setDeleteType('task'); }}
          onMarkDone={handleMarkDone}
          selectedIds={selectedTasks}
          onToggle={id => toggleId(id, selectedTasks, setSelectedTasks)}
          onToggleAll={items => toggleAll(items, selectedTasks, setSelectedTasks)}
        />
      )}

      {activeTab === 'tasks' && viewMode === 'cards' && (
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">אין משימות</div>
          ) : tasks.map(task => (
            <TaskCardItem key={task.id} task={task} getContact={getContact}
              onEdit={() => { setEditTask(task); setShowTaskForm(true); }}
              onDelete={() => { setDeleteTarget(task); setDeleteType('task'); }}
              onMarkDone={() => handleMarkDone(task)} />
          ))}
        </div>
      )}

      <MeetingFormDialog open={showMeetingForm} onClose={() => { setShowMeetingForm(false); setEditMeeting(null); }}
        onSave={handleSaveMeeting} contacts={contacts} editItem={editMeeting} />
      <TaskFormDialog open={showTaskForm} onClose={() => { setShowTaskForm(false); setEditTask(null); }}
        onSave={handleSaveTask} contacts={contacts} editItem={editTask} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteType(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת {deleteType === 'meeting' ? 'פגישה' : 'משימה'}</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MeetingCardGroup({ title, meetings, getContact, onEdit, onDelete }) {
  if (meetings.length === 0) return null;
  return (
    <div>
      <h3 className="font-semibold mb-3 text-muted-foreground text-sm">{title} ({meetings.length})</h3>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {meetings.map(m => {
          const contact = getContact(m.contact_id);
          return (
            <Card key={m.id} className="hover:shadow-md transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-bold text-primary">{m.scheduled_at ? format(parseISO(m.scheduled_at), 'HH:mm') : '—'}</div>
                    <div className="text-xs text-muted-foreground">{m.scheduled_at ? format(parseISO(m.scheduled_at), 'dd/MM/yyyy') : ''}</div>
                  </div>
                  <MeetingStatusBadge status={m.status} />
                </div>
                <Link to={`/contacts/${m.contact_id}`} className="font-semibold text-sm mt-2 block hover:text-primary">{contact?.full_name || '—'}</Link>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <MapPin size={12} />{LOCATION_LABELS[m.location] || m.location}
                </div>
                <div className="flex gap-1 mt-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onEdit(m)}>עריכה</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => onDelete(m)}>מחיקה</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function TaskCardItem({ task, getContact, onEdit, onDelete, onMarkDone }) {
  const contact = getContact(task.contact_id);
  return (
    <Card className={task.status === 'done' ? 'opacity-50' : ''}>
      <CardContent className="p-3 flex items-start gap-3">
        {task.status !== 'done' && (
          <button onClick={onMarkDone}
            className="mt-0.5 w-5 h-5 rounded border-2 border-muted-foreground hover:border-primary hover:bg-primary/10 transition-colors flex-shrink-0" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{task.title}</span>
            <PriorityBadge priority={task.priority} />
            <TaskStatusBadge status={task.status} />
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex gap-2 flex-wrap">
            {contact && <Link to={`/contacts/${task.contact_id}`} className="text-primary hover:underline">{contact.full_name}</Link>}
            {task.assigned_to && <span>→ {task.assigned_to}</span>}
            {task.due_date && <span>יעד: {format(new Date(task.due_date), 'dd/MM/yy')}</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>✏️</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>🗑️</Button>
        </div>
      </CardContent>
    </Card>
  );
}
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, CheckSquare, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MeetingStatusBadge, TaskStatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

const LOCATION_LABELS = {
  modiin: 'מודיעין',
  petah_tikva_wednesday: 'פתח תקווה',
  zoom: 'זום',
  phone: 'טלפון',
};

const VIEW_TABS = [
  { key: 'meetings', label: 'פגישות' },
  { key: 'tasks', label: 'משימות' },
];

export default function Meetings() {
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('meetings');

  useEffect(() => {
    Promise.all([
      base44.entities.Meeting.list('-scheduled_at', 200),
      base44.entities.Task.list('-created_date', 200),
      base44.entities.Contact.list(),
    ]).then(([m, t, c]) => {
      setMeetings(m);
      setTasks(t);
      setContacts(c);
      setLoading(false);
    });
  }, []);

  const getContact = id => contacts.find(c => c.id === id);

  const updateTaskStatus = async (task, status) => {
    await base44.entities.Task.update(task.id, { status, completed_at: status === 'done' ? new Date().toISOString().split('T')[0] : undefined });
    const updated = await base44.entities.Task.list('-created_date', 200);
    setTasks(updated);
  };

  const today = meetings.filter(m => m.scheduled_at && isToday(parseISO(m.scheduled_at)));
  const tomorrow = meetings.filter(m => m.scheduled_at && isTomorrow(parseISO(m.scheduled_at)));
  const upcoming = meetings.filter(m => {
    if (!m.scheduled_at) return false;
    const d = parseISO(m.scheduled_at);
    return !isToday(d) && !isTomorrow(d) && d > new Date() && m.status === 'scheduled';
  });

  const openTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const urgentTasks = openTasks.filter(t => ['high', 'urgent'].includes(t.priority));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">פגישות ומשימות</h1>

      <div className="flex gap-2 border-b border-border pb-0">
        {VIEW_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key ? 'bg-[#D4A843] text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'meetings' && (
        <div className="space-y-6">
          <MeetingGroup title="היום" meetings={today} getContact={getContact} />
          <MeetingGroup title="מחר" meetings={tomorrow} getContact={getContact} />
          <MeetingGroup title="הבא" meetings={upcoming.slice(0, 20)} getContact={getContact} />
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {urgentTasks.length > 0 && (
            <div>
              <h3 className="font-semibold text-coral mb-2">🔴 דחוף ({urgentTasks.length})</h3>
              <div className="space-y-2">
                {urgentTasks.map(task => (
                  <TaskRow key={task.id} task={task} getContact={getContact} onUpdate={updateTaskStatus} />
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="font-semibold mb-2">משימות פתוחות ({openTasks.length})</h3>
            <div className="space-y-2">
              {openTasks.filter(t => !['high', 'urgent'].includes(t.priority)).map(task => (
                <TaskRow key={task.id} task={task} getContact={getContact} onUpdate={updateTaskStatus} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingGroup({ title, meetings, getContact }) {
  if (meetings.length === 0) return null;
  return (
    <div>
      <h3 className="font-semibold mb-3 text-muted-foreground text-sm uppercase tracking-wide">{title} ({meetings.length})</h3>
      <div className="space-y-2">
        {meetings.map(m => {
          const contact = getContact(m.contact_id);
          return (
            <Link key={m.id} to={`/contacts/${m.contact_id}`}>
              <Card className="hover:shadow-md transition-all hover:border-primary/30 cursor-pointer">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="text-center flex-shrink-0 w-14">
                    <div className="text-xl font-bold text-primary">
                      {m.scheduled_at ? format(parseISO(m.scheduled_at), 'HH:mm') : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.scheduled_at ? format(parseISO(m.scheduled_at), 'dd/MM') : ''}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{contact?.full_name || '—'}</span>
                      <MeetingStatusBadge status={m.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <MapPin size={13} />
                      {LOCATION_LABELS[m.location] || m.location}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs">
                    {m.checklist_pre_completed ? (
                      <span className="text-success">✓ צ׳ק ליסט</span>
                    ) : (
                      <span className="text-coral">✗ צ׳ק ליסט</span>
                    )}
                    {m.reminder_d1_sent && <span className="text-muted-foreground">תזכורת ✓</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function TaskRow({ task, getContact, onUpdate }) {
  const contact = getContact(task.contact_id);
  return (
    <Card>
      <CardContent className="p-3 flex items-start gap-3">
        <button
          onClick={() => onUpdate(task, 'done')}
          className="mt-0.5 w-5 h-5 rounded border-2 border-muted-foreground hover:border-primary hover:bg-primary/10 transition-colors flex-shrink-0"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{task.title}</span>
            <PriorityBadge priority={task.priority} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {contact && <Link to={`/contacts/${task.contact_id}`} className="text-primary hover:underline">{contact.full_name}</Link>}
            {task.assigned_to && <span className="mr-2">→ {task.assigned_to}</span>}
            {task.due_date && <span className="mr-2">יעד: {format(new Date(task.due_date), 'dd/MM/yyyy')}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
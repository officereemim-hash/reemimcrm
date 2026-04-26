import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Users, Calendar, CheckSquare, AlertTriangle, TrendingUp, Phone, Bell, FileX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, isToday, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

export default function Dashboard() {
  const [contacts, setContacts] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Contact.list(),
      base44.entities.Meeting.list(),
      base44.entities.Task.list(),
      base44.entities.Communication.list(),
    ]).then(([c, m, t, comm]) => {
      setContacts(c);
      setMeetings(m);
      setTasks(t);
      setCommunications(comm);
      setLoading(false);
    });
  }, []);

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const newLeadsToday = contacts.filter(c => c.created_date?.startsWith(todayStr)).length;
  const todayMeetings = meetings.filter(m => m.scheduled_at?.startsWith(todayStr)).length;
  const openTasks = tasks.filter(t => ['open', 'in_progress'].includes(t.status)).length;
  const noResponse = contacts.filter(c => c.bot_status === 'no_response').length;
  const activeClients = contacts.filter(c => c.status === 'active_client').length;
  const inProgress = contacts.filter(c => c.status === 'in_progress').length;
  const quoteSent = contacts.filter(c => c.status === 'quote_sent').length;
  const conversionRate = (inProgress + quoteSent) > 0
    ? Math.round((activeClients / (inProgress + quoteSent + activeClients)) * 100)
    : 0;

  const birthdayContacts = contacts.filter(c => {
    if (!c.birth_date) return false;
    const bd = parseISO(c.birth_date);
    return bd.getDate() === today.getDate() && bd.getMonth() === today.getMonth();
  });

  const systemErrors = communications.filter(c => c.type === 'system_error' && c.created_date > new Date(Date.now() - 7*24*60*60*1000).toISOString()).length;
  const urgentTasks = tasks.filter(t => ['high','urgent'].includes(t.priority) && t.status === 'open').length;

  const kpis = [
    { label: 'לידים חדשים היום', value: newLeadsToday, icon: Users, color: 'bg-primary/10 text-primary' },
    { label: 'פגישות היום', value: todayMeetings, icon: Calendar, color: 'bg-gold/20 text-gold' },
    { label: 'משימות פתוחות', value: openTasks, icon: CheckSquare, color: 'bg-accent/20 text-accent-foreground' },
    { label: 'ללא מענה', value: noResponse, icon: Phone, color: 'bg-coral/20 text-coral' },
    { label: 'לקוחות פעילים', value: activeClients, icon: TrendingUp, color: 'bg-success/10 text-success' },
    { label: 'משימות דחופות', value: urgentTasks, icon: AlertTriangle, color: 'bg-destructive/10 text-destructive' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דשבורד</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {format(today, 'EEEE, d בMMMM yyyy', { locale: he })}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {(noResponse > 0 || systemErrors > 0 || urgentTasks > 0) && (
        <div className="space-y-2">
          {noResponse > 0 && (
            <div className="flex items-center gap-3 bg-[#FDECEA] border-r-4 border-[#E07B6B] rounded-lg px-4 py-3">
              <AlertTriangle size={18} className="text-coral flex-shrink-0" />
              <span className="text-sm font-medium text-foreground">
                {noResponse} לידים ללא מענה מעל 48 שעות
              </span>
              <Link to="/contacts?filter=no_response" className="mr-auto text-sm text-primary font-semibold hover:underline">
                צפה במשימות
              </Link>
            </div>
          )}
          {systemErrors > 0 && (
            <div className="flex items-center gap-3 bg-[#FDECEA] border-r-4 border-red-500 rounded-lg px-4 py-3">
              <FileX size={18} className="text-destructive flex-shrink-0" />
              <span className="text-sm font-medium text-foreground">
                {systemErrors} שגיאות אוטומציה השבוע
              </span>
              <Link to="/communications?filter=system_error" className="mr-auto text-sm text-primary font-semibold hover:underline">
                צפה בשגיאות
              </Link>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${kpi.color}`}>
                <kpi.icon size={20} />
              </div>
              <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-tight">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline & Birthday */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Pipeline */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Pipeline — מצב לידים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PipelineBar label="לידים חדשים" value={contacts.filter(c => c.status === 'new_lead').length} color="bg-[#EDE8F5]" textColor="text-[#4A2C78]" />
            <PipelineBar label="בטיפול" value={inProgress} color="bg-[#E8EEF8]" textColor="text-[#2952A3]" />
            <PipelineBar label="הצעה נשלחה" value={quoteSent} color="bg-[#F8F0DC]" textColor="text-[#A87B20]" />
            <PipelineBar label="לקוח פעיל" value={activeClients} color="bg-[#DCF0E8]" textColor="text-[#2E7A4A]" />
            <div className="pt-2 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">שיעור המרה כולל</span>
                <span className="text-lg font-bold text-primary">{conversionRate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Birthdays */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">🎂 ימי הולדת היום</CardTitle>
          </CardHeader>
          <CardContent>
            {birthdayContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין ימי הולדת היום</p>
            ) : (
              <div className="space-y-2">
                {birthdayContacts.map(c => (
                  <Link key={c.id} to={`/contacts/${c.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-sm font-bold text-gold">
                      {c.full_name?.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{c.full_name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's meetings */}
      {todayMeetings > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">📅 פגישות היום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {meetings.filter(m => m.scheduled_at?.startsWith(todayStr)).map(m => {
                const contact = contacts.find(c => c.id === m.contact_id);
                return (
                  <div key={m.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="text-sm font-bold text-primary w-14 text-center">
                      {m.scheduled_at ? format(parseISO(m.scheduled_at), 'HH:mm') : '—'}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{contact?.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{LOCATION_LABELS[m.location] || m.location}</div>
                    </div>
                    {!m.checklist_pre_completed && (
                      <span className="text-xs text-coral bg-coral/10 px-2 py-1 rounded-full">ללא צ׳ק ליסט</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const LOCATION_LABELS = {
  modiin: 'מודיעין',
  petah_tikva_wednesday: 'פתח תקווה',
  zoom: 'זום',
  phone: 'טלפון',
};

function PipelineBar({ label, value, color, textColor }) {
  const max = 100;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-sm text-muted-foreground text-right">{label}</div>
      <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.max(5, Math.min(100, value * 10))}%` }}
        />
      </div>
      <div className={`text-sm font-bold w-8 text-left ${textColor}`}>{value}</div>
    </div>
  );
}
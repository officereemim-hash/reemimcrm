import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Video, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

const TYPE_LABELS = { investments: 'השקעות', divorce: 'גירושין / איזון', retirement: 'פרישה' };

export default function Webinars() {
  const [registrations, setRegistrations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      base44.entities.WebinarRegistration.list('-created_date', 300),
      base44.entities.Contact.list(),
    ]).then(([regs, cs]) => {
      setRegistrations(regs);
      setContacts(cs);
      setLoading(false);
    });
  }, []);

  const getContact = id => contacts.find(c => c.id === id);

  const filtered = registrations.filter(r => filter === 'all' || r.webinar_type === filter);

  const stats = {
    total: registrations.length,
    attended: registrations.filter(r => r.attended).length,
    paid: registrations.filter(r => r.payment_completed).length,
    meeting: registrations.filter(r => r.meeting_scheduled).length,
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">וובינרים</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'נרשמו', value: stats.total, color: 'text-primary' },
          { label: 'השתתפו', value: stats.attended, color: 'text-gold' },
          { label: 'שילמו', value: stats.paid, color: 'text-success' },
          { label: 'קבעו פגישה', value: stats.meeting, color: 'text-primary' },
        ].map(s => (
          <Card key={s.label} className="text-center">
            <CardContent className="py-4">
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
              {stats.total > 0 && <div className="text-xs text-muted-foreground">{Math.round(s.value / stats.total * 100)}%</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[{ key: 'all', label: 'הכל' }, ...Object.entries(TYPE_LABELS).map(([k, v]) => ({ key: k, label: v }))].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filter === tab.key ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map(reg => {
          const contact = getContact(reg.contact_id);
          return (
            <Card key={reg.id} className="hover:shadow-md transition-all">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                  <Video size={18} className="text-gold" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/contacts/${reg.contact_id}`} className="font-semibold text-sm hover:text-primary">
                      {contact?.full_name || reg.contact_id}
                    </Link>
                    <span className="text-xs bg-gold/20 text-gold px-2 py-0.5 rounded-full">
                      {TYPE_LABELS[reg.webinar_type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    {reg.webinar_date && <span>{format(new Date(reg.webinar_date), 'dd/MM/yyyy')}</span>}
                    {contact?.phone && <span>{contact.phone}</span>}
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <StatusDot active={reg.attended} label="השתתף" />
                  <StatusDot active={reg.payment_completed} label="שילם" />
                  <StatusDot active={reg.meeting_scheduled} label="פגישה" />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-16">אין רשומות</div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ active, label }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 ${active ? 'text-success' : 'text-muted-foreground'}`}>
      {active ? <Check size={14} /> : <X size={14} />}
      <span>{label}</span>
    </div>
  );
}
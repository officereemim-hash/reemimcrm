import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { SRStatusBadge, SERVICE_TYPE_LABELS } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { format } from 'date-fns';

const SR_STATUS_COLUMNS = [
  { key: 'new_inprogress', label: 'בטיפול', statuses: ['new', 'in_progress'] },
  { key: 'quote', label: 'הצעת מחיר', statuses: ['quote_sent', 'awaiting_client_decision'] },
  { key: 'followup', label: 'פולו-אפ', statuses: ['followup_active'] },
  { key: 'meeting', label: 'פגישה נקבעה', statuses: ['meeting_scheduled'] },
  { key: 'done', label: 'הושלם', statuses: ['completed', 'cancelled', 'followup_closed', 'closed_lost'] },
];

export default function ServiceRequests() {
  const [requests, setRequests] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'kanban'

  useEffect(() => {
    Promise.all([
      base44.entities.ServiceRequest.list('-updated_date', 200),
      base44.entities.Contact.list(),
    ]).then(([srs, cs]) => {
      setRequests(srs);
      setContacts(cs);
      setLoading(false);
    });
  }, []);

  const getContact = (id) => contacts.find(c => c.id === id);

  const filtered = requests.filter(r => {
    if (!search) return true;
    const c = getContact(r.contact_id);
    return c?.full_name?.includes(search) || c?.phone?.includes(search);
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">פניות שירות</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{requests.length} פניות במערכת</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${viewMode === 'list' ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}
          >
            רשימה
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${viewMode === 'kanban' ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}
          >
            קאנבן
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="חיפוש לפי שם לקוח..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-2">
          {filtered.map(req => {
            const contact = getContact(req.contact_id);
            return (
              <Link key={req.id} to={`/contacts/${req.contact_id}`}>
                <Card className="hover:shadow-md transition-all hover:border-primary/30 cursor-pointer">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{contact?.full_name || req.contact_id}</span>
                        <SRStatusBadge status={req.status} />
                        <span className="text-xs text-muted-foreground">{SERVICE_TYPE_LABELS[req.service_type]}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                        {req.quote_sent && <span>✓ הצעה נשלחה</span>}
                        {req.followup_stage !== 'none' && req.followup_stage && <span>פולו-אפ: {req.followup_stage}</span>}
                        {req.updated_date && <span>עדכון: {format(new Date(req.updated_date), 'dd/MM/yyyy')}</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {SR_STATUS_COLUMNS.map(col => {
            const items = filtered.filter(r => col.statuses.includes(r.status));
            return (
              <div key={col.key} className="flex-shrink-0 w-64">
                <div className="bg-muted rounded-t-lg px-3 py-2 font-semibold text-sm flex items-center justify-between">
                  <span>{col.label}</span>
                  <span className="bg-white rounded-full px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="bg-muted/20 rounded-b-lg min-h-[300px] p-2 space-y-2">
                  {items.map(r => {
                    const c = getContact(r.contact_id);
                    return (
                      <Link key={r.id} to={`/contacts/${r.contact_id}`}>
                        <div className="bg-white rounded-lg p-2.5 shadow-sm hover:shadow-md transition-all border text-sm">
                          <div className="font-medium truncate">{c?.full_name || '—'}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{SERVICE_TYPE_LABELS[r.service_type]}</div>
                          <div className="mt-1"><SRStatusBadge status={r.status} /></div>
                        </div>
                      </Link>
                    );
                  })}
                  {items.length === 0 && <div className="text-center text-muted-foreground text-xs py-6">ריק</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
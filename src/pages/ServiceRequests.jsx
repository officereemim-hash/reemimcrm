import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { SRStatusBadge, SERVICE_TYPE_LABELS } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ViewToggle from '@/components/shared/ViewToggle';
import ServiceRequestTable from '@/components/service-requests/ServiceRequestTable';
import ServiceRequestCard from '@/components/service-requests/ServiceRequestCard';
import ServiceRequestFormDialog from '@/components/service-requests/ServiceRequestFormDialog';

const SR_STATUS_COLUMNS = [
  { key: 'new_inprogress', label: 'פניות חדשות', statuses: ['new', 'in_progress'] },
  { key: 'quote', label: 'הצעות ומעקב', statuses: ['quote_sent', 'awaiting_client_decision'] },
  { key: 'followup', label: 'פולו-אפ', statuses: ['followup_active'] },
  { key: 'meeting', label: 'הכנה לפגישה', statuses: ['meeting_scheduled'] },
  { key: 'done', label: 'סגירה וסיום', statuses: ['completed', 'cancelled', 'followup_closed', 'closed_lost'] },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'כל הסטטוסים' },
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

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'כל סוגי השירות' },
  ...Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

export default function ServiceRequests() {
  const [requests, setRequests] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.ServiceRequest.list('-updated_date', 200),
      base44.entities.Contact.list(),
    ]).then(([srs, cs]) => {
      setRequests(srs);
      setContacts(cs);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const getContact = (id) => contacts.find(c => c.id === id);

  const filtered = requests.filter(r => {
    const matchSearch = !search || (() => {
      const c = getContact(r.contact_id);
      return c?.full_name?.includes(search) || c?.phone?.includes(search);
    })();
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchType = typeFilter === 'all' || r.service_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const handleSave = async (formData) => {
    if (editItem) {
      await base44.entities.ServiceRequest.update(editItem.id, formData);
    } else {
      await base44.entities.ServiceRequest.create(formData);
    }
    setShowForm(false);
    setEditItem(null);
    load();
  };

  const handleEdit = (req) => {
    setEditItem(req);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await base44.entities.ServiceRequest.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
    }
  };

  const handleStatusChange = async (req, newStatus) => {
    await base44.entities.ServiceRequest.update(req.id, { status: newStatus });
    load();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">פניות שירות</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{requests.length} פניות במערכת</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <ViewToggle view={viewMode} onViewChange={setViewMode} showKanban />
          <Button onClick={() => { setEditItem(null); setShowForm(true); }} className="gap-2" size="sm">
            <Plus size={16} />
            פנייה חדשה
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="חיפוש לפי שם / טלפון..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPE_FILTER_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {viewMode === 'table' && (
        <ServiceRequestTable
          requests={filtered}
          contacts={contacts}
          onEdit={handleEdit}
          onDelete={setDeleteTarget}
          onStatusChange={handleStatusChange}
        />
      )}

      {viewMode === 'cards' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center text-muted-foreground py-16">אין פניות</div>
          ) : (
            filtered.map(req => (
              <ServiceRequestCard
                key={req.id}
                request={req}
                contact={getContact(req.contact_id)}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
              />
            ))
          )}
        </div>
      )}

      {viewMode === 'kanban' && (
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

      {/* Form Dialog */}
      <ServiceRequestFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditItem(null); }}
        onSave={handleSave}
        contacts={contacts}
        editItem={editItem}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פנייה</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את הפנייה? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
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
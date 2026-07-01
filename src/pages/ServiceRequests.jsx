import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { SRStatusBadge, SERVICE_TYPE_LABELS } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import ViewToggle from '@/components/shared/ViewToggle';
import ServiceRequestTable from '@/components/service-requests/ServiceRequestTable';
import ServiceRequestCard from '@/components/service-requests/ServiceRequestCard';
import ServiceRequestFormDialog from '@/components/service-requests/ServiceRequestFormDialog';
import { handleBotMessage } from '@/lib/sendBotMessage';
import StatCard from '@/components/shared/StatCard';
import { FileText, Clock, CalendarCheck, Users, XCircle } from 'lucide-react';

const SR_STATUS_COLUMNS = [
  { key: 'new_inprogress', label: 'פניות חדשות', statuses: ['new', 'in_progress'] },
  { key: 'quote', label: 'הצעות ומעקב', statuses: ['quote_sent', 'awaiting_client_decision', 'interested'] },
  { key: 'followup', label: 'פולו-אפ', statuses: ['followup_active'] },
  { key: 'meeting', label: 'הכנה לפגישה', statuses: ['meeting_scheduled', 'meeting_scheduled_frontal', 'meeting_scheduled_zoom', 'phone_meeting'] },
  { key: 'done', label: 'סגירה וסיום', statuses: ['completed', 'cancelled', 'followup_closed', 'closed_lost'] },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'כל הסטטוסים' },
  { value: 'new', label: 'חדש' },
  { value: 'in_progress', label: 'בטיפול' },
  { value: 'quote_sent', label: 'הצעה נשלחה' },
  { value: 'interested', label: 'מעוניין' },
  { value: 'awaiting_client_decision', label: 'ממתין להחלטה' },
  { value: 'followup_active', label: 'פולו-אפ פעיל' },
  { value: 'phone_meeting', label: 'נקבעה שיחה טלפונית' },
  { value: 'meeting_scheduled', label: 'פגישה נקבעה' },
  { value: 'meeting_scheduled_frontal', label: 'נקבעה פגישה פרונטאלית' },
  { value: 'meeting_scheduled_zoom', label: 'נקבעה פגישת זום' },
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
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Sync filter from URL reactively
  const urlFilter = searchParams.get('filter');
  useEffect(() => {
    if (urlFilter) setStatusFilter(urlFilter);
    else setStatusFilter('all');
  }, [urlFilter]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => base44.entities.ServiceRequest.list('-updated_date', 200),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 500),
  });

  const getContact = (id) => contacts.find(c => c.id === id);

  const filtered = requests.filter(r => {
    const matchSearch = !search || (() => {
      const c = getContact(r.contact_id);
      return c?.full_name?.includes(search) || c?.phone?.includes(search) || (r.contact_name || '').includes(search) || (r.contact_phone || '').includes(search);
    })();
    const matchStatus = statusFilter === 'all' || r.status === statusFilter || (statusFilter === 'meeting_scheduled' && ['meeting_scheduled','meeting_scheduled_frontal','meeting_scheduled_zoom'].includes(r.status));
    const matchType = typeFilter === 'all' || r.service_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const saveMutation = useMutation({
    mutationFn: async (formData) => {
      if (editItem) {
        const oldStatus = editItem.status;
        await base44.entities.ServiceRequest.update(editItem.id, formData);
        if (formData.status && formData.status !== oldStatus) {
          await base44.entities.ServiceRequestTimeline.create({
            service_request_id: editItem.id, event_type: 'status_change', description: 'סטטוס שונה', old_value: oldStatus, new_value: formData.status,
          });
        }
        return { id: editItem.id, statusChanged: formData.status && formData.status !== oldStatus };
      } else {
        const contact = contacts.find(c => c.id === formData.contact_id);
        const result = await base44.entities.ServiceRequest.create({ ...formData, contact_name: contact?.full_name || '', contact_phone: contact?.phone || '' });
        await base44.entities.ServiceRequestTimeline.create({ service_request_id: result.id, event_type: 'status_change', description: 'פנייה חדשה נוצרה', new_value: formData.status || 'new' });
        return { id: result.id, statusChanged: false };
      }
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['service-requests'] });
      setShowForm(false);
      setEditItem(null);
      toast.success(editItem ? 'עודכן' : 'פנייה נוצרה');
      if (result?.statusChanged) {
        try {
          const sent = await handleBotMessage(result.id);
          if (sent) toast.success(`הודעת ${sent.trigger} נשלחה`);
        } catch (err) { console.warn('Bot message failed:', err.message); }
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceRequest.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-requests'] }); toast.success('נמחק'); },
  });

  const statusChangeMutation = useMutation({
    mutationFn: async ({ req, newStatus }) => {
      const oldStatus = req.status;
      await base44.entities.ServiceRequest.update(req.id, { status: newStatus });
      await base44.entities.ServiceRequestTimeline.create({
        service_request_id: req.id, event_type: 'status_change', description: 'סטטוס שונה', old_value: oldStatus, new_value: newStatus,
      });
      return { id: req.id, statusChanged: true };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['service-requests'] });
      toast.success('סטטוס עודכן');
      try {
        const sent = await handleBotMessage(result.id);
        if (sent) toast.success(`הודעת ${sent.trigger} נשלחה`);
      } catch (err) { console.warn('Bot message failed:', err.message); }
    },
  });

  const handleSave = (formData) => saveMutation.mutate(formData);

  const handleEdit = (req) => {
    setEditItem(req);
    setShowForm(true);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleStatusChange = (req, newStatus) => {
    statusChangeMutation.mutate({ req, newStatus });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">פניות שירות</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{requests.length} פניות במערכת</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap w-full md:w-auto">
          <ViewToggle view={viewMode} onViewChange={setViewMode} showKanban />
          <Button onClick={() => { setEditItem(null); setShowForm(true); }} className="gap-2" size="sm">
            <Plus size={16} />
            פנייה חדשה
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="חדשות" value={requests.filter(r => r.status === 'new').length} icon={FileText} color="bg-[#EDE8F5] text-[#4A2C78]"
          to="/service-requests?filter=new" />
        <StatCard label="בטיפול" value={requests.filter(r => r.status === 'in_progress').length} icon={Clock} color="bg-[#E8EEF8] text-[#2952A3]"
          to="/service-requests?filter=in_progress" />
        <StatCard label="הצעה נשלחה" value={requests.filter(r => r.status === 'quote_sent').length} icon={FileText} color="bg-[#F8F0DC] text-[#A87B20]"
          to="/service-requests?filter=quote_sent" />
        <StatCard label="פגישה נקבעה" value={requests.filter(r => ['meeting_scheduled','meeting_scheduled_frontal','meeting_scheduled_zoom'].includes(r.status)).length} icon={CalendarCheck} color="bg-success/10 text-success"
          to="/service-requests?filter=meeting_scheduled" />
        <StatCard label="הושלמו" value={requests.filter(r => r.status === 'completed').length} icon={Users} color="bg-muted text-muted-foreground"
          to="/service-requests?filter=completed" />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,360px)_160px_160px] gap-3 items-end justify-end">
        <div className="w-full">
          <label className="text-xs text-muted-foreground mb-1 block text-right">חיפוש</label>
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="חיפוש לפי שם / טלפון..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 text-right" />
          </div>
        </div>
        <div className="w-full">
          <label className="text-xs text-muted-foreground mb-1 block text-right">סטטוס</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full">
          <label className="text-xs text-muted-foreground mb-1 block text-right">סוג שירות</label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_FILTER_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
                      <Link key={r.id} to={`/service-requests/${r.id}`}>
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
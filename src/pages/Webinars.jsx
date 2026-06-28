import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Video, Check, X, Plus, Gift, Loader2, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import ViewToggle from '@/components/shared/ViewToggle';
import StatCard from '@/components/shared/StatCard';
import WebinarTable from '@/components/webinars/WebinarTable';
import WebinarFormDialog from '@/components/webinars/WebinarFormDialog';
import BulkActionsBar from '@/components/webinars/BulkActionsBar';

const TYPE_LABELS = { investments: 'השקעות', divorce: 'גירושין / איזון', retirement: 'פרישה' };

export default function Webinars() {
  const [registrations, setRegistrations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sendingCoupon, setSendingCoupon] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.WebinarRegistration.list('-created_date', 300),
      base44.entities.Contact.list(),
    ]).then(([regs, cs]) => {
      setRegistrations(regs);
      setContacts(cs);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const getContact = id => contacts.find(c => c.id === id);
  const filtered = registrations.filter(r => filter === 'all' || r.webinar_type === filter);

  // Unique webinars by type+date for dropdown
  const uniqueWebinars = useMemo(() => {
    const map = new Map();
    registrations.forEach(r => {
      const dateStr = r.webinar_date ? r.webinar_date.substring(0, 10) : '';
      const key = `${r.webinar_type}|${dateStr}`;
      if (!map.has(key)) {
        map.set(key, { webinar_type: r.webinar_type, webinar_date: dateStr, count: 0 });
      }
      map.get(key).count++;
    });
    return Array.from(map.values()).sort((a, b) => b.webinar_date.localeCompare(a.webinar_date));
  }, [registrations]);

  const stats = {
    total: registrations.length,
    attended: registrations.filter(r => r.attended).length,
    paid: registrations.filter(r => r.payment_completed).length,
    meeting: registrations.filter(r => r.meeting_scheduled).length,
  };

  const handleSave = async (data) => {
    if (editItem) {
      await base44.entities.WebinarRegistration.update(editItem.id, data);
    } else {
      await base44.entities.WebinarRegistration.create(data);
    }
    setShowForm(false);
    setEditItem(null);
    load();
  };

  const handleSendCouponsForWebinar = async (webinar_type, webinar_date) => {
    setSendingCoupon(true);
    try {
      const res = await base44.functions.invoke('sendWebinarCoupon', { webinar_type, webinar_date });
      if (res.data?.ok) {
        toast.success(`נשלחו ${res.data.sent} קופונים (${res.data.skipped} דולגו)`);
        load();
      } else {
        toast.error('שגיאה בשליחת הקופונים');
      }
    } catch {
      toast.error('שגיאה בשליחת הקופונים');
    } finally {
      setSendingCoupon(false);
    }
  };

  const handleBulkMarkAttended = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await base44.entities.WebinarRegistration.update(id, { attended: true });
      }
      await base44.functions.invoke('sendWebinarCoupon', { registration_ids: ids });
      toast.success(`${ids.length} נרשמים סומנו כהשתתפו + נשלחו קופונים`);
      setSelectedIds(new Set());
      load();
    } catch {
      toast.error('שגיאה בעדכון');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkLoading(true);
    try {
      for (const id of selectedIds) {
        await base44.entities.WebinarRegistration.delete(id);
      }
      toast.success(`${selectedIds.size} רשומות נמחקו`);
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      load();
    } catch {
      toast.error('שגיאה במחיקה');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await base44.entities.WebinarRegistration.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">וובינרים</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{registrations.length} רישומים</p>
        </div>
        <div className="flex gap-2 items-center">
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2" disabled={sendingCoupon}>
                {sendingCoupon ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
                שלח קופונים לוובינר
                <ChevronDown size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {uniqueWebinars.length === 0 ? (
                <DropdownMenuItem disabled>אין וובינרים</DropdownMenuItem>
              ) : uniqueWebinars.map(w => (
                <DropdownMenuItem key={`${w.webinar_type}|${w.webinar_date}`}
                  onClick={() => handleSendCouponsForWebinar(w.webinar_type, w.webinar_date)}>
                  {TYPE_LABELS[w.webinar_type]} — {w.webinar_date ? format(new Date(w.webinar_date), 'dd/MM/yyyy') : 'ללא תאריך'} ({w.count})
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="gap-2" onClick={() => { setEditItem(null); setShowForm(true); }}>
            <Plus size={16} />רישום חדש
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="נרשמו" value={stats.total} color="text-primary" percent={100} to="/webinars" />
        <StatCard label="השתתפו" value={stats.attended} color="text-gold" percent={stats.total > 0 ? Math.round(stats.attended / stats.total * 100) : 0} to="/webinars" />
        <StatCard label="שילמו" value={stats.paid} color="text-success" percent={stats.total > 0 ? Math.round(stats.paid / stats.total * 100) : 0} to="/webinars" />
        <StatCard label="קבעו פגישה" value={stats.meeting} color="text-primary" percent={stats.total > 0 ? Math.round(stats.meeting / stats.total * 100) : 0} to="/webinars" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[{ key: 'all', label: 'הכל' }, ...Object.entries(TYPE_LABELS).map(([k, v]) => ({ key: k, label: v }))].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filter === tab.key ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        onMarkAttended={handleBulkMarkAttended}
        onDelete={() => setBulkDeleteConfirm(true)}
        loading={bulkLoading}
      />

      {/* Table view */}
      {viewMode === 'table' && (
        <WebinarTable registrations={filtered} contacts={contacts}
          onEdit={r => { setEditItem(r); setShowForm(true); }}
          onDelete={setDeleteTarget}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      )}

      {/* Cards view */}
      {viewMode === 'cards' && (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">אין רשומות</div>
          ) : filtered.map(reg => {
            const contact = getContact(reg.contact_id);
            return (
              <Card key={reg.id} className="hover:shadow-md transition-all">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                    <Video size={18} className="text-gold" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/contacts/${reg.contact_id}`} className="font-semibold text-sm hover:text-primary">{contact?.full_name || '—'}</Link>
                      <span className="text-xs bg-gold/20 text-gold px-2 py-0.5 rounded-full">{TYPE_LABELS[reg.webinar_type]}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      {reg.created_date && <span>נוצר: {format(new Date(reg.created_date), 'dd/MM/yyyy')}</span>}
                      {reg.webinar_date && <span>וובינר: {format(new Date(reg.webinar_date), 'dd/MM/yyyy')}</span>}
                      {contact?.phone && <span>{contact.phone}</span>}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <StatusDot active={reg.attended} label="השתתף" />
                    <StatusDot active={reg.payment_completed} label="שילם" />
                    <StatusDot active={reg.meeting_scheduled} label="פגישה" />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditItem(reg); setShowForm(true); }}>✏️</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(reg)}>🗑️</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <WebinarFormDialog open={showForm} onClose={() => { setShowForm(false); setEditItem(null); }}
        onSave={handleSave} contacts={contacts} editItem={editItem} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת רישום</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את הרישום? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteConfirm} onOpenChange={() => setBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת {selectedIds.size} רשומות</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את כל הרשומות המסומנות? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>מחק הכל</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
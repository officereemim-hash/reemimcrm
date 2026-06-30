import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Video, ClipboardList, CreditCard, Link as LinkIcon, FileCheck, Calendar, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ServiceContentFormDialog, { CONTENT_TYPES, SERVICE_TYPES } from '@/components/bot/ServiceContentFormDialog';
import ServiceContentTable from '@/components/bot/ServiceContentTable';
import ViewToggle from '@/components/shared/ViewToggle';
import BulkDeleteBar from '@/components/shared/BulkDeleteBar';
import ServiceContentKanban from '@/components/service-content/ServiceContentKanban';
import { Pencil, Trash2 } from 'lucide-react';

const ICON_MAP = { video: Video, pdf: FileText, questionnaire: ClipboardList, payment_link: CreditCard, external_link: LinkIcon, agreement: FileCheck, calendar_link: Calendar };

export default function ServiceContentPage() {
  const [search, setSearch] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const queryClient = useQueryClient();

  const { data: contents = [], isLoading } = useQuery({
    queryKey: ['service-content'],
    queryFn: () => base44.entities.ServiceContent.list('sort_order', 500),
  });

  const saveMutation = useMutation({
    mutationFn: data => editItem?.id ? base44.entities.ServiceContent.update(editItem.id, data) : base44.entities.ServiceContent.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-content'] }); setShowForm(false); setEditItem(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.ServiceContent.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-content'] }); setDeleteTarget(null); },
  });

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    for (const id of selectedIds) await base44.entities.ServiceContent.delete(id);
    setSelectedIds([]); setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: ['service-content'] });
  };

  const toggleId = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = (items) => setSelectedIds(prev => prev.length === items.length ? [] : items.map(i => i.id));

  const filtered = contents
    .filter(c => filterService === 'all' || c.service_type === filterService)
    .filter(c => filterType === 'all' || c.content_type === filterType)
    .filter(c => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (c.title || '').toLowerCase().includes(q) || (c.url || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
            <LinkIcon size={20} className="text-accent-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ניהול תוכן</h1>
            <p className="text-sm text-muted-foreground">קישורים, PDFs, שאלונים, תשלומים ויומנים</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <ViewToggle view={viewMode} onViewChange={setViewMode} showKanban />
          <Button onClick={() => { setEditItem(null); setShowForm(true); }} className="gap-2" size="sm"><Plus size={16} />תוכן חדש</Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="pr-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center ml-2">שירות:</span>
          {[{ value: 'all', label: 'הכל' }, ...SERVICE_TYPES].map(s => (
            <Badge key={s.value} variant={filterService === s.value ? 'default' : 'outline'} className="cursor-pointer text-xs" onClick={() => setFilterService(s.value)}>{s.label}</Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center ml-2">סוג:</span>
          {[{ value: 'all', label: 'הכל' }, ...CONTENT_TYPES].map(t => (
            <Badge key={t.value} variant={filterType === t.value ? 'default' : 'outline'} className="cursor-pointer text-xs" onClick={() => setFilterType(t.value)}>{t.label}</Badge>
          ))}
        </div>
      </div>

      <BulkDeleteBar count={selectedIds.length} label="פריטי תוכן" deleting={bulkDeleting} onDelete={handleBulkDelete} />

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">אין תוכן להצגה</div>
      ) : viewMode === 'kanban' ? (
        <ServiceContentKanban items={filtered} onEdit={item => { setEditItem(item); setShowForm(true); }} />
      ) : viewMode === 'table' ? (
        <ServiceContentTable items={filtered} onEdit={item => { setEditItem(item); setShowForm(true); }} onDelete={setDeleteTarget}
          selectedIds={selectedIds} onToggle={toggleId} onToggleAll={toggleAll} />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => {
            const Icon = ICON_MAP[item.content_type] || FileText;
            return (
              <Card key={item.id} className="shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon size={16} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">{item.title}</div>
                        {item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>}
                        {item.url && <p className="text-xs text-primary/70 mt-1 truncate" dir="ltr">{item.url}</p>}
                        <div className="flex flex-wrap gap-1 mt-2">
                          <Badge variant="secondary" className="text-xs">{CONTENT_TYPES.find(t => t.value === item.content_type)?.label}</Badge>
                          <Badge variant="outline" className="text-xs">{SERVICE_TYPES.find(s => s.value === item.service_type)?.label}</Badge>
                          {!item.is_active && <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive">לא פעיל</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditItem(item); setShowForm(true); }}><Pencil size={14} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 size={14} /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ServiceContentFormDialog open={showForm} onClose={() => { setShowForm(false); setEditItem(null); }} item={editItem} onSave={data => saveMutation.mutate(data)} saving={saveMutation.isPending} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת תוכן</AlertDialogTitle>
            <AlertDialogDescription>למחוק את "{deleteTarget?.title}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteTarget.id)}>מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
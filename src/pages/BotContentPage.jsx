import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import BotContentFilters from '@/components/bot/BotContentFilters';
import BotContentCard from '@/components/bot/BotContentCard';
import BotContentTable from '@/components/bot/BotContentTable';
import BotContentFormDialog from '@/components/bot/BotContentFormDialog';
import ViewToggle from '@/components/shared/ViewToggle';

export default function BotContentPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [flow, setFlow] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const queryClient = useQueryClient();

  const { data: contents = [], isLoading } = useQuery({
    queryKey: ['bot-content'],
    queryFn: () => base44.entities.BotContent.list('-created_date', 500),
  });

  const saveMutation = useMutation({
    mutationFn: data => editItem?.id ? base44.entities.BotContent.update(editItem.id, data) : base44.entities.BotContent.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bot-content'] }); setShowForm(false); setEditItem(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.BotContent.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bot-content'] }); setDeleteTarget(null); },
  });

  const filtered = contents
    .filter(c => category === 'all' || c.category === category)
    .filter(c => flow === 'all' || c.service_type_flow === 'general' || !c.service_type_flow || c.service_type_flow === flow)
    .filter(c => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (c.title || '').toLowerCase().includes(q) || (c.key || '').toLowerCase().includes(q) || (c.content || '').toLowerCase().includes(q);
    });

  const handleEdit = item => { setEditItem(item); setShowForm(true); };
  const handleNew = () => { setEditItem(null); setShowForm(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageSquare size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">תוכן הבוט</h1>
            <p className="text-sm text-muted-foreground">ניהול הודעות, ניסוחים ומסלולים</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
          <Button onClick={handleNew} className="gap-2" size="sm"><Plus size={16} />הודעה חדשה</Button>
        </div>
      </div>

      <BotContentFilters search={search} onSearchChange={setSearch} category={category} onCategoryChange={setCategory} flow={flow} onFlowChange={setFlow} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">אין הודעות להצגה</div>
      ) : viewMode === 'table' ? (
        <BotContentTable items={filtered} onEdit={handleEdit} onDelete={setDeleteTarget} />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <BotContentCard key={item.id} item={item} onEdit={handleEdit} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      <BotContentFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditItem(null); }}
        item={editItem}
        onSave={data => saveMutation.mutate(data)}
        saving={saveMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת הודעה</AlertDialogTitle>
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
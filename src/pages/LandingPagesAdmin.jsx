import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Globe, Plus, Pencil, Trash2, ExternalLink, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import LandingPageFormDialog from '@/components/landing/LandingPageFormDialog';
import BulkDeleteBar from '@/components/shared/BulkDeleteBar';

const TYPE_LABELS = { investments: 'השקעות', divorce: 'גירושין / איזון', retirement: 'פרישה' };

export default function LandingPagesAdmin() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    base44.entities.LandingPage.list('-created_date', 100).then(p => { setPages(p); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    try {
      if (editItem) await base44.entities.LandingPage.update(editItem.id, data);
      else await base44.entities.LandingPage.create(data);
      setShowForm(false); setEditItem(null); load();
      toast.success('דף הנחיתה נשמר');
    } catch (err) {
      toast.error('שגיאה בשמירת הדף: ' + (err?.message || 'נסי שוב'));
    }
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await base44.entities.LandingPage.delete(deleteTarget.id);
      setDeleteTarget(null); load();
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    for (const id of selectedIds) await base44.entities.LandingPage.delete(id);
    setSelectedIds([]); setBulkDeleting(false); load();
  };

  const toggleId = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const pageUrl = (slug) => `${window.location.origin}/webinar/${slug}`;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">דפי נחיתה לוובינרים</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{pages.length} דפים</p>
        </div>
        <Button size="sm" className="gap-2 w-full md:w-auto" onClick={() => { setEditItem(null); setShowForm(true); }}>
          <Plus size={16} />דף חדש
        </Button>
      </div>

      <BulkDeleteBar count={selectedIds.length} label="דפי נחיתה" deleting={bulkDeleting} onDelete={handleBulkDelete} />

      {pages.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">אין דפי נחיתה עדיין</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {pages.map(page => (
            <Card key={page.id} className="hover:shadow-md transition-all">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox checked={selectedIds.includes(page.id)} onCheckedChange={() => toggleId(page.id)} className="mt-1" />
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Globe size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{page.hero_title || page.slug}</span>
                      <span className="text-xs bg-gold/20 text-gold px-2 py-0.5 rounded-full">{TYPE_LABELS[page.webinar_type]}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${page.is_active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {page.is_active ? 'פעיל' : 'כבוי'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1" dir="ltr">/webinar/{page.slug}</div>
                    {page.webinar_date && (
                      <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(page.webinar_date), 'dd/MM/yyyy HH:mm')}</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { setEditItem(page); setShowForm(true); }}>
                    <Pencil size={12} />עריכה
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => window.open(pageUrl(page.slug), '_blank')}>
                    <ExternalLink size={12} />תצוגה
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(pageUrl(page.slug)); toast.success('הקישור הועתק'); }}>
                    <Copy size={12} />העתק קישור
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs text-destructive mr-auto" onClick={() => setDeleteTarget(page)}>
                    <Trash2 size={12} />מחיקה
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <LandingPageFormDialog open={showForm} onClose={() => { setShowForm(false); setEditItem(null); }} onSave={handleSave} editItem={editItem} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת דף נחיתה</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את הדף? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
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
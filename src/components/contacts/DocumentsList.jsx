import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, FileText, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';

const CATEGORY_LABELS = {
  shoranss: 'שורנס / מסלקה',
  identity: 'תעודת זהות',
  salary: 'תלוש שכר',
  tax: 'מסמכי מס',
  reports: 'דוחות',
  agreements: 'הסכמים',
  pension_fund: 'קרן פנסיה',
};

export default function DocumentsList({ contactId, documents, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'identity' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setSaving(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.Document.create({
      ...form,
      contact_id: contactId,
      file_url,
    });
    setShowForm(false);
    setFile(null);
    setForm({ name: '', category: 'identity' });
    onRefresh();
    setSaving(false);
  };

  const grouped = documents.reduce((acc, doc) => {
    const cat = doc.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">מסמכים ({documents.length})</h3>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
          <Plus size={14} />
          העלאת מסמך
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="text-center text-muted-foreground py-10 text-sm">אין מסמכים</div>
      ) : (
        Object.entries(grouped).map(([cat, docs]) => (
          <div key={cat}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">{CATEGORY_LABELS[cat] || cat}</h4>
            <div className="space-y-1">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border hover:border-primary/30 transition-colors">
                  <FileText size={16} className="text-primary flex-shrink-0" />
                  <span className="text-sm flex-1">{doc.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {doc.created_date ? format(new Date(doc.created_date), 'dd/MM/yy') : ''}
                  </span>
                  {doc.file_url && (
                    <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/70">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>העלאת מסמך</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label>שם מסמך *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>קטגוריה</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>קובץ *</Label>
                <Input type="file" onChange={e => setFile(e.target.files[0])} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
                <Button onClick={handleUpload} disabled={saving || !form.name || !file}>
                  {saving ? 'מעלה...' : 'העלה'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
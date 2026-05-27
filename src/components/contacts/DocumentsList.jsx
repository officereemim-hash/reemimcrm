import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, FileText, Trash2, ExternalLink, Send, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';

const CATEGORY_LABELS = {
  shoranss: 'שורנס / מסלקה',
  identity: 'תעודת זהות',
  salary: 'תלוש שכר',
  tax: 'מסמכי מס',
  reports: 'דוחות',
  agreements: 'הסכמים',
  pension_fund: 'קרן פנסיה',
};

export default function DocumentsList({ contactId, documents, onRefresh, contact }) {
  const [showForm, setShowForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({ name: '', category: 'identity' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sendingSig, setSendingSig] = useState(null);

  const openCreate = () => {
    setEditingDoc(null);
    setForm({ name: '', category: 'identity' });
    setFile(null);
    setShowForm(true);
  };

  const openEdit = (doc) => {
    setEditingDoc(doc);
    setForm({ name: doc.name || '', category: doc.category || 'identity' });
    setFile(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || (!editingDoc && !file)) return;
    setSaving(true);
    let file_url = editingDoc?.file_url;
    if (file) {
      const upload = await base44.integrations.Core.UploadFile({ file });
      file_url = upload.file_url;
    }
    if (editingDoc) {
      await base44.entities.Document.update(editingDoc.id, { ...form, file_url });
    } else {
      await base44.entities.Document.create({ ...form, contact_id: contactId, file_url });
    }
    setShowForm(false);
    setEditingDoc(null);
    setFile(null);
    setForm({ name: '', category: 'identity' });
    onRefresh();
    setSaving(false);
  };

  const deleteDocument = async (doc) => {
    if (!confirm(`למחוק את המסמך "${doc.name}"?`)) return;
    await base44.entities.Document.delete(doc.id);
    setSelectedIds(ids => ids.filter(id => id !== doc.id));
    onRefresh();
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || !confirm(`למחוק ${selectedIds.length} מסמכים?`)) return;
    await Promise.all(selectedIds.map(id => base44.entities.Document.delete(id)));
    setSelectedIds([]);
    onRefresh();
  };

  const toggleSelected = (id) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  };

  const sendDocumentForSignature = async (documentId, documentName) => {
    if (!contact?.phone && !contact?.email) {
      toast.error('אין טלפון או מייל ללקוח');
      return;
    }
    setSendingSig(documentId);
    try {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
      await base44.entities.Document.update(documentId, { signature_token: token, signature_status: 'pending' });
      const appUrl = import.meta.env.VITE_BASE44_APP_BASE_URL || window.location.origin;
      const signUrl = `${appUrl}/sign?token=${token}`;
      const message = `שלום ${contact.full_name} 🌿\nלחתימה על המסמך "${documentName}":\n${signUrl}`;
      const sentChannels = [];

      if (contact.phone) {
        try {
          await base44.functions.invoke('sendWhatsAppMessage', { phone: contact.phone, message });
          await base44.entities.Communication.create({
            contact_id: contactId,
            type: 'whatsapp',
            direction: 'outbound',
            content: message,
            sent_by: 'system',
            is_automated: false,
            status: 'sent',
          });
          sentChannels.push('WhatsApp');
        } catch (error) {
          console.warn('WhatsApp signature send failed:', error.message);
        }
      }

      if (contact.email) {
        await base44.functions.invoke('sendEmailToContact', {
          contact_id: contactId,
          subject: `חתימה על מסמך - ${documentName}`,
          html_body: `שלום ${contact.full_name || ''},<br /><br />לחתימה על המסמך "${documentName}":<br /><a href="${signUrl}">${signUrl}</a>`,
          template_id: 'document_signature',
        });
        sentChannels.push('מייל');
      }

      toast.success(sentChannels.length ? `לינק לחתימה נשלח ב-${sentChannels.join(' ו-')}` : 'לא נשלח לינק לחתימה');
      onRefresh();
    } catch (error) {
      toast.error('שגיאה בשליחת המסמך: ' + error.message);
    } finally {
      setSendingSig(null);
    }
  };

  const grouped = documents.reduce((acc, doc) => {
    const cat = doc.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h3 className="font-semibold">מסמכים ({documents.length})</h3>
        <div className="flex gap-2">
          {selectedIds.length > 0 && <Button size="sm" variant="destructive" onClick={deleteSelected}>מחיקת נבחרים ({selectedIds.length})</Button>}
          <Button size="sm" onClick={openCreate} className="gap-1"><Plus size={14} />העלאת מסמך</Button>
        </div>
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
                  <input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => toggleSelected(doc.id)} />
                  <FileText size={16} className="text-primary flex-shrink-0" />
                  <span className="text-sm flex-1">{doc.name}</span>
                  <span className="text-xs text-muted-foreground">{doc.created_date ? format(new Date(doc.created_date), 'dd/MM/yy') : ''}</span>
                  {doc.signature_status === 'pending' && (
                    <Button size="sm" variant="ghost" onClick={() => sendDocumentForSignature(doc.id, doc.name)} disabled={sendingSig === doc.id} className="gap-1 h-6">
                      <Send size={13} />{sendingSig === doc.id ? 'שולח...' : 'לחתימה'}
                    </Button>
                  )}
                  {doc.signature_status === 'signed' && <span className="text-xs text-success">✍️ נחתם</span>}
                  <Button size="icon" variant="ghost" onClick={() => openEdit(doc)}><Edit size={14} /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteDocument(doc)} className="text-destructive"><Trash2 size={14} /></Button>
                  {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/70"><ExternalLink size={14} /></a>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>{editingDoc ? 'עריכת מסמך' : 'העלאת מסמך'}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1"><Label>שם מסמך *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>קטגוריה</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{editingDoc ? 'החלפת קובץ' : 'קובץ *'}</Label><Input type="file" onChange={e => setFile(e.target.files[0])} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
                <Button onClick={handleSave} disabled={saving || !form.name || (!editingDoc && !file)}>{saving ? 'שומר...' : editingDoc ? 'עדכן' : 'העלה'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
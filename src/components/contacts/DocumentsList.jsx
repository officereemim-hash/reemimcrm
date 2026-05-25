import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, FileText, Trash2, ExternalLink, Send } from 'lucide-react';
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
  const [form, setForm] = useState({ name: '', category: 'identity' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sendingSig, setSendingSig] = useState(null);

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

  const sendDocumentForSignature = async (documentId, documentName) => {
    if (!contact?.phone && !contact?.email) {
      toast.error('אין טלפון או מייל ללקוח');
      return;
    }
    setSendingSig(documentId);
    try {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      await base44.entities.Document.update(documentId, {
        signature_token: token,
        signature_status: 'pending',
      });

      const appUrl = import.meta.env.VITE_BASE44_APP_BASE_URL || window.location.origin;
      const signUrl = `${appUrl}/sign?token=${token}`;
      const message = `שלום ${contact.full_name} 🌿\nלחתימה על המסמך "${documentName}":\n${signUrl}`;
      const sentChannels = [];

      if (contact.phone) {
        try {
          await base44.functions.invoke('sendWhatsAppMessage', {
            phone: contact.phone,
            message,
          });

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
                  {doc.signature_status === 'pending' && (
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => sendDocumentForSignature(doc.id, doc.name)}
                      disabled={sendingSig === doc.id}
                      className="gap-1 h-6"
                    >
                      <Send size={13} />
                      {sendingSig === doc.id ? 'שולח...' : 'לחתימה'}
                    </Button>
                  )}
                  {doc.signature_status === 'signed' && (
                    <div className="flex items-center gap-2 text-xs text-success">
                      <span>✍️ נחתם</span>
                      <span className="text-muted-foreground">
                        {doc.signer_name && `${doc.signer_name} • `}
                        {doc.signed_at ? format(new Date(doc.signed_at), 'dd/MM/yy') : ''}
                      </span>
                    </div>
                  )}
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
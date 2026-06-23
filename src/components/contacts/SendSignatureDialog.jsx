import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Mail, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function SendSignatureDialog({ open, onClose, contact, contactId, documentId, documentName, onRefresh }) {
  const [sending, setSending] = useState(false);

  const hasEmail = !!contact?.email;
  const hasPhone = !!contact?.phone;

  const handleSend = async (channel) => {
    setSending(true);
    try {
      // Generate token and sign URL
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
      console.log('SendSig: updating doc', documentId, 'with token', token);
      await base44.entities.Document.update(documentId, { signature_token: token, signature_status: 'pending' });
      console.log('SendSig: doc updated OK');
      const appUrl = import.meta.env.VITE_BASE44_APP_BASE_URL || window.location.origin;
      const signUrl = `${appUrl}/sign?token=${token}`;
      console.log('SendSig: signUrl =', signUrl, '| channel =', channel);
      const sentChannels = [];

      // Send WhatsApp
      if (channel === 'whatsapp' || channel === 'both') {
        try {
          const message = `שלום ${contact.full_name} 🌿\nלחתימה על המסמך "${documentName}":\n${signUrl}`;
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
          sentChannels.push('וואצאפ');
        } catch (err) {
          console.warn('WhatsApp send failed:', err.message);
          toast.error('שליחת וואצאפ נכשלה');
        }
      }

      // Send Email
      if (channel === 'email' || channel === 'both') {
        try {
          await base44.functions.invoke('sendSignatureEmail', {
            contact_id: contactId,
            contact_name: contact.full_name || '',
            contact_email: contact.email,
            document_name: documentName,
            sign_url: signUrl,
          });
          sentChannels.push('מייל');
        } catch (err) {
          console.error('Email send failed:', err.message, err);
          toast.error('שליחת מייל נכשלה: ' + (err?.response?.data?.error || err.message));
        }
      }

      if (sentChannels.length) {
        toast.success(`לינק לחתימה נשלח ב-${sentChannels.join(' ו-')}`);
      }
      onRefresh();
      onClose();
    } catch (err) {
      console.error('Signature send outer error:', err);
      alert('שגיאה בשליחה: ' + (err?.message || JSON.stringify(err)));
      toast.error('שגיאה בשליחת המסמך: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>שליחת מסמך לחתימה</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-1">
          שליחת "{documentName}" ל-{contact?.full_name}
        </p>
        <div className="flex flex-col gap-2 mt-3">
          {hasEmail && (
            <Button variant="outline" className="justify-start gap-2 h-11" onClick={() => handleSend('email')} disabled={sending}>
              <Mail size={16} /> שליחה במייל בלבד
            </Button>
          )}
          {hasPhone && (
            <Button variant="outline" className="justify-start gap-2 h-11" onClick={() => handleSend('whatsapp')} disabled={sending}>
              <MessageCircle size={16} /> שליחה בוואצאפ בלבד
            </Button>
          )}
          {hasEmail && hasPhone && (
            <Button className="justify-start gap-2 h-11" onClick={() => handleSend('both')} disabled={sending}>
              <Send size={16} /> שליחה במייל + וואצאפ
            </Button>
          )}
          {!hasEmail && !hasPhone && (
            <p className="text-sm text-destructive text-center py-2">אין מייל או טלפון ללקוח</p>
          )}
        </div>
        {sending && <p className="text-xs text-muted-foreground text-center mt-2">שולח...</p>}
      </DialogContent>
    </Dialog>
  );
}
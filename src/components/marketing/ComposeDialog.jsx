import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageCircle, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SingleContactPicker from './SingleContactPicker';
import EmojiPicker from './EmojiPicker';
import buildEmailHtml from './buildEmailHtml';

const MESSAGE_TYPES = [
  { key: 'newsletter', label: 'ניוזלטר תקופתי' },
  { key: 'google_review', label: 'בקשת המלצה (Google)' },
  { key: 'followup_after_meeting', label: 'פולו-אפ אחרי פגישה' },
];

const AUDIENCE_OPTIONS = [
  { key: 'all_active', label: 'כל הלקוחות הפעילים', filter: c => c.status === 'active_client' },
  { key: 'completed', label: 'לקוחות שהשלימו טיפול', filter: c => c.status === 'completed' },
  { key: 'in_progress', label: 'לידים בטיפול', filter: c => ['in_progress', 'quote_sent'].includes(c.status) },
  { key: 'new_leads', label: 'לידים חדשים', filter: c => c.status === 'new_lead' },
];

export default function ComposeDialog({ open, onClose, contacts, onDone }) {
  const [form, setForm] = useState({
    type: 'newsletter',
    channel: 'whatsapp',
    sendMode: 'group',
    audience: 'all_active',
    subject: '',
    content: '',
    whatsappMessage: '',
  });
  const [singleRecipient, setSingleRecipient] = useState(null);
  const [sending, setSending] = useState(false);
  const [marketingSettings, setMarketingSettings] = useState({ email_live_mode: false, whatsapp_live_mode: false });
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [waRef, setWaRef] = useState(null);

  useEffect(() => {
    base44.auth.me().then(user => {
      if (user?.marketing_settings) {
        setMarketingSettings(user.marketing_settings);
      }
    });
    base44.entities.MessageTemplate.list().then(data => {
      setMessageTemplates(data || []);
    });
  }, []);

  // Auto-load template when type changes
  useEffect(() => {
    const tpl = messageTemplates.find(t => t.type === form.type);
    if (tpl) {
      setForm(f => ({
        ...f,
        subject: tpl.subject || f.subject,
        content: tpl.intro_text || f.content,
        whatsappMessage: tpl.whatsapp_message || f.whatsappMessage,
      }));
    }
  }, [form.type, messageTemplates]);

  const getAudienceCount = (key) => {
    const option = AUDIENCE_OPTIONS.find(o => o.key === key);
    return option ? contacts.filter(option.filter).length : 0;
  };

  const getRecipients = () => {
    if (form.sendMode === 'single') {
      return singleRecipient ? [singleRecipient] : [];
    }
    const option = AUDIENCE_OPTIONS.find(o => o.key === form.audience);
    return option ? contacts.filter(option.filter) : [];
  };

  const handleSend = async () => {
    const recipients = getRecipients();
    if (recipients.length === 0) return;

    // Validation
    if ((form.channel === 'email' || form.channel === 'both') && !form.subject) {
      alert('אנא מלאי נושא למייל');
      return;
    }
    if ((form.channel === 'email' || form.channel === 'both') && !form.content) {
      alert('אנא מלאי תוכן למייל');
      return;
    }
    if ((form.channel === 'whatsapp' || form.channel === 'both') && !form.whatsappMessage) {
      alert('אנא מלאי הודעת וואטסאפ');
      return;
    }

    const confirmMsg = form.sendMode === 'single'
      ? `לשלוח ל-${singleRecipient?.full_name}?`
      : `לשלוח ל-${recipients.length} אנשי קשר?`;
    if (!confirm(confirmMsg)) return;

    setSending(true);
    let successCount = 0;

    for (const contact of recipients) {
      const personalizedContent = (form.content || '')
        .replace('{שם}', contact.full_name || '')
        .replace('{name}', contact.full_name || '');
      const personalizedWA = (form.whatsappMessage || '')
        .replace('{שם}', contact.full_name || '')
        .replace('{name}', contact.full_name || '');

      // WhatsApp
      if (form.channel === 'whatsapp' || form.channel === 'both') {
        await base44.entities.Communication.create({
          contact_id: contact.id,
          type: 'whatsapp',
          direction: 'outbound',
          content: personalizedWA,
          sent_by: 'basmat',
          is_automated: false,
          status: marketingSettings.whatsapp_live_mode ? 'sent' : 'sent',
        });
      }

      // Email
      if (form.channel === 'email' || form.channel === 'both') {
        // Build HTML email from template if available
        const tpl = messageTemplates.find(t => t.type === form.type);
        let emailBody = personalizedContent;
        if (tpl) {
          const personalizedTpl = {
            ...tpl,
            greeting: (tpl.greeting || '').replace('{שם}', contact.full_name || '').replace('{name}', contact.full_name || ''),
            intro_text: (tpl.intro_text || '').replace('{שם}', contact.full_name || '').replace('{name}', contact.full_name || ''),
          };
          emailBody = buildEmailHtml(personalizedTpl);
        }

        if (marketingSettings.email_live_mode && contact.email) {
          await base44.integrations.Core.SendEmail({
            to: contact.email,
            subject: form.subject,
            body: emailBody,
            from_name: 'קרנות ראמים',
          });
        }
        await base44.entities.Communication.create({
          contact_id: contact.id,
          type: 'email',
          direction: 'outbound',
          content: `נושא: ${form.subject}\n${personalizedContent}`,
          sent_by: 'basmat',
          is_automated: false,
          status: marketingSettings.email_live_mode ? 'sent' : 'sent',
        });
      }

      await base44.entities.Contact.update(contact.id, {
        last_contact_date: new Date().toISOString().split('T')[0],
      });

      successCount++;
    }

    setSending(false);
    onDone({
      count: successCount,
      type: MESSAGE_TYPES.find(t => t.key === form.type)?.label,
      channel: form.channel,
    });
    onClose();
  };

  const recipientCount = form.sendMode === 'single' ? (singleRecipient ? 1 : 0) : getAudienceCount(form.audience);
  const canSend = recipientCount > 0 && (
    (form.channel === 'whatsapp' && form.whatsappMessage) ||
    (form.channel === 'email' && form.content && form.subject) ||
    (form.channel === 'both' && form.whatsappMessage && form.content && form.subject)
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>שליחת הודעה</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">

          {/* Channel */}
          <div className="space-y-1">
            <Label>ערוץ שליחה</Label>
            <div className="flex gap-2">
              {[
                { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
                { key: 'email', label: 'מייל', icon: Mail },
                { key: 'both', label: 'שניהם', icon: Send },
              ].map(ch => (
                <button
                  key={ch.key}
                  onClick={() => setForm(f => ({ ...f, channel: ch.key }))}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.channel === ch.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border hover:bg-muted'
                  }`}
                >
                  <ch.icon size={14} />
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Send mode */}
          <div className="space-y-1">
            <Label>מצב שליחה</Label>
            <div className="flex gap-2">
              <button
                onClick={() => { setForm(f => ({ ...f, sendMode: 'group' })); setSingleRecipient(null); }}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  form.sendMode === 'group' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-muted'
                }`}
              >
                קבוצה
              </button>
              <button
                onClick={() => setForm(f => ({ ...f, sendMode: 'single' }))}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  form.sendMode === 'single' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-muted'
                }`}
              >
                נמען אחד
              </button>
            </div>
          </div>

          {/* Audience or single picker */}
          {form.sendMode === 'group' ? (
            <div className="space-y-1">
              <Label>קהל יעד</Label>
              <Select value={form.audience} onValueChange={v => setForm(f => ({ ...f, audience: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map(o => (
                    <SelectItem key={o.key} value={o.key}>{o.label} ({getAudienceCount(o.key)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">יישלח ל-{getAudienceCount(form.audience)} אנשי קשר</p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>בחירת נמען</Label>
              <SingleContactPicker
                contacts={contacts}
                selected={singleRecipient}
                onSelect={setSingleRecipient}
              />
            </div>
          )}

          {/* Message type */}
          <div className="space-y-1">
            <Label>סוג הודעה</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESSAGE_TYPES.map(t => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Email subject */}
          {(form.channel === 'email' || form.channel === 'both') && (
            <div className="space-y-1">
              <Label>נושא מייל *</Label>
              <Input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="נושא המייל..."
              />
            </div>
          )}

          {/* Email content */}
          {(form.channel === 'email' || form.channel === 'both') && (
            <div className="space-y-1">
              <Label>תוכן מייל *</Label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={4}
                placeholder="היי {שם}, ..."
              />
              <p className="text-xs text-muted-foreground">
                השתמש ב-&#123;שם&#125; לשם פרסונלי
                {marketingSettings.email_live_mode
                  ? ' • 🟢 מצב שליחה אמיתית'
                  : ' • 🔵 מצב לוג בלבד'
                }
              </p>
            </div>
          )}

          {/* WhatsApp message */}
          {(form.channel === 'whatsapp' || form.channel === 'both') && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>הודעת WhatsApp *</Label>
                <EmojiPicker onSelect={(emoji) => {
                  const ta = waRef;
                  if (ta) {
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    const current = form.whatsappMessage || '';
                    const newVal = current.slice(0, start) + emoji + current.slice(end);
                    setForm(f => ({ ...f, whatsappMessage: newVal }));
                    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
                  } else {
                    setForm(f => ({ ...f, whatsappMessage: (f.whatsappMessage || '') + emoji }));
                  }
                }} />
              </div>
              <Textarea
                ref={el => setWaRef(el)}
                value={form.whatsappMessage}
                onChange={e => setForm(f => ({ ...f, whatsappMessage: e.target.value }))}
                rows={4}
                placeholder="היי {שם} 👋..."
              />
              <p className="text-xs text-muted-foreground">
                השתמש ב-&#123;שם&#125; לשם פרסונלי • לחצי 😊 לאימוג׳י
                {marketingSettings.whatsapp_live_mode
                  ? ' • 🟢 מצב שליחה אמיתית'
                  : ' • 🔵 מצב לוג בלבד'
                }
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSend} disabled={sending || !canSend}>
              {sending ? 'שולח...' : `שלח ל-${recipientCount} ${recipientCount === 1 ? 'נמען' : 'אנשי קשר'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
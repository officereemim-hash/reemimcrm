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

// המרת תגיות פרסונליזציה ישנות לפורמט אחיד שהשרת מזהה
const toServerPlaceholders = (text) =>
  (text || '').replaceAll('{שם}', '{{name}}').replaceAll('{name}', '{{name}}');

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
  const [sendError, setSendError] = useState(null);
  const [liveMode, setLiveMode] = useState({ email: false, whatsapp: false });
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [waRef, setWaRef] = useState(null);

  useEffect(() => {
    // דגלי שליחה אמיתית — הגדרות מערכת (SystemSetting)
    base44.entities.SystemSetting.list().then(settings => {
      const get = (key) => (settings || []).find(s => s.key === key)?.value === 'true';
      setLiveMode({ email: get('email_live_mode'), whatsapp: get('whatsapp_live_mode') });
    }).catch(() => {});
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

  // מסירים מהקהל את מי שהוסר מהתפוצה
  const eligible = (contacts || []).filter(c => !c.mailing_opt_out);

  const getAudienceCount = (key) => {
    const option = AUDIENCE_OPTIONS.find(o => o.key === key);
    return option ? eligible.filter(option.filter).length : 0;
  };

  const getRecipients = () => {
    if (form.sendMode === 'single') {
      return singleRecipient ? [singleRecipient] : [];
    }
    const option = AUDIENCE_OPTIONS.find(o => o.key === form.audience);
    return option ? eligible.filter(option.filter) : [];
  };

  const handleSend = async () => {
    const recipients = getRecipients();
    if (recipients.length === 0) return;
    setSendError(null);

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
    try {
      // בניית HTML של המייל עם תגיות {{name}} ו-{{unsubscribe_link}} —
      // השרת מחליף אותן לכל נמען בנפרד
      let emailHtml = '';
      if (form.channel === 'email' || form.channel === 'both') {
        const tpl = messageTemplates.find(t => t.type === form.type);
        if (tpl) {
          emailHtml = buildEmailHtml({
            ...tpl,
            greeting: toServerPlaceholders(tpl.greeting),
            intro_text: toServerPlaceholders(form.content),
          });
        } else {
          // בלי תבנית — עטיפה מינימלית עם לינק הסרה
          emailHtml = buildEmailHtml({
            header_title: 'קרנות ראמים',
            greeting: 'שלום {{name}},',
            intro_text: toServerPlaceholders(form.content),
            blocks: [],
          });
        }
      }

      const res = await base44.functions.invoke('sendCampaign', {
        type: form.type,
        channel: form.channel,
        audience: form.sendMode === 'single' ? 'single' : form.audience,
        contact_ids: form.sendMode === 'single' ? [singleRecipient.id] : undefined,
        subject: toServerPlaceholders(form.subject),
        email_html: emailHtml,
        whatsapp_message: toServerPlaceholders(form.whatsappMessage),
        campaign_name: form.subject || MESSAGE_TYPES.find(t => t.key === form.type)?.label,
      });

      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);

      setSending(false);
      onDone({
        count: recipients.length,
        type: MESSAGE_TYPES.find(t => t.key === form.type)?.label,
        channel: form.channel,
        queued: (data?.email_queued || 0) + (data?.whatsapp_queued || 0),
      });
      onClose();
    } catch (err) {
      setSending(false);
      setSendError(err?.response?.data?.error || err.message || 'שגיאה בשליחה');
    }
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
              <p className="text-xs text-muted-foreground">
                יישלח ל-{getAudienceCount(form.audience)} אנשי קשר (לא כולל מי שהוסרו מהתפוצה)
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>בחירת נמען</Label>
              <SingleContactPicker
                contacts={eligible}
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
                {liveMode.email
                  ? ' • 🟢 מצב שליחה אמיתית (Brevo)'
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
                {liveMode.whatsapp
                  ? ' • 🟢 מצב שליחה אמיתית — נשלח בהדרגה דרך התור'
                  : ' • 🔵 מצב לוג בלבד'
                }
              </p>
            </div>
          )}

          {sendError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-sm text-destructive">
              {sendError}
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
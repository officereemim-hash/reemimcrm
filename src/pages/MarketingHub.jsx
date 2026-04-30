import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Mail, Send, Users, Calendar, Star, Bell, Plus, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const MESSAGE_TYPES = [
  { key: 'newsletter', label: 'ניוזלטר תקופתי', icon: Mail, desc: 'שליחה לכלל הלקוחות הפעילים' },
  { key: 'birthday', label: 'ברכת יום הולדת', icon: Calendar, desc: 'מופעל אוטומטית כל יום ב-08:00' },
  { key: 'google_review', label: 'בקשת המלצה (Google)', icon: Star, desc: 'שליחה ללקוחות לאחר סיום טיפול' },
  { key: 'followup_after_meeting', label: 'פולו-אפ אחרי פגישה', icon: Bell, desc: 'תזכורת אחרי פגישה שהתקיימה' },
  { key: 'annual_reminder', label: 'תזכורת שנתית', icon: Clock, desc: 'מופעל אוטומטית לפי annual_followup_date' },
];

const AUDIENCE_OPTIONS = [
  { key: 'all_active', label: 'כל הלקוחות הפעילים', filter: c => c.status === 'active_client' },
  { key: 'completed', label: 'לקוחות שהשלימו טיפול', filter: c => c.status === 'completed' },
  { key: 'in_progress', label: 'לידים בטיפול', filter: c => ['in_progress', 'quote_sent'].includes(c.status) },
  { key: 'new_leads', label: 'לידים חדשים', filter: c => c.status === 'new_lead' },
];

export default function MarketingHub() {
  const { isAdmin } = useCurrentUser();
  const [contacts, setContacts] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState({ type: 'newsletter', audience: 'all_active', subject: '', content: '', sender_name: 'קרנות ראמים' });
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState(null);

  const load = () => {
    Promise.all([
      base44.entities.Contact.list(),
      base44.entities.Communication.list('-created_date', 200),
    ]).then(([cs, comms]) => {
      setContacts(cs);
      setCommunications(comms.filter(c => c.is_automated || c.type === 'whatsapp'));
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const getAudienceCount = (audienceKey) => {
    const option = AUDIENCE_OPTIONS.find(o => o.key === audienceKey);
    return option ? contacts.filter(option.filter).length : 0;
  };

  const handleSend = async () => {
    if (!form.content) return;
    setSending(true);
    setSentResult(null);

    const option = AUDIENCE_OPTIONS.find(o => o.key === form.audience);
    const audience = contacts.filter(option.filter);
    let successCount = 0;

    for (const contact of audience) {
      const personalizedContent = form.content
        .replace('{שם}', contact.full_name || '')
        .replace('{name}', contact.full_name || '');

      await base44.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: personalizedContent,
        sent_by: 'basmat',
        is_automated: false,
        status: 'sent',
      });

      await base44.entities.Contact.update(contact.id, {
        last_contact_date: new Date().toISOString().split('T')[0],
      });

      successCount++;
    }

    setSentResult({ count: successCount, type: MESSAGE_TYPES.find(t => t.key === form.type)?.label });
    setSending(false);
    setShowCompose(false);
    load();
  };

  // Stats
  const totalSent = communications.filter(c => c.direction === 'outbound').length;
  const automatedSent = communications.filter(c => c.is_automated).length;
  const thisMonthSent = communications.filter(c => {
    const d = new Date(c.created_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">מרכז דיוור</h1>
          <p className="text-muted-foreground text-sm mt-0.5">ניהול תקשורת שוטפת, דיוור ופולו-אפ</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCompose(true)} className="gap-2">
            <Plus size={16} />
            שליחה חדשה
          </Button>
        )}
      </div>

      {sentResult && (
        <div className="flex items-center gap-3 bg-success/10 border border-success/30 rounded-lg px-4 py-3">
          <CheckCircle size={18} className="text-success" />
          <span className="text-sm font-medium">נשלח בהצלחה: {sentResult.type} ל-{sentResult.count} אנשי קשר</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="סה״כ נשלחו" value={totalSent} icon={Send} color="bg-primary/10 text-primary" />
        <StatCard label="אוטומטי" value={automatedSent} icon={Bell} color="bg-gold/20 text-gold" />
        <StatCard label="החודש" value={thisMonthSent} icon={Calendar} color="bg-success/10 text-success" />
        <StatCard label="לקוחות פעילים" value={contacts.filter(c => c.status === 'active_client').length} icon={Users} color="bg-accent/20 text-accent-foreground" />
      </div>

      {/* Message types */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MESSAGE_TYPES.map(type => {
          const Icon = type.icon;
          const isAuto = ['birthday', 'annual_reminder'].includes(type.key);
          return (
            <Card key={type.key} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{type.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{type.desc}</div>
                    {isAuto && (
                      <span className="inline-block mt-2 text-xs bg-gold/20 text-gold px-2 py-0.5 rounded-full">אוטומטי</span>
                    )}
                    {!isAuto && isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 text-xs gap-1"
                        onClick={() => { setForm(f => ({ ...f, type: type.key })); setShowCompose(true); }}
                      >
                        <Send size={12} />
                        שלח עכשיו
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent sends */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">שליחות אחרונות</CardTitle>
        </CardHeader>
        <CardContent>
          {communications.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין שליחות עדיין</p>
          ) : (
            <div className="space-y-2">
              {communications.slice(0, 10).map(comm => {
                const contact = contacts.find(c => c.id === comm.contact_id);
                return (
                  <div key={comm.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-sm">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${comm.status === 'failed' ? 'bg-destructive' : 'bg-success'}`} />
                    <span className="font-medium flex-shrink-0">{contact?.full_name || '—'}</span>
                    <span className="text-muted-foreground flex-1 truncate">{comm.content?.slice(0, 60)}...</span>
                    {comm.is_automated && <span className="text-xs bg-muted px-1.5 rounded flex-shrink-0">אוטו׳</span>}
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {comm.created_date ? format(new Date(comm.created_date), 'dd/MM HH:mm') : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compose Dialog */}
      {showCompose && (
        <Dialog open onOpenChange={() => setShowCompose(false)}>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader>
              <DialogTitle>שליחת הודעה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label>סוג הודעה</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESSAGE_TYPES.filter(t => !['birthday', 'annual_reminder'].includes(t.key)).map(t => (
                      <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  יישלח ל-{getAudienceCount(form.audience)} אנשי קשר
                </p>
              </div>

              <div className="space-y-1">
                <Label>תוכן ההודעה *</Label>
                <Textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={5}
                  placeholder="היי {שם}, ..."
                />
                <p className="text-xs text-muted-foreground">השתמש ב-&#123;שם&#125; לשם פרסונלי</p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCompose(false)}>ביטול</Button>
                <Button onClick={handleSend} disabled={sending || !form.content || getAudienceCount(form.audience) === 0}>
                  {sending ? 'שולח...' : `שלח ל-${getAudienceCount(form.audience)} אנשי קשר`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color}`}>
          <Icon size={16} />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}
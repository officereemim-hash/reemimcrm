import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Mail, Send, Users, Calendar, Star, Bell, Plus, CheckCircle, Clock, FileText, Search, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import ComposeDialog from '@/components/marketing/ComposeDialog';
import TemplateEditor from '@/components/marketing/TemplateEditor';
import CampaignHistory from '@/components/marketing/CampaignHistory';
import ViewToggle from '@/components/shared/ViewToggle';
import BulkDeleteBar from '@/components/shared/BulkDeleteBar';

const MESSAGE_TYPES = [
  { key: 'newsletter', label: 'ניוזלטר תקופתי', icon: Mail, desc: 'שליחה לכלל הלקוחות הפעילים' },
  { key: 'birthday', label: 'ברכת יום הולדת', icon: Calendar, desc: 'מופעל אוטומטית כל יום ב-08:00' },
  { key: 'google_review', label: 'בקשת המלצה (Google)', icon: Star, desc: 'שליחה ללקוחות לאחר סיום טיפול' },
  { key: 'followup_after_meeting', label: 'פולו-אפ אחרי פגישה', icon: Bell, desc: 'תזכורת אחרי פגישה שהתקיימה' },
  { key: 'annual_reminder', label: 'תזכורת שנתית', icon: Clock, desc: 'מופעל אוטומטית לפי annual_followup_date' },
];

export default function MarketingHub() {
  const { isAdmin } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [sentResult, setSentResult] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState('cards');
  const [selectedComms, setSelectedComms] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('filter') || 'all');

  // Sync URL filter to state
  useEffect(() => {
    const f = searchParams.get('filter');
    if (f) setTypeFilter(f);
  }, [searchParams]);

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

  const handleSendDone = (result) => {
    setSentResult(result);
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

  // Filtered communications
  const filteredComms = communications.filter(comm => {
    // Type filter (stat cards)
    if (typeFilter === 'automated' && !comm.is_automated) return false;
    if (typeFilter === 'this_month') {
      const d = new Date(comm.created_date);
      const now = new Date();
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
    }
    // Status filter
    if (statusFilter === 'sent' && comm.status === 'failed') return false;
    if (statusFilter === 'failed' && comm.status !== 'failed') return false;
    // Search
    if (searchText) {
      const q = searchText.toLowerCase();
      const contact = contacts.find(c => c.id === comm.contact_id);
      const nameMatch = contact?.full_name?.toLowerCase().includes(q);
      const contentMatch = comm.content?.toLowerCase().includes(q);
      if (!nameMatch && !contentMatch) return false;
    }
    return true;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">מרכז דיוור</h1>
          <p className="text-muted-foreground text-sm mt-0.5">ניהול תקשורת שוטפת, דיוור ופולו-אפ</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap w-full md:w-auto">
          {activeTab === 'overview' && <ViewToggle view={viewMode} onViewChange={setViewMode} />}
          {isAdmin && (
            <Button onClick={() => setShowCompose(true)} className="gap-2" size="sm">
              <Plus size={16} />
              שליחה חדשה
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap border-b pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'overview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Send size={14} className="inline ml-1" />
          סקירה ושליחה
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'templates' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <FileText size={14} className="inline ml-1" />
            תבניות
          </button>
        )}
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Clock size={14} className="inline ml-1" />
          היסטוריית דיוור
        </button>
      </div>

      {activeTab === 'templates' && <TemplateEditor />}
      {activeTab === 'history' && <CampaignHistory />}

      {activeTab === 'overview' && sentResult && (
        <div className="flex items-center gap-3 bg-success/10 border border-success/30 rounded-lg px-4 py-3">
          <CheckCircle size={18} className="text-success" />
          <span className="text-sm font-medium">
            נשלח בהצלחה: {sentResult.type} ל-{sentResult.count} אנשי קשר
            {sentResult.channel && ` (${sentResult.channel === 'whatsapp' ? 'WhatsApp' : sentResult.channel === 'email' ? 'מייל' : 'WhatsApp + מייל'})`}
          </span>
        </div>
      )}

      {activeTab === 'overview' && <>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'סה״כ נשלחו', value: totalSent, icon: Send, color: 'bg-primary/10 text-primary', filterKey: 'all' },
          { label: 'אוטומטי', value: automatedSent, icon: Bell, color: 'bg-gold/20 text-gold', filterKey: 'automated' },
          { label: 'החודש', value: thisMonthSent, icon: Calendar, color: 'bg-success/10 text-success', filterKey: 'this_month' },
        ].map(s => {
          const Icon = s.icon;
          const active = typeFilter === s.filterKey;
          return (
            <Card key={s.label}
              className={`shadow-sm hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer ${active ? 'border-primary ring-1 ring-primary/30' : 'hover:border-primary/30'}`}
              onClick={() => { setTypeFilter(active ? 'all' : s.filterKey); setSearchParams(active ? {} : { filter: s.filterKey }); }}>
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.color}`}><Icon size={16} /></div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </CardContent>
            </Card>
          );
        })}
        <Link to="/contacts?filter=active_client" className="block">
          <Card className="shadow-sm hover:shadow-md hover:border-primary/30 hover:scale-[1.02] transition-all cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2 bg-accent/20 text-accent-foreground"><Users size={16} /></div>
              <div className="text-2xl font-bold">{contacts.filter(c => c.status === 'active_client').length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">לקוחות פעילים</div>
            </CardContent>
          </Card>
        </Link>
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
                        onClick={() => setShowCompose(true)}
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם או תוכן..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pr-9 h-9 text-sm"
          />
          {searchText && <button onClick={() => setSearchText('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={14} /></button>}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="sent">נשלח</SelectItem>
            <SelectItem value="failed">נכשל</SelectItem>
          </SelectContent>
        </Select>
        {(searchText || statusFilter !== 'all' || typeFilter !== 'all') && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setSearchText(''); setStatusFilter('all'); setTypeFilter('all'); setSearchParams({}); }}>
            <X size={12} className="ml-1" /> נקה פילטרים
          </Button>
        )}
      </div>

      {/* Sends list */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">שליחות{typeFilter === 'automated' ? ' — אוטומטיות' : typeFilter === 'this_month' ? ' — החודש' : ''}</CardTitle>
            <span className="text-xs text-muted-foreground">{filteredComms.length} תוצאות</span>
          </div>
        </CardHeader>
        <CardContent>
          <BulkDeleteBar count={selectedComms.length} label="שליחות" deleting={bulkDeleting}
            onDelete={async () => {
              setBulkDeleting(true);
              for (const id of selectedComms) await base44.entities.Communication.delete(id);
              setSelectedComms([]); setBulkDeleting(false); load();
            }} />
          {filteredComms.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין שליחות תואמות</p>
          ) : (
            <div className="space-y-2">
              {filteredComms.map(comm => {
                const contact = contacts.find(c => c.id === comm.contact_id);
                return (
                  <div key={comm.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-sm">
                    <Checkbox checked={selectedComms.includes(comm.id)} onCheckedChange={() => setSelectedComms(prev => prev.includes(comm.id) ? prev.filter(x => x !== comm.id) : [...prev, comm.id])} />
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

      </>}

      {/* Compose Dialog */}
      <ComposeDialog
        open={showCompose}
        onClose={() => setShowCompose(false)}
        contacts={contacts}
        onDone={handleSendDone}
      />
    </div>
  );
}
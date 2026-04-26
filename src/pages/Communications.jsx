import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Phone, Mail, MessageSquare, Bot, AlertCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';

const TYPE_ICONS = { whatsapp: MessageSquare, call: Phone, email: Mail, bot_event: Bot, system_error: AlertCircle, note: MessageSquare };
const TYPE_LABELS = { whatsapp: 'WhatsApp', call: 'שיחה', email: 'מייל', bot_event: 'אירוע בוט', system_error: 'שגיאת מערכת', note: 'הערה' };

const FILTER_TABS = [
  { key: 'all', label: 'הכל' },
  { key: 'system_error', label: 'שגיאות מערכת' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'call', label: 'שיחות' },
];

export default function Communications() {
  const [communications, setCommunications] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      base44.entities.Communication.list('-created_date', 300),
      base44.entities.Contact.list(),
    ]).then(([comms, cs]) => {
      setCommunications(comms);
      setContacts(cs);
      setLoading(false);
    });
  }, []);

  const getContact = id => contacts.find(c => c.id === id);

  const filtered = communications.filter(c => {
    const matchTab = activeTab === 'all' || c.type === activeTab;
    const matchSearch = !search || c.content?.includes(search) || getContact(c.contact_id)?.full_name?.includes(search);
    return matchTab && matchSearch;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">לוג תקשורת</h1>

      <div className="flex gap-2 border-b border-border pb-0">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key ? 'bg-[#D4A843] text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.key === 'system_error' && communications.filter(c => c.type === 'system_error').length > 0 && (
              <span className="mr-1 bg-destructive text-white text-xs rounded-full px-1.5">
                {communications.filter(c => c.type === 'system_error').length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
      </div>

      <div className="space-y-2">
        {filtered.map(comm => {
          const contact = getContact(comm.contact_id);
          const Icon = TYPE_ICONS[comm.type] || MessageSquare;
          const isError = comm.type === 'system_error';
          return (
            <Card key={comm.id} className={isError ? 'border-destructive/30 bg-destructive/5' : ''}>
              <CardContent className="p-4 flex gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isError ? 'bg-destructive/10' : 'bg-muted'}`}>
                  <Icon size={16} className={isError ? 'text-destructive' : 'text-muted-foreground'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">{TYPE_LABELS[comm.type]}</span>
                    {contact && (
                      <Link to={`/contacts/${comm.contact_id}`} className="text-primary hover:underline text-xs">
                        {contact.full_name}
                      </Link>
                    )}
                    <span className="text-muted-foreground text-xs">{comm.direction === 'inbound' ? '← נכנס' : '→ יוצא'}</span>
                    {comm.is_automated && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">אוטומטי</span>}
                  </div>
                  <p className="text-sm text-foreground mt-1 break-words">{comm.content}</p>
                  <span className="text-xs text-muted-foreground">
                    {comm.created_date ? format(new Date(comm.created_date), 'dd/MM/yyyy HH:mm') : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-16">אין תוצאות</div>
        )}
      </div>
    </div>
  );
}
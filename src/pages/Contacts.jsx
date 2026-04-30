import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Plus, Search, Phone, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ContactStatusBadge, BotStatusBadge, SERVICE_TYPE_LABELS, SOURCE_LABELS } from '@/components/StatusBadge';
import { format } from 'date-fns';
import ContactFormDialog from '@/components/contacts/ContactFormDialog';
import ContactsTable from '@/components/contacts/ContactsTable';
import ViewToggle from '@/components/shared/ViewToggle';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const TABS = [
  { key: 'all', label: 'הכל' },
  { key: 'new_lead', label: 'לידים חדשים' },
  { key: 'active_client', label: 'לקוחות פעילים' },
  { key: 'completed', label: 'הושלמו' },
];

export default function Contacts() {
  const { isAdmin, filterForUser } = useCurrentUser();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState('cards');

  const load = () => {
    base44.entities.Contact.list('-created_date', 200).then(data => {
      setContacts(filterForUser(data));
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const filtered = contacts.filter(c => {
    const matchTab = activeTab === 'all' || c.status === activeTab;
    const matchSearch = !search || c.full_name?.includes(search) || c.phone?.includes(search) || c.email?.includes(search);
    return matchTab && matchSearch;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">לקוחות</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{contacts.length} אנשי קשר במערכת</p>
        </div>
        <div className="flex gap-2 items-center">
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
          <Button onClick={() => setShowForm(true)} className="gap-2" size="sm">
            <Plus size={16} />
            לקוח/ה חדש
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-[#D4A843] text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="חיפוש לפי שם, טלפון, מייל..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-9"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : viewMode === 'table' ? (
        <ContactsTable contacts={filtered} />
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">לא נמצאו אנשי קשר</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(contact => (
            <Link key={contact.id} to={`/contacts/${contact.id}`}>
              <Card className="hover:shadow-md transition-all hover:border-primary/30 cursor-pointer">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                    {contact.full_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{contact.full_name}</span>
                      <ContactStatusBadge status={contact.status} />
                      <BotStatusBadge status={contact.bot_status} />
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      {contact.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={12} />
                          {contact.phone}
                        </span>
                      )}
                      {contact.service_type && (
                        <span>{SERVICE_TYPE_LABELS[contact.service_type]}</span>
                      )}
                      {contact.assigned_to && (
                        <span>מטופל/ת ע"י: {contact.assigned_to}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {contact.created_date ? format(new Date(contact.created_date), 'dd/MM/yyyy') : ''}
                      </span>
                    </div>
                  </div>
                  {contact.lead_temperature && (
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      contact.lead_temperature === 'hot' ? 'bg-red-100 text-red-600' :
                      contact.lead_temperature === 'warm' ? 'bg-orange-100 text-orange-600' :
                      'bg-blue-100 text-blue-600'
                    }`}>
                      {contact.lead_temperature === 'hot' ? '🔥 חם' : contact.lead_temperature === 'warm' ? '☀️ פושר' : '❄️ קר'}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {showForm && (
        <ContactFormDialog
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
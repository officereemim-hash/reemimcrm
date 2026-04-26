import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Phone, MoreHorizontal } from 'lucide-react';
import { BotStatusBadge, ContactStatusBadge } from '@/components/StatusBadge';

const COLUMNS = [
  { key: 'new_waiting', label: 'פניות חדשות', statuses: ['new', 'waiting_agent'], color: '#EDE8F5', textColor: '#4A2C78' },
  { key: 'in_conversation', label: 'בטיפול נציגה', statuses: ['waiting_user_reply', 'in_conversation'], color: '#E8EEF8', textColor: '#2952A3' },
  { key: 'escalation', label: 'הסלמה', statuses: ['escalated_to_agent', 'no_response'], color: '#F8DCDC', textColor: '#A82020' },
  { key: 'closed', label: 'סגורות', statuses: ['closed', 'not_relevant'], color: '#DCF0E8', textColor: '#2E7A4A' },
];

export default function LeadsPipeline() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Contact.list('-updated_date', 300).then(data => {
      setContacts(data);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Pipeline — לידים</h1>
        <p className="text-muted-foreground text-sm mt-0.5">לפי סטטוס בוט</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(col => {
          const items = contacts.filter(c => col.statuses.includes(c.bot_status));
          return (
            <div key={col.key} className="flex-shrink-0 w-72">
              <div
                className="rounded-t-lg px-3 py-2 font-semibold text-sm flex items-center justify-between"
                style={{ backgroundColor: col.color, color: col.textColor }}
              >
                <span>{col.label}</span>
                <span className="bg-white/60 rounded-full px-2 py-0.5 text-xs">{items.length}</span>
              </div>
              <div className="bg-muted/30 rounded-b-lg min-h-[400px] p-2 space-y-2">
                {items.map(c => (
                  <Link key={c.id} to={`/contacts/${c.id}`}>
                    <div className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-all border hover:border-primary/30 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {c.full_name?.charAt(0)}
                        </div>
                        <span className="font-medium text-sm truncate flex-1">{c.full_name}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Phone size={11} />
                        {c.phone}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <BotStatusBadge status={c.bot_status} />
                      </div>
                      {c.assigned_to && (
                        <div className="mt-1 text-xs text-muted-foreground">→ {c.assigned_to}</div>
                      )}
                    </div>
                  </Link>
                ))}
                {items.length === 0 && (
                  <div className="text-center text-muted-foreground text-xs py-8">ריק</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
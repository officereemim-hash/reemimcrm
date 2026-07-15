import { useState, useMemo } from 'react';
import { Search, X, User, Phone, Mail, CheckSquare, Square } from 'lucide-react';

export default function MultiContactPicker({ contacts, selected, onSelectedChange }) {
  const [query, setQuery] = useState('');

  const sorted = useMemo(() =>
    [...(contacts || [])]
      .filter(c => c.full_name && (c.phone || c.email))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'he')),
    [contacts]
  );

  const filtered = query.trim()
    ? sorted.filter(c =>
        (c.full_name || '').includes(query) ||
        (c.phone || '').includes(query) ||
        (c.email || '').toLowerCase().includes(query.toLowerCase())
      )
    : sorted;

  const selectedIds = new Set((selected || []).map(c => c.id));

  const toggle = (contact) => {
    if (selectedIds.has(contact.id)) {
      onSelectedChange((selected || []).filter(c => c.id !== contact.id));
    } else {
      onSelectedChange([...(selected || []), contact]);
    }
  };

  const clearAll = () => onSelectedChange([]);

  return (
    <div className="space-y-2">
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-primary/10 rounded-lg px-3 py-1.5">
          <span className="text-sm font-medium text-primary">{selectedIds.size} נבחרו</span>
          <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
            <X size={12} /> נקה הכל
          </button>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="חפש לפי שם, טלפון או מייל..."
          className="w-full pr-10 pl-4 py-2.5 border border-input rounded-lg bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="border rounded-lg max-h-48 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-4 py-3 text-sm text-muted-foreground text-center">לא נמצאו אנשי קשר</div>
        )}
        {filtered.slice(0, 50).map(contact => {
          const isSelected = selectedIds.has(contact.id);
          return (
            <button
              key={contact.id}
              onClick={() => toggle(contact)}
              className={`w-full text-right px-3 py-2 flex items-center gap-3 border-b border-border/30 last:border-0 transition-colors ${
                isSelected ? 'bg-primary/5' : 'hover:bg-muted'
              }`}
            >
              {isSelected
                ? <CheckSquare size={16} className="text-primary flex-shrink-0" />
                : <Square size={16} className="text-muted-foreground flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{contact.full_name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {contact.phone && (
                    <span className="flex items-center gap-0.5"><Phone size={10} /> {contact.phone}</span>
                  )}
                  {contact.email && (
                    <span className="flex items-center gap-0.5"><Mail size={10} /> {contact.email}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
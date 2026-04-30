import { useState, useRef, useEffect } from 'react';
import { Search, X, User, Phone, Mail } from 'lucide-react';

export default function SingleContactPicker({ contacts, onSelect, selected }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const sorted = [...(contacts || [])]
    .filter(c => c.full_name && (c.phone || c.email))
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'he'));

  const filtered = query.trim()
    ? sorted.filter(c =>
        (c.full_name || '').includes(query) ||
        (c.phone || '').includes(query) ||
        (c.email || '').toLowerCase().includes(query.toLowerCase())
      )
    : sorted;

  const handleSelect = (contact) => {
    onSelect(contact);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
    setQuery('');
  };

  if (selected) {
    return (
      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
        <User size={16} className="text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{selected.full_name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            {selected.phone && <span>{selected.phone}</span>}
            {selected.email && <span>{selected.email}</span>}
          </div>
        </div>
        <button onClick={handleClear} className="p-1 hover:bg-background rounded">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="חפש לפי שם, טלפון או מייל..."
          className="w-full pr-10 pl-4 py-2.5 border border-input rounded-lg bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              לא נמצאו אנשי קשר
            </div>
          )}
          {filtered.slice(0, 30).map((contact) => (
            <button
              key={contact.id}
              onClick={() => handleSelect(contact)}
              className="w-full text-right px-4 py-2.5 hover:bg-muted flex items-center gap-3 border-b border-border/30 last:border-0"
            >
              <User size={14} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{contact.full_name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {contact.phone && (
                    <span className="flex items-center gap-0.5">
                      <Phone size={10} /> {contact.phone}
                    </span>
                  )}
                  {contact.email && (
                    <span className="flex items-center gap-0.5">
                      <Mail size={10} /> {contact.email}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
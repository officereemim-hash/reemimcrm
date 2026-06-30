import { Badge } from '@/components/ui/badge';

const CATEGORIES_ORDER = [
  { key: 'welcome',    label: 'פתיחה',           color: '#EDE8F5', text: '#4A2C78' },
  { key: 'menu',       label: 'תפריטים',          color: '#E8EEF8', text: '#2952A3' },
  { key: 'followup',   label: 'מעקב',             color: '#F5EDD8', text: '#9A6210' },
  { key: 'reminder',   label: 'תזכורות',          color: '#DCF0E8', text: '#2E7A4A' },
  { key: 'closing',    label: 'סיום',             color: '#D8EDD8', text: '#2A6A2A' },
  { key: 'error',      label: 'שגיאות / הבהרות',  color: '#F8DCDC', text: '#A82020' },
  { key: 'escalation', label: 'העברה לנציגה',     color: '#F8E8DC', text: '#B04020' },
  { key: '_none',      label: 'ללא קטגוריה',      color: '#F0F0F0', text: '#666666' },
];

export default function BotContentKanban({ items, onEdit }) {
  const grouped = {};
  CATEGORIES_ORDER.forEach(c => { grouped[c.key] = []; });

  items.forEach(item => {
    const key = item.category && grouped[item.category] ? item.category : '_none';
    grouped[key].push(item);
  });

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" dir="rtl">
      {CATEGORIES_ORDER.map(col => {
        const colItems = grouped[col.key];
        if (colItems.length === 0) return null;
        return (
          <div key={col.key} className="min-w-[220px] max-w-[260px] flex-shrink-0">
            <div className="rounded-t-lg px-3 py-2 flex items-center justify-between" style={{ backgroundColor: col.color }}>
              <span className="font-semibold text-sm" style={{ color: col.text }}>{col.label}</span>
              <span className="text-xs rounded-full px-2 py-0.5" style={{ backgroundColor: col.text + '20', color: col.text }}>{colItems.length}</span>
            </div>
            <div className="space-y-2 p-2 rounded-b-lg border border-t-0 bg-card min-h-[100px]">
              {colItems.map(item => (
                <button key={item.id} onClick={() => onEdit(item)}
                  className="w-full text-right p-2.5 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-medium text-xs leading-snug">{item.title}</span>
                    {!item.is_active && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive flex-shrink-0">כבוי</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap mb-1.5">
                    {(item.content || '').slice(0, 80)}{(item.content || '').length > 80 ? '…' : ''}
                  </p>
                  {item.step_label && (
                    <span className="text-[10px] text-gold bg-gold/10 rounded px-1.5 py-0.5">{item.step_label}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
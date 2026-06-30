import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SERVICE_CONTENT_ROUTE_MAP, itemMatchesRoute } from '@/lib/serviceContentRoutes';

const CONTENT_TYPES_ORDER = [
  { key: 'calendar_link',  label: 'יומנים',           color: '#E8EEF8', text: '#2952A3' },
  { key: 'questionnaire',  label: 'שאלונים',           color: '#F0E8F8', text: '#7B2DA0' },
  { key: 'payment_link',   label: 'קישורי תשלום',      color: '#DCF0E8', text: '#2E7A4A' },
  { key: 'external_link',  label: 'קישורים כלליים',    color: '#EDE8F5', text: '#4A2C78' },
  { key: 'pdf',            label: 'מסמכי PDF',         color: '#F5EDD8', text: '#9A6210' },
  { key: 'agreement',      label: 'הסכמים',            color: '#F8F0DC', text: '#A87B20' },
  { key: 'video',          label: 'וידאו',             color: '#D8EDD8', text: '#2A6A2A' },
  { key: 'image',          label: 'תמונות',            color: '#FAF0F0', text: '#A82020' },
];

export default function ServiceContentKanban({ items, onEdit }) {
  const [route, setRoute] = useState('all');

  const filteredItems = route === 'all'
    ? items
    : items.filter(item => itemMatchesRoute(item, route));

  const grouped = {};
  CONTENT_TYPES_ORDER.forEach(c => { grouped[c.key] = []; });

  filteredItems.forEach(item => {
    const key = item.content_type && grouped[item.content_type] ? item.content_type : null;
    if (key) grouped[key].push(item);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">סינון לפי מסלול:</span>
        <Select value={route} onValueChange={setRoute}>
          <SelectTrigger className="w-[220px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל המסלולים</SelectItem>
            {Object.entries(SERVICE_CONTENT_ROUTE_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {route !== 'all' && (
          <span className="text-xs text-muted-foreground">{filteredItems.length} פריטים</span>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4" dir="rtl">
        {CONTENT_TYPES_ORDER.map(col => {
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
                      {!item.is_active && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive flex-shrink-0">לא פעיל</Badge>}
                    </div>
                    {item.sub_type && (
                      <span className="text-[10px] text-muted-foreground">{item.sub_type}</span>
                    )}
                    {item.url && (
                      <p className="text-[10px] text-primary/60 truncate mt-1" dir="ltr">{item.url}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
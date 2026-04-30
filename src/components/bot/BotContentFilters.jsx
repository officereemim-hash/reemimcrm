import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const CATEGORIES = [
  { value: 'all', label: 'הכל' },
  { value: 'welcome', label: 'קבלת פנים' },
  { value: 'menu', label: 'תפריט' },
  { value: 'followup', label: 'פולו-אפ' },
  { value: 'reminder', label: 'תזכורת' },
  { value: 'closing', label: 'סגירה' },
  { value: 'error', label: 'שגיאה' },
  { value: 'escalation', label: 'הסלמה' },
];

const FLOWS = [
  { value: 'all', label: 'כל המסלולים' },
  { value: 'general', label: 'כללי' },
  { value: 'retirement', label: 'פרישה' },
  { value: 'economic_feasibility', label: 'היתכנות כלכלית' },
  { value: 'investments', label: 'השקעות' },
  { value: 'divorce_split', label: 'גירושין' },
  { value: 'tax_advisory', label: 'ייעוץ מס' },
  { value: 'annual_service', label: 'שירות שנתי' },
  { value: 'webinar', label: 'וובינר' },
];

export { CATEGORIES, FLOWS };

export default function BotContentFilters({ search, onSearchChange, category, onCategoryChange, flow, onFlowChange }) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="חיפוש לפי כותרת, מפתח או תוכן..."
          className="pr-9"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center ml-2">קטגוריה:</span>
        {CATEGORIES.map(c => (
          <Badge
            key={c.value}
            variant={category === c.value ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => onCategoryChange(c.value)}
          >
            {c.label}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center ml-2">מסלול:</span>
        {FLOWS.map(f => (
          <Badge
            key={f.value}
            variant={flow === f.value ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => onFlowChange(f.value)}
          >
            {f.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
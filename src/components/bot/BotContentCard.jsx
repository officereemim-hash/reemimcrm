import { Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CATEGORIES, FLOWS } from './BotContentFilters';

export default function BotContentCard({ item, onEdit, onDelete }) {
  const catLabel = CATEGORIES.find(c => c.value === item.category)?.label || item.category;
  const flowLabel = FLOWS.find(f => f.value === item.service_type_flow)?.label || item.service_type_flow;

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-sm">{item.title}</span>
              {!item.is_active && <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive">לא פעיל</Badge>}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3 mb-2 whitespace-pre-wrap">{item.content}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">{item.key}</Badge>
              {item.category && <Badge variant="outline" className="text-xs">{catLabel}</Badge>}
              {item.service_type_flow && <Badge variant="outline" className="text-xs bg-primary/5">{flowLabel}</Badge>}
              {item.step_label && <Badge variant="outline" className="text-xs bg-gold/10 text-gold">{item.step_label}</Badge>}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}>
              <Pencil size={14} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(item)}>
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
import { MessageSquare, Plus, Trash2, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function BotConversationsList({ requests, activeId, onSelect, onNew, onDelete, onHide, loading }) {
  return (
    <div className="border-l h-full flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">בדיקות</h3>
        <Button size="sm" variant="ghost" onClick={onNew} className="gap-1">
          <Plus size={14} />
          חדש
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-muted-foreground text-sm">טוען...</div>
        )}
        {!loading && requests.length === 0 && (
          <div className="p-4 text-center text-muted-foreground text-sm">
            אין בדיקות. לחצי "חדש" כדי להתחיל.
          </div>
        )}
        {requests.map(req => (
          <div
            key={req.id}
            className={cn(
              'group w-full text-right p-3 border-b hover:bg-muted/50 transition-colors cursor-pointer',
              activeId === req.id && 'bg-primary/5 border-r-2 border-r-primary'
            )}
            onClick={() => onSelect(req.id)}
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {req.contact_name || 'בדיקה'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {req.service_type || ''} • {req.created_date ? new Date(req.created_date).toLocaleDateString('he-IL') : ''}
                </div>
              </div>
              <div className="hidden group-hover:flex gap-0.5">
                <button
                  className="p-1 rounded hover:bg-muted"
                  title="הסתר"
                  onClick={e => { e.stopPropagation(); onHide(req.id); }}
                >
                  <EyeOff size={12} className="text-muted-foreground" />
                </button>
                <button
                  className="p-1 rounded hover:bg-destructive/10"
                  title="מחק"
                  onClick={e => { e.stopPropagation(); onDelete(req.id); }}
                >
                  <Trash2 size={12} className="text-destructive" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
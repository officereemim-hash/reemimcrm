import { MessageSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ConversationsList({ conversations, activeId, onSelect, onNew, loading }) {
  return (
    <div className="border-l h-full flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">שיחות</h3>
        <Button size="sm" variant="ghost" onClick={onNew} className="gap-1">
          <Plus size={14} />
          חדש
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-muted-foreground text-sm">טוען...</div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="p-4 text-center text-muted-foreground text-sm">
            אין שיחות. לחץ "חדש" כדי להתחיל.
          </div>
        )}
        {conversations.map(conv => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={cn(
              'w-full text-right p-3 border-b hover:bg-muted/50 transition-colors',
              activeId === conv.id && 'bg-primary/5 border-r-2 border-r-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {conv.title || `שיחה #${conv.id?.slice(-4)}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {conv.created_date ? new Date(conv.created_date).toLocaleDateString('he-IL') : ''}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
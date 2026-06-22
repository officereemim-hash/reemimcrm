import { CheckCircle2, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BulkActionsBar({ selectedCount, onMarkAttended, onDelete, loading }) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
      <span className="text-sm font-medium text-primary">{selectedCount} נבחרו</span>
      <div className="h-4 w-px bg-border" />
      <Button size="sm" variant="outline" className="gap-2 border-success text-success hover:bg-success/10" onClick={onMarkAttended} disabled={loading}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        סמן כהשתתפו + שלח קופון
      </Button>
      <Button size="sm" variant="outline" className="gap-2 border-destructive text-destructive hover:bg-destructive/10" onClick={onDelete} disabled={loading}>
        <Trash2 size={14} />
        מחק נבחרים
      </Button>
    </div>
  );
}
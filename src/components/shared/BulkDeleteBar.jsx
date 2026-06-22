import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export default function BulkDeleteBar({ count, label = 'פריטים', onDelete, deleting }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <>
      <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-2">
        <span className="text-sm font-medium">{count} {label} נבחרו</span>
        <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setOpen(true)} disabled={deleting}>
          <Trash2 size={14} />{deleting ? 'מוחק...' : 'מחק נבחרים'}
        </Button>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקה מרובה</AlertDialogTitle>
            <AlertDialogDescription>למחוק {count} {label}? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOpen(false); onDelete(); }}>מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
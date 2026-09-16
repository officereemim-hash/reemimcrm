import { Button } from '@/components/ui/button';

export default function ContactsLoadMore({ shown, total, onLoadMore }) {
  if (!total) return null;
  return <div className="flex items-center justify-center gap-3 py-3">
    <span className="text-sm text-muted-foreground" role="status">מוצגים {shown} מתוך {total}</span>
    {shown < total && <Button variant="outline" onClick={onLoadMore}>טען עוד</Button>}
  </div>;
}
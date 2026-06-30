import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eraser, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function ResetTestUserCard() {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!phone.trim() && !email.trim()) {
      toast({ title: 'הזיני מספר טלפון או אימייל של הבדיקה', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke('resetTestUser', { phone: phone.trim(), email: email.trim() });
      const deleted = res.data?.deleted || {};
      const total = Object.values(deleted).reduce((a, b) => a + b, 0);
      toast({ title: total ? `נמחקו ${total} רשומות — אפשר להתחיל נקי` : 'לא נמצאו רשומות למחיקה — כבר נקי' });
    } catch {
      toast({ title: 'שגיאה בניקוי הרשומות', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-coral/10 border border-coral/30 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Eraser size={18} className="text-coral" />
        <h3 className="font-bold text-sm">ניקוי רשומות בדיקה</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        הזיני את מספר הטלפון (ו/או אימייל) של הבדיקה. הפעולה מוחקת את כל הרשומות של אותו אדם
        (לקוח, פניות, פגישות, תקשורת, הרשמות, חסימות) — כדי שהבוט יתייחס כמשתמש חדש לגמרי.
      </p>
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="מספר טלפון לבדיקה" dir="ltr" />
        <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="אימייל (אופציונלי)" dir="ltr" />
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" className="gap-2" disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Eraser size={16} />}
            נקה רשומות
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>לנקות את רשומות הבדיקה?</AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו תמחק לצמיתות את כל הרשומות הקשורות ל-{phone || email}. השתמשי בזה רק עם מספר/מייל בדיקה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>כן, נקה</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
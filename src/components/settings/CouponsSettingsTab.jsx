import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Ticket, Save } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_LABELS = { retirement: 'פרישה', investments: 'השקעות', divorce: 'גירושין / איזון' };
const TYPES = ['retirement', 'investments', 'divorce'];

export default function CouponsSettingsTab() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const existing = await base44.entities.WebinarCouponSetting.list();
    const byType = TYPES.map(t => existing.find(s => s.webinar_type === t) || {
      webinar_type: t, coupon_prefix: '', discount_percent: 0, amount: 0,
    });
    setSettings(byType);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = (type, field, value) =>
    setSettings(s => s.map(item => item.webinar_type === type ? { ...item, [field]: value } : item));

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const s of settings) {
        const data = {
          webinar_type: s.webinar_type,
          coupon_prefix: s.coupon_prefix || '',
          discount_percent: Number(s.discount_percent) || 0,
          amount: Number(s.amount) || 0,
        };
        if (s.id) await base44.entities.WebinarCouponSetting.update(s.id, data);
        else await base44.entities.WebinarCouponSetting.create(data);
      }
      toast.success('הגדרות הקופונים נשמרו');
      load();
    } catch {
      toast.error('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket size={18} className="text-gold" />
            הגדרות קופונים לוובינרים
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            אחוז ההטבה, הסכום הסופי וקידומת קוד הקופון מוזרקים אוטומטית להודעת הקופון בבוט.
            את טקסט ההודעה עורכים בתוכן הבוט (webinar_coupon / webinar_payment_intro).
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {settings.map(s => (
            <div key={s.webinar_type} className="border rounded-xl p-4 space-y-3">
              <div className="font-semibold text-primary">{TYPE_LABELS[s.webinar_type]}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>קידומת קוד</Label>
                  <Input value={s.coupon_prefix} dir="ltr" placeholder="RET"
                    onChange={e => update(s.webinar_type, 'coupon_prefix', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <Label>אחוז הטבה (%)</Label>
                  <Input type="number" min="0" max="100" value={s.discount_percent}
                    onChange={e => update(s.webinar_type, 'discount_percent', e.target.value)} />
                </div>
                <div>
                  <Label>סכום סופי (₪)</Label>
                  <Input type="number" min="0" value={s.amount}
                    onChange={e => update(s.webinar_type, 'amount', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          שמור הגדרות
        </Button>
      </div>
    </div>
  );
}
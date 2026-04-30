import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MessageCircle, Mail, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function MarketingSettingsTab() {
  const [settings, setSettings] = useState({ email_live_mode: false, whatsapp_live_mode: false });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    base44.auth.me().then(user => {
      if (user?.marketing_settings) {
        setSettings(user.marketing_settings);
      }
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe({ marketing_settings: settings });
    setSaving(false);
  };

  if (!loaded) return (
    <div className="flex justify-center py-8">
      <Loader2 size={20} className="animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle size={18} className="text-success" />
            WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">מצב שליחה אמיתית</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {settings.whatsapp_live_mode
                  ? 'הודעות WhatsApp יישלחו בפועל (כשתוגדר אינטגרציה)'
                  : 'הודעות WhatsApp נשמרות כלוג בלבד — לא נשלחות בפועל'
                }
              </p>
            </div>
            <Switch
              checked={settings.whatsapp_live_mode}
              onCheckedChange={v => setSettings(s => ({ ...s, whatsapp_live_mode: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail size={18} className="text-primary" />
            מייל
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">מצב שליחה אמיתית</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {settings.email_live_mode
                  ? '🟢 מיילים יישלחו בפועל דרך SendEmail'
                  : '🔵 מיילים נשמרים כלוג בלבד — לא נשלחים בפועל'
                }
              </p>
            </div>
            <Switch
              checked={settings.email_live_mode}
              onCheckedChange={v => setSettings(s => ({ ...s, email_live_mode: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        שמור הגדרות
      </Button>
    </div>
  );
}
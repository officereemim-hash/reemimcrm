import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ClipboardCheck, MessageSquare, Video, FileUp, Loader2, ExternalLink, Info } from 'lucide-react';
import { CRM_GROUPS, SERVICE_TYPES, BOT_SERVICE_FLOW, BOT_WEBINAR_FLOW, buildPlanText } from '@/lib/testPlans';
import TestStep from '@/components/testing/TestStep';
import ResetTestUser from '@/components/testing/ResetTestUser';

export default function Testing() {
  const [saving, setSaving] = useState(false);
  const [savedLink, setSavedLink] = useState(null);

  const saveToDrive = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke('saveTestPlanToDrive', {
        title: `תכנית בדיקות — קרנות ראמים (${new Date().toLocaleDateString('he-IL')})`,
        content: buildPlanText(),
      });
      if (res.data?.ok) {
        setSavedLink(res.data.link);
        toast.success('המסמך נשמר ב-Google Drive שלך');
      } else {
        toast.error('שמירה נכשלה');
      }
    } catch {
      toast.error('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">מרכז בדיקות</h1>
          <p className="text-muted-foreground text-sm mt-0.5">תכנית בדיקות מלאה — למשתמש שאינו טכנולוגי. עברו שלב-אחר-שלב וסמנו.</p>
        </div>
        <div className="flex items-center gap-2">
          {savedLink && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(savedLink, '_blank')}>
              <ExternalLink size={15} />פתח ב-Drive
            </Button>
          )}
          <Button size="sm" className="gap-2" onClick={saveToDrive} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            שמור ל-Google Drive
          </Button>
        </div>
      </div>

      {/* הערות כלליות */}
      <div className="bg-secondary/40 border border-secondary rounded-xl p-3 text-sm flex gap-2">
        <Info size={16} className="text-primary mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-semibold">שימו לב:</span> שלב שורנס (שאלון) עדיין בפיתוח — דלגו עליו בינתיים.
          ייבוא אקסלים אינו נכלל בבדיקות. בבדיקות הבוט — נקו רשומות לפני כל סבב.
        </div>
      </div>

      <Tabs defaultValue="crm" dir="rtl">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="crm" className="gap-1.5 py-2 text-xs sm:text-sm"><ClipboardCheck size={15} />מערכת CRM (אדמין)</TabsTrigger>
          <TabsTrigger value="bot-service" className="gap-1.5 py-2 text-xs sm:text-sm"><MessageSquare size={15} />בוט — פניות שירות</TabsTrigger>
          <TabsTrigger value="bot-webinar" className="gap-1.5 py-2 text-xs sm:text-sm"><Video size={15} />בוט — וובינר</TabsTrigger>
        </TabsList>

        {/* --- חלק 1: CRM --- */}
        <TabsContent value="crm" className="space-y-5 mt-4">
          <p className="text-sm text-muted-foreground">בדיקת המערכת מנקודת מבטה של בשמת (אדמין) — ניהול שוטף מלא.</p>
          {CRM_GROUPS.map((g, gi) => (
            <div key={g.id} className="space-y-2">
              <h2 className="font-bold flex items-center gap-2">
                <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">{gi + 1}</span>
                {g.title}
              </h2>
              <p className="text-xs text-muted-foreground pr-8">{g.intro}</p>
              <div className="space-y-2 pr-8">
                {g.steps.map((s, i) => <TestStep key={i} index={`${gi + 1}.${i + 1}`} step={s} />)}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* --- חלק 2: בוט פניות שירות --- */}
        <TabsContent value="bot-service" className="space-y-5 mt-4">
          <ResetTestUser />
          <div className="bg-white border border-border rounded-xl p-3 text-sm space-y-1">
            <p>{BOT_SERVICE_FLOW.intro}</p>
            <p className="text-xs text-muted-foreground">{BOT_SERVICE_FLOW.note}</p>
          </div>
          {SERVICE_TYPES.map((t, ti) => (
            <div key={t.id} className="space-y-2">
              <h2 className="font-bold flex items-center gap-2">
                <span className="bg-gold text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">{ti + 1}</span>
                סוג שירות: {t.label}
              </h2>
              <div className="space-y-2 pr-8">
                {BOT_SERVICE_FLOW.steps.map((s, i) => <TestStep key={i} index={`${ti + 1}.${i + 1}`} step={s} />)}
              </div>
            </div>
          ))}
        </TabsContent>

        {/* --- חלק 3: בוט וובינר --- */}
        <TabsContent value="bot-webinar" className="space-y-5 mt-4">
          <ResetTestUser />
          <div className="bg-white border border-border rounded-xl p-3 text-sm">{BOT_WEBINAR_FLOW.intro}</div>
          <div className="space-y-2">
            {BOT_WEBINAR_FLOW.steps.map((s, i) => <TestStep key={i} index={i + 1} step={s} />)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
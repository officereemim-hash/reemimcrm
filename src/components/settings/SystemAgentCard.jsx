import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, Sparkles } from 'lucide-react';

export default function SystemAgentCard() {
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles size={18} className="text-primary" />
          סוכן המערכת רעמים — ניהול ה-CRM מוואטסאפ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground text-xs leading-relaxed">
          סוכן AI לצוות בלבד: בודק פניות ופגישות, מעדכן סטטוסים, מוסיף אנשי קשר ומשימות, עורך נוסחי הודעות
          ומחליף קישורים — ישירות מוואטסאפ. מקבל גם הודעות קוליות, תמונות ומסמכים.
        </p>
        <p className="text-xs text-muted-foreground">
          לחיצה על הכפתור פותחת שיחה עם המספר של הסוכן; שלחו את ההודעה שמופיעה כדי לחבר את חשבון האדמין שלכם.
        </p>
        <Button asChild className="gap-2 w-full sm:w-auto">
          <a href={base44.agents.getWhatsAppConnectURL('reemim_system_agent')} target="_blank" rel="noreferrer">
            <MessageCircle size={16} />
            התחברות לסוכן בוואטסאפ
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
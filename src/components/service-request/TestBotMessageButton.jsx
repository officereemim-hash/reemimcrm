import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bug } from 'lucide-react';
import { toast } from 'sonner';
import { handleBotMessage } from '@/lib/sendBotMessage';

const triggerOptions = [
  { value: 'welcome_message', label: 'הודעת קבלה' },
  { value: 'in_progress_notification', label: 'הפנייה בטיפול' },
  { value: 'quote_sent_notification', label: 'הצעת מחיר נשלחה' },
  { value: 'followup_t7', label: 'פולו-אפ T+7' },
  { value: 'followup_t14', label: 'פולו-אפ T+14' },
  { value: 'followup_t21', label: 'פולו-אפ T+21' },
  { value: 'meeting_confirmed', label: 'פגישה נקבעה' },
  { value: 'reminder_d1', label: 'תזכורת D-1' },
  { value: 'reminder_h1', label: 'תזכורת H-1' },
  { value: 'completed_review_request', label: 'הושלם — בקשת חוות דעת' },
  { value: 'payment_confirmed', label: 'תשלום אושר' },
  { value: 'questionnaire_filled', label: 'שאלון מולא' },
];

export default function TestBotMessageButton({ requestId }) {
  const [trigger, setTrigger] = useState('welcome_message');
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      toast.info(`מגדיר pending_bot_message = ${trigger}...`);
      await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: trigger });
      setTimeout(async () => {
        try {
          const sent = await handleBotMessage(requestId);
          if (sent) toast.success(`הודעת ${sent.trigger} נשלחה!`);
          else toast.warning('לא נשלחה הודעה');
        } catch (err) {
          toast.error(`שגיאה: ${err.message}`);
        } finally {
          setTesting(false);
        }
      }, 3000);
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`);
      setTesting(false);
    }
  };

  return (
    <div className="border border-dashed border-orange-300 rounded-lg p-3 bg-orange-50 space-y-2">
      <p className="text-xs font-medium text-orange-700 flex items-center gap-1">
        <Bug className="w-3.5 h-3.5" /> בדיקת שליחת הודעה
      </p>
      <Select value={trigger} onValueChange={setTrigger}>
        <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
        <SelectContent>{triggerOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="w-full text-xs border-orange-300 text-orange-700 hover:bg-orange-100" onClick={handleTest} disabled={testing}>
        {testing ? 'בודק...' : 'שלח הודעת בדיקה'}
      </Button>
    </div>
  );
}
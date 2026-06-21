import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import QuotePDFButton from './QuotePDFButton';

const allStatuses = [
  { value: 'new', label: 'חדש' },
  { value: 'in_progress', label: 'בטיפול' },
  { value: 'interested', label: 'מעוניין' },
  { value: 'quote_sent', label: 'הצעה נשלחה' },
  { value: 'closed_lost', label: 'לא מעוניין' },
  { value: 'followup_active', label: 'פולו-אפ פעיל' },
  { value: 'phone_meeting', label: 'נקבעה שיחה טלפונית' },
  { value: 'meeting_scheduled', label: 'פגישה נקבעה' },
  { value: 'meeting_scheduled_frontal', label: 'נקבעה פגישה פרונטאלית' },
  { value: 'meeting_scheduled_zoom', label: 'נקבעה פגישת זום' },
  { value: 'completed', label: 'הושלם' },
  { value: 'cancelled', label: 'בוטל' },
  { value: 'followup_closed', label: 'פולו-אפ נסגר' },
];

export default function StatusActions({ request, contact, onUpdate, isUpdating }) {
  const [status, setStatus] = useState(request.status);
  const [step, setStep] = useState(request.current_step || '');
  const [notes, setNotes] = useState(request.notes || '');
  const [paymentConfirmed, setPaymentConfirmed] = useState(request.payment_confirmed || false);
  const [documentsReceived, setDocumentsReceived] = useState(request.documents_received || false);
  const [questionnaireCompleted, setQuestionnaireCompleted] = useState(request.questionnaire_completed || false);
  const [apptType, setApptType] = useState(request.last_appointment_type || '');

  const handleSave = () => {
    const updates = { status, current_step: step, notes, payment_confirmed: paymentConfirmed, documents_received: documentsReceived, questionnaire_completed: questionnaireCompleted };
    if (apptType) updates.last_appointment_type = apptType;
    if (status === 'in_progress' && request.status !== 'in_progress') updates.processing_start_date = new Date().toISOString();
    if (status === 'quote_sent' && request.status !== 'quote_sent') { updates.quote_sent = true; updates.quote_sent_at = new Date().toISOString().split('T')[0]; }
    if (status === 'completed' && request.status !== 'completed') { updates.closed_at = new Date().toISOString().split('T')[0]; updates.closed_reason = 'won'; }
    if (status === 'closed_lost' && request.status !== 'closed_lost') { updates.closed_at = new Date().toISOString().split('T')[0]; updates.closed_reason = 'lost_no_response'; }
    if (documentsReceived && !request.documents_received) updates.documents_status = 'complete';
    onUpdate(updates, request.status);
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg">פעולות</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>סטטוס</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{allStatuses.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>שלב נוכחי</Label>
          <Input value={step} onChange={(e) => setStep(e.target.value)} placeholder="לדוגמה: questionnaire_sent" />
        </div>
        <div>
          <Label>מיקום פגישה</Label>
          <Select value={apptType} onValueChange={setApptType}>
            <SelectTrigger><SelectValue placeholder="בחר מיקום" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="zoom">זום</SelectItem>
              <SelectItem value="modiin">מודיעין</SelectItem>
              <SelectItem value="petah_tikva_wednesday">פתח תקווה</SelectItem>
              <SelectItem value="phone">טלפון</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={paymentConfirmed} onCheckedChange={setPaymentConfirmed} />
            תשלום אושר
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={questionnaireCompleted} onCheckedChange={setQuestionnaireCompleted} />
            שאלון מולא
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={documentsReceived} onCheckedChange={setDocumentsReceived} />
            מסמכים התקבלו
          </label>
        </div>
        <div>
          <Label>הערות</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <Button onClick={handleSave} disabled={isUpdating} className="w-full">
          {isUpdating ? 'שומר...' : 'שמור שינויים'}
        </Button>

        {/* הפקת הצעת מחיר PDF */}
        <div className="pt-2 border-t border-border">
          <QuotePDFButton
            contact={contact}
            request={request}
            onQuoteSent={() => onUpdate({ quote_sent: true, quote_sent_at: new Date().toISOString().split('T')[0] })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
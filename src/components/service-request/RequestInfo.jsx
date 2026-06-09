import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SRStatusBadge, SERVICE_TYPE_LABELS } from '@/components/StatusBadge';
import { Clock, FileCheck, CreditCard, ClipboardList } from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

const FOLLOWUP_LABELS = { none: 'ללא', 'T+7': 'T+7', 'T+14': 'T+14', 'T+21': 'T+21', escalated: 'הסלמה' };
const DOC_STATUS_LABELS = { not_required: 'לא נדרש', pending: 'ממתין', partial: 'חלקי', complete: 'הושלם' };

export default function RequestInfo({ request }) {
  const items = [
    { label: 'סוג שירות', value: SERVICE_TYPE_LABELS[request.service_type] || request.service_type },
    { label: 'סטטוס', value: <SRStatusBadge status={request.status} /> },
    { label: 'שלב נוכחי', value: request.current_step || '-' },
    { label: 'מקור', value: request.source || '-' },
    { label: 'תשלום', value: request.payment_confirmed ? '✓ אושר' : '✗ לא אושר', icon: CreditCard },
    { label: 'שאלון', value: request.questionnaire_completed ? '✓ מולא' : '✗ לא מולא', icon: ClipboardList },
    { label: 'מסמכים', value: DOC_STATUS_LABELS[request.documents_status] || '-', icon: FileCheck },
    { label: 'פולו-אפ', value: FOLLOWUP_LABELS[request.followup_stage] || '-' },
  ];

  if (request.processing_start_date) items.push({ label: 'תחילת טיפול', value: fmtDate(request.processing_start_date), icon: Clock });
  if (request.quote_sent) items.push({ label: 'הצעת מחיר', value: request.quote_sent_at ? `נשלחה ${request.quote_sent_at}` : '✓ נשלחה' });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg">פרטי הפנייה</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className="text-sm font-medium">{item.value}</span>
            </div>
          ))}
        </div>
        {request.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">הערות</span>
            <p className="text-sm mt-1">{request.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
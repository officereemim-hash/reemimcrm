import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ROUTE_MAP = {
  service_intake: {
    label: 'קליטת ליד / פתיחה',
    keys: [
      'greeting', 'instant_ack', 'new_lead_welcome', 'new_lead_welcome_missing',
      'new_lead_welcome_shoranss', 'contact_details_confirm', 'welcome', 'menu_services',
      'next_step_options', 'service_type_clarify', 'after_choice_wait', 'returning_client', 'returning_lead',
    ],
  },
  service_a_interested: {
    label: 'מסלול א — מעוניין',
    keys: [
      'schedule_intro', 'meeting_summary_quote', 'quote_sent',
      'meeting_scheduled', 'meeting_scheduled_zoom', 'meeting_scheduled_modiin',
      'meeting_scheduled_petah_tikva', 'meeting_scheduled_phone',
      'meeting_scheduled_divorce_split', 'meeting_scheduled_annual_service',
      'post_location_photo_prompt', 'questionnaire_request', 'questionnaire_ack_waiting',
      'questionnaire_completed_thanks', 'questionnaire_id_request',
      'id_details_received_ack', 'id_details_retry', 'documents_request',
      'documents_sent_ack', 'documents_received_ack', 'documents_confirmed',
      'preparation_complete_closing', 'pre_meeting_reminder', 'reminder_d1',
      'reminder_d1_zoom', 'reminder_d1_modiin', 'reminder_d1_petah_tikva',
      'reminder_h1', 'meeting_day_reminder',
    ],
  },
  service_b_awaiting: {
    label: 'מסלול ב — ממתין להחלטה',
    keys: [
      'meeting_summary_quote', 'quote_sent', 'schedule_intro',
      'resume_nudge', 'resume_nudge_2', 'followup_t7', 'followup_t14', 'followup_t21',
    ],
  },
  service_c_not_interested: {
    label: 'מסלול ג — לא מעוניין',
    keys: ['not_interested_reason', 'not_interested_value', 'value_proposition', 'opt_in_future', 'goodbye'],
  },
  webinar: {
    label: 'וובינר',
    keys: [
      'webinar_lead_intro', 'webinar_type_clarify', 'webinar_confirm', 'webinar_confirm_recording',
      'webinar_reminder_1h', 'webinar_reminder_h1', 'webinar_reminder_start', 'webinar_post_intro', 'webinar_post_options', 'webinar_coupon',
      'webinar_payment_intro', 'webinar_payment', 'webinar_payment_pending_ack',
      'webinar_location_choice', 'webinar_location', 'webinar_schedule',
      'webinar_meeting_confirmed', 'webinar_recording',
    ],
  },
  shared_handoff: {
    label: 'משותף — נימוס, הבהרה, נציגה',
    keys: [
      'polite_ack', 'patience_message', 'clarification_request', 'fallback_1',
      'fallback_2_escalation', 'off_topic_reply', 'wait_coordinator_ack',
      'coordinator_notify', 'coordinator_no_response', 'escalate_to_agent',
      'handoff_message', 'conversation_closing', 'shoranss_questionnaire',
      'questionnaire_reminder', 'phone_call_summary_block', 'birthday',
      'birthday_greeting', 'annual_followup', 'unsubscribe_confirm',
    ],
  },
};

const CATEGORIES_ORDER = [
  { key: 'welcome',    label: 'פתיחה',           color: '#EDE8F5', text: '#4A2C78' },
  { key: 'menu',       label: 'תפריטים',          color: '#E8EEF8', text: '#2952A3' },
  { key: 'followup',   label: 'מעקב',             color: '#F5EDD8', text: '#9A6210' },
  { key: 'reminder',   label: 'תזכורות',          color: '#DCF0E8', text: '#2E7A4A' },
  { key: 'closing',    label: 'סיום',             color: '#D8EDD8', text: '#2A6A2A' },
  { key: 'error',      label: 'שגיאות / הבהרות',  color: '#F8DCDC', text: '#A82020' },
  { key: 'escalation', label: 'העברה לנציגה',     color: '#F8E8DC', text: '#B04020' },
  { key: '_none',      label: 'ללא קטגוריה',      color: '#F0F0F0', text: '#666666' },
];

export default function BotContentKanban({ items, onEdit }) {
  const [route, setRoute] = useState('all');

  const routeKeys = route !== 'all' ? ROUTE_MAP[route]?.keys || [] : null;

  const filteredItems = routeKeys
    ? items.filter(item => routeKeys.includes(item.key))
        .sort((a, b) => routeKeys.indexOf(a.key) - routeKeys.indexOf(b.key))
    : items;

  const grouped = {};
  CATEGORIES_ORDER.forEach(c => { grouped[c.key] = []; });

  filteredItems.forEach(item => {
    const key = item.category && grouped[item.category] ? item.category : '_none';
    grouped[key].push(item);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">סינון לפי מסלול:</span>
        <Select value={route} onValueChange={setRoute}>
          <SelectTrigger className="w-[220px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל המסלולים</SelectItem>
            {Object.entries(ROUTE_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {route !== 'all' && (
          <span className="text-xs text-muted-foreground">{filteredItems.length} הודעות</span>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4" dir="rtl">
      {CATEGORIES_ORDER.map(col => {
        const colItems = grouped[col.key];
        if (colItems.length === 0) return null;
        return (
          <div key={col.key} className="min-w-[220px] max-w-[260px] flex-shrink-0">
            <div className="rounded-t-lg px-3 py-2 flex items-center justify-between" style={{ backgroundColor: col.color }}>
              <span className="font-semibold text-sm" style={{ color: col.text }}>{col.label}</span>
              <span className="text-xs rounded-full px-2 py-0.5" style={{ backgroundColor: col.text + '20', color: col.text }}>{colItems.length}</span>
            </div>
            <div className="space-y-2 p-2 rounded-b-lg border border-t-0 bg-card min-h-[100px]">
              {colItems.map(item => (
                <button key={item.id} onClick={() => onEdit(item)}
                  className="w-full text-right p-2.5 rounded-lg border bg-background hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-medium text-xs leading-snug">{item.title}</span>
                    {!item.is_active && <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive flex-shrink-0">כבוי</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap mb-1.5">
                    {(item.content || '').slice(0, 80)}{(item.content || '').length > 80 ? '…' : ''}
                  </p>
                  {item.step_label && (
                    <span className="text-[10px] text-gold bg-gold/10 rounded px-1.5 py-0.5">{item.step_label}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
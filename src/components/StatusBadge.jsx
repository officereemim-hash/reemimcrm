import { cn } from '@/lib/utils';

const contactStatusMap = {
  new_lead:      { label: 'ליד חדש',       bg: '#EDE8F5', text: '#4A2C78' },
  in_progress:   { label: 'בטיפול',        bg: '#E8EEF8', text: '#2952A3' },
  quote_sent:    { label: 'הצעה נשלחה',    bg: '#F8F0DC', text: '#A87B20' },
  active_client: { label: 'לקוח פעיל',     bg: '#DCF0E8', text: '#2E7A4A' },
  completed:     { label: 'הושלם',         bg: '#D8EDD8', text: '#2A6A2A' },
  not_relevant:  { label: 'לא רלוונטי',    bg: '#EBEBEB', text: '#555555' },
  archived:      { label: 'ארכיון',        bg: '#D8D8D8', text: '#444444' },
};

const botStatusMap = {
  new:                { label: 'חדש',           bg: '#EDE8F5', text: '#4A2C78' },
  waiting_agent:      { label: 'ממתין לנציגה',  bg: '#F8EDE8', text: '#C05A45' },
  waiting_user_reply: { label: 'ממתין לתגובה',  bg: '#F5EDD8', text: '#9A6210' },
  in_conversation:    { label: 'בשיחה',         bg: '#E8EEF8', text: '#2952A3' },
  escalated_to_agent: { label: 'הועבר לנציגה',  bg: '#F8E8DC', text: '#B04020' },
  no_response:        { label: 'אין מענה',       bg: '#F8DCDC', text: '#A82020' },
  closed:             { label: 'סגור',           bg: '#DCF0E8', text: '#2E7A4A' },
  not_relevant:       { label: 'לא רלוונטי',    bg: '#EBEBEB', text: '#555555' },
};

const srStatusMap = {
  new:                      { label: 'חדש',              bg: '#EDE8F5', text: '#4A2C78' },
  in_progress:              { label: 'בטיפול',           bg: '#E8EEF8', text: '#2952A3' },
  quote_sent:               { label: 'הצעה נשלחה',       bg: '#F8F0DC', text: '#A87B20' },
  awaiting_client_decision: { label: 'ממתין להחלטה',     bg: '#F5EDD8', text: '#9A6210' },
  followup_active:          { label: 'פולו-אפ פעיל',     bg: '#F8E8DC', text: '#B04020' },
  phone_meeting:            { label: 'נקבעה שיחה טלפונית', bg: '#E3F2FD', text: '#1565C0' },
  meeting_scheduled:        { label: 'פגישה נקבעה',      bg: '#D4F0E8', text: '#2A7A5A' },
  completed:                { label: 'הושלם',            bg: '#D8EDD8', text: '#2A6A2A' },
  cancelled:                { label: 'בוטל',             bg: '#EBEBEB', text: '#555555' },
  followup_closed:          { label: 'פולו-אפ נסגר',     bg: '#D8D8D8', text: '#444444' },
  closed_lost:              { label: 'נסגר — אבוד',       bg: '#F8DCDC', text: '#A82020' },
};

const meetingStatusMap = {
  scheduled:   { label: 'מתוכנן',     bg: '#E8EEF8', text: '#2952A3' },
  completed:   { label: 'התקיים',     bg: '#D8EDD8', text: '#2A6A2A' },
  cancelled:   { label: 'בוטל',       bg: '#EBEBEB', text: '#555555' },
  no_show:     { label: 'לא הגיע',    bg: '#F8DCDC', text: '#A82020' },
  rescheduled: { label: 'תואם מחדש',  bg: '#F5EDD8', text: '#9A6210' },
};

const taskStatusMap = {
  open:        { label: 'פתוח',       bg: '#EDE8F5', text: '#4A2C78' },
  in_progress: { label: 'בביצוע',     bg: '#E8EEF8', text: '#2952A3' },
  done:        { label: 'הושלם',      bg: '#D8EDD8', text: '#2A6A2A' },
  cancelled:   { label: 'בוטל',       bg: '#EBEBEB', text: '#555555' },
};

const priorityMap = {
  low:    { label: 'נמוכה',  bg: '#EBEBEB', text: '#555555' },
  normal: { label: 'רגילה',  bg: '#E8EEF8', text: '#2952A3' },
  high:   { label: 'גבוהה',  bg: '#F5EDD8', text: '#9A6210' },
  urgent: { label: 'דחוף',   bg: '#F8DCDC', text: '#A82020' },
};

export function ContactStatusBadge({ status }) {
  const s = contactStatusMap[status] || { label: status, bg: '#EBEBEB', text: '#555' };
  return <Badge bg={s.bg} text={s.text} label={s.label} />;
}

export function BotStatusBadge({ status }) {
  const s = botStatusMap[status] || { label: status, bg: '#EBEBEB', text: '#555' };
  return <Badge bg={s.bg} text={s.text} label={s.label} />;
}

export function SRStatusBadge({ status }) {
  const s = srStatusMap[status] || { label: status, bg: '#EBEBEB', text: '#555' };
  return <Badge bg={s.bg} text={s.text} label={s.label} />;
}

export function MeetingStatusBadge({ status }) {
  const s = meetingStatusMap[status] || { label: status, bg: '#EBEBEB', text: '#555' };
  return <Badge bg={s.bg} text={s.text} label={s.label} />;
}

export function TaskStatusBadge({ status }) {
  const s = taskStatusMap[status] || { label: status, bg: '#EBEBEB', text: '#555' };
  return <Badge bg={s.bg} text={s.text} label={s.label} />;
}

export function PriorityBadge({ priority }) {
  const s = priorityMap[priority] || { label: priority, bg: '#EBEBEB', text: '#555' };
  return <Badge bg={s.bg} text={s.text} label={s.label} />;
}

function Badge({ bg, text, label }) {
  return (
    <span
      className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

export const SERVICE_TYPE_LABELS = {
  retirement: 'ייעוץ פרישה',
  economic_feasibility: 'היתכנות כלכלית',
  investments: 'השקעות',
  divorce_split: 'איזון אקטוארי',
  tax_advisory: 'ייעוץ מס',
  annual_service: 'שירות שנתי',
  annual_service_call: 'שיחת שירות שנתית',
};

export const SOURCE_LABELS = {
  facebook: 'פייסבוק',
  website: 'אתר',
  webinar: 'וובינר',
  referral: 'הפניה',
  excel_import: 'ייבוא אקסל',
  manual: 'ידני',
  bot: 'בוט',
  bar_call: 'שיחת בר',
};
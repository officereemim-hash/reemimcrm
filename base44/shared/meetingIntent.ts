// זיהוי הודעה שעוסקת בפגישה שכבר קיימת (הקדמה / דחייה / ביטול / איחור / חניה / מספר רכב / שאלה על הפגישה)
// סינון מילים מהיר קודם — רק אם יש התאמה נשאלת הבינה המלאכותית (מודל מהיר, שאלה סגורה).

const KEYWORDS = /פגיש|להקדים|נקדים|להזיז|לדחות|נדחה|לבטל|ביטול|מבטל|לשנות|מאחר|מאחרת|איחור|חניה|חנייה|רכב|לחנות|יש לנו|קבענו|קבעתי|תור|נפגש|הפגישה/;

export function maybeAboutExistingMeeting(text: string): boolean {
  const t = String(text || '');
  if (t.trim().split(/\s+/).length < 2 && !/\d{5,8}/.test(t)) return false;
  return KEYWORDS.test(t) || /\b\d{2,3}-?\d{2,3}-?\d{2,3}\b/.test(t);
}

export async function classifyMeetingIntent(base44: any, text: string) {
  const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gpt_5_mini',
    prompt: `הודעת וואטסאפ שהתקבלה במשרד לתכנון פרישה:\n"""${String(text).substring(0, 600)}"""\n\nהאם הכותב מתייחס לפגישה שכבר נקבעה איתנו (למשל: הקדמה, דחייה, ביטול, איחור, חניה, שליחת מספר רכב, שאלה על פרטי הפגישה)? פנייה של ליד חדש שמתעניין בשירות או רוצה לקבוע פגישה חדשה — אינה פגישה קיימת.\nאם יש בהודעה מספר רכב — החזר אותו בספרות בלבד, אחרת מחרוזת ריקה. summary = משפט קצר בעברית מה הלקוח מבקש.`,
    response_json_schema: {
      type: 'object',
      properties: {
        about_existing_meeting: { type: 'boolean' },
        car_plate: { type: 'string' },
        summary: { type: 'string' },
      },
      required: ['about_existing_meeting'],
    },
  });
  return res || { about_existing_meeting: false };
}
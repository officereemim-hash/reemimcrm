import { useState } from 'react';
import {
  LayoutDashboard, Users, FileText, Calendar, Video,
  Globe, Bot, MessageCircle, Link2, Settings, Zap,
  Lightbulb, ChevronDown, Mail,
} from 'lucide-react';

const SECTIONS = [
  { id: 'dashboard', icon: LayoutDashboard, color: 'hsl(270,47%,32%)', title: 'דשבורד — המסך הראשי',
    points: [
      'סיכום מהיר: לידים חדשים, פגישות קרובות, משימות פתוחות.',
      'התראות דחופות — כשלי תקשורת, פניות שממתינות.',
      'גישה מהירה לפעילות האחרונה.',
    ] },
  { id: 'contacts', icon: Users, color: 'hsl(12,54%,67%)', title: 'לקוחות',
    points: [
      'חיפוש לפי שם / טלפון / מייל, וסינון לפי סטטוס, מקור ושירות.',
      'לחיצה על שם → כרטיס מלא: פרטים אישיים, פניות שירות, פגישות, מסמכים, תקשורת.',
      'ייבוא מ-Excel, הוספה ידנית, וקישור לשורנס.',
    ] },
  { id: 'service-requests', icon: FileText, color: 'hsl(42,65%,55%)', title: 'פניות שירות',
    points: [
      'ייעוץ פרישה, היתכנות כלכלית, השקעות, איזון אקטוארי, ייעוץ מס, שירות שנתי.',
      'מעקב שלב-אחר-שלב: ליד → בטיפול → הצעת מחיר → פגישה → סגירה.',
      'פולו-אפ אוטומטי (T+7 / T+14 / T+21) + הסלמה.',
    ] },
  { id: 'meetings', icon: Calendar, color: 'hsl(130,42%,43%)', title: 'פגישות ומשימות',
    points: [
      'פגישות: זום / פרונטלית (מודיעין / פתח תקווה) / טלפונית.',
      'תזכורות אוטומטיות: יום לפני ושעה לפני.',
      'משימות: פולו-אפ, איסוף מסמכים, צ\'קליסטים לפני/אחרי פגישה.',
    ] },
  { id: 'marketing', icon: Mail, color: '#B0455E', title: 'מרכז דיוור',
    points: [
      'שליחת קמפיינים במייל (דרך Brevo) ובוואטסאפ.',
      'סוגים: ניוזלטר, ברכת יום הולדת, ביקורת גוגל, פולו-אפ אחרי פגישה, תזכורת שנתית.',
      'עורך תבניות: כותרות, טקסט, תמונות, כפתורים, מפריד.',
      'מעקב: נפתח / נקלק / חזר (bounce) — מ-Brevo webhooks.',
    ] },
  { id: 'webinars', icon: Video, color: 'hsl(270,47%,32%)', title: 'וובינרים',
    points: [
      'מעקב אחרי כל שלב: נרשם → תזכורת → השתתף → קופון → שילם → פגישה.',
      'רישום אוטומטי לזום + קישור הצטרפות אישי.',
      'שליחת הקלטה אוטומטית למשתתפים אחרי הוובינר.',
      'קופון מותאם (סכום + אחוז הטבה) נשלח למשתתפים.',
    ] },
  { id: 'landing', icon: Globe, color: '#2A6B6B', title: 'דפי נחיתה',
    points: [
      'יצירת דף נחיתה לכל וובינר — עיצוב, תוכן, טופס הרשמה.',
      'בלוקים גמישים: טקסט, תמונה, רשימת נקודות.',
      'שאלות ותשובות, פרטי המרצה, הסכמה ותנאי שימוש.',
    ],
    note: 'שינוי תאריך הוובינר בדף הנחיתה מעדכן אוטומטית את כל הנרשמים ואת זום.' },
  { id: 'bot-content', icon: Bot, color: 'hsl(270,47%,32%)', title: 'תוכן הבוט',
    intro: 'עריכת ההודעות שהבוט שולח בוואטסאפ:',
    points: [
      'BotContent — הודעות עם placeholders (למשל {name}, {link}).',
      'ServiceContent — קישורים: תשלום, הסכם, יומן Cal.com.',
      'Agent Instructions — התסריט שמנחה את הבוט מתי לשלוף מה ובאיזה סדר.',
    ],
    note: 'כל שינוי בהודעות הבוט נכנס לתוקף מיד — בלי צורך בריסטרט.' },
  { id: 'bot-flows', icon: MessageCircle, color: '#2A6B6B', title: 'מסלולי הבוט — מה הלקוח חווה',
    intro: 'הבוט מנהל שני מסלולים עיקריים:',
    flows: [
      { name: '🛤️ מסלול כללי (General Path)', desc: 'ליד חדש → זיהוי שירות → שאלון שורנס → הצעת מחיר → תיאום פגישה → פולו-אפ → סגירה.' },
      { name: '🎥 מסלול וובינר (Webinar Path)', desc: 'הרשמה לדף נחיתה → אישור + תזכורות → נוכחות → קופון → תשלום → תיאום פגישה.' },
    ],
    subTitle: 'שלבים משותפים לשני המסלולים:',
    subFlows: [
      { name: '📋 זיהוי שירות', desc: 'הבוט שואל שאלות ומזהה סוג שירות (פרישה, השקעות, איזון, מס ועוד).' },
      { name: '📝 שאלון שורנס', desc: 'שליחת קישור אוטומטית + מעקב עד מילוי.' },
      { name: '💰 הצעת מחיר', desc: 'שליחת הסכם דיגיטלי + קישור תשלום.' },
      { name: '📅 תיאום פגישה', desc: 'קישור Cal.com לבחירת מועד (זום / פרונטלית / טלפונית).' },
      { name: '🔄 פולו-אפ', desc: 'T+7 / T+14 / T+21 — תזכורות אוטומטיות. אחרי 3 ניסיונות → הסלמה לנציגה.' },
      { name: '👩‍💼 הסלמה', desc: 'העברה לנציגה אנושית + התראה בוואטסאפ.' },
    ],
    note: '🔒 הבוט תמיד עונה בעברית בלבד ולעולם לא אוסף פרטי אשראי — רק קישור מאובטח.' },
  { id: 'settings', icon: Settings, color: 'hsl(42,65%,55%)', title: 'הגדרות',
    points: [
      'כללי: הגדרות AI Agent, אוטומציות פעילות, זמני SLA, הרשאות.',
      'הגדרות מערכת: ערכים כלליים (מיילים, קישורים, פרמטרים).',
      'לוג תקשורת: כל ההודעות שנשלחו ונכשלו.',
      'מרכז דיוור: הגדרות Brevo ותבניות.',
      'קופונים: הגדרות קופון לכל סוג וובינר.',
      'כלי בדיקה: איפוס משתמש טסט.',
      'בדיקת בוט: סימולטור שיחה חיה.',
    ] },
  { id: 'auto', icon: Zap, color: 'hsl(130,42%,43%)', title: 'מה קורה אוטומטית',
    points: [
      'בוט וואטסאפ עונה ללידים חדשים ומנהל שיחה מלאה.',
      'תזכורות פגישה: יום לפני + שעה לפני.',
      'פולו-אפ: T+7 / T+14 / T+21 + הסלמה.',
      'וובינר: רישום לזום, תזכורות, שליחת הקלטה, קופון.',
      'ברכות יום הולדת + תזכורת שנתית.',
      'סנכרון לידים מ-Google Sheets + Gmail (שורנס).',
      'קמפיינים מתוזמנים (מייל + וואטסאפ).',
    ] },
  { id: 'tips', icon: Lightbulb, color: 'hsl(270,47%,32%)', title: 'טיפים',
    points: [
      'רענון: Cmd/Ctrl + Shift + R.',
      'נייד: המערכת עובדת גם מהטלפון (תפריט ☰).',
      'כפתור ה-? בפינה השמאלית התחתונה → סיור אינטראקטיבי.',
      'בכל עמוד אפשר לסנן, לחפש ולייצא נתונים.',
    ] },
];

export default function HelpGuideTab() {
  const [open, setOpen] = useState('dashboard');

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold text-primary mb-1">מדריך שימוש 📖</h2>
        <p className="text-sm text-muted-foreground">כל מה שצריך לדעת על המערכת — בלי ידע טכני. לחצי על נושא כדי לפתוח.</p>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((s) => {
          const isOpen = open === s.id;
          const Icon = s.icon;
          return (
            <section key={s.id} className="rounded-2xl overflow-hidden border bg-card"
              style={{ borderRightWidth: isOpen ? 4 : 1, borderRightColor: isOpen ? s.color : 'hsl(var(--border))' }}>
              <button onClick={() => setOpen(isOpen ? null : s.id)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-right">
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.color }}>
                    <Icon size={18} color="#fff" />
                  </span>
                  <span className="font-bold text-base truncate">{s.title}</span>
                </span>
                <ChevronDown size={20} className="text-muted-foreground flex-shrink-0 transition-transform duration-200"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t">
                  {s.intro && <p className="text-sm mt-3 mb-1">{s.intro}</p>}
                  {s.points && (
                    <ul className="mt-3 space-y-2">
                      {s.points.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.flows && (
                    <div className="mt-3 space-y-2.5">
                      {s.flows.map((f) => (
                        <div key={f.name} className="flex items-start gap-2.5">
                          <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          <p className="text-sm leading-relaxed">
                            <span className="font-bold text-primary">{f.name}</span>
                            <span className="text-muted-foreground"> — {f.desc}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.subTitle && <p className="text-sm font-semibold mt-4 mb-1">{s.subTitle}</p>}
                  {s.subFlows && (
                    <div className="space-y-2">
                      {s.subFlows.map((f) => (
                        <div key={f.name} className="flex items-start gap-2.5">
                          <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          <p className="text-sm leading-relaxed">
                            <span className="font-bold text-primary">{f.name}</span>
                            <span className="text-muted-foreground"> — {f.desc}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.note && (
                    <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-accent/10 border border-accent/30">
                      <Zap size={14} className="mt-0.5 flex-shrink-0 text-accent" />
                      <p className="text-xs leading-relaxed">{s.note}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
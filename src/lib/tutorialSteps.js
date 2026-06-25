import {
  Sparkles, LayoutDashboard, Users, FileText, Calendar,
  Video, Globe, Bot, FileText as FileTextAlt, Mail,
  Settings, MessageCircle,
} from 'lucide-react';

const TUTORIAL_STEPS = [
  {
    id: 'welcome', icon: Sparkles, iconColor: 'text-primary', bgColor: 'from-secondary to-white',
    title: 'ברוכה הבאה! 🌟',
    content: 'זה סיור קצר שיכיר לך את המערכת. כל שלב יקפיץ אותך לעמוד הרלוונטי. אפשר לדלג, לחזור, או לצאת בכל רגע — והכפתור עם ה-? תמיד יחזיר אותך לכאן.',
    navigateTo: '/',
  },
  {
    id: 'dashboard', icon: LayoutDashboard, iconColor: 'text-primary', bgColor: 'from-secondary to-white',
    title: 'דשבורד — המסך הראשי',
    content: 'כאן רואים הכול במבט אחד: סיכום לידים, פגישות קרובות, משימות פתוחות והתראות חשובות.',
    navigateTo: '/',
  },
  {
    id: 'contacts', icon: Users, iconColor: 'text-coral', bgColor: 'from-[#FAF0ED] to-white',
    title: 'לקוחות',
    content: 'כל אנשי הקשר במערכת — לידים, לקוחות פעילים ולקוחות לשעבר. חיפוש, סינון, ולחיצה על שם לכרטיס מלא.',
    tip: 'לחיצה על איש קשר פותחת כרטיס עם כל הפרטים: פניות שירות, פגישות, מסמכים ותקשורת.',
    navigateTo: '/contacts',
  },
  {
    id: 'service-requests', icon: FileText, iconColor: 'text-gold', bgColor: 'from-[#FBF1DE] to-white',
    title: 'פניות שירות',
    content: 'כל הפניות מכל הסוגים: ייעוץ פרישה, השקעות, איזון אקטוארי ועוד. מעקב סטטוס, שלב בתהליך, ופולו-אפ אוטומטי.',
    navigateTo: '/service-requests',
  },
  {
    id: 'meetings', icon: Calendar, iconColor: 'text-success', bgColor: 'from-[#EEF4E9] to-white',
    title: 'פגישות ומשימות',
    content: 'פגישות שנקבעו (זום / פרונטלית / טלפונית) ומשימות פתוחות. תזכורות יוצאות אוטומטית יום לפני ושעה לפני.',
    navigateTo: '/meetings',
  },
  {
    id: 'marketing', icon: Mail, iconColor: 'text-[#B0455E]', bgColor: 'from-[#FAECF0] to-white',
    title: 'מרכז דיוור',
    content: 'שליחת קמפיינים במייל ובוואטסאפ: ניוזלטר, ברכות יום הולדת, תזכורת שנתית, פולו-אפ אחרי פגישה ועוד.',
    navigateTo: '/marketing',
  },
  {
    id: 'webinars', icon: Video, iconColor: 'text-primary', bgColor: 'from-secondary to-white',
    title: 'וובינרים',
    content: 'ניהול נרשמים לוובינרים — מעקב אחרי רישום, נוכחות, קופון, תשלום ותיאום פגישה. הכל אוטומטי מרגע ההרשמה.',
    navigateTo: '/webinars',
  },
  {
    id: 'landing-pages', icon: Globe, iconColor: 'text-[#2A6B6B]', bgColor: 'from-[#E6F4EF] to-white',
    title: 'דפי נחיתה',
    content: 'יצירת דפי נחיתה לוובינרים — עם טופס הרשמה, מידע על המרצה, שאלות ותשובות ועיצוב מותאם אישית.',
    tip: 'שינוי תאריך הוובינר בדף הנחיתה מעדכן אוטומטית את כל הנרשמים ואת זום.',
    navigateTo: '/landing-pages',
  },
  {
    id: 'bot-content', icon: Bot, iconColor: 'text-primary', bgColor: 'from-secondary to-white',
    title: 'תוכן הבוט',
    content: 'עריכת הודעות הבוט בוואטסאפ — לכל שלב בתהליך יש הודעה מותאמת עם placeholders לקישורים.',
    tip: 'הודעות הבוט מחולקות לפי קטגוריות (ברכה, תפריט, פולו-אפ, תזכורת ועוד).',
    navigateTo: '/bot-content',
  },
  {
    id: 'bot-flows', icon: MessageCircle, iconColor: 'text-[#2A6B6B]', bgColor: 'from-[#E6F4EF] to-white',
    title: 'מסלולי הבוט 🤖',
    content: 'הבוט מנהל שני מסלולים עיקריים:',
    flows: [
      { name: '🛤️ מסלול כללי (General Path)', desc: 'ליד חדש → זיהוי שירות → שאלון שורנס → הצעת מחיר → תיאום פגישה → סגירה.' },
      { name: '🎥 מסלול וובינר (Webinar Path)', desc: 'הרשמה → תזכורות → נוכחות → קופון → תשלום → תיאום פגישה.' },
      { name: '📋 זיהוי שירות', desc: 'הבוט שואל שאלות ומזהה את סוג השירות (פרישה, השקעות, איזון, מס ועוד).' },
      { name: '📝 שאלון שורנס', desc: 'שליחת קישור לשאלון אוטומטית ומעקב עד מילוי.' },
      { name: '💰 הצעת מחיר', desc: 'שליחת הסכם דיגיטלי וקישור תשלום.' },
      { name: '📅 תיאום פגישה', desc: 'שליחת קישור Cal.com לבחירת מועד (זום / פרונטלית / טלפונית).' },
      { name: '🔄 פולו-אפ', desc: 'T+7 / T+14 / T+21 — תזכורות אוטומטיות + הסלמה לנציגה.' },
      { name: '👩‍💼 הסלמה', desc: 'העברה לנציגה אנושית כשהבוט לא מצליח לענות.' },
    ],
    tip: 'פירוט מלא של כל מסלול נמצא במדריך השימוש (הגדרות → מדריך שימוש).',
    navigateTo: '/bot-content',
  },
  {
    id: 'service-content', icon: FileTextAlt, iconColor: 'text-coral', bgColor: 'from-[#FAF0ED] to-white',
    title: 'ניהול תוכן',
    content: 'הקישורים שהבוט שולח — תשלום, הסכמים, יומנים ועוד. כל קישור משויך לסוג שירות.',
    navigateTo: '/service-content',
  },
  {
    id: 'settings', icon: Settings, iconColor: 'text-gold', bgColor: 'from-[#FBF1DE] to-white',
    title: 'הגדרות',
    content: 'הגדרות מערכת, לוג תקשורת, מרכז דיוור, קופונים, כלי בדיקה וסימולטור בוט.',
    tip: 'בטאב "מדריך שימוש" תמצאי הסבר מפורט על כל חלק במערכת.',
    navigateTo: '/settings',
  },
  {
    id: 'done', icon: Sparkles, iconColor: 'text-primary', bgColor: 'from-secondary to-white',
    title: 'סיימת! 🎉',
    content: 'את מכירה את המערכת. הבוט עונה אוטומטית, התהליכים רצים לבד, ואת מנהלת הכול מכאן. הכפתור עם ה-? תמיד זמין לסיור חוזר.',
    navigateTo: '/',
  },
];

export default TUTORIAL_STEPS;
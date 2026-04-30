import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Send, RotateCcw, Bot, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const PERSONAS = [
  { value: 'new_lead', label: 'ליד חדש', desc: 'פנייה ראשונה מפייסבוק' },
  { value: 'returning_client', label: 'לקוח חוזר', desc: 'לקוח קיים שחוזר' },
  { value: 'webinar', label: 'משתתף וובינר', desc: 'אחרי וובינר עם קופון' },
];

export default function BotChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState('new_lead');
  const [botContents, setBotContents] = useState([]);
  const [serviceContents, setServiceContents] = useState([]);
  const [systemSettings, setSystemSettings] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    Promise.all([
      base44.entities.BotContent.list('-created_date', 500),
      base44.entities.ServiceContent.list('sort_order', 500),
      base44.entities.SystemSetting.list('category', 500),
    ]).then(([bc, sc, ss]) => {
      setBotContents(bc);
      setServiceContents(sc);
      setSystemSettings(ss);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildSystemPrompt = () => {
    const botMessages = botContents.filter(b => b.is_active !== false).map(b => `[${b.key}] (${b.category}/${b.service_type_flow || 'general'}): ${b.content}`).join('\n');
    const links = serviceContents.filter(s => s.is_active !== false).map(s => `[${s.content_type}/${s.service_type}${s.sub_type ? '/' + s.sub_type : ''}] ${s.title}: ${s.url || 'ללא קישור'}`).join('\n');
    const settings = systemSettings.map(s => `${s.key}: ${s.value}`).join('\n');

    const personaContext = persona === 'returning_client'
      ? 'הפונה הוא לקוח קיים (status=active_client). שמו דוד כהן.'
      : persona === 'webinar'
        ? 'הפונה הגיע מוובינר השקעות. יש לו קוד קופון INVEST2026. שמו משה לוי.'
        : 'הפונה הוא ליד חדש מפייסבוק. שמו ישראל ישראלי.';

    return `את נציגת WhatsApp של קרנות ראמים — בשמת שערי בלוך, מומחית בגנטיקה רפואית ופנסיונית.
ענה בעברית בלבד. היה ידידותי ומקצועי. אל תמציאי מחירים.

=== פרסונת הבדיקה ===
${personaContext}

=== בנק הודעות (BotContent) ===
כאשר ההנחיות אומרות "שלוף key=X" — חפשי את ה-key ושלחי את ה-content:
${botMessages}

=== תוכן שירות (ServiceContent) ===
קישורים ומסמכים — שלחי אותם כשרלוונטי:
${links}

=== הגדרות מערכת ===
${settings}

=== מסלולי השיחה ===
1. פנייה רגילה: כניסה → תפריט 6 שירותים → בחירת המשך (נציגה / תיאום עצמי)
2. מסלול א׳ (סגור): תיאום פגישה → שאלון שורנס → מסמכים → תזכורות → פגישה
3. מסלול ב׳ (רוצה לחשוב): הצעת מחיר → פולו-אפ T+7/14/21
4. מסלול ג׳ (לא מעוניין): שאלת סיבה → הצעת ערך → opt-in עתידי
5. נתיב וובינר: קופון → תשלום → בחירת מיקום → תיאום

שלחי הודעה אחת בכל תגובה. קצר וממוקד.`;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    const history = [...messages, { role: 'user', content: userMsg }];
    const conversationText = history.map(m => `${m.role === 'user' ? 'לקוח' : 'בוט'}: ${m.content}`).join('\n');

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${buildSystemPrompt()}\n\n=== היסטוריית שיחה ===\n${conversationText}\n\nבוט:`,
    });

    setMessages(prev => [...prev, { role: 'bot', content: result }]);
    setLoading(false);
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
            <Bot size={20} className="text-success" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">בדיקת בוט</h1>
            <p className="text-sm text-muted-foreground">סימולציית שיחת WhatsApp — לא נשלח באמת</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <Label className="text-xs">פרסונה</Label>
            <Select value={persona} onValueChange={setPersona}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSONAS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1 mt-5"><RotateCcw size={14} />אפס</Button>
        </div>
      </div>

      <Card className="shadow-sm">
        {/* Chat header */}
        <div className="flex items-center gap-3 p-4 border-b bg-success/5 rounded-t-xl">
          <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
            <Bot size={18} className="text-success" />
          </div>
          <div>
            <div className="font-semibold text-sm">בוט קרנות ראמים</div>
            <div className="text-xs text-muted-foreground">מצב בדיקה — {PERSONAS.find(p => p.value === persona)?.desc}</div>
          </div>
        </div>

        {/* Messages */}
        <div className="h-[400px] overflow-y-auto p-4 space-y-3 bg-muted/20">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-16">
              שלח הודעה כדי להתחיל את הסימולציה 💬
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-card border rounded-br-sm'
                  : 'bg-success/10 text-foreground rounded-bl-sm'
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                  <span className="text-xs font-medium text-muted-foreground">{msg.role === 'user' ? 'לקוח' : 'בוט'}</span>
                </div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-end">
              <div className="bg-success/10 rounded-2xl px-4 py-3 rounded-bl-sm">
                <Loader2 size={16} className="animate-spin text-success" />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="כתוב הודעה..."
            className="flex-1"
            disabled={loading}
          />
          <Button onClick={handleSend} disabled={!input.trim() || loading} size="icon">
            <Send size={16} />
          </Button>
        </div>
      </Card>
    </div>
  );
}
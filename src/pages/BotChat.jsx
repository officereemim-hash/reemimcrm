import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Bot } from 'lucide-react';
import MessageBubble from '@/components/bot-chat/MessageBubble';
import ChatInput from '@/components/bot-chat/ChatInput';
import BotConversationsList from '@/components/bot-chat/BotConversationsList';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const AGENT_NAME = 'bot_reemim';

// Naive UTC timestamps from the API must not be parsed as local time
const toUtcTime = (value) => {
  if (!value) return 0;
  const s = String(value);
  return new Date(/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`).getTime();
};

export default function BotChat() {
  const [conversations, setConversations] = useState([]);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [hiddenLoaded, setHiddenLoaded] = useState(false);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [statusMessages, setStatusMessages] = useState([]);
  const [showNewConvDialog, setShowNewConvDialog] = useState(false);
  const [newConvPhone, setNewConvPhone] = useState('');
  const [newConvEmail, setNewConvEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const messagesEndRef = useRef(null);
  const contactLookupCacheRef = useRef(new Map());
  const convContactCacheRef = useRef(new Map());
  const messagesRef = useRef([]);
  const isLoadingStatusRef = useRef(false);
  const injectedRef = useRef(new Set());

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Load hidden IDs from user profile
  useEffect(() => {
    const loadHidden = async () => {
      const user = await base44.auth.me();
      const saved = user?.hidden_conversations || [];
      setHiddenIds(saved);
      setHiddenLoaded(true);
    };
    loadHidden();
  }, []);

  useEffect(() => {
    if (hiddenLoaded) loadConversations();
  }, [hiddenLoaded]);

  const loadConversations = useCallback(async () => {
    setIsLoadingList(true);
    // קריאה דרך השרת — שיחות הסימולטור נוצרות ע"י המערכת ולא נגישות ישירות מהדפדפן
    const res = await base44.functions.invoke('getSimConversation', {});
    const all = (res.data?.conversations || []).filter(c => c.metadata?.source === 'test');
    setConversations(all.filter(c => !hiddenIds.includes(c.id)));
    setIsLoadingList(false);
  }, [hiddenIds]);

  // Load active conversation and subscribe
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      setActiveConv(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const res = await base44.functions.invoke('getSimConversation', { conversation_id: activeConvId });
      if (cancelled) return;
      const conv = res.data?.conversation;
      if (!conv) return;
      setActiveConv(prev => (prev?.id === conv.id ? prev : conv));
      setMessages(conv.messages || []);
    };
    load();
    const timer = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeConvId]);

  const extractPhoneFromMessages = useCallback((items) => {
    const text = (items || []).map(m => m.content || '').join(' ');
    const match = text.match(/(?:\+?972|0)5\d[\s-]?\d{3}[\s-]?\d{4}/);
    return match ? match[0].replace(/[\s-]/g, '') : '';
  }, []);

  const normalizeCachePhone = useCallback((phone) => {
    const raw = String(phone || '').trim().replace(/[\s\-\+\(\)]/g, '');
    if (!raw) return '';
    return raw.startsWith('0') ? `972${raw.substring(1)}` : raw;
  }, []);

  const buildPhoneVariants = useCallback((phone) => {
    const raw = String(phone || '').trim().replace(/[\s-]/g, '').replace(/^\+/, '');
    if (!raw) return [];

    const normalized = raw.startsWith('0') ? `972${raw.substring(1)}` : raw;
    const local = normalized.startsWith('972') ? `0${normalized.substring(3)}` : raw;

    return [...new Set([raw, normalized, `+${normalized}`, local].filter(Boolean))];
  }, []);

  const findContactForConversation = useCallback(async ({ contactId, phone, email }) => {
    const isValidObjectId = (id) => /^[a-f0-9]{24}$/i.test(id || '');
    const phoneVariants = buildPhoneVariants(phone);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const safeContactId = isValidObjectId(contactId) ? contactId : '';
    const cacheKey = [safeContactId, phoneVariants.join('|'), normalizedEmail].join('::');

    if (contactLookupCacheRef.current.has(cacheKey)) {
      return contactLookupCacheRef.current.get(cacheKey);
    }

    let contact = null;

    if (safeContactId) {
      const byId = await base44.entities.Contact.filter({ id: safeContactId });
      contact = byId[0] || null;
    }

    if (!contact) {
      for (const variant of phoneVariants) {
        const found = await base44.entities.Contact.filter({ phone: variant });
        if (found[0]) {
          contact = found[0];
          break;
        }
      }
    }

    if (!contact && normalizedEmail) {
      const byEmail = await base44.entities.Contact.filter({ email: normalizedEmail });
      contact = byEmail[0] || null;
    }

    // Cache only successful lookups — the contact may be created later by the agent
    if (contact) contactLookupCacheRef.current.set(cacheKey, contact);
    return contact;
  }, [buildPhoneVariants]);

  const loadStatusMessages = useCallback(async (conv) => {
    if (!conv?.id || isLoadingStatusRef.current) return;
    isLoadingStatusRef.current = true;
    try {
      // All lookup + filtering logic runs server-side with full permissions
      const res = await base44.functions.invoke('getBotChatStatusMessages', {
        conversation_id: conv.id,
        phone: conv.metadata?.phone || '',
        email: conv.metadata?.email || '',
        started_at: conv.created_date || '',
      });
      const incoming = res.data?.messages || [];
      setStatusMessages(incoming);

      // הזרקת הודעות סטטוס לתוך השיחה עצמה — כך הסדר נשמר והבוט מכיר אותן
      // (ההזרקה מהשרת נחסמת ב-403 על שיחות שנוצרו ע"י המשתמש, לכן היא מתבצעת כאן)
      for (const m of incoming) {
        const content = String(m.content || '').trim();
        if (!content) continue;
        const injectKey = `${conv.id}::${content}`;
        if (injectedRef.current.has(injectKey)) continue;
        const alreadyInConv = (messagesRef.current || []).some(
          x => String(x.content || '').trim() === content
        );
        injectedRef.current.add(injectKey);
        if (!alreadyInConv) {
          await base44.agents.addMessage(conv, { role: 'assistant', content });
        }
      }
    } catch (err) {
      console.warn('טעינת הודעות סטטוס נכשלה:', err.message);
    } finally {
      isLoadingStatusRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!activeConv) return;
    loadStatusMessages(activeConv);
    const refresh = () => loadStatusMessages(activeConv);
    const unsubscribe = base44.entities.Communication.subscribe(refresh);
    const timer = setInterval(refresh, 10000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [activeConv, loadStatusMessages]);

  const agentMessagesWithContent = messages.filter(message =>
    (message.role === 'user' || message.role === 'assistant') && String(message.content || '').trim()
  );

  const agentContentSet = new Set(
    agentMessagesWithContent.map(message => String(message.content || '').trim())
  );

  // Status messages already injected into the conversation are hidden here
  // (agentContentSet) — the overlay shows only ones not yet injected, deduped by content.
  const statusMessagesToShow = statusMessages
    .filter(message => {
      const content = String(message.content || '').trim();
      return content && !agentContentSet.has(content);
    })
    .filter((message, index, self) =>
      index === self.findIndex(m => String(m.content || '').trim() === String(message.content || '').trim())
    );

  const displayMessages = [
    ...agentMessagesWithContent,
    ...[...statusMessagesToShow].sort((a, b) => toUtcTime(a.created_date) - toUtcTime(b.created_date)),
  ];

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const openNewConversation = () => {
    setNewConvPhone('');
    setNewConvEmail('');
    setShowNewConvDialog(true);
  };

  const confirmNewConversation = async () => {
    const phone = newConvPhone.trim();
    const email = newConvEmail.trim().toLowerCase();
    const contact = await findContactForConversation({ phone, email });

    // השיחה נוצרת בשרת כדי שה-webhook יוכל לשקף אליה הודעות (שיחה מהדפדפן חסומה ב-403)
    const res = await base44.functions.invoke('createSimConversation', {
      phone,
      email,
      ...(contact?.id ? { contact_id: contact.id } : {}),
    });
    const conv = res.data?.conversation;
    if (!conv) return;

    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
    setShowNewConvDialog(false);
  };

  const handleHide = async (convId) => {
    const newHidden = [...hiddenIds, convId];
    setHiddenIds(newHidden);
    await base44.auth.updateMe({ hidden_conversations: newHidden });
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConvId === convId) setActiveConvId(null);
  };

  const handleSend = async (text) => {
    if (!activeConv) return;
    setIsSending(true);
    try {
      const intlPhone = normalizeCachePhone(activeConv.metadata?.phone || '');
      if (intlPhone) {
        // מסלול זהה להודעת WhatsApp אמיתית — מפעיל את ה-Fast Path לפני הסוכן
        await base44.functions.invoke('greenApiWebhook', {
          typeWebhook: 'incomingMessageReceived',
          idMessage: `sim_${Date.now()}`,
          senderData: { chatId: `${intlPhone}@c.us` },
          messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
        });
      } else {
        await base44.agents.addMessage(activeConv, { role: 'user', content: text });
      }
    } catch (err) {
      console.warn('שגיאה בשליחה:', err.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
          <Bot size={20} className="text-success" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">בדיקת בוט</h1>
          <p className="text-sm text-muted-foreground">סימולציה של שיחת WhatsApp</p>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden h-[500px] flex">
        {/* Sidebar */}
        <div className="w-64 shrink-0 hidden md:block">
          <BotConversationsList
            requests={conversations.map(c => ({
              id: c.id,
              contact_name: c.metadata?.name || 'בדיקה',
              created_date: c.created_date,
            }))}
            activeId={activeConvId}
            onSelect={setActiveConvId}
            onNew={openNewConversation}
            onDelete={handleHide}
            loading={isLoadingList}
          />
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b bg-success/5">
            <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
              <Bot size={18} className="text-success" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">בוט קרנות ראמים</div>
              <div className="text-xs text-muted-foreground">
                {activeConv ? activeConv.metadata?.name || 'בדיקה' : 'בחר שיחה או צור שיחה חדשה'}
              </div>
            </div>
            <button onClick={openNewConversation} className="md:hidden text-xs text-primary underline">
              שיחה חדשה
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
            {!activeConvId ? (
              <div className="text-center text-muted-foreground text-sm py-16">
                בחר שיחה מהרשימה או צור שיחה חדשה 💬
              </div>
            ) : (
              <>
                {displayMessages
                  .filter(m => m.role === 'user' || m.role === 'assistant')
                  .map((msg, i) => <MessageBubble key={msg.id || i} message={msg} />)}
                {agentMessagesWithContent[agentMessagesWithContent.length - 1]?.role === 'user' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pr-2">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                    </span>
                    הבוט מקליד...
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          <ChatInput onSend={handleSend} disabled={!activeConvId || isSending} />
        </div>
      </div>

      <Dialog open={showNewConvDialog} onOpenChange={setShowNewConvDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>שיחת בדיקה חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-xs text-muted-foreground">
              הזיני טלפון או מייל של איש הקשר — אחד מהם מספיק כדי שהודעות הסטטוס יופיעו בצ׳אט.
            </p>
            <div className="space-y-1">
              <Label>טלפון</Label>
              <Input
                value={newConvPhone}
                onChange={(e) => setNewConvPhone(e.target.value)}
                placeholder="לדוגמה: 0544535688"
              />
            </div>
            <div className="space-y-1">
              <Label>מייל</Label>
              <Input
                value={newConvEmail}
                onChange={(e) => setNewConvEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNewConvDialog(false)}>
                ביטול
              </Button>
              <Button
                onClick={confirmNewConversation}
                disabled={!newConvPhone.trim() && !newConvEmail.trim()}
              >
                צור שיחה
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
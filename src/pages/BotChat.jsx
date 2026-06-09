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
    const list = await base44.agents.listConversations({ agent_name: AGENT_NAME });
    const all = list || [];
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
    let unsubscribe;
    const init = async () => {
      const conv = await base44.agents.getConversation(activeConvId);
      setActiveConv(conv);
      setMessages(conv.messages || []);
      unsubscribe = base44.agents.subscribeToConversation(activeConvId, (data) => {
        setMessages(data.messages || []);
      });
    };
    init();
    return () => { if (unsubscribe) unsubscribe(); };
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

  const loadStatusMessages = useCallback(async (conv, currentMessages) => {
    const meta = conv?.metadata || {};

    // 1) Deterministic link: ServiceRequest that points to this conversation
    let contact = null;
    if (conv?.id) {
      const linkedRequests = await base44.entities.ServiceRequest.filter({ conversation_id: conv.id });
      if (linkedRequests[0]?.contact_id) {
        const byId = await base44.entities.Contact.filter({ id: linkedRequests[0].contact_id });
        contact = byId[0] || null;
      }
    }

    // 2) Fallback: phone/email lookup
    if (!contact) {
      const phoneCandidate = meta.phone || extractPhoneFromMessages(currentMessages);
      contact = await findContactForConversation({
        contactId: meta.contact_id,
        phone: phoneCandidate,
        email: meta.email,
      });
    }

    if (!contact) {
      setStatusMessages([]);
      return;
    }

    const communications = await base44.entities.Communication.filter({ contact_id: contact.id, type: 'whatsapp', direction: 'outbound' }, '-created_date', 20);
    const startedAt = conv?.created_date ? new Date(conv.created_date).getTime() : 0;
    const synced = communications
      .filter(item => item.is_automated && item.content && new Date(item.created_date).getTime() >= startedAt)
      .map(item => ({
        id: `status-${item.id}`,
        role: 'assistant',
        content: item.content,
        created_date: item.created_date,
        source: 'status_automation',
        status: item.status,
      }))
      .reverse();
    setStatusMessages(synced);
  }, [extractPhoneFromMessages, findContactForConversation]);

  useEffect(() => {
    if (activeConv) loadStatusMessages(activeConv, messages);
  }, [activeConv, messages, loadStatusMessages]);

  useEffect(() => {
    if (!activeConv) return;
    const refresh = () => loadStatusMessages(activeConv, messages);
    const unsubscribe = base44.entities.Communication.subscribe(refresh);
    const timer = setInterval(refresh, 5000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [activeConv, messages, loadStatusMessages]);

  const agentMessagesWithContent = messages.filter(message =>
    (message.role === 'user' || message.role === 'assistant') && String(message.content || '').trim()
  );

  const agentContentSet = new Set(
    agentMessagesWithContent.map(message => String(message.content || '').trim())
  );

  const statusMessagesToShow = statusMessages.filter(message => {
    const content = String(message.content || '').trim();
    return content && !agentContentSet.has(content);
  });

  const displayMessages = [...agentMessagesWithContent, ...statusMessagesToShow]
    .filter((message, index, self) => index === self.findIndex(m => (m.id || m.content) === (message.id || message.content)))
    .map((message, index) => ({
      ...message,
      _sortTime: message.created_date ? new Date(message.created_date).getTime() : Date.now() + index,
      _sortOrder: index,
    }))
    .sort((a, b) => (a._sortTime - b._sortTime) || (a._sortOrder - b._sortOrder));

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

    const conv = await base44.agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: {
        name: `בדיקה ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`,
        source: 'test',
        phone,
        email,
        ...(contact?.id ? { contact_id: contact.id } : {}),
      },
    });

    const cachePhone = normalizeCachePhone(phone || contact?.phone);
    if (cachePhone) {
      const key = `phone_conv_${cachePhone}`;
      const existing = await base44.entities.SystemSetting.filter({ key });
      const payload = {
        category: 'flow',
        key,
        label: `שיחת בוט לטלפון ${cachePhone}`,
        value: conv.id,
        value_type: 'text',
      };
      if (existing[0]) {
        await base44.entities.SystemSetting.update(existing[0].id, payload);
      } else {
        await base44.entities.SystemSetting.create(payload);
      }
    }

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
      await base44.agents.addMessage(activeConv, { role: 'user', content: text });
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
              displayMessages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map((msg, i) => <MessageBubble key={msg.id || i} message={msg} />)
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
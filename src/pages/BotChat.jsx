import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Bot } from 'lucide-react';
import MessageBubble from '@/components/bot-chat/MessageBubble';
import ChatInput from '@/components/bot-chat/ChatInput';
import BotConversationsList from '@/components/bot-chat/BotConversationsList';

const AGENT_NAME = 'bot_reemim';

export default function BotChat() {
  const [conversations, setConversations] = useState([]);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [hiddenLoaded, setHiddenLoaded] = useState(false);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [statusMessages, setStatusMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const messagesEndRef = useRef(null);

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

  const loadStatusMessages = useCallback(async (conv, currentMessages) => {
    const phone = extractPhoneFromMessages(currentMessages);
    if (!phone) {
      setStatusMessages([]);
      return;
    }

    const normalizedPhone = phone.startsWith('0') ? `972${phone.substring(1)}` : phone.replace(/^\+/, '');
    const contactsByOriginal = await base44.entities.Contact.filter({ phone });
    const contactsByNormalized = contactsByOriginal.length ? [] : await base44.entities.Contact.filter({ phone: normalizedPhone });
    const contactsByPlus = contactsByOriginal.length || contactsByNormalized.length ? [] : await base44.entities.Contact.filter({ phone: `+${normalizedPhone}` });
    const contact = contactsByOriginal[0] || contactsByNormalized[0] || contactsByPlus[0];
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
      }))
      .reverse();
    setStatusMessages(synced);
  }, [extractPhoneFromMessages]);

  useEffect(() => {
    if (activeConv) loadStatusMessages(activeConv, messages);
  }, [activeConv, messages, loadStatusMessages]);

  const displayMessages = [...messages, ...statusMessages]
    .filter((message, index, self) => index === self.findIndex(m => (m.id || m.content) === (message.id || message.content)))
    .sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const handleNewConversation = async () => {
    const conv = await base44.agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: {
        name: `בדיקה ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`,
        source: 'test',
      },
    });
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
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
            onNew={handleNewConversation}
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
            <button onClick={handleNewConversation} className="md:hidden text-xs text-primary underline">
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
    </div>
  );
}
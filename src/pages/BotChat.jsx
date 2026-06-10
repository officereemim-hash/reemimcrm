import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Bot } from 'lucide-react';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import ConversationsList from '@/components/chat/ConversationsList';

const AGENT_NAME = 'bot_reemim';

export default function BotChat() {
  const [conversations, setConversations] = useState([]);
  const [allConversations, setAllConversations] = useState([]);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [hiddenLoaded, setHiddenLoaded] = useState(false);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const messagesEndRef = useRef(null);

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
    setAllConversations(all);
    setConversations(all.filter(c => !hiddenIds.includes(c.id)));
    setIsLoadingList(false);
  }, [hiddenIds]);

  useEffect(() => {
    if (!activeConvId) { setMessages([]); setActiveConv(null); return; }
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateConversation = async () => {
    const conv = await base44.agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: { name: `בדיקה ${new Date().toLocaleDateString('he-IL')}` },
    });
    setAllConversations(prev => [conv, ...prev]);
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
  };

  const handleHideConversation = async (conv, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('להסתיר את השיחה?')) return;
    const newHidden = [...hiddenIds, conv.id];
    setHiddenIds(newHidden);
    await base44.auth.updateMe({ hidden_conversations: newHidden });
    setConversations(prev => prev.filter(c => c.id !== conv.id));
    if (activeConvId === conv.id) setActiveConvId(null);
  };

  const handleHideBulk = async (ids) => {
    const newHidden = [...hiddenIds, ...ids];
    setHiddenIds(newHidden);
    await base44.auth.updateMe({ hidden_conversations: newHidden });
    setConversations(prev => prev.filter(c => !ids.includes(c.id)));
    if (ids.includes(activeConvId)) setActiveConvId(null);
  };

  const handleRestoreAll = async () => {
    setHiddenIds([]);
    await base44.auth.updateMe({ hidden_conversations: [] });
    setConversations(allConversations);
  };

  const handleSend = async (text) => {
    if (!activeConv) return;
    setIsSending(true);
    try {
      await base44.agents.addMessage(activeConv, { role: 'user', content: text });
    } catch (err) {
      console.warn('Message send error:', err.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-5rem)] md:h-[calc(100vh-2rem)] flex rounded-xl overflow-hidden border border-border bg-background">
      <div className="w-64 flex-shrink-0 hidden md:block">
        <ConversationsList conversations={conversations} activeId={activeConvId} onSelect={setActiveConvId} onCreate={handleCreateConversation} onHide={handleHideConversation} onHideBulk={handleHideBulk} onRestoreAll={handleRestoreAll} hasHidden={hiddenIds.length > 0} isLoading={isLoadingList} />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">בוט קרנות ראמים</p>
            <p className="text-xs text-muted-foreground">בדיקת שיחות</p>
          </div>
          <button onClick={handleCreateConversation} className="md:hidden mr-auto text-xs text-primary underline">שיחה חדשה</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeConvId ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">בחר שיחה קיימת או צור שיחה חדשה</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-muted-foreground text-sm">שלח הודעה כדי להתחיל</p>
            </div>
          ) : (
            messages.map((msg, idx) => <MessageBubble key={idx} message={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>
        {activeConvId && <ChatInput onSend={handleSend} disabled={isSending} />}
      </div>
    </div>
  );
}
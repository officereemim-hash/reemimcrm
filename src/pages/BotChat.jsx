import { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Bot, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ConversationsList from '@/components/bot-chat/ConversationsList';
import MessageBubble from '@/components/bot-chat/MessageBubble';
import ChatInput from '@/components/bot-chat/ChatInput';

const AGENT_NAME = 'dr_adri_bot';

export default function BotChat() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const convs = await base44.agents.listConversations({
        limit: 50,
        sort: '-created_date',
        q: { agent_name: AGENT_NAME },
      });
      setConversations(convs || []);
    } catch (err) {
      console.error('loadConversations error:', err);
    }
    setLoadingConvs(false);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      setActiveConv(null);
      return;
    }
    setLoading(true);
    base44.agents.getConversation(activeConvId).then(conv => {
      setActiveConv(conv);
      setMessages(conv.messages || []);
      setLoading(false);
    });
  }, [activeConvId]);

  // Subscribe to conversation updates
  useEffect(() => {
    if (!activeConvId) return;
    const unsub = base44.agents.subscribeToConversation(activeConvId, (updatedConv) => {
      setMessages(updatedConv.messages || []);
      setActiveConv(updatedConv);
    });
    return () => { if (unsub) unsub(); };
  }, [activeConvId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewConversation = async () => {
    try {
      const conv = await base44.agents.createConversation({
        agent_name: AGENT_NAME,
      });
      console.log('Created conversation:', conv);
      setConversations(prev => [conv, ...prev]);
      setActiveConvId(conv.id);
      setActiveConv(conv);
      setMessages(conv.messages || []);
    } catch (err) {
      console.error('createConversation error:', err);
    }
  };

  const handleSend = async (text) => {
    if (!activeConv || sending) return;
    setSending(true);

    // Optimistic add
    const tempMsg = { id: 'temp-' + Date.now(), role: 'user', content: text };
    setMessages(prev => [...prev, tempMsg]);

    try {
      await base44.agents.addMessage(activeConv, { role: 'user', content: text });
    } catch (err) {
      console.error('addMessage error:', err);
    }
    setSending(false);
  };

  const handleSelectConversation = (convId) => {
    setActiveConvId(convId);
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
            <p className="text-sm text-muted-foreground">שיחות עם ה-Agent — נשמרות במערכת</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadConversations} className="gap-1">
          <RotateCcw size={14} />
          רענון
        </Button>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="flex h-[500px]">
          {/* Conversations sidebar */}
          <div className="w-64 shrink-0 hidden md:block">
            <ConversationsList
              conversations={conversations}
              activeId={activeConvId}
              onSelect={handleSelectConversation}
              onNew={handleNewConversation}
              loading={loadingConvs}
            />
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col">
            {/* Chat header */}
            <div className="flex items-center gap-3 p-4 border-b bg-success/5">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                <Bot size={18} className="text-success" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">בוט קרנות ראמים</div>
                <div className="text-xs text-muted-foreground">
                  {activeConvId ? `שיחה #${activeConvId.slice(-4)}` : 'בחר שיחה או צור חדשה'}
                </div>
              </div>
              {/* Mobile new button */}
              <Button size="sm" variant="outline" onClick={handleNewConversation} className="md:hidden">
                שיחה חדשה
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {!activeConvId && (
                <div className="text-center text-muted-foreground text-sm py-16">
                  בחר שיחה מהרשימה או צור שיחה חדשה כדי להתחיל 💬
                </div>
              )}
              {loading && activeConvId && (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map((msg, i) => (
                  <MessageBubble key={msg.id || i} message={msg} />
                ))
              }
              {sending && (
                <div className="flex justify-end">
                  <div className="bg-success/10 rounded-2xl px-4 py-3 rounded-bl-sm">
                    <Loader2 size={16} className="animate-spin text-success" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>

            {/* Input */}
            <ChatInput onSend={handleSend} disabled={!activeConvId || sending} />
          </div>
        </div>
      </Card>
    </div>
  );
}
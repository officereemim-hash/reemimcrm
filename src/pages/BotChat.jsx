import { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Bot, Loader2, RotateCcw, Trash2, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import BotConversationsList from '@/components/bot-chat/BotConversationsList';
import MessageBubble from '@/components/bot-chat/MessageBubble';
import ChatInput from '@/components/bot-chat/ChatInput';

const AGENT_NAME = 'bot_reemim';

export default function BotChat() {
  const [testRequests, setTestRequests] = useState([]);
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [activeRequest, setActiveRequest] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // Load test ServiceRequests (our "conversations")
  const loadTestRequests = useCallback(async () => {
    setLoadingList(true);
    const requests = await base44.entities.ServiceRequest.filter(
      { is_test: true },
      '-created_date',
      50
    );
    setTestRequests(requests);
    setLoadingList(false);
  }, []);

  useEffect(() => {
    loadTestRequests();
  }, [loadTestRequests]);

  // Load messages when active request changes
  useEffect(() => {
    if (!activeRequestId) {
      setMessages([]);
      setActiveRequest(null);
      return;
    }
    setLoading(true);
    const req = testRequests.find(r => r.id === activeRequestId);
    setActiveRequest(req);

    if (req?.conversation_id) {
      base44.agents.getConversation(req.conversation_id).then(conv => {
        setMessages(conv.messages || []);
        setLoading(false);
      }).catch(() => {
        setMessages([]);
        setLoading(false);
      });
    } else {
      setMessages([]);
      setLoading(false);
    }
  }, [activeRequestId, testRequests]);

  // Subscribe to conversation updates for real-time messages
  useEffect(() => {
    if (!activeRequest?.conversation_id) return;
    const unsub = base44.agents.subscribeToConversation(activeRequest.conversation_id, (updatedConv) => {
      setMessages(updatedConv.messages || []);
    });
    return () => { if (unsub) unsub(); };
  }, [activeRequest?.conversation_id]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Create new test conversation (Contact + ServiceRequest + Agent Conversation)
  const handleNewConversation = async () => {
    // 1. Create test contact
    const contact = await base44.entities.Contact.create({
      full_name: 'בדיקה ' + new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
      phone: '0500000000',
      status: 'new_lead',
      source: 'manual',
      bot_status: 'new',
      conversation_owner: 'bot',
    });

    // 2. Create ServiceRequest FIRST (so we have the ID for metadata)
    const sr = await base44.entities.ServiceRequest.create({
      contact_id: contact.id,
      contact_name: contact.full_name,
      contact_phone: contact.phone,
      service_type: 'retirement',
      status: 'new',
      source: 'bot',
      is_test: true,
    });

    // 3. Create Agent conversation with full context (contact_id + service_request_id)
    const conv = await base44.agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: {
        name: contact.full_name,
        phone: contact.phone,
        contact_id: contact.id,
        service_request_id: sr.id,
        source: 'test',
      },
    });

    // 4. Update SR with conversation_id + Contact with SR link
    await base44.entities.ServiceRequest.update(sr.id, { conversation_id: conv.id });
    try {
      await base44.entities.Contact.update(contact.id, { current_service_request_id: sr.id });
    } catch (e) {
      console.warn('Could not update contact:', e.message);
    }

    // Refresh list and select
    await loadTestRequests();
    setActiveRequestId(sr.id);
  };

  // Send message — goes through the Agent, like the real system
  const handleSend = async (text) => {
    if (!activeRequest?.conversation_id || sending) return;
    setSending(true);

    // Optimistic add
    const tempMsg = { id: 'temp-' + Date.now(), role: 'user', content: text };
    setMessages(prev => [...prev, tempMsg]);

    const conv = await base44.agents.getConversation(activeRequest.conversation_id);
    await base44.agents.addMessage(conv, { role: 'user', content: text });

    setSending(false);
  };

  // Delete test request (and its contact)
  const handleDelete = async (requestId) => {
    const req = testRequests.find(r => r.id === requestId);
    if (req?.contact_id) {
      await base44.entities.Contact.delete(req.contact_id).catch(() => {});
    }
    await base44.entities.ServiceRequest.delete(requestId);
    if (activeRequestId === requestId) {
      setActiveRequestId(null);
    }
    await loadTestRequests();
  };

  // Hide test request (mark is_test = false to remove from list but keep data)
  const handleHide = async (requestId) => {
    await base44.entities.ServiceRequest.update(requestId, { is_test: false });
    if (activeRequestId === requestId) {
      setActiveRequestId(null);
    }
    await loadTestRequests();
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
            <p className="text-sm text-muted-foreground">שיחות בדיקה — נשמרות כפניות שירות אמיתיות</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadTestRequests} className="gap-1">
          <RotateCcw size={14} />
          רענון
        </Button>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="flex h-[500px]">
          {/* Conversations sidebar */}
          <div className="w-64 shrink-0 hidden md:block">
            <BotConversationsList
              requests={testRequests}
              activeId={activeRequestId}
              onSelect={setActiveRequestId}
              onNew={handleNewConversation}
              onDelete={handleDelete}
              onHide={handleHide}
              loading={loadingList}
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
                  {activeRequest
                    ? `${activeRequest.contact_name || 'בדיקה'} • ${activeRequest.service_type || ''}`
                    : 'בחר שיחה או צור חדשה'}
                </div>
              </div>
              {/* Mobile new button */}
              <Button size="sm" variant="outline" onClick={handleNewConversation} className="md:hidden">
                שיחה חדשה
              </Button>
              {/* Actions for active request */}
              {activeRequest && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="הסתר" onClick={() => handleHide(activeRequestId)}>
                    <EyeOff size={14} />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="מחק">
                        <Trash2 size={14} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>מחיקת בדיקה</AlertDialogTitle>
                        <AlertDialogDescription>הפניה ואיש הקשר ייחמקו לצמיתות. בטוח?</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>ביטול</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(activeRequestId)}>מחק</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {!activeRequestId && (
                <div className="text-center text-muted-foreground text-sm py-16">
                  בחר שיחה מהרשימה או צור שיחה חדשה כדי להתחיל 💬
                </div>
              )}
              {loading && activeRequestId && (
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
            <ChatInput onSend={handleSend} disabled={!activeRequestId || sending} />
          </div>
        </div>
      </Card>
    </div>
  );
}
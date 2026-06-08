import { Bot, User } from 'lucide-react';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isBot = message.role === 'assistant';
  const isSystem = message.role === 'system';
  const isAutomationLog = message.source === 'status_automation';

  if (isSystem) {
    return (
      <div className="text-center text-xs text-muted-foreground py-1">
        {message.content}
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
        isUser
          ? 'bg-card border rounded-br-sm'
          : 'bg-success/10 text-foreground rounded-bl-sm'
      }`}>
        <div className="flex items-center gap-1.5 mb-1">
          {isUser ? <User size={12} /> : <Bot size={12} />}
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? 'לקוח' : isAutomationLog ? 'בוט (לוג אוטומטי)' : 'בוט (Agent)'}
          </span>
        </div>
        <div className="whitespace-pre-wrap">{message.content}</div>
        {isAutomationLog && message.status && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            סטטוס לוג: {message.status === 'skipped' ? 'לוג בלבד' : message.status === 'failed' ? 'לא נשלח בפועל' : 'נשלח'}
          </div>
        )}
      </div>
    </div>
  );
}
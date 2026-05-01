import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ChatInput({ onSend, disabled }) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="p-3 border-t flex gap-2">
      <Input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSend()}
        placeholder="כתוב הודעה..."
        className="flex-1"
        disabled={disabled}
      />
      <Button onClick={handleSend} disabled={!input.trim() || disabled} size="icon">
        <Send size={16} />
      </Button>
    </div>
  );
}
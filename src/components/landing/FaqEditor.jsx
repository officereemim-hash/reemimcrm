import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

export default function FaqEditor({ faqs = [], onChange }) {
  const update = (idx, field, value) => {
    const next = [...faqs];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };
  const add = () => onChange([...faqs, { question: '', answer: '' }]);
  const remove = (idx) => onChange(faqs.filter((_, i) => i !== idx));
  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= faqs.length) return;
    const next = [...faqs];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {faqs.map((faq, idx) => (
        <div key={idx} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center gap-1">
            <Input value={faq.question || ''} onChange={e => update(idx, 'question', e.target.value)} placeholder="שאלה" className="flex-1" />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(idx, -1)}><ChevronUp size={14} /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(idx, 1)}><ChevronDown size={14} /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(idx)}><Trash2 size={14} /></Button>
          </div>
          <Textarea value={faq.answer || ''} onChange={e => update(idx, 'answer', e.target.value)} placeholder="תשובה" rows={2} />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
        <Plus size={14} />הוסף שאלה
      </Button>
    </div>
  );
}
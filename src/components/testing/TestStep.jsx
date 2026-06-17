import { useState } from 'react';
import { Check, MapPin, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// כרטיס שלב בדיקה בודד — עם צ'קבוקס סימון "בוצע" (מקומי בלבד, לעזרת הבודק)
export default function TestStep({ index, step }) {
  const [done, setDone] = useState(false);
  return (
    <div className={cn('flex gap-3 p-3 rounded-xl border transition-colors', done ? 'bg-success/5 border-success/30' : 'bg-white border-border')}>
      <button
        onClick={() => setDone(d => !d)}
        className={cn('mt-0.5 w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-colors',
          done ? 'bg-success border-success text-white' : 'border-muted-foreground/40 text-transparent hover:border-primary')}
      >
        <Check size={14} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-medium">{index}</span>
          <MapPin size={12} />
          <span>{step.where}</span>
        </div>
        <p className={cn('text-sm', done && 'line-through text-muted-foreground')}>{step.action}</p>
        <p className="text-xs text-success flex items-center gap-1 mt-1">
          <ArrowLeft size={12} />מצופה: {step.expect}
        </p>
      </div>
    </div>
  );
}
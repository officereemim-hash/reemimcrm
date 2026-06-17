import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

export default function FaqSection({ faqs = [], primary = '#4B2E83' }) {
  const [open, setOpen] = useState(null);
  if (!faqs.length) return null;

  return (
    <div className="max-w-3xl mx-auto px-6 pb-10">
      <h2 className="text-xl md:text-2xl font-bold text-center mb-5" style={{ color: primary }}>
        שאלות ותשובות
      </h2>
      <div className="space-y-2">
        {faqs.map((faq, idx) => (
          <div key={idx} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(open === idx ? null : idx)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right"
            >
              <span className="font-semibold text-gray-800">{faq.question}</span>
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: primary }}>
                {open === idx ? <Minus size={14} /> : <Plus size={14} />}
              </span>
            </button>
            {open === idx && (
              <div className="px-4 pb-4 text-gray-600 whitespace-pre-line leading-relaxed">
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
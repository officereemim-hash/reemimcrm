import { useState, useRef, useEffect } from 'react';
import { Smile } from 'lucide-react';

const EMOJI_CATEGORIES = {
  'חיוכים': ['😀','😃','😄','😁','😊','🥰','😍','🤩','😘','😗','😚','🙂','🤗','😌','😉','🙃'],
  'לבבות': ['❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💕','💞','💓','💗','💖','💝','💘'],
  'ידיים': ['👋','🤚','✋','🖐️','👌','🤌','✌️','🤞','🤟','🤘','👍','👏','🙌','🤝','🙏','💪'],
  'חגיגה': ['🎉','🎊','🥳','✨','🌟','⭐','💫','🔥','🎯','🏆','🎁','🎈','🪩','🎶','🕺','🎵'],
  'כסף ועסקים': ['💰','💵','📈','📊','🏦','💼','📋','🤝','✅','⚡','🎓','📌','💡','🔔','📅','🗓️'],
  'טבע': ['🌸','🌺','🌻','🌹','🌷','🌼','🍀','🌿','🌱','🦋','🌈','☀️','🌙','⛅','🌊','🍃'],
  'סמלים': ['📧','📱','💬','📢','⏰','✅','❌','⚡','💰','📍','🔗','📎','🏷️','🔑','🎯','💎'],
};

export default function EmojiPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('חיוכים');
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1.5 hover:bg-muted rounded-lg transition-colors"
        title="הוסף אמוג׳י"
      >
        <Smile size={18} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 bottom-full mb-1 left-0 bg-card border border-border rounded-xl shadow-xl p-3 w-72">
          <div className="flex gap-1 overflow-x-auto pb-2 mb-2 border-b border-border">
            {Object.keys(EMOJI_CATEGORIES).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-0.5 max-h-36 overflow-y-auto">
            {EMOJI_CATEGORIES[activeCategory].map((emoji, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { onSelect(emoji); setOpen(false); }}
                className="text-lg p-1 hover:bg-muted rounded-lg transition-colors text-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
import { HelpCircle } from 'lucide-react';

export default function TutorialFAB({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 left-6 z-[9998] w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 flex items-center justify-center transition-transform hover:scale-110"
      title="מדריך שימוש"
    >
      <HelpCircle size={22} />
    </button>
  );
}
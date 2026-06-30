import { HelpCircle } from 'lucide-react';

export default function TutorialFAB({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 z-[9998] w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 flex items-center justify-center transition-transform hover:scale-110"
      title="מדריך שימוש"
    >
      <HelpCircle size={16} />
    </button>
  );
}
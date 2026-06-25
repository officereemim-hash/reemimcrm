import { AnimatePresence } from 'framer-motion';
import TutorialCard from './TutorialCard';

export default function TutorialOverlay({ tutorial }) {
  if (!tutorial.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center pb-8 pointer-events-none">
      <div className="pointer-events-auto">
        <AnimatePresence mode="wait">
          <TutorialCard
            key={tutorial.step.id}
            step={tutorial.step}
            currentStep={tutorial.currentStep}
            totalSteps={tutorial.totalSteps}
            steps={tutorial.steps}
            onNext={tutorial.next}
            onPrev={tutorial.prev}
            onClose={tutorial.close}
            onGoToStep={tutorial.goToStep}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}
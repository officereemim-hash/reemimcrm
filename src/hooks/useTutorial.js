import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import TUTORIAL_STEPS from '@/lib/tutorialSteps';

const STORAGE_KEY = 'reemim_tutorial_done';

export default function useTutorial() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const step = TUTORIAL_STEPS[currentStep];

  const open = useCallback(() => {
    setCurrentStep(0);
    setIsOpen(true);
    if (TUTORIAL_STEPS[0]?.navigateTo) navigate(TUTORIAL_STEPS[0].navigateTo);
  }, [navigate]);

  const close = useCallback(() => {
    setIsOpen(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const next = useCallback(() => {
    if (currentStep >= TUTORIAL_STEPS.length - 1) {
      close();
      return;
    }
    const nextIdx = currentStep + 1;
    setCurrentStep(nextIdx);
    if (TUTORIAL_STEPS[nextIdx]?.navigateTo) navigate(TUTORIAL_STEPS[nextIdx].navigateTo);
  }, [currentStep, close, navigate]);

  const prev = useCallback(() => {
    if (currentStep <= 0) return;
    const prevIdx = currentStep - 1;
    setCurrentStep(prevIdx);
    if (TUTORIAL_STEPS[prevIdx]?.navigateTo) navigate(TUTORIAL_STEPS[prevIdx].navigateTo);
  }, [currentStep, navigate]);

  const goToStep = useCallback((idx) => {
    setCurrentStep(idx);
    if (TUTORIAL_STEPS[idx]?.navigateTo) navigate(TUTORIAL_STEPS[idx].navigateTo);
  }, [navigate]);

  const practice = useCallback(() => {
    if (step?.navigateTo) {
      navigate(step.navigateTo);
      close();
    }
  }, [step, navigate, close]);

  const isDone = localStorage.getItem(STORAGE_KEY) === 'true';

  return {
    isOpen, step, currentStep, totalSteps: TUTORIAL_STEPS.length,
    steps: TUTORIAL_STEPS, open, close, next, prev, goToStep, practice, isDone,
  };
}
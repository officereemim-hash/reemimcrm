import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, List, Zap, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import TutorialProgress from './TutorialProgress';

export default function TutorialCard({ step, currentStep, totalSteps, steps, onNext, onPrev, onClose, onGoToStep, onPractice }) {
  const [showMenu, setShowMenu] = useState(false);
  const Icon = step.icon;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <motion.div
      key={step.id}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={`bg-gradient-to-br ${step.bgColor || 'from-white to-gray-50'} border border-border rounded-2xl shadow-2xl p-5 w-[420px] max-w-[92vw] max-h-[85vh] overflow-y-auto`}
      style={{ direction: 'rtl' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/80 shadow-sm">
            <Icon className={`w-5 h-5 ${step.iconColor}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">שלב {currentStep + 1} מתוך {totalSteps}</p>
            <h3 className="font-bold text-foreground text-base leading-tight">{step.title}</h3>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowMenu(!showMenu)}
            className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/60" title="כל השלבים">
            <List className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Step menu dropdown */}
      {showMenu && (
        <div className="mb-3 bg-white rounded-xl border border-border shadow-lg max-h-[240px] overflow-y-auto">
          {steps.map((s, i) => (
            <button key={s.id} onClick={() => { onGoToStep(i); setShowMenu(false); }}
              className={`w-full text-right px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2 transition-colors ${
                i === currentStep ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'
              }`}>
              <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                i === currentStep ? 'bg-primary text-primary-foreground' : i < currentStep ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
              }`}>
                {i < currentStep ? '✓' : i + 1}
              </span>
              <span className="truncate">{s.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="mb-3 bg-white/60 rounded-xl p-3">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{step.content}</p>
      </div>

      {/* Bullets */}
      {step.bullets && (
        <div className="mb-3 bg-white/60 rounded-xl p-3">
          <ul className="space-y-1.5">
            {step.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bot flows list */}
      {step.flows && (
        <div className="mb-3 bg-white/60 rounded-xl p-3 space-y-2">
          {step.flows.map((f) => (
            <div key={f.name} className="flex items-start gap-2">
              <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
              <p className="text-sm leading-relaxed">
                <span className="font-bold text-primary">{f.name}</span>
                <span className="text-muted-foreground"> — {f.desc}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Auto note */}
      {step.autoNote && (
        <div className="mb-2 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-accent/10 border border-accent/30">
          <span className="text-sm mt-0.5 flex-shrink-0">🤖</span>
          <p className="text-xs leading-relaxed"><strong>מה אוטומטי:</strong> {step.autoNote}</p>
        </div>
      )}

      {/* Admin note */}
      {step.adminNote && (
        <div className="mb-2 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm mt-0.5 flex-shrink-0">✋</span>
          <p className="text-xs leading-relaxed"><strong>מה האדמין עושה:</strong> {step.adminNote}</p>
        </div>
      )}

      {/* Tip */}
      {step.tip && (
        <div className="mb-2 p-2.5 rounded-lg bg-accent/10 border border-accent/30">
          <p className="text-xs text-foreground">💡 {step.tip}</p>
        </div>
      )}

      {/* Practice note */}
      {step.practiceNote && (
        <div className="mb-3 p-2.5 rounded-lg bg-[#E6F4EF] border border-[#2A6B6B]/20">
          <p className="text-xs"><span className="font-bold">🎯 תרגול:</span> {step.practiceNote}</p>
        </div>
      )}

      {/* Progress */}
      <div className="mb-3">
        <TutorialProgress current={currentStep} total={totalSteps} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {step.practiceNote && step.navigateTo && (
          <button onClick={onPractice}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-[#2A6B6B] bg-[#E6F4EF] hover:bg-[#d5ede5] rounded-full transition-colors border border-[#2A6B6B]/20">
            <Play className="w-3.5 h-3.5" /> תרגלי
          </button>
        )}
        <div className="flex-1" />
        {!isFirst && (
          <button onClick={onPrev} className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/60 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4" /> הקודם
          </button>
        )}
        <button onClick={onNext}
          className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-primary-foreground rounded-full transition-colors bg-primary hover:bg-primary/90">
          {isLast ? 'סיום 🎉' : 'הבא'}
          {!isLast && <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.div>
  );
}
import { AnimatePresence, motion } from 'framer-motion';
import { ProgressBar } from './ProgressBar';
import { useWizard } from '../store/wizard';

const SECTIONS = ['Welcome', 'Account', 'AIOStreams', 'Catalogs', 'Install'];

function stepToSection(step: number): number {
  if (step === 0) return 0;
  if (step <= 7) return 1;
  if (step <= 14) return 2;
  if (step <= 16) return 3;
  return 4;
}

const variants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

interface Props {
  children: React.ReactNode;
  showBack?: boolean;
}

export function WizardShell({ children, showBack = true }: Props) {
  const { step, prevStep } = useWizard();

  return (
    <div
      className="min-h-screen bg-panel flex flex-col items-center justify-center px-4 py-8"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
    >
      <div className="w-full max-w-xl">
        <div className="text-center mb-6">
          <span className="text-3xl">🤖</span>
          <p className="text-sm text-gray-500 mt-1 font-medium tracking-wide uppercase">Perfect Setup Wizard</p>
        </div>

        <ProgressBar sections={SECTIONS} currentSection={stepToSection(step)} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="bg-white rounded-wizard shadow-wizard p-8"
          >
            {children}
          </motion.div>
        </AnimatePresence>

        {showBack && step > 0 && (
          <button
            onClick={prevStep}
            className="mt-4 text-sm text-gray-400 hover:text-accent transition-colors"
          >
            ← Back
          </button>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          🔒 Everything runs in your browser — we never store your credentials.
        </p>
      </div>
    </div>
  );
}

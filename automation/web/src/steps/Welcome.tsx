import { motion } from 'framer-motion';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard, type Target } from '../store/wizard';

const targets: { id: Target; emoji: string; name: string; desc: string }[] = [
  { id: 'stremio', emoji: '🎞️', name: 'Stremio', desc: 'Desktop & mobile, best ecosystem' },
  { id: 'nuvio', emoji: '🚀', name: 'Nuvio', desc: 'Modern app with dynamic collections' },
];

export function Welcome() {
  const { target, setTarget, nextStep } = useWizard();

  return (
    <WizardShell showBack={false}>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">
        Welcome! Let's set everything up for you 💪
      </h1>
      <p className="text-gray-500 mb-6 leading-relaxed">
        Don't be scared — although there are a few steps, this wizard handles everything automatically.
        You'll just need a few API keys and we'll walk you through each one.
      </p>

      <p className="font-semibold text-gray-700 mb-3">Which app are you setting up?</p>
      <div className="grid grid-cols-2 gap-3 mb-2">
        {targets.map(t => (
          <motion.button
            key={t.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setTarget(t.id)}
            className={`p-4 border-2 rounded-xl text-left transition-all ${
              target === t.id
                ? 'border-accent bg-purple-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-2xl mb-1">{t.emoji}</div>
            <div className="font-bold text-gray-800">{t.name}</div>
            <div className="text-xs text-gray-500">{t.desc}</div>
          </motion.button>
        ))}
      </div>

      <NextButton onClick={nextStep} disabled={!target} label="Let's go! →" />
    </WizardShell>
  );
}

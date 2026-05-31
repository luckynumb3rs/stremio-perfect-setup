import { motion } from 'framer-motion';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard, type Target } from '../store/wizard';
import { resolveLogoUrl } from '../lib/services';

const targets: { id: Target; name: string; desc: string; logoFile: string }[] = [
  {
    id: 'stremio',
    name: 'Stremio',
    desc: 'Desktop, mobile, and TV. The largest streaming addon ecosystem with thousands of community addons.',
    logoFile: 'stremio.svg',
  },
  {
    id: 'nuvio',
    name: 'Nuvio',
    desc: 'Modern streaming app with beautiful dynamic collections, backdrops, and a polished interface.',
    logoFile: 'nuvio.png',
  },
];

export function Welcome() {
  const { target, setTarget, nextStep } = useWizard();

  return (
    <WizardShell showBack={false}>
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.6rem', lineHeight: 1.3 }}>
          Welcome to the Perfect Setup Wizard
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: '0.5rem' }}>
          This wizard automatically configures your entire streaming setup - AIOStreams for streams, AIOMetadata for catalogs, and all your preferred settings in one go.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.65 }}>
          You will need a few API keys, but we walk you through each one step by step. The process takes about 5 minutes and everything runs in your browser.
        </p>
      </div>

      <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
        Which app are you setting up?
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
        {targets.map(t => {
          const logoUrl = resolveLogoUrl(`assets/logos/${t.logoFile}`);
          const isSelected = target === t.id;
          return (
            <motion.button
              key={t.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setTarget(t.id)}
              style={{
                padding: '1.1rem',
                border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '12px',
                background: isSelected ? 'var(--panel-2)' : 'var(--panel)',
                textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                boxShadow: isSelected ? '0 0 0 4px rgba(109,58,242,0.1)' : 'none',
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={t.name}
                  style={{ height: '28px', maxWidth: '100px', objectFit: 'contain', marginBottom: '0.75rem', display: 'block' }}
                />
              ) : (
                <div style={{ height: '28px', fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent)', marginBottom: '0.75rem' }}>
                  {t.name}
                </div>
              )}
              <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.95rem', marginBottom: '0.2rem' }}>{t.name}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.45 }}>{t.desc}</div>
            </motion.button>
          );
        })}
      </div>

      <NextButton onClick={nextStep} disabled={!target} label="Start Setup" />
    </WizardShell>
  );
}

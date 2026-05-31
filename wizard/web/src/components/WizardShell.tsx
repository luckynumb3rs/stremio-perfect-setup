import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, ChevronLeft } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useWizard } from '../store/wizard';
import { useTheme } from '../hooks/useTheme';
import { resolveLogoUrl } from '../lib/services';
import { getGuideUrl } from '../lib/site';

const variants = {
  enter:  { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit:   { opacity: 0, x: -30 },
};

interface Props {
  children: React.ReactNode;
  showBack?: boolean;
}

export function WizardShell({ children, showBack = true }: Props) {
  const { step, prevStep } = useWizard();
  const { theme, toggle } = useTheme();
  const [navOpen, setNavOpen] = useState(false);

  const spsLogo = resolveLogoUrl('assets/logos/sps-logo.svg');
  const guideUrl = getGuideUrl();

  function closeNav() { setNavOpen(false); }

  return (
    <>
      {/* Topbar identical to guide */}
      <header className="topbar">
        <button
          className="icon-btn"
          id="nav-toggle"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(o => !o)}
        >
          ☰
        </button>
        <a className="topbar-brand" href={guideUrl}>
          {spsLogo && (
            <img src={spsLogo} alt="Stremio Perfect Setup logo" className="topbar-logo" />
          )}
          <span className="topbar-brand-text">
            <span className="topbar-title">Stremio/Nuvio Perfect Setup</span>
            <span className="topbar-subtitle">Full and Easy Total Beginner's Guide</span>
          </span>
        </a>
        <a
          className="topbar-wizard-btn is-guide"
          href={guideUrl}
          aria-label="Back to guide"
        >
          <BookOpen size={15} aria-hidden="true" />
          <span className="wizard-label">Guide</span>
        </a>
        <button
          className="icon-btn"
          id="theme-toggle"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={theme === 'dark'}
          onClick={toggle}
        >
          ◐
        </button>
      </header>

      {/* Mobile backdrop */}
      <div
        className={`nav-backdrop${navOpen ? ' nav-open' : ''}`}
        aria-hidden="true"
        onClick={closeNav}
      />

      {/* Sidebar */}
      <aside className={`sidebar${navOpen ? ' nav-open' : ''}`} aria-label="Wizard navigation">
        <Sidebar onClose={closeNav} />
      </aside>

      {/* Layout */}
      <div className="layout">
        <main className="content" id="main-content">
          <article className="doc-card fade-in">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeInOut' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>

            {showBack && step > 0 && (
              <button
                onClick={prevStep}
                style={{
                  marginTop: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.875rem',
                  color: 'var(--muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem 0',
                }}
                onMouseOver={e => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseOut={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
          </article>
        </main>
      </div>
    </>
  );
}

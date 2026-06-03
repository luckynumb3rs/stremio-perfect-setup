import { useEffect, useRef } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { useWizard } from '../store/wizard';
import { getGuideStatsUrl } from '../lib/site';
import {
  ACTIVE_KEY_SCREENS,
  AIO_SECTION_START_STEP,
  KEY_SCREEN_START_STEP,
  getCatalogStep,
  getInstallStep,
} from '../lib/keyScreens';

interface Props {
  onClose: () => void;
}

export function Sidebar({ onClose }: Props) {
  const { step, maxReachedStep, aioSections, setStep } = useWizard();
  const guideCountRef = useRef<HTMLSpanElement>(null);
  const wizardCountRef = useRef<HTMLSpanElement>(null);

  // Load and animate the guide and wizard counts
  useEffect(() => {
    const BASELINE = 15000;
    fetch(getGuideStatsUrl(), { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { totalCompletions?: number; wizard?: { totalAccountsCreated?: number } }) => {
        const guideTotal = data?.totalCompletions ?? BASELINE;
        const wizardTotal = data?.wizard?.totalAccountsCreated ?? 0;
        animateCount(guideCountRef.current, guideTotal);
        animateCount(wizardCountRef.current, wizardTotal);
      })
      .catch(() => {
        if (guideCountRef.current) guideCountRef.current.textContent = new Intl.NumberFormat().format(BASELINE);
        if (wizardCountRef.current) wizardCountRef.current.textContent = '0';
      });
  }, []);

  function animateCount(node: HTMLElement | null, target: number) {
    if (!node) return;
    const duration = 1400;
    const start = performance.now();
    function frame(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      node!.textContent = new Intl.NumberFormat().format(Math.floor(target * eased));
      if (p < 1) requestAnimationFrame(frame);
      else node!.textContent = new Intl.NumberFormat().format(target);
    }
    requestAnimationFrame(frame);
  }

  const n = aioSections.length;
  const CATALOGS_STEP = getCatalogStep(n);
  const INSTALL_STEP = getInstallStep(n);

  function goTo(s: number) {
    if (s <= maxReachedStep && s !== step) { setStep(s); onClose(); }
  }

  function cls(s: number) {
    const isDone = s < step;
    const isCurr = s === step;
    const isClickable = s <= maxReachedStep && s !== step;
    return [
      'nav-step',
      isCurr ? 'is-current' : '',
      isDone ? 'is-done' : '',
      isClickable ? 'is-clickable' : '',
    ].filter(Boolean).join(' ');
  }

  function StepIcon({ s }: { s: number }) {
    if (s < step) return <Check size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />;
    if (s === step) return <ChevronRight size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />;
    return (
      <span style={{
        width: '12px', height: '12px', borderRadius: '50%',
        border: '1px solid var(--border)', display: 'inline-block', flexShrink: 0,
      }} />
    );
  }

  return (
    <div className="sidebar__inner">
      {/* Wizard nav steps */}
      <nav id="sidebar-nav">
        {/* Welcome */}
        <button className={cls(0)} onClick={() => goTo(0)}>
          <StepIcon s={0} />
          <span>Welcome</span>
        </button>

        {/* Account */}
        <button className={cls(1)} onClick={() => goTo(1)}>
          <StepIcon s={1} />
          <span>Account Setup</span>
        </button>

        {/* Services & Keys */}
        <div className="nav-section-label">Services &amp; Keys</div>
        {ACTIVE_KEY_SCREENS.map((screen, index) => {
          const stepIndex = KEY_SCREEN_START_STEP + index;
          return (
            <button key={screen.id} className={`${cls(stepIndex)} is-sub`} onClick={() => goTo(stepIndex)}>
              <StepIcon s={stepIndex} />
              <span>{screen.label}</span>
            </button>
          );
        })}

        {/* AIOStreams Config */}
        <div className="nav-section-label">AIOStreams Configuration</div>
        {n === 0 ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', padding: '0.35rem 0.65rem', fontStyle: 'italic' }}>
            Loading…
          </div>
        ) : (
          aioSections.map((sec, i) => {
            const s = AIO_SECTION_START_STEP + i;
            return (
              <button key={sec.id} className={`${cls(s)} is-sub`} onClick={() => goTo(s)}>
                <StepIcon s={s} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sec.icon} {sec.title}
                </span>
              </button>
            );
          })
        )}

        {/* Catalogs + Install */}
        <div style={{ marginTop: '0.6rem' }}>
          <button className={cls(CATALOGS_STEP)} onClick={() => goTo(CATALOGS_STEP)}>
            <StepIcon s={CATALOGS_STEP} />
            <span>Catalogs</span>
          </button>
          <button className={cls(INSTALL_STEP)} onClick={() => goTo(INSTALL_STEP)}>
            <StepIcon s={INSTALL_STEP} />
            <span>Install</span>
          </button>
        </div>
      </nav>

      {/* Footer mirrors guide sidebar footer */}
      <div className="sidebar-footer">
        <div className="sidebar-support-links">
          <a
            className="sidebar-support-link sidebar-support-link--github"
            href="https://github.com/luckynumb3rs/stremio-perfect-setup"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View GitHub repository"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.11.79-.25.79-.56v-2.17c-3.2.7-3.88-1.36-3.88-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.69.08-.69 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.67 1.24 3.32.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.27 1.17-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.14 1.18a10.9 10.9 0 0 1 5.72 0c2.18-1.49 3.14-1.18 3.14-1.18.62 1.58.23 2.75.11 3.04.73.81 1.17 1.83 1.17 3.08 0 4.41-2.68 5.39-5.24 5.67.41.35.78 1.04.78 2.1v3.12c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>
            </svg>
          </a>
          <a
            className="sidebar-support-link sidebar-support-link--kofi"
            href="https://ko-fi.com/luckynumb3rs"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Support on Ko-fi"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M7.5 3.25c.35.35.7.78.7 1.35 0 .48-.22.84-.43 1.17-.2.31-.37.57-.37.93 0 .39.2.7.55 1.08l-1.1.95C6.25 8.08 6 7.43 6 6.75c0-.62.27-1.04.5-1.4.17-.27.3-.47.3-.75 0-.25-.15-.47-.4-.72l1.1-.63Zm4 0c.35.35.7.78.7 1.35 0 .48-.22.84-.43 1.17-.2.31-.37.57-.37.93 0 .39.2.7.55 1.08l-1.1.95c-.6-.65-.85-1.3-.85-1.98 0-.62.27-1.04.5-1.4.17-.27.3-.47.3-.75 0-.25-.15-.47-.4-.72l1.1-.63Zm4 0c.35.35.7.78.7 1.35 0 .48-.22.84-.43 1.17-.2.31-.37.57-.37.93 0 .39.2.7.55 1.08l-1.1.95c-.6-.65-.85-1.3-.85-1.98 0-.62.27-1.04.5-1.4.17-.27.3-.47.3-.75 0-.25-.15-.47-.4-.72l1.1-.63ZM4 10h12.5A1.5 1.5 0 0 1 18 11.5V12h.75a3.75 3.75 0 0 1 0 7.5h-1.23A3.5 3.5 0 0 1 14.5 21h-7A3.5 3.5 0 0 1 4 17.5V10Zm14 3.5v4.25h.75a2.125 2.125 0 0 0 0-4.25H18Zm-12.25-2v6A1.75 1.75 0 0 0 7.5 19.25h7a1.75 1.75 0 0 0 1.75-1.75v-6H5.75Z"/>
            </svg>
            <span>Buy me a coffee</span>
          </a>
        </div>
        <section className="sidebar-stat-card" aria-label="Guide and wizard activity">
          <div className="sidebar-stat-grid">
            <div className="sidebar-stat-item">
              <span className="sidebar-stat-item__label">Guide completed</span>
              <strong className="sidebar-stat-item__value"><span ref={guideCountRef}>0</span></strong>
              <span className="sidebar-stat-item__suffix">readers</span>
            </div>
            <div className="sidebar-stat-divider" aria-hidden="true" />
            <div className="sidebar-stat-item">
              <span className="sidebar-stat-item__label">Wizard created</span>
              <strong className="sidebar-stat-item__value"><span ref={wizardCountRef}>0</span></strong>
              <span className="sidebar-stat-item__suffix">accounts</span>
            </div>
          </div>
        </section>
        <div className="sidebar-credit">
          Made with ❤️ by <a className="sidebar-credit__link" href="https://github.com/luckynumb3rs" target="_blank" rel="noopener noreferrer">luckynumb3rs</a>
        </div>
      </div>
    </div>
  );
}

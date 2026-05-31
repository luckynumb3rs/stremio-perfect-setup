import { useEffect } from 'react';
import { useWizard } from './store/wizard';
import { buildAioSections } from './lib/aioSections';
import { Welcome } from './steps/Welcome';
import { AccountStep } from './steps/AccountStep';
import { DebridStep } from './steps/DebridStep';
import { KeysStep } from './steps/KeysStep';
import { AioSectionStep } from './steps/AioSectionStep';
import { CatalogStep } from './steps/CatalogStep';
import { InstallingStep } from './steps/InstallingStep';
import { DoneStep } from './steps/DoneStep';
import { TEMPLATE_URLS } from './lib/constants';
import { WizardShell } from './components/WizardShell';

function StepRouter() {
  const { step, templates, aioSections, setTemplates, setAioSections } = useWizard();

  useEffect(() => {
    if (templates) return;
    Promise.all([
      fetch(TEMPLATE_URLS.aiostreams).then(r => r.json()),
      fetch(TEMPLATE_URLS.aiometadataStremio).then(r => r.json()),
      fetch(TEMPLATE_URLS.collections).then(r => r.json()),
    ]).then(([aiostreams, aiometadata, collections]) => {
      setTemplates({ aiostreams, aiometadata, collections });
      setAioSections(buildAioSections(aiostreams));
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const n = aioSections.length;
  const CATALOGS_STEP = 7 + n;
  const INSTALL_STEP  = 7 + n + 1;

  // Fixed steps
  if (step === 0) return <Welcome />;
  if (step === 1) return <AccountStep />;
  if (step === 2) return <DebridStep />;
  // steps 3-6: TMDB(0), TVDB(1), Gemini(2), RPDB(3)
  if (step >= 3 && step <= 6) return <KeysStep keyIndex={step - 3} />;

  // AIO sections (7 to 7+n-1)
  if (step >= 7 && step < 7 + n) {
    return <AioSectionStep sectionIndex={step - 7} />;
  }

  // Loading guard: template not yet loaded when user is at step >= 7
  if (step >= 7 && n === 0) {
    return (
      <WizardShell>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', textAlign: 'center', padding: '1rem 0' }}>
          Loading configuration...
        </p>
      </WizardShell>
    );
  }

  if (step === CATALOGS_STEP) return <CatalogStep />;
  if (step === INSTALL_STEP)  return <InstallingStep />;
  return <DoneStep />;
}

export default function App() {
  return <StepRouter />;
}

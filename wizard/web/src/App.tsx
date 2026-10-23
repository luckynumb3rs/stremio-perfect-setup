import { useEffect, useRef, useState } from 'react';
import { rolesOf, useWizard } from './store/wizard';
import { buildAioSections } from './lib/aioSections';
import { Welcome } from './steps/Welcome';
import { AccountStep } from './steps/AccountStep';
import { KeysStep } from './steps/KeysStep';
import { AioSectionStep } from './steps/AioSectionStep';
import { CatalogStep } from './steps/CatalogStep';
import { InstallingStep } from './steps/InstallingStep';
import { DoneStep } from './steps/DoneStep';
import { RecommendationsStep } from './steps/RecommendationsStep';
import { isBingecatOn, normalizeWizardConfig, resolveWizardConfig } from './lib/constants';
import {
  ACTIVE_KEY_SCREENS,
  AIO_SECTION_START_STEP,
  KEY_SCREEN_START_STEP,
  getCatalogStep,
  getRecommendationsStep,
  getInstallStep,
} from './lib/keyScreens';
import { WizardShell } from './components/WizardShell';
import { ensureAnalytics, getStepMeta, trackWizardStepView } from './lib/analytics';
import { resolveRepoUrl } from './lib/integration';

// config.json is bundled at build time from the root wizard/config.json.
import bundledConfig from '../../config.json';

const wizardConfigSource = normalizeWizardConfig(bundledConfig);

async function fetchJson(url: string, label: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} failed to load from ${url} (HTTP ${response.status}).`);
  }
  return response.json();
}

function StepRouter() {
  const { step, target, aioSections, wizardConfig, nuvioProfiles, stremioKids, setTemplates, setAioSections, setWizardConfig } = useWizard();
  const hasCatalogs = rolesOf({ target, nuvioProfiles, stremioKids }).hasStandard;
  const lastTrackedKeyRef = useRef('');
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    const resolvedConfig = resolveWizardConfig(wizardConfigSource, target);
    setWizardConfig(resolvedConfig);
    if (target && !resolvedConfig) {
      setConfigError(`No valid config.json block matches the selected target "${target}".`);
      return;
    }
    setConfigError(null);
  }, [target, setWizardConfig]);

  useEffect(() => {
    if (!target || !wizardConfig) {
      setTemplates(null);
      setAioSections([]);
      return;
    }

    const targetTemplates = target === 'nuvio'
      ? wizardConfig.templates.nuvio
      : wizardConfig.templates.stremio;
    const collectionsTemplatePath = targetTemplates.collections ?? wizardConfig.templates.nuvio.collections ?? null;
    const tplUrls = {
      aiostreams: resolveRepoUrl(targetTemplates.aiostreams),
      aiometadata: resolveRepoUrl(targetTemplates.aiometadata),
    };

    let cancelled = false;
    setConfigError(null);
    setTemplates(null);
    setAioSections([]);

    const watchlyTemplatePath = targetTemplates.watchly ?? null;
    const bingecatConfig = isBingecatOn(wizardConfig) ? wizardConfig.bingecat ?? null : null;

    const fetches = [
      fetchJson(tplUrls.aiostreams, 'AIOStreams template'),
      fetchJson(tplUrls.aiometadata, 'AIOMetadata template'),
      collectionsTemplatePath
        ? fetchJson(resolveRepoUrl(collectionsTemplatePath), `${target === 'nuvio' ? 'Nuvio' : 'Collections'} template`)
        : Promise.resolve([]),
      target === 'nuvio'
        ? fetchJson(resolveRepoUrl(wizardConfig.templates.nuvio.settings), 'Nuvio settings template')
        : Promise.resolve(null),
      watchlyTemplatePath
        ? fetchJson(resolveRepoUrl(watchlyTemplatePath), 'Watchly template')
        : Promise.resolve(null),
      bingecatConfig
        ? Promise.all([
          fetchJson(resolveRepoUrl(bingecatConfig.templates.standard), 'BingeCat template'),
          fetchJson(resolveRepoUrl(bingecatConfig.templates.kids), 'BingeCat Kids template'),
        ]).then(([standard, kids]) => ({ standard, kids }))
        : Promise.resolve(undefined),
    ] as const;

    Promise.all(fetches).then(([aiostreams, aiometadata, collections, settings, watchly, bingecat]) => {
      if (cancelled) return;
      setTemplates({ aiostreams, aiometadata, collections, settings, watchly: watchly ?? null, ...(bingecat ? { bingecat } : {}) });
      setAioSections(buildAioSections(aiostreams));
    }).catch((error: unknown) => {
      if (cancelled) return;
      setConfigError(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
    };
  }, [target, wizardConfig, setAioSections, setTemplates]);

  useEffect(() => {
    const meta = getStepMeta(step, aioSections, hasCatalogs);
    if (!meta) return;

    const trackingKey = `${step}:${target ?? 'unknown'}:${meta.slug}`;
    if (lastTrackedKeyRef.current === trackingKey) return;

    lastTrackedKeyRef.current = trackingKey;
    ensureAnalytics();
    trackWizardStepView(step, target, aioSections, hasCatalogs);
  }, [aioSections, hasCatalogs, step, target]);

  const n = aioSections.length;
  const KEY_SCREEN_END_STEP = KEY_SCREEN_START_STEP + ACTIVE_KEY_SCREENS.length;
  const CATALOGS_STEP = getCatalogStep(n);
  const RECOMMENDATIONS_STEP = getRecommendationsStep(n, hasCatalogs);
  const INSTALL_STEP = getInstallStep(n, hasCatalogs);

  if (step > 0 && target && configError) {
    return (
      <WizardShell>
        <p style={{ color: '#dc2626', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {configError}
        </p>
      </WizardShell>
    );
  }

  // Fixed steps
  if (step === 0) return <Welcome />;
  if (step === 1) return <AccountStep />;
  if (step >= KEY_SCREEN_START_STEP && step < KEY_SCREEN_END_STEP) {
    return <KeysStep keyIndex={step - KEY_SCREEN_START_STEP} />;
  }

  if (step >= AIO_SECTION_START_STEP && step < AIO_SECTION_START_STEP + n) {
    return <AioSectionStep sectionIndex={step - AIO_SECTION_START_STEP} />;
  }

  if (step >= AIO_SECTION_START_STEP && n === 0) {
    return (
      <WizardShell>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', textAlign: 'center', padding: '1rem 0' }}>
          Loading configuration...
        </p>
      </WizardShell>
    );
  }

  if (hasCatalogs && step === CATALOGS_STEP) return <CatalogStep />;
  if (step === RECOMMENDATIONS_STEP) return <RecommendationsStep />;
  if (step === INSTALL_STEP) return <InstallingStep />;
  return <DoneStep />;
}

export default function App() {
  return <StepRouter />;
}

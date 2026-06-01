import type { AioSection } from './aioSections';
import {
  ACTIVE_KEY_SCREENS,
  AIO_SECTION_START_STEP,
  KEY_SCREEN_START_STEP,
  getCatalogStep,
  getDoneStep,
  getInstallStep,
} from './keyScreens';
import { wizardMetadata } from './integration';

const MEASUREMENT_ID = wizardMetadata.ga4Id.trim();

const COMPLETION_EVENT = 'wizard_setup_completed';
const ACCOUNT_CREATED_EVENT = 'wizard_account_created';

let analyticsReady = false;

interface StepMeta {
  index: number;
  slug: string;
  name: string;
}

interface CompletionPayload {
  accountMode: 'create' | 'signin';
  addonCount: number;
  debridServiceCount: number;
  runId: string;
  target: 'stremio' | 'nuvio';
}

export function ensureAnalytics() {
  if (analyticsReady || !MEASUREMENT_ID || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  const scriptId = 'wizard-ga4';
  if (!document.getElementById(scriptId)) {
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.appendChild(script);
  }

  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false });

  analyticsReady = true;
}

export function trackWizardStepView(
  step: number,
  target: 'stremio' | 'nuvio' | null,
  aioSections: AioSection[],
) {
  if (!MEASUREMENT_ID) return;

  ensureAnalytics();

  const meta = getStepMeta(step, aioSections);
  if (!meta || typeof window.gtag !== 'function') return;

  const baseUrl = new URL('./', window.location.href);
  const pageLocation = new URL(meta.slug, baseUrl).toString();
  const pagePath = `${baseUrl.pathname.replace(/\/$/, '')}/${meta.slug}`;

  window.gtag('event', 'page_view', {
    page_location: pageLocation,
    page_path: pagePath,
    page_title: `${wizardMetadata.wizardPageTitle} - ${meta.name}`,
  });

  window.gtag('event', 'wizard_step_view', {
    step_index: meta.index,
    step_name: meta.name,
    step_slug: meta.slug,
    target: target ?? 'unknown',
  });
}

export function trackWizardCompletion(payload: CompletionPayload) {
  if (!MEASUREMENT_ID) return;

  ensureAnalytics();

  if (typeof window.gtag !== 'function') return;

  const completionStorageKey = `wizard-completion-sent:${payload.runId}`;
  if (readSessionFlag(completionStorageKey)) return;

  window.gtag('event', COMPLETION_EVENT, {
    account_mode: payload.accountMode,
    addon_count: payload.addonCount,
    debrid_service_count: payload.debridServiceCount,
    target: payload.target,
  });
  writeSessionFlag(completionStorageKey);

  if (payload.accountMode !== 'create') return;

  const createdStorageKey = `wizard-account-created-sent:${payload.runId}`;
  if (readSessionFlag(createdStorageKey)) return;

  window.gtag('event', ACCOUNT_CREATED_EVENT, {
    addon_count: payload.addonCount,
    debrid_service_count: payload.debridServiceCount,
    target: payload.target,
  });
  writeSessionFlag(createdStorageKey);
}

export function getStepMeta(step: number, aioSections: AioSection[]): StepMeta | null {
  if (step === 0) return { index: 0, slug: 'welcome', name: 'Welcome' };
  if (step === 1) return { index: 1, slug: 'account', name: 'Account Setup' };
  if (step >= KEY_SCREEN_START_STEP && step < KEY_SCREEN_START_STEP + ACTIVE_KEY_SCREENS.length) {
    const screen = ACTIVE_KEY_SCREENS[step - KEY_SCREEN_START_STEP];
    if (!screen) return null;
    return { index: step, slug: screen.slug, name: screen.label };
  }

  const sectionIndex = step - AIO_SECTION_START_STEP;
  if (sectionIndex >= 0 && sectionIndex < aioSections.length) {
    const section = aioSections[sectionIndex];
    return {
      index: step,
      slug: sanitizeSlug(section.title || section.id || `section-${step}`),
      name: `${section.icon ? `${section.icon} ` : ''}${section.title}`.trim(),
    };
  }

  if (step === getCatalogStep(aioSections.length)) {
    return { index: step, slug: 'catalogs', name: 'Catalogs' };
  }
  if (step === getInstallStep(aioSections.length)) {
    return { index: step, slug: 'install', name: 'Install' };
  }
  if (step === getDoneStep(aioSections.length)) {
    return { index: step, slug: 'done', name: 'Done' };
  }

  return null;
}

function sanitizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'step';
}

function readSessionFlag(key: string) {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Ignore storage failures; analytics should remain best-effort.
  }
}

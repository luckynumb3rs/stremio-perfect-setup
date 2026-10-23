import type { AioSection } from './aioSections';
import type { WizardConfig } from './constants';
import {
  ACTIVE_KEY_SCREENS,
  AIO_SECTION_START_STEP,
  KEY_SCREEN_START_STEP,
  getCatalogStep,
  getRecommendationsStep,
  getDoneStep,
  getInstallStep,
} from './keyScreens';
import { DEBRID_SERVICES } from './services';
import { wizardMetadata } from './integration';
import { formatAioAnalyticsValue, shouldTrackAioField, toAioAnalyticsParamName } from './analytics-helpers';
import type { AccountMode, AioStreamsInputs, CatalogSelection, Credentials, LoadedTemplates } from '../store/wizard';

// @ts-ignore
import { deriveCategories, deriveDiscoverFolders } from '@core/catalog-config.js';
// @ts-ignore
import { isVisible } from '@core/template-engine.js';

const MEASUREMENT_ID = wizardMetadata.ga4Id.trim();

const COMPLETION_EVENT = 'wizard_completed';
const ACCOUNT_CREATED_EVENT = 'wizard_account_created';

let analyticsReady = false;

interface StepMeta {
  index: number;
  slug: string;
  name: string;
}

interface CompletionPayload {
  accountMode: AccountMode;
  eventParams: Record<string, string | number>;
  runId: string;
  target: 'stremio' | 'nuvio';
}

interface BuildCompletionPayloadOptions {
  accountMode: AccountMode;
  addonCount: number;
  /** Profiles configured in this run (Stremio = 1) */
  profileCount: number;
  target: 'stremio' | 'nuvio';
  credentials: Credentials;
  instantDebrid: boolean;
  aioStreamsInputs: AioStreamsInputs;
  catalogSelection: CatalogSelection;
  templates: LoadedTemplates | null;
  wizardConfig: WizardConfig | null;
}

interface TemplateField {
  id: string;
  type?: string;
  default?: unknown;
  subOptions?: TemplateField[];
}

export function ensureAnalytics() {
  if (analyticsReady || !MEASUREMENT_ID || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      window.dataLayer?.push(arguments);
    };
  }

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
  hasCatalogs = true,
) {
  if (!MEASUREMENT_ID) return;

  ensureAnalytics();

  const meta = getStepMeta(step, aioSections, hasCatalogs);
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

  window.gtag('event', COMPLETION_EVENT, payload.eventParams);
  writeSessionFlag(completionStorageKey);

  if (payload.accountMode !== 'create') return;

  const createdStorageKey = `wizard-account-created-sent:${payload.runId}`;
  if (readSessionFlag(createdStorageKey)) return;

  window.gtag('event', ACCOUNT_CREATED_EVENT, payload.eventParams);
  writeSessionFlag(createdStorageKey);
}

export function buildWizardCompletionPayload({
  accountMode,
  addonCount,
  profileCount,
  target,
  credentials,
  instantDebrid,
  aioStreamsInputs,
  catalogSelection,
  templates,
  wizardConfig,
}: BuildCompletionPayloadOptions): Record<string, string | number> {
  const params: Record<string, string | number> = {
    account_mode: accountMode,
    addon_count: addonCount,
    target,
  };

  const deniedParams = new Set(wizardConfig?.analytics?.denylist ?? []);
  if (!deniedParams.has('profile_count')) params.profile_count = profileCount;

  const debridNames = credentials.debridServices
    .map((service) => DEBRID_SERVICES.find(({ id }) => id === service.id)?.name ?? service.id)
    .filter(Boolean);
  const debridValue = joinWithinLimit(debridNames);
  if (debridValue && !deniedParams.has('services_debrid')) params.services_debrid = debridValue;

  const ownKeyIds = [
    credentials.tmdbApiKey.trim() || credentials.tmdbAccessToken.trim() ? 'tmdb' : '',
    credentials.tvdbApiKey.trim() ? 'tvdb' : '',
    credentials.geminiApiKey.trim() ? 'gemini' : '',
    credentials.rpdbApiKey.trim() ? 'rpdb' : '',
  ].filter(Boolean);
  const keysValue = joinWithinLimit(ownKeyIds);
  if (keysValue && !deniedParams.has('services_keys')) params.services_keys = keysValue;

  if (!deniedParams.has('instant_debrid')) params.instant_debrid = instantDebrid ? 'true' : 'false';

  const categories = deriveEnabledCatalogCategories(templates, catalogSelection, wizardConfig);
  const categoryValue = joinWithinLimit(categories);
  if (categoryValue && !deniedParams.has('catalog_categories')) params.catalog_categories = categoryValue;

  const discoverKeys = deriveEnabledDiscoverKeys(templates, catalogSelection, wizardConfig);
  const discoverValue = joinWithinLimit(discoverKeys);
  if (discoverValue && !deniedParams.has('catalog_discover')) params.catalog_discover = discoverValue;

  const visibleAioFields = getVisibleAioFields(templates?.aiostreams, aioStreamsInputs, credentials);
  for (const field of visibleAioFields) {
    if (!field.id) continue;
    if (!shouldTrackAioField(field)) continue;

    const paramName = toAioAnalyticsParamName(field.id);
    if (deniedParams.has(paramName)) continue;
    const value = formatAioAnalyticsValue(field.type, field.value);
    if (value === undefined) continue;
    params[paramName] = value;
  }

  return params;
}

export function getStepMeta(step: number, aioSections: AioSection[], hasCatalogs = true): StepMeta | null {
  if (step === 0) return { index: 0, slug: 'welcome', name: 'Welcome' };
  if (step === 1) return { index: 1, slug: 'account', name: 'Account Setup' };
  if (step >= KEY_SCREEN_START_STEP && step < KEY_SCREEN_START_STEP + ACTIVE_KEY_SCREENS.length) {
    const screen = ACTIVE_KEY_SCREENS[step - KEY_SCREEN_START_STEP];
    if (!screen) return null;
    return { index: step, slug: screen.id, name: screen.label };
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

  if (hasCatalogs && step === getCatalogStep(aioSections.length)) {
    return { index: step, slug: 'catalogs', name: 'Catalogs' };
  }
  if (step === getRecommendationsStep(aioSections.length, hasCatalogs)) {
    return { index: step, slug: 'recommendations', name: 'Recommendations' };
  }
  if (step === getInstallStep(aioSections.length, hasCatalogs)) {
    return { index: step, slug: 'install', name: 'Install' };
  }
  if (step === getDoneStep(aioSections.length, hasCatalogs)) {
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

function deriveEnabledCatalogCategories(
  templates: LoadedTemplates | null,
  catalogSelection: CatalogSelection,
  wizardConfig: WizardConfig | null,
) {
  const catalogs = (templates?.aiometadata as { config?: { catalogs?: object[] } } | null)?.config?.catalogs ?? [];
  const collections = (templates?.collections ?? []) as object[];
  const categoryExceptions = wizardConfig?.catalogSelectionExceptions ?? [];
  return deriveCategories(catalogs, collections, categoryExceptions)
    .map((category: { key: string }) => category.key)
    .filter((key: string) => catalogSelection.enabledCategories.has(key));
}

function deriveEnabledDiscoverKeys(
  templates: LoadedTemplates | null,
  catalogSelection: CatalogSelection,
  wizardConfig: WizardConfig | null,
) {
  const catalogs = (templates?.aiometadata as { config?: { catalogs?: object[] } } | null)?.config?.catalogs ?? [];
  const collections = (templates?.collections ?? []) as object[];
  const categoryExceptions = wizardConfig?.catalogSelectionExceptions ?? [];
  return deriveDiscoverFolders(catalogs, collections, categoryExceptions)
    .map((discover: { id: string }) => discover.id)
    .filter((id: string) => catalogSelection.enabledDiscoverFolderIds.has(id));
}

function getVisibleAioFields(
  template: unknown,
  aioStreamsInputs: AioStreamsInputs,
  credentials: Credentials,
): Array<{ id: string; type?: string; value: unknown }> {
  const inputs: TemplateField[] = (template as { metadata?: { inputs?: TemplateField[] } } | null)?.metadata?.inputs ?? [];
  const services = credentials.debridServices.map((service) => service.id);
  const isVisibleField = isVisible as (field: TemplateField, ctx: { inputs: AioStreamsInputs; services: string[] }) => boolean;
  const ctx = { inputs: aioStreamsInputs, services };
  const readNested = (id: string): unknown =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    id.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), aioStreamsInputs);

  const out: Array<{ id: string; type?: string; value: unknown }> = [];
  for (const field of inputs) {
    if (field.type === 'alert' || field.type === 'socials') continue;
    if (field.type === 'subsection') {
      // Subsection sub-option values are namespaced under the subsection id.
      if (!isVisibleField(field, ctx)) continue;
      for (const child of field.subOptions ?? []) {
        if (!child.id || child.type === 'alert' || child.type === 'socials' || child.type === 'subsection') continue;
        if (!isVisibleField(child, ctx)) continue;
        const path = `${field.id}.${child.id}`;
        out.push({ id: path, type: child.type, value: readNested(path) ?? child.default });
      }
      continue;
    }
    if (!isVisibleField(field, ctx)) continue;
    out.push({ id: field.id, type: field.type, value: readNested(field.id) ?? field.default });
  }
  return out;
}

function joinWithinLimit(values: string[], maxLength = 100) {
  const trimmedValues = values
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
  if (trimmedValues.length === 0) return '';

  const kept: string[] = [];
  for (const value of trimmedValues) {
    const next = kept.length > 0 ? `${kept.join(',')},${value}` : value;
    if (next.length > maxLength) break;
    kept.push(value);
  }

  if (kept.length > 0) return kept.join(',');
  return trimmedValues[0].slice(0, maxLength);
}

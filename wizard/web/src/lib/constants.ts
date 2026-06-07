/** Shape of the wizard/config.json file loaded at runtime. */
export type WizardTarget = 'stremio' | 'nuvio';

export const WIZARD_KEY_ARRAY_IDS = [
  'tmdbApiKeys',
  'tmdbReadAccessTokens',
  'tvdbApiKeys',
  'geminiApiKeys',
  'rpdbApiKeys',
] as const;

export type WizardKeyArrayId = typeof WIZARD_KEY_ARRAY_IDS[number];

export type WizardObfuscatedKey = string;

export interface WizardNotificationStyle {
  background?: string;
  borderColor?: string;
  textColor?: string;
  boxShadow?: string;
}

export interface WizardNotification {
  markdown: string;
  targets?: WizardTarget[];
  style?: WizardNotificationStyle;
}

export interface WizardInstances {
  aiostreams: string[];
  aiometadata: string[];
  watchly?: string[];
}

export interface WizardTargetTemplates {
  aiostreams: string;
  aiometadata: string;
  collections?: string;
  watchly?: string;
}

export interface WizardNuvioTemplates extends WizardTargetTemplates {
  collections: string;
  settings: string;
}

export interface WizardTemplates {
  stremio: WizardTargetTemplates;
  nuvio: WizardNuvioTemplates;
}

export interface WizardKeys {
  tmdbApiKeys: WizardObfuscatedKey[];
  tmdbReadAccessTokens: WizardObfuscatedKey[];
  tvdbApiKeys: WizardObfuscatedKey[];
  geminiApiKeys: WizardObfuscatedKey[];
  rpdbApiKeys: WizardObfuscatedKey[];
}

export interface WizardLimits {
  stremioMaxCatalogs: number;
}

export interface WizardAnalyticsConfig {
  denylist?: string[];
}

export interface WizardConfig {
  name: string;
  targets: WizardTarget[];
  addonDetailsFilenamePrefix: string;
  catalogSelectionExceptions?: string[];
  keys: WizardKeys;
  limits: WizardLimits;
  analytics?: WizardAnalyticsConfig;
  doneStepNotifications?: WizardNotification[];
  instances: WizardInstances;
  templates: WizardTemplates;
  proxyBase?: string;
}

export interface WizardConfigFile {
  configurations: WizardConfig[];
}

interface LegacyWizardConfig extends Omit<WizardConfig, 'targets' | 'addonDetailsFilenamePrefix'> {
  target?: WizardTarget;
  targets?: WizardTarget[];
  addonDetailsFilenamePrefix?: string;
  addonDetailsFilename?: string;
}

function normalizeTargets(targets: unknown): WizardTarget[] {
  if (!Array.isArray(targets)) return [];
  return targets.filter((target): target is WizardTarget => target === 'stremio' || target === 'nuvio');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length ? items : null;
}

function normalizeOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function normalizeInstances(value: unknown): WizardInstances | null {
  if (!isRecord(value)) return null;
  const aiostreams = normalizeStringArray(value.aiostreams);
  const aiometadata = normalizeStringArray(value.aiometadata);
  if (!aiostreams || !aiometadata) return null;

  const watchly = Array.isArray(value.watchly)
    ? value.watchly.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined;

  return {
    aiostreams: shuffleArray(aiostreams),
    aiometadata: shuffleArray(aiometadata),
    watchly: watchly ? shuffleArray(watchly) : undefined,
  };
}

function normalizeTargetTemplates(value: unknown): WizardTargetTemplates | null {
  if (!isRecord(value)) return null;
  if (typeof value.aiostreams !== 'string' || typeof value.aiometadata !== 'string') {
    return null;
  }

  return {
    aiostreams: value.aiostreams,
    aiometadata: value.aiometadata,
    collections: typeof value.collections === 'string' ? value.collections : undefined,
    watchly: typeof value.watchly === 'string' ? value.watchly : undefined,
  };
}

function normalizeNuvioTemplates(value: unknown): WizardNuvioTemplates | null {
  const base = normalizeTargetTemplates(value);
  if (!base || !isRecord(value) || typeof value.collections !== 'string' || typeof value.settings !== 'string') {
    return null;
  }

  return {
    ...base,
    collections: value.collections,
    settings: value.settings,
  };
}

function normalizeTemplates(value: unknown): WizardTemplates | null {
  if (!isRecord(value)) return null;

  const stremio = normalizeTargetTemplates(value.stremio);
  const nuvio = normalizeNuvioTemplates(value.nuvio);
  return stremio && nuvio ? { stremio, nuvio } : null;
}

function normalizeObfuscatedKey(value: unknown): WizardObfuscatedKey | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeKeyArray(value: unknown): WizardObfuscatedKey[] | null {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeObfuscatedKey(entry))
    .filter((entry): entry is WizardObfuscatedKey => Boolean(entry));
}

function normalizeKeys(value: unknown): WizardKeys | null {
  if (!isRecord(value)) return null;

  const tmdbApiKeys = normalizeKeyArray(value.tmdbApiKeys);
  const tmdbReadAccessTokens = normalizeKeyArray(value.tmdbReadAccessTokens);
  const tvdbApiKeys = normalizeKeyArray(value.tvdbApiKeys);
  const geminiApiKeys = normalizeKeyArray(value.geminiApiKeys);
  const rpdbApiKeys = normalizeKeyArray(value.rpdbApiKeys);

  if (!tmdbApiKeys || !tmdbReadAccessTokens || !tvdbApiKeys || !geminiApiKeys || !rpdbApiKeys) {
    return null;
  }

  return { tmdbApiKeys, tmdbReadAccessTokens, tvdbApiKeys, geminiApiKeys, rpdbApiKeys };
}

function normalizeLimits(value: unknown): WizardLimits | null {
  if (!isRecord(value) || typeof value.stremioMaxCatalogs !== 'number' || value.stremioMaxCatalogs <= 0) {
    return null;
  }
  return { stremioMaxCatalogs: value.stremioMaxCatalogs };
}

function normalizeAnalytics(value: unknown): WizardAnalyticsConfig | undefined {
  if (!isRecord(value)) return undefined;
  const denylist = normalizeOptionalStringArray(value.denylist);
  if (!denylist || denylist.length === 0) {
    return undefined;
  }

  return { denylist };
}

function normalizeConfigBlock(block: LegacyWizardConfig): WizardConfig | null {
  const { target: _target, account: _account, ...rest } = block as LegacyWizardConfig & { account?: unknown };
  void _target;
  void _account;
  const targets = normalizeTargets(block.targets ?? (block.target ? [block.target] : []));
  const addonDetailsFilenamePrefix = typeof block.addonDetailsFilenamePrefix === 'string'
    ? block.addonDetailsFilenamePrefix.trim()
    : typeof block.addonDetailsFilename === 'string'
    ? block.addonDetailsFilename.replace(/\.txt$/i, '').trim()
    : '';
  const instances = normalizeInstances(block.instances);
  const templates = normalizeTemplates(block.templates);
  const keys = normalizeKeys(block.keys);
  const limits = normalizeLimits(block.limits);
  const analytics = normalizeAnalytics(block.analytics);
  if (
    !targets.length
    || typeof block.name !== 'string'
    || block.name.trim().length === 0
    || addonDetailsFilenamePrefix.length === 0
    || !instances
    || !templates
    || !keys
    || !limits
  ) {
    return null;
  }

  return {
    ...rest,
    name: block.name,
    addonDetailsFilenamePrefix,
    catalogSelectionExceptions: normalizeOptionalStringArray(block.catalogSelectionExceptions),
    keys,
    limits,
    analytics,
    instances,
    templates,
    targets,
  };
}

export function normalizeWizardConfig(source: unknown): WizardConfigFile {
  if (isRecord(source) && Array.isArray(source.configurations)) {
    return {
      configurations: source.configurations
        .map((config) => isRecord(config) ? normalizeConfigBlock(config as unknown as LegacyWizardConfig) : null)
        .filter((config): config is WizardConfig => Boolean(config)),
    };
  }

  if (!isRecord(source)) {
    return { configurations: [] };
  }

  const normalized = normalizeConfigBlock(source as unknown as LegacyWizardConfig);
  return {
    configurations: normalized ? [normalized] : [],
  };
}

export function resolveWizardConfig(source: unknown, target: WizardTarget | null): WizardConfig | null {
  if (!target) return null;
  const normalized = normalizeWizardConfig(source);
  return normalized.configurations.find((config) => config.targets.includes(target)) ?? null;
}

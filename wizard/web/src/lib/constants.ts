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

export interface WizardTemplates {
  aiostreams: string;
  aiometadata_stremio: string;
  aiometadata_nuvio: string;
  nuvio_collections: string;
  nuvio_settings: string;
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

export interface WizardConfig {
  name: string;
  targets: WizardTarget[];
  addonDetailsFilename: string;
  keys: WizardKeys;
  limits: WizardLimits;
  doneStepNotifications?: WizardNotification[];
  instances: WizardInstances;
  templates: WizardTemplates;
  proxyBase?: string;
}

export interface WizardConfigFile {
  configurations: WizardConfig[];
}

interface LegacyWizardConfig extends Omit<WizardConfig, 'targets'> {
  target?: WizardTarget;
  targets?: WizardTarget[];
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

function normalizeInstances(value: unknown): WizardInstances | null {
  if (!isRecord(value)) return null;
  const aiostreams = normalizeStringArray(value.aiostreams);
  const aiometadata = normalizeStringArray(value.aiometadata);
  if (!aiostreams || !aiometadata) return null;

  const watchly = Array.isArray(value.watchly)
    ? value.watchly.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined;

  return { aiostreams, aiometadata, watchly };
}

function normalizeTemplates(value: unknown): WizardTemplates | null {
  if (!isRecord(value)) return null;
  const nuvioCollections = typeof value.nuvio_collections === 'string'
    ? value.nuvio_collections
    : typeof value.collections === 'string'
      ? value.collections
      : null;
  if (
    typeof value.aiostreams !== 'string'
    || typeof value.aiometadata_stremio !== 'string'
    || typeof value.aiometadata_nuvio !== 'string'
    || typeof nuvioCollections !== 'string'
    || typeof value.nuvio_settings !== 'string'
  ) {
    return null;
  }

  return {
    aiostreams: value.aiostreams,
    aiometadata_stremio: value.aiometadata_stremio,
    aiometadata_nuvio: value.aiometadata_nuvio,
    nuvio_collections: nuvioCollections,
    nuvio_settings: value.nuvio_settings,
  };
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

function normalizeConfigBlock(block: LegacyWizardConfig): WizardConfig | null {
  const { target: _target, account: _account, ...rest } = block as LegacyWizardConfig & { account?: unknown };
  void _target;
  void _account;
  const targets = normalizeTargets(block.targets ?? (block.target ? [block.target] : []));
  const instances = normalizeInstances(block.instances);
  const templates = normalizeTemplates(block.templates);
  const keys = normalizeKeys(block.keys);
  const limits = normalizeLimits(block.limits);
  if (
    !targets.length
    || typeof block.name !== 'string'
    || block.name.trim().length === 0
    || typeof block.addonDetailsFilename !== 'string'
    || block.addonDetailsFilename.trim().length === 0
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
    addonDetailsFilename: block.addonDetailsFilename,
    keys,
    limits,
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

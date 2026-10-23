import { create } from 'zustand';
import { type WizardConfig, type WizardTarget } from '../lib/constants.ts';
import type { AioSection } from '../lib/aioSections.ts';

export type Target = WizardTarget;
export type AccountMode = 'create' | 'signin';

export interface NuvioProfileOption {
  profile_index: number;
  name: string;
  avatar_color_hex?: string | null;
  uses_primary_addons?: boolean;
  uses_primary_plugins?: boolean;
}

/**
 * One Nuvio profile the wizard configures. 'new' entries are created on the Account step,
 * so Install only ever sees real ids 1-6.
 */
export interface NuvioProfileTarget {
  nuvioProfileId: number | 'new';
  name: string;
  kids: boolean; // ponytail: always false until the Kids option exists
}

/** Nuvio order: existing profiles by index, then new ones. */
export function sortNuvioProfiles(list: NuvioProfileTarget[]): NuvioProfileTarget[] {
  const rank = (t: NuvioProfileTarget) => (t.nuvioProfileId === 'new' ? 99 : t.nuvioProfileId);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

export interface AccountInfo {
  mode: AccountMode;
  email: string;
  password: string;
  /** Nuvio profiles loaded from the account (the selection lives in nuvioProfiles) */
  profiles?: NuvioProfileOption[];
  /** Set after successful early auth on AccountStep */
  authKey?: string;   // Stremio authKey
  authToken?: string; // Nuvio access_token
  authRefreshToken?: string; // Nuvio refresh_token, used by Watchly's Nuvio source
  authExpiresAt?: number; // Nuvio session expiry as epoch seconds
  authError?: string; // inline error message
  loading?: boolean;
  userId?: string;  // Stremio user _id, used for Trakt scrobble auth URL
}

export interface DebridServiceSelection {
  id: string;
  credentials: Record<string, string>;
}

export interface Credentials {
  /** Multi-debrid: array of { id, credentials } pairs */
  debridServices: DebridServiceSelection[];
  tmdbApiKey: string;
  tmdbAccessToken: string;
  tvdbApiKey: string;
  geminiApiKey: string;
  rpdbApiKey: string;
}

export interface AioStreamsInputs {
  [key: string]: unknown;
}

export interface CatalogSelection {
  enabledCategories: Set<string>;
  enabledDiscoverFolderIds: Set<string>;
  categoryOrder: string[];
  discoverFolderOrder: string[];
}

export interface PreviousAddonBackupEntry {
  name: string;
  manifestUrl: string;
}

export interface NuvioProfileInstallResult {
  profileIndex: number;
  name: string;
  status: 'done' | 'failed';
  error: string | null;
  /** True once the profile's original addons were read; only then is previousAddons trustworthy */
  backupTaken: boolean;
  previousAddons: PreviousAddonBackupEntry[];
  watchly: { manifestUrl: string; token: string } | null;
}

export interface InstallResult {
  aiostreams: { manifestUrl: string; uuid: string; password: string } | null;
  aiometadata: {
    manifestUrl: string;
    uuid: string;
    password: string;
    instance: string;
    config: Record<string, unknown>;
  } | null;
  watchly: { manifestUrl: string; token: string } | null;
  previousAddons: PreviousAddonBackupEntry[];
  /** Nuvio only: one entry per configured profile (Stremio keeps the top-level watchly/previousAddons) */
  profiles: NuvioProfileInstallResult[];
  addonPasswordSource: 'account' | 'generated' | null;
  warnings: string[];
  error: string | null;
}

export interface WatchlyState {
  enabled: boolean;
}

export interface LoadedTemplates {
  aiostreams: unknown;
  aiometadata: unknown;
  collections: unknown[];
  settings: unknown | null;
  watchly: unknown | null;
}

interface WizardState {
  step: number;
  /** Highest step the user has reached (for sidebar clickability) */
  maxReachedStep: number;
  target: Target | null;
  stremioAccount: AccountInfo;
  nuvioAccount: AccountInfo;
  /** Nuvio profiles to configure (at least one) */
  nuvioProfiles: NuvioProfileTarget[];
  credentials: Credentials;
  aioStreamsInstance: string;
  aioStreamsInputs: AioStreamsInputs;
  aiometadataInstance: string;
  catalogSelection: CatalogSelection;
  installResult: InstallResult;
  /** True while the install is running (the sidebar must not leave the Install step then) */
  installRunning: boolean;
  templates: LoadedTemplates | null;
  /** Computed from template when loaded; drives dynamic step count */
  aioSections: AioSection[];
  /** Runtime config loaded from config.json at startup */
  wizardConfig: WizardConfig | null;
  watchly: WatchlyState;
  setWatchly: (w: Partial<WatchlyState>) => void;
  instantDebrid: boolean;
  setInstantDebrid: (enabled: boolean) => void;

  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setTarget: (t: Target) => void;
  setStremioAccount: (a: Partial<AccountInfo>) => void;
  setNuvioAccount: (a: Partial<AccountInfo>) => void;
  setNuvioProfiles: (profiles: NuvioProfileTarget[]) => void;
  /** Select or deselect an existing Nuvio profile */
  toggleNuvioProfile: (p: NuvioProfileOption) => void;
  setCredentials: (c: Partial<Credentials>) => void;
  toggleDebridService: (id: string) => void;
  setDebridCredential: (id: string, fieldId: string, value: string) => void;
  setAioStreamsInstance: (url: string) => void;
  setAioStreamsInput: (id: string, value: unknown) => void;
  setAiometadataInstance: (url: string) => void;
  setCatalogSelection: (sel: Partial<CatalogSelection>) => void;
  setTemplates: (t: WizardState['templates']) => void;
  setAioSections: (sections: AioSection[]) => void;
  setInstallResult: (r: Partial<InstallResult>) => void;
  setInstallRunning: (running: boolean) => void;
  setWizardConfig: (cfg: WizardConfig | null) => void;
}

export const useWizard = create<WizardState>((set) => ({
  step: 0,
  maxReachedStep: 0,
  target: null,
  stremioAccount: { mode: 'create', email: '', password: '' },
  nuvioAccount:   { mode: 'create', email: '', password: '', profiles: [] },
  nuvioProfiles: [{ nuvioProfileId: 'new', name: 'Profile 1', kids: false }],
  credentials: {
    debridServices: [],
    tmdbApiKey: '', tmdbAccessToken: '', tvdbApiKey: '',
    geminiApiKey: '', rpdbApiKey: '',
  },
  aioStreamsInstance: '',
  aioStreamsInputs: {},
  aiometadataInstance: '',
  catalogSelection: {
    enabledCategories: new Set(),
    enabledDiscoverFolderIds: new Set(),
    categoryOrder: [],
    discoverFolderOrder: [],
  },
  installResult: {
    aiostreams: null,
    aiometadata: null,
    watchly: null,
    previousAddons: [],
    profiles: [],
    addonPasswordSource: null,
    warnings: [],
    error: null,
  },
  installRunning: false,
  templates: null,
  aioSections: [],
  wizardConfig: null,
  watchly: { enabled: false },
  instantDebrid: false,

  setStep: (step) => set(s => ({
    step,
    maxReachedStep: Math.max(s.maxReachedStep, step),
  })),
  nextStep: () => set(s => {
    const next = s.step + 1;
    return { step: next, maxReachedStep: Math.max(s.maxReachedStep, next) };
  }),
  prevStep: () => set(s => ({ step: Math.max(0, s.step - 1) })),

  setTarget: (target) => set(s => ({
    target,
    // Watchly is enabled by default for both supported targets.
    watchly: { ...s.watchly, enabled: target === 'stremio' || target === 'nuvio' },
  })),
  setStremioAccount: (a) => set(s => ({ stremioAccount: { ...s.stremioAccount, ...a } })),
  setNuvioAccount: (a) => set(s => ({ nuvioAccount: { ...s.nuvioAccount, ...a } })),
  setNuvioProfiles: (nuvioProfiles) => set({ nuvioProfiles }),
  toggleNuvioProfile: (p) => set(s => {
    const selected = s.nuvioProfiles.some(t => t.nuvioProfileId === p.profile_index);
    const next = selected
      ? s.nuvioProfiles.filter(t => t.nuvioProfileId !== p.profile_index)
      : [...s.nuvioProfiles, { nuvioProfileId: p.profile_index, name: p.name, kids: false }];
    return { nuvioProfiles: sortNuvioProfiles(next) };
  }),
  setCredentials: (c) => set(s => ({ credentials: { ...s.credentials, ...c } })),

  toggleDebridService: (id) => set(s => {
    const existing = s.credentials.debridServices;
    const already = existing.find(d => d.id === id);
    const updated = already
      ? existing.filter(d => d.id !== id)
      : [...existing, { id, credentials: {} }];
    const QUALIFYING = ['torbox', 'premiumize'];
    const shouldResetInstantDebrid = s.instantDebrid
      && !!already  // we removed a service
      && !updated.some(d => QUALIFYING.includes(d.id));  // no qualifying services remain
    return {
      credentials: { ...s.credentials, debridServices: updated },
      ...(shouldResetInstantDebrid ? { instantDebrid: false } : {}),
    };
  }),
  setDebridCredential: (id, fieldId, value) => set(s => ({
    credentials: {
      ...s.credentials,
      debridServices: s.credentials.debridServices.map((service) => (
        service.id === id
          ? {
              ...service,
              credentials: {
                ...service.credentials,
                [fieldId]: value,
              },
            }
          : service
      )),
    },
  })),

  setAioStreamsInstance: (url) => set({ aioStreamsInstance: url }),
  setAioStreamsInput: (id, value) => set(s => {
    // Subsection sub-options use a dotted id (`subsectionId.optionId`) and are stored
    // nested under the subsection id, matching the canonical AIOStreams wizard.
    if (!id.includes('.')) {
      return { aioStreamsInputs: { ...s.aioStreamsInputs, [id]: value } };
    }
    const [head, ...rest] = id.split('.');
    const branch = { ...((s.aioStreamsInputs[head] as Record<string, unknown>) || {}) };
    branch[rest.join('.')] = value;
    return { aioStreamsInputs: { ...s.aioStreamsInputs, [head]: branch } };
  }),
  setAiometadataInstance: (url) => set({ aiometadataInstance: url }),
  setCatalogSelection: (sel) => set(s => ({
    catalogSelection: {
      enabledCategories: sel.enabledCategories ?? s.catalogSelection.enabledCategories,
      enabledDiscoverFolderIds: sel.enabledDiscoverFolderIds ?? s.catalogSelection.enabledDiscoverFolderIds,
      categoryOrder: sel.categoryOrder ?? s.catalogSelection.categoryOrder,
      discoverFolderOrder: sel.discoverFolderOrder ?? s.catalogSelection.discoverFolderOrder,
    },
  })),
  setTemplates: (templates) => set({ templates }),
  setAioSections: (aioSections) => set({ aioSections }),
  setInstallResult: (r) => set(s => ({ installResult: { ...s.installResult, ...r } })),
  setInstallRunning: (installRunning) => set({ installRunning }),
  setWatchly: (w) => set(s => ({ watchly: { ...s.watchly, ...w } })),
  setInstantDebrid: (enabled) => set(s => {
    if (enabled) {
      const INSTANT_DEBRID_SERVICE_IDS = ['torbox', 'premiumize'];
      return {
        instantDebrid: true,
        credentials: {
          ...s.credentials,
          debridServices: s.credentials.debridServices.filter(d =>
            INSTANT_DEBRID_SERVICE_IDS.includes(d.id)
          ),
        },
      };
    }
    return { instantDebrid: false };
  }),
  setWizardConfig: (cfg) => set({
    wizardConfig: cfg,
    aioStreamsInstance: cfg?.instances.aiostreams[0] ?? '',
    aiometadataInstance: cfg?.instances.aiometadata[0] ?? '',
  }),
}));

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

export interface AccountInfo {
  mode: AccountMode;
  email: string;
  password: string;
  profileName?: string;
  profileId?: number;
  createNewProfile?: boolean;
  profiles?: NuvioProfileOption[];
  /** Set after successful early auth on AccountStep */
  authKey?: string;   // Stremio authKey
  authToken?: string; // Nuvio access_token
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
  addonPasswordSource: 'account' | 'generated' | null;
  warnings: string[];
  error: string | null;
}

export interface WatchlyState {
  enabled: boolean;
  /** Stremio login collected on the Watchly page for the Nuvio target.
   *  Stremio target uses stremioAccount directly; this is only needed for Nuvio. */
  nuvioStremioLogin: {
    email: string;
    password: string;
    authKey: string;
    userId: string;
  } | null;
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
  credentials: Credentials;
  aioStreamsInstance: string;
  aioStreamsInputs: AioStreamsInputs;
  aiometadataInstance: string;
  catalogSelection: CatalogSelection;
  installResult: InstallResult;
  templates: LoadedTemplates | null;
  /** Computed from template when loaded; drives dynamic step count */
  aioSections: AioSection[];
  /** Runtime config loaded from config.json at startup */
  wizardConfig: WizardConfig | null;
  watchly: WatchlyState;
  setWatchly: (w: Partial<WatchlyState>) => void;
  nuvioInstantDebrid: boolean;
  setNuvioInstantDebrid: (enabled: boolean) => void;

  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setTarget: (t: Target) => void;
  setStremioAccount: (a: Partial<AccountInfo>) => void;
  setNuvioAccount: (a: Partial<AccountInfo>) => void;
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
  setWizardConfig: (cfg: WizardConfig | null) => void;
}

export const useWizard = create<WizardState>((set) => ({
  step: 0,
  maxReachedStep: 0,
  target: null,
  stremioAccount: { mode: 'create', email: '', password: '' },
  nuvioAccount:   { mode: 'create', email: '', password: '', profileName: 'Profile 1', createNewProfile: false, profiles: [] },
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
    addonPasswordSource: null,
    warnings: [],
    error: null,
  },
  templates: null,
  aioSections: [],
  wizardConfig: null,
  watchly: { enabled: false, nuvioStremioLogin: null },
  nuvioInstantDebrid: false,

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
    // Watchly is enabled by default in Stremio mode; Nuvio support is still coming soon.
    watchly: { ...s.watchly, enabled: target === 'stremio' },
  })),
  setStremioAccount: (a) => set(s => ({ stremioAccount: { ...s.stremioAccount, ...a } })),
  setNuvioAccount: (a) => set(s => ({ nuvioAccount: { ...s.nuvioAccount, ...a } })),
  setCredentials: (c) => set(s => ({ credentials: { ...s.credentials, ...c } })),

  toggleDebridService: (id) => set(s => {
    const existing = s.credentials.debridServices;
    const already = existing.find(d => d.id === id);
    const updated = already
      ? existing.filter(d => d.id !== id)
      : [...existing, { id, credentials: {} }];
    const QUALIFYING = ['torbox', 'premiumize'];
    const shouldResetInstantDebrid = s.nuvioInstantDebrid
      && !!already  // we removed a service
      && !updated.some(d => QUALIFYING.includes(d.id));  // no qualifying services remain
    return {
      credentials: { ...s.credentials, debridServices: updated },
      ...(shouldResetInstantDebrid ? { nuvioInstantDebrid: false } : {}),
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
  setWatchly: (w) => set(s => ({ watchly: { ...s.watchly, ...w } })),
  setNuvioInstantDebrid: (enabled) => set(s => {
    if (enabled) {
      const INSTANT_DEBRID_SERVICE_IDS = ['torbox', 'premiumize'];
      return {
        nuvioInstantDebrid: true,
        credentials: {
          ...s.credentials,
          debridServices: s.credentials.debridServices.filter(d =>
            INSTANT_DEBRID_SERVICE_IDS.includes(d.id)
          ),
        },
      };
    }
    return { nuvioInstantDebrid: false };
  }),
  setWizardConfig: (cfg) => set({
    wizardConfig: cfg,
    aioStreamsInstance: cfg?.instances.aiostreams[0] ?? '',
    aiometadataInstance: cfg?.instances.aiometadata[0] ?? '',
  }),
}));

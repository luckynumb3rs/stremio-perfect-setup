import { create } from 'zustand';
import { type WizardConfig, type WizardTarget } from '../lib/constants';
import type { AioSection } from '../lib/aioSections';

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
  profiles?: NuvioProfileOption[];
  /** Set after successful early auth on AccountStep */
  authKey?: string;   // Stremio authKey
  authToken?: string; // Nuvio access_token
  authError?: string; // inline error message
  loading?: boolean;
}

export interface Credentials {
  /** Multi-debrid: array of { id, apiKey } pairs */
  debridServices: Array<{ id: string; apiKey: string }>;
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
}

export interface InstallResult {
  aiostreams: { manifestUrl: string; uuid: string; password: string } | null;
  aiometadata: { manifestUrl: string; uuid: string; password: string } | null;
  addonPasswordSource: 'account' | 'generated' | null;
  warnings: string[];
  error: string | null;
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
  templates: { aiostreams: unknown; aiometadata: unknown; nuvioCollections: unknown[]; nuvioSettings: unknown } | null;
  /** Computed from template when loaded; drives dynamic step count */
  aioSections: AioSection[];
  /** Runtime config loaded from config.json at startup */
  wizardConfig: WizardConfig | null;

  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setTarget: (t: Target) => void;
  setStremioAccount: (a: Partial<AccountInfo>) => void;
  setNuvioAccount: (a: Partial<AccountInfo>) => void;
  setCredentials: (c: Partial<Credentials>) => void;
  toggleDebridService: (id: string) => void;
  setDebridApiKey: (id: string, apiKey: string) => void;
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
  nuvioAccount:   { mode: 'create', email: '', password: '', profileName: 'Profile 1', profiles: [] },
  credentials: {
    debridServices: [],
    tmdbApiKey: '', tmdbAccessToken: '', tvdbApiKey: '',
    geminiApiKey: '', rpdbApiKey: '',
  },
  aioStreamsInstance: '',
  aioStreamsInputs: {},
  aiometadataInstance: '',
  catalogSelection: { enabledCategories: new Set(), enabledDiscoverFolderIds: new Set() },
  installResult: { aiostreams: null, aiometadata: null, addonPasswordSource: null, warnings: [], error: null },
  templates: null,
  aioSections: [],
  wizardConfig: null,

  setStep: (step) => set(s => ({
    step,
    maxReachedStep: Math.max(s.maxReachedStep, step),
  })),
  nextStep: () => set(s => {
    const next = s.step + 1;
    return { step: next, maxReachedStep: Math.max(s.maxReachedStep, next) };
  }),
  prevStep: () => set(s => ({ step: Math.max(0, s.step - 1) })),

  setTarget: (target) => set({ target }),
  setStremioAccount: (a) => set(s => ({ stremioAccount: { ...s.stremioAccount, ...a } })),
  setNuvioAccount: (a) => set(s => ({ nuvioAccount: { ...s.nuvioAccount, ...a } })),
  setCredentials: (c) => set(s => ({ credentials: { ...s.credentials, ...c } })),

  toggleDebridService: (id) => set(s => {
    const existing = s.credentials.debridServices;
    const already = existing.find(d => d.id === id);
    const updated = already
      ? existing.filter(d => d.id !== id)
      : [...existing, { id, apiKey: '' }];
    return { credentials: { ...s.credentials, debridServices: updated } };
  }),
  setDebridApiKey: (id, apiKey) => set(s => ({
    credentials: {
      ...s.credentials,
      debridServices: s.credentials.debridServices.map(d => d.id === id ? { ...d, apiKey } : d),
    },
  })),

  setAioStreamsInstance: (url) => set({ aioStreamsInstance: url }),
  setAioStreamsInput: (id, value) => set(s => ({
    aioStreamsInputs: { ...s.aioStreamsInputs, [id]: value },
  })),
  setAiometadataInstance: (url) => set({ aiometadataInstance: url }),
  setCatalogSelection: (sel) => set(s => ({
    catalogSelection: {
      enabledCategories: sel.enabledCategories ?? s.catalogSelection.enabledCategories,
      enabledDiscoverFolderIds: sel.enabledDiscoverFolderIds ?? s.catalogSelection.enabledDiscoverFolderIds,
    },
  })),
  setTemplates: (templates) => set({ templates }),
  setAioSections: (aioSections) => set({ aioSections }),
  setInstallResult: (r) => set(s => ({ installResult: { ...s.installResult, ...r } })),
  setWizardConfig: (cfg) => set({
    wizardConfig: cfg,
    aioStreamsInstance: cfg?.instances.aiostreams[0] ?? '',
    aiometadataInstance: cfg?.instances.aiometadata[0] ?? '',
  }),
}));

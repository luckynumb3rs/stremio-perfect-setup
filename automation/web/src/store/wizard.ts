import { create } from 'zustand';
import { INSTANCES, RPDB_FREE_KEY } from '../lib/constants';

export type Target = 'stremio' | 'nuvio';
export type AccountMode = 'create' | 'signin';

export interface AccountInfo {
  mode: AccountMode;
  email: string;
  password: string;
}

export interface Credentials {
  debridService: string;    // service id ('torbox', 'realdebrid', …) or '' for P2P
  debridApiKey: string;
  tmdbApiKey: string;
  tmdbAccessToken: string;
  tvdbApiKey: string;
  geminiApiKey: string;
  rpdbApiKey: string;
}

export interface AioStreamsInputs {
  [key: string]: unknown;   // keyed by metadata.inputs[].id
}

export interface CatalogSelection {
  enabledCategories: Set<string>;
  enabledDiscoverFolderIds: Set<string>;
}

export interface InstallResult {
  aiostreams: { manifestUrl: string; uuid: string; password: string } | null;
  aiometadata: { manifestUrl: string; uuid: string } | null;
  warnings: string[];
  error: string | null;
}

interface WizardState {
  step: number;
  target: Target | null;
  stremioAccount: AccountInfo;
  nuvioAccount: AccountInfo;
  credentials: Credentials;
  aioStreamsInstance: string;
  aioStreamsInputs: AioStreamsInputs;
  aiometadataInstance: string;
  aiometadataLanguage: string;
  catalogSelection: CatalogSelection;
  installResult: InstallResult;
  templates: { aiostreams: unknown; aiometadata: unknown; collections: unknown[] } | null;

  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setTarget: (t: Target) => void;
  setStremioAccount: (a: Partial<AccountInfo>) => void;
  setNuvioAccount: (a: Partial<AccountInfo>) => void;
  setCredentials: (c: Partial<Credentials>) => void;
  setAioStreamsInstance: (url: string) => void;
  setAioStreamsInput: (id: string, value: unknown) => void;
  setAiometadataInstance: (url: string) => void;
  setAiometadataLanguage: (lang: string) => void;
  setCatalogSelection: (sel: Partial<CatalogSelection>) => void;
  setTemplates: (t: WizardState['templates']) => void;
  setInstallResult: (r: Partial<InstallResult>) => void;
}

export const useWizard = create<WizardState>((set) => ({
  step: 0,
  target: null,
  stremioAccount: { mode: 'create', email: '', password: '' },
  nuvioAccount: { mode: 'create', email: '', password: '' },
  credentials: {
    debridService: '', debridApiKey: '',
    tmdbApiKey: '', tmdbAccessToken: '', tvdbApiKey: '',
    geminiApiKey: '', rpdbApiKey: RPDB_FREE_KEY,
  },
  aioStreamsInstance: INSTANCES.aiostreams.primary,
  aioStreamsInputs: {},
  aiometadataInstance: INSTANCES.aiometadata.primary,
  aiometadataLanguage: 'en-US',
  catalogSelection: { enabledCategories: new Set(), enabledDiscoverFolderIds: new Set() },
  installResult: { aiostreams: null, aiometadata: null, warnings: [], error: null },
  templates: null,

  setStep: (step) => set({ step }),
  nextStep: () => set(s => ({ step: s.step + 1 })),
  prevStep: () => set(s => ({ step: Math.max(0, s.step - 1) })),
  setTarget: (target) => set({ target }),
  setStremioAccount: (a) => set(s => ({ stremioAccount: { ...s.stremioAccount, ...a } })),
  setNuvioAccount: (a) => set(s => ({ nuvioAccount: { ...s.nuvioAccount, ...a } })),
  setCredentials: (c) => set(s => ({ credentials: { ...s.credentials, ...c } })),
  setAioStreamsInstance: (url) => set({ aioStreamsInstance: url }),
  setAioStreamsInput: (id, value) => set(s => ({ aioStreamsInputs: { ...s.aioStreamsInputs, [id]: value } })),
  setAiometadataInstance: (url) => set({ aiometadataInstance: url }),
  setAiometadataLanguage: (lang) => set({ aiometadataLanguage: lang }),
  setCatalogSelection: (sel) => set(s => ({
    catalogSelection: {
      enabledCategories: sel.enabledCategories ?? s.catalogSelection.enabledCategories,
      enabledDiscoverFolderIds: sel.enabledDiscoverFolderIds ?? s.catalogSelection.enabledDiscoverFolderIds,
    },
  })),
  setTemplates: (templates) => set({ templates }),
  setInstallResult: (r) => set(s => ({ installResult: { ...s.installResult, ...r } })),
}));

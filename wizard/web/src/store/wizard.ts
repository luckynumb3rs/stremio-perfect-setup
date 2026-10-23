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

/** A BingeCat profile of the connected account (see core/adapters/bingecat.js loadProfiles). */
export interface BingecatProfile {
  id: number;
  name: string;
  isMain: boolean;
  /** Age cap in the recommendation/content-filter settings: the best hint of a kids profile until the API exposes a type */
  ageLimited: boolean;
  type?: string;
  boundNuvio: { id: string | number; name: string }[];
  settings: Record<string, unknown>;
}

export interface BingecatMappingEntry {
  /** Nuvio profile id (Stremio: 0) */
  key: number;
  target: number | 'new';
  reason: 'linked' | 'name' | 'fresh-main' | 'new' | 'created' | 'manual';
}

export interface BingecatState {
  /** Standard profiles use BingeCat (Kids profiles always do) */
  enabled: boolean;
  /** OAuth token, memory only. Never logged, never in URLs or analytics. */
  token: string | null;
  /** Token expiry, epoch seconds */
  expiresAt: number | null;
  accountName: string;
  profiles: BingecatProfile[];
  mapping: BingecatMappingEntry[];
}

export const EMPTY_BINGECAT: BingecatState = { enabled: false, token: null, expiresAt: null, accountName: '', profiles: [], mapping: [] };

/** Which profile kinds this run has. An empty Nuvio list counts as Standard (sign-in is still loading). */
export function rolesOf(s: { target: Target | null; nuvioProfiles: NuvioProfileTarget[]; stremioKids: boolean }) {
  if (s.target === 'stremio') return { hasStandard: !s.stremioKids, hasKids: s.stremioKids };
  const hasKids = s.nuvioProfiles.some((p) => p.kids);
  return { hasStandard: s.nuvioProfiles.length === 0 || s.nuvioProfiles.some((p) => !p.kids), hasKids };
}

/** The profiles that need a BingeCat profile: Kids always, Standard only when BingeCat is on for them. Stremio is key 0. */
export function bingecatRows(
  s: { target: Target | null; nuvioProfiles: NuvioProfileTarget[]; stremioKids: boolean; bingecat: Pick<BingecatState, 'enabled'> },
  featureOn: boolean,
): { key: number; name: string; kids: boolean }[] {
  if (!featureOn) return [];
  if (s.target === 'stremio') {
    return s.stremioKids || s.bingecat.enabled ? [{ key: 0, name: s.stremioKids ? 'Kids' : 'Stremio', kids: s.stremioKids }] : [];
  }
  return s.nuvioProfiles
    .filter((p): p is NuvioProfileTarget & { nuvioProfileId: number } => typeof p.nuvioProfileId === 'number' && (p.kids || s.bingecat.enabled))
    .map((p) => ({ key: p.nuvioProfileId, name: p.name, kids: p.kids }));
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

/** What the BingeCat part of an install produced for one profile. The URLs contain a secret: never log them. */
export interface BingecatInstallResult {
  profileId: number;
  created: boolean;
  url: string;
  searchUrl: string | null;
}

export interface NuvioProfileInstallResult {
  profileIndex: number;
  name: string;
  kids: boolean;
  bingecat: BingecatInstallResult | null;
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
  /** Stremio only (Nuvio keeps it per profile) */
  bingecat: BingecatInstallResult | null;
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
  /** Only when the BingeCat feature is on */
  bingecat?: { standard: unknown; kids: unknown };
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
  /** Stremio: set up a Kids account (BingeCat is then mandatory) */
  stremioKids: boolean;
  bingecat: BingecatState;
  /** True until the user turns Watchly and BingeCat on together: turning one on then turns the other off */
  recoAutoExclusive: boolean;
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
  /** Kids switch of the profile at this position in nuvioProfiles */
  setNuvioProfileKids: (index: number, kids: boolean) => void;
  setStremioKids: (kids: boolean) => void;
  setBingecat: (b: Partial<BingecatState>) => void;
  disconnectBingecat: () => void;
  /** A BingeCat profile was just created for this row: remember it so a retry reuses it */
  bingecatProfileCreated: (key: number, profile: { id: number; name: string }) => void;
  toggleRecommendation: (which: 'watchly' | 'bingecat') => void;
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

/**
 * When a change flips whether the run has Standard profiles, the Catalogs step appears or disappears and every later
 * step number shifts: the user has to walk forward again, so the "reached" mark drops back to the current step.
 */
function guardRoles(s: WizardState, patch: Partial<WizardState>): Partial<WizardState> {
  const next = { ...s, ...patch };
  return rolesOf(s).hasStandard !== rolesOf(next).hasStandard ? { ...patch, maxReachedStep: s.step } : patch;
}

export const useWizard = create<WizardState>((set) => ({
  step: 0,
  maxReachedStep: 0,
  target: null,
  stremioAccount: { mode: 'create', email: '', password: '' },
  nuvioAccount:   { mode: 'create', email: '', password: '', profiles: [] },
  nuvioProfiles: [{ nuvioProfileId: 'new', name: 'Profile 1', kids: false }],
  stremioKids: false,
  bingecat: EMPTY_BINGECAT,
  recoAutoExclusive: true,
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
    bingecat: null,
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
    // BingeCat/Kids choices belong to one target
    stremioKids: false,
    bingecat: EMPTY_BINGECAT,
    recoAutoExclusive: true,
    nuvioProfiles: s.nuvioProfiles.map((p) => ({ ...p, kids: false })),
  })),
  setStremioAccount: (a) => set(s => ({ stremioAccount: { ...s.stremioAccount, ...a } })),
  setNuvioAccount: (a) => set(s => ({ nuvioAccount: { ...s.nuvioAccount, ...a } })),
  setNuvioProfiles: (nuvioProfiles) => set(s => guardRoles(s, { nuvioProfiles })),
  setNuvioProfileKids: (index, kids) => set(s => guardRoles(s, {
    nuvioProfiles: s.nuvioProfiles.map((p, i) => (i === index ? { ...p, kids } : p)),
  })),
  setStremioKids: (stremioKids) => set(s => guardRoles(s, { stremioKids })),
  setBingecat: (b) => set(s => ({ bingecat: { ...s.bingecat, ...b } })),
  disconnectBingecat: () => set(s => ({ bingecat: { ...EMPTY_BINGECAT, enabled: s.bingecat.enabled } })),
  bingecatProfileCreated: (key, profile) => set(s => ({
    bingecat: {
      ...s.bingecat,
      profiles: [...s.bingecat.profiles, { id: profile.id, name: profile.name, isMain: false, ageLimited: false, boundNuvio: [], settings: {} }],
      mapping: s.bingecat.mapping.map((m) => (m.key === key ? { key, target: profile.id, reason: 'created' } : m)),
    },
  })),
  toggleRecommendation: (which) => set(s => {
    const turningOn = which === 'watchly' ? !s.watchly.enabled : !s.bingecat.enabled;
    const otherOn = which === 'watchly' ? s.bingecat.enabled : s.watchly.enabled;
    const swap = turningOn && otherOn && s.recoAutoExclusive;
    // After the first swap, both may be on (the user asked for it).
    const patch: Partial<WizardState> = swap ? { recoAutoExclusive: false } : {};
    const watchlyOn = which === 'watchly' ? turningOn : (swap ? false : s.watchly.enabled);
    const bingecatOn = which === 'bingecat' ? turningOn : (swap ? false : s.bingecat.enabled);
    return { ...patch, watchly: { ...s.watchly, enabled: watchlyOn }, bingecat: { ...s.bingecat, enabled: bingecatOn } };
  }),
  toggleNuvioProfile: (p) => set(s => {
    const selected = s.nuvioProfiles.some(t => t.nuvioProfileId === p.profile_index);
    const next = selected
      ? s.nuvioProfiles.filter(t => t.nuvioProfileId !== p.profile_index)
      : [...s.nuvioProfiles, { nuvioProfileId: p.profile_index, name: p.name, kids: false }];
    return guardRoles(s, { nuvioProfiles: sortNuvioProfiles(next) });
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

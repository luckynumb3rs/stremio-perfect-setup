// Orchestrator: full Stremio + Nuvio flows.
// Install is ATOMIC: the ordered addon collection is pushed only after all configs succeed.
// If any config step fails, the account is left untouched.

import { createStremioAdapter, buildAddonCollection, hydrateAddonCollection, resolveCinemetaDescriptor } from './adapters/stremio.js';
import { createWithFallbacks } from './adapters/aiostreams.js';
import { createAiometadataAdapter } from './adapters/aiometadata.js';
import {
  createNuvioAdapter,
  mergeNuvioSettingsBlob,
  resolveNuvioSettingsTemplate,
} from './adapters/nuvio.js';
import { buildAioMetadataConfig } from './catalog-config.js';
import { filterCollections } from './nuvio-collections.js';

function randomPassword(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? crypto.getRandomValues(new Uint32Array(len))
    : Array.from({ length: len }, () => Math.floor(Math.random() * 1e9));
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

function toError(err) {
  return err instanceof Error ? err : new Error(String(err));
}

function shouldRetryWithGeneratedPassword(err, attemptedPassword) {
  const message = String(err?.message || err).toLowerCase();

  if (message.includes('[cors')) return false;

  const explicitPasswordSignal = [
    'password',
    'too short',
    'shorter than',
    'minimum',
    'at least',
    'min length',
    'length',
    'weak',
    'invalid',
    'required',
  ].some(signal => message.includes(signal));

  if (explicitPasswordSignal) return true;

  // Some addon APIs return only a generic 400/validation message when the password
  // is unacceptable. If the account password is relatively short, retry once with
  // a strong generated password before surfacing the failure.
  return attemptedPassword.length < 10
    && /http 400|validation|bad request|rejected/.test(message);
}

async function createAioStreamsSummary(instances, aiostreamsParams, password, proxyBase, warnings) {
  const aioResult = await createWithFallbacks(instances.aiostreams, {
    ...aiostreamsParams,
    password,
    proxyBase,
  });

  for (const warning of aioResult.retryWarnings || []) {
    warnings.push(warning);
  }

  for (const r of aioResult.all.filter((result) => !result.ok)) {
    warnings.push(`AIOStreams fallback ${r.instanceUrl} tried but failed: ${r.error}`);
  }

  return {
    instance: aioResult.primary.instanceUrl,
    uuid: aioResult.primary.uuid,
    password,
    manifestUrl: aioResult.primary.manifestUrl,
  };
}

async function createAiometadataSummary(instances, aiometadataParams, password, target, warnings) {
  const { config: aioMetaConfig } = buildAioMetadataConfig(aiometadataParams.baseTemplate, {
    ...aiometadataParams,
    target,
  });

  let aioMetaResult = null;
  for (const instanceUrl of instances.aiometadata) {
    try {
      const adapter = createAiometadataAdapter(instanceUrl);
      aioMetaResult = await adapter.createConfig(aioMetaConfig, password);
      aioMetaResult = { ...aioMetaResult, instanceUrl };
      break;
    } catch (err) {
      warnings.push(`AIOMetadata ${instanceUrl} tried but failed: ${toError(err).message}`);
    }
  }

  if (!aioMetaResult) throw new Error('All AIOMetadata instances failed, see warnings');

  return {
    instance: aioMetaResult.instanceUrl,
    uuid: aioMetaResult.userUUID,
    password,
    manifestUrl: aioMetaResult.manifestUrl || aioMetaResult.installUrl,
  };
}

async function createAddonBundle({ instances, aiostreamsParams, aiometadataParams, password, target, proxyBase }) {
  const warnings = [];
  const aiostreams = await createAioStreamsSummary(instances, aiostreamsParams, password, proxyBase, warnings);
  const aiometadata = await createAiometadataSummary(instances, aiometadataParams, password, target, warnings);
  return { addons: { aiostreams, aiometadata }, warnings };
}

async function applyNuvioProfileSettings(nuvio, token, profileIndex, settingsTemplate, aiometadataParams) {
  const { entries, skipped } = resolveNuvioSettingsTemplate(settingsTemplate, {
    TMDB_API_KEY: aiometadataParams?.apiKeys?.tmdb,
    TMDB_LANGUAGE: aiometadataParams?.language,
  });

  const appliedPlatforms = [];
  for (const entry of entries) {
    const current = await nuvio.getProfileSettings(token, profileIndex, entry.platform);
    const merged = mergeNuvioSettingsBlob(current.settingsJson, entry.settingsJson, entry.fallbackVersion);
    await nuvio.pushProfileSettings(token, profileIndex, entry.platform, merged);
    appliedPlatforms.push(entry.platform);
  }

  return {
    appliedPlatforms,
    skippedPlatforms: skipped.map((entry) => entry.platform),
    unresolvedPlaceholders: skipped.reduce((acc, entry) => {
      acc[entry.platform] = entry.unresolved;
      return acc;
    }, {}),
    tmdbKeyReused: appliedPlatforms.includes('mobile'),
  };
}

/**
 * Full Stremio setup flow.
 * @param {object} p
 * @param {object} p.instances         { aiostreams: string[], aiometadata: string[] } – ordered list; first is primary, rest are fallbacks
 * @param {object} p.account           { mode: 'create'|'signin', email, password }
 * @param {object} p.aiostreamsParams  { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams { baseTemplate, enabledCategories, enabledDiscoverFolderIds, apiKeys, language }
 * @param {function} p.onStep          (name, data) => void; progress callback
 */
export async function runStremioSetup({ instances, account, aiostreamsParams, aiometadataParams, proxyBase, onStep }) {
  const summary = { account: null, addons: {}, warnings: [], addonPasswordSource: 'account' };
  const step = (name, data) => { onStep?.(name, data); return data; };

  // 1) Account
  const stremio = createStremioAdapter();
  let auth;
  if (account.authKey) {
    auth = { authKey: account.authKey };
    summary.account = { service: 'stremio', email: account.email, created: account.mode === 'create', reusedSession: true };
  } else if (account.mode === 'create') {
    auth = await stremio.register(account.email, account.password);
    summary.account = { service: 'stremio', email: account.email, password: account.password, created: true };
  } else {
    auth = await stremio.login(account.email, account.password);
    summary.account = { service: 'stremio', email: account.email, created: false };
  }
  step('account', summary.account);

  // 2-3) Create all addon configs with a shared password.
  // Prefer the user's account password so they only need to remember one password.
  // If addon creation rejects it, retry the whole addon bundle once with a strong
  // generated password so both addons stay aligned on the same credential.
  let addonBundle;
  try {
    addonBundle = await createAddonBundle({
      instances,
      aiostreamsParams,
      aiometadataParams,
      password: account.password,
      target: 'stremio',
      proxyBase,
    });
  } catch (err) {
    const firstError = toError(err);
    if (!shouldRetryWithGeneratedPassword(firstError, account.password)) throw firstError;

    summary.addonPasswordSource = 'generated';
    addonBundle = await createAddonBundle({
      instances,
      aiostreamsParams,
      aiometadataParams,
      password: randomPassword(),
      target: 'stremio',
      proxyBase,
    });
  }

  summary.addons.aiostreams = addonBundle.addons.aiostreams;
  summary.addons.aiometadata = addonBundle.addons.aiometadata;
  summary.warnings.push(...addonBundle.warnings);
  step('aiostreams', summary.addons.aiostreams);
  step('aiometadata', summary.addons.aiometadata);

  // 4) ATOMIC install: push only after all configs succeeded
  const existing = await stremio.getAddons(auth.authKey);
  const cinemetaDescriptor = await resolveCinemetaDescriptor(existing);
  const collection = buildAddonCollection(existing, {
    aiometadata: summary.addons.aiometadata.manifestUrl,
    aiostreams: summary.addons.aiostreams.manifestUrl,
  }, {
    cinemetaDescriptor,
    cleanCinemeta: { removeSearch: true, removeCatalogs: true, removeMetadata: true },
  });
  const hydratedCollection = await hydrateAddonCollection(collection);
  await stremio.setAddons(auth.authKey, hydratedCollection);
  step('install', { count: hydratedCollection.length, order: hydratedCollection.map((a) => a.manifest?.name || a.transportUrl) });

  return summary;
}

/**
 * Full Nuvio setup flow.
 * @param {object} p
 * @param {object} p.instances           { aiostreams: string[], aiometadata: string[] } – ordered list; first is primary, rest are fallbacks
 * @param {object} p.account             { mode: 'create'|'signin', email, password }
 * @param {object} p.aiostreamsParams    { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams   { baseTemplate, enabledCategories, enabledDiscoverFolderIds, apiKeys, language }
 * @param {object[]} p.collectionsJson   Nuvio-Collections.json array
 * @param {object} p.nuvioSettingsTemplate Nuvio-Settings.json platform map
 * @param {function} p.onStep
 */
export async function runNuvioSetup({ instances, account, aiostreamsParams, aiometadataParams, collectionsJson, nuvioSettingsTemplate, proxyBase, onStep }) {
  const summary = { account: null, addons: {}, settings: null, warnings: [], addonPasswordSource: 'account' };
  const step = (name, data) => { onStep?.(name, data); return data; };

  // 1) Nuvio account
  const nuvio = createNuvioAdapter();
  let auth;
  if (account.authToken) {
    auth = { token: account.authToken };
    summary.account = { service: 'nuvio', email: account.email, created: account.mode === 'create', reusedSession: true };
  } else if (account.mode === 'create') {
    auth = await nuvio.signup(account.email, account.password);
    summary.account = { service: 'nuvio', email: account.email, password: account.password, created: true };
  } else {
    auth = await nuvio.login(account.email, account.password);
    summary.account = { service: 'nuvio', email: account.email, created: false };
  }
  step('account', summary.account);

  // 2) Resolve the chosen profile, and make sure it uses its own add-ons.
  const profiles = await nuvio.getProfiles(auth.token);
  const profile = account.profileId
    ? profiles.find((entry) => entry.profile_index === account.profileId)
    : profiles[0];
  if (!profile) {
    if (account.profileId) {
      throw new Error(`Nuvio: selected profile ${account.profileId} was not found on this account.`);
    }
    throw new Error('Nuvio: no profiles found. Create or load a Nuvio profile first, then try again.');
  }
  const profileIndex = profile.profile_index;
  if (profile.uses_primary_addons) {
    await nuvio.updateProfile(auth.token, profileIndex, { uses_primary_addons: false });
  }
  step('profile', { profileIndex, profileName: profile.name });

  // 3-4) Create both addon configs with one shared password.
  let addonBundle;
  try {
    addonBundle = await createAddonBundle({
      instances,
      aiostreamsParams,
      aiometadataParams,
      password: account.password,
      target: 'nuvio',
      proxyBase,
    });
  } catch (err) {
    const firstError = toError(err);
    if (!shouldRetryWithGeneratedPassword(firstError, account.password)) throw firstError;

    summary.addonPasswordSource = 'generated';
    addonBundle = await createAddonBundle({
      instances,
      aiostreamsParams,
      aiometadataParams,
      password: randomPassword(),
      target: 'nuvio',
      proxyBase,
    });
  }

  summary.addons.aiostreams = addonBundle.addons.aiostreams;
  summary.addons.aiometadata = addonBundle.addons.aiometadata;
  summary.warnings.push(...addonBundle.warnings);
  step('aiostreams', summary.addons.aiostreams);
  step('aiometadata', summary.addons.aiometadata);

  // 5) ATOMIC install: replace profile add-ons then push collections only after
  // all configs succeed. Nuvio addon order: AIOMetadata first (catalog source),
  // then AIOStreams (stream source).
  const addons = [
    { url: summary.addons.aiometadata.manifestUrl, name: 'AIOMetadata', sort_order: 1 },
    { url: summary.addons.aiostreams.manifestUrl, name: 'AIOStreams', sort_order: 2 },
  ];
  await nuvio.replaceAddons(auth.token, profileIndex, addons);
  step('addons', { count: addons.length, profileIndex, profileName: profile.name });

  // Filter collections to user's enabled categories, then push.
  // p_collections_json is a real JSON value, not a JSON-encoded string (verified Task 2).
  // pushCollections signature: (token, profileId, collections)
  const catalogs = aiometadataParams.baseTemplate.config.catalogs;
  const { enabledCategories, enabledDiscoverFolderIds } = aiometadataParams;
  const filteredCollections = filterCollections(collectionsJson, catalogs, {
    enabledCategories,
    enabledDiscoverFolderIds,
  });
  await nuvio.pushCollections(auth.token, profileIndex, filteredCollections);
  step('collections', { groupCount: filteredCollections.length });

  const appliedSettings = await applyNuvioProfileSettings(
    nuvio,
    auth.token,
    profileIndex,
    nuvioSettingsTemplate,
    aiometadataParams
  );
  summary.settings = appliedSettings;
  step('settings', appliedSettings);

  return summary;
}

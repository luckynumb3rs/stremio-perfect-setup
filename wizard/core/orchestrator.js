// Orchestrator: full Stremio + Nuvio flows.
// Addons are pushed only after the configs they need were created. A Nuvio profile is a unit: if one of its
// later write steps fails it is reported failed (it may be left partly written) and a retry redoes it.

import { createStremioAdapter, buildAddonCollection, hydrateAddonCollection, resolveCinemetaDescriptor } from './adapters/stremio.js';
import { createWithFallbacks } from './adapters/aiostreams.js';
import { createAiometadataAdapter } from './adapters/aiometadata.js';
import {
  MAX_NUVIO_PROFILES,
  createNuvioAdapter,
  mergeNuvioSettingsBlob,
  resolveNuvioSettingsTemplate,
} from './adapters/nuvio.js';
import { buildAioMetadataConfig } from './catalog-config.js';
import { filterCollections } from './nuvio-collections.js';
import { buildWatchlyBody, createWatchlyAdapter } from './adapters/watchly.js';

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

function createPreviousAddonBackupEntry(name, manifestUrl) {
  const normalizedManifestUrl = String(manifestUrl || '').trim();
  if (!normalizedManifestUrl) return null;

  const normalizedName = String(name || '').trim() || normalizedManifestUrl;
  return {
    name: normalizedName,
    manifestUrl: normalizedManifestUrl,
  };
}

function dedupePreviousAddons(addons) {
  const seen = new Set();
  const deduped = [];

  for (const addon of addons) {
    if (!addon) continue;
    const key = `${addon.name}\u0000${addon.manifestUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(addon);
  }

  return deduped;
}

function buildStremioPreviousAddons(existing) {
  return dedupePreviousAddons(
    (Array.isArray(existing) ? existing : []).map((addon) => createPreviousAddonBackupEntry(
      addon?.manifest?.name || addon?.manifest?.id || addon?.transportUrl,
      addon?.transportUrl,
    ))
  );
}

function buildNuvioPreviousAddons(existing) {
  return dedupePreviousAddons(
    (Array.isArray(existing) ? existing : []).map((addon) => createPreviousAddonBackupEntry(
      addon?.name || addon?.url,
      addon?.url,
    ))
  );
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
    config: aioMetaConfig,
  };
}

async function createWatchlySummary(instances, watchlyBody, warnings) {
  if (!instances.watchly?.length) {
    throw new Error('No Watchly instances are configured. Add at least one URL to instances.watchly in wizard/config.json.');
  }

  let watchlyResult = null;
  for (const instanceUrl of instances.watchly) {
    try {
      const adapter = createWatchlyAdapter(instanceUrl);
      const result = await adapter.createConfig(watchlyBody);
      watchlyResult = { ...result, instanceUrl };
      break;
    } catch (err) {
      warnings.push(`Watchly ${instanceUrl} tried but failed: ${toError(err).message}`);
    }
  }

  if (!watchlyResult) throw new Error('All Watchly instances failed, see warnings');

  return {
    instance: watchlyResult.instanceUrl,
    token: watchlyResult.token,
    manifestUrl: watchlyResult.manifestUrl,
  };
}

async function createAddonBundle({ instances, aiostreamsParams, aiometadataParams, watchlyBody, password, target, proxyBase }) {
  const warnings = [];
  const aiostreams = await createAioStreamsSummary(instances, aiostreamsParams, password, proxyBase, warnings);
  const aiometadata = await createAiometadataSummary(instances, aiometadataParams, password, target, warnings);

  let watchly = null;
  if (watchlyBody) {
    watchly = await createWatchlySummary(instances, watchlyBody, warnings);
  }

  return { addons: { aiostreams, aiometadata, ...(watchly ? { watchly } : {}) }, warnings };
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
 * @param {object} p.instances         { aiostreams: string[], aiometadata: string[], watchly?: string[] } – ordered list; first is primary, rest are fallbacks
 * @param {object} p.account           { mode: 'create'|'signin', email, password }
 * @param {object} p.aiostreamsParams  { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams { baseTemplate, enabledCategories, enabledDiscoverFolderIds, categoryOrder, discoverFolderOrder, apiKeys, language }
 * @param {object} [p.watchlyBody]     Merged Watchly TokenRequest body (null/undefined = skip Watchly)
 * @param {function} p.onStep          (name, data) => void; progress callback
 */
export async function runStremioSetup({ instances, account, aiostreamsParams, aiometadataParams, watchlyBody, proxyBase, onStep }) {
  const summary = { account: null, addons: {}, previousAddons: [], warnings: [], addonPasswordSource: 'account' };
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

  const existing = await stremio.getAddons(auth.authKey);
  summary.previousAddons = buildStremioPreviousAddons(existing);
  step('backup', { count: summary.previousAddons.length, addons: summary.previousAddons });

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
      watchlyBody: watchlyBody ?? null,
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
      watchlyBody: watchlyBody ?? null,
      password: randomPassword(),
      target: 'stremio',
      proxyBase,
    });
  }

  summary.addons.aiostreams = addonBundle.addons.aiostreams;
  summary.addons.aiometadata = addonBundle.addons.aiometadata;
  if (addonBundle.addons.watchly) {
    summary.addons.watchly = addonBundle.addons.watchly;
  }
  summary.warnings.push(...addonBundle.warnings);
  step('aiostreams', summary.addons.aiostreams);
  step('aiometadata', summary.addons.aiometadata);
  if (summary.addons.watchly) {
    step('watchly', summary.addons.watchly);
  }

  // 4) ATOMIC install: push only after all configs succeeded
  const cinemetaDescriptor = await resolveCinemetaDescriptor(existing);
  const collection = buildAddonCollection(existing, {
    aiometadata: summary.addons.aiometadata.manifestUrl,
    aiostreams: summary.addons.aiostreams.manifestUrl,
    watchly: summary.addons.watchly?.manifestUrl,
  }, {
    cinemetaDescriptor,
    cleanCinemeta: { removeSearch: true, removeCatalogs: true, removeMetadata: true },
  });
  const hydratedCollection = await hydrateAddonCollection(collection);
  await stremio.setAddons(auth.authKey, hydratedCollection);
  step('install', { count: hydratedCollection.length, order: hydratedCollection.map((a) => a.manifest?.name || a.transportUrl) });

  return summary;
}

// Nuvio session for the install. The token from the Account step is reused unless it is about to expire
// (it can be much older than an hour by the time Install runs); then a fresh password sign-in replaces it.
async function resolveNuvioAuth(nuvio, account) {
  const now = Math.floor(Date.now() / 1000);
  const base = { service: 'nuvio', email: account.email };
  if (account.authToken && (!account.authExpiresAt || account.authExpiresAt - now > 300)) {
    return {
      auth: { token: account.authToken, refreshToken: account.authRefreshToken ?? null, expiresAt: account.authExpiresAt ?? null },
      accountSummary: { ...base, created: account.mode === 'create', reusedSession: true },
    };
  }
  if (account.authToken || account.mode !== 'create') {
    return { auth: await nuvio.login(account.email, account.password), accountSummary: { ...base, created: account.mode === 'create' } };
  }
  return { auth: await nuvio.signup(account.email, account.password), accountSummary: { ...base, password: account.password, created: true } };
}

function validateNuvioTargets(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error('Nuvio: select at least one profile to set up.');
  }
  const seen = new Set();
  for (const p of profiles) {
    const id = p?.nuvioProfileId;
    if (!Number.isInteger(id) || id < 1 || id > MAX_NUVIO_PROFILES) {
      throw new Error('Nuvio: every profile must exist before install (ids 1-6). Go back to the Account step.');
    }
    if (seen.has(id)) throw new Error(`Nuvio: profile ${id} is selected twice.`);
    seen.add(id);
  }
}

/**
 * Full Nuvio setup flow for one or more profiles of one account.
 * Shared AIOStreams / AIOMetadata configs are created once; Watchly (if requested) once per profile.
 * Each profile is installed as a unit: a failure marks only that profile failed and never undoes finished ones.
 * @param {object} p
 * @param {object} p.instances           { aiostreams: string[], aiometadata: string[], watchly?: string[] } – ordered list; first is primary, rest are fallbacks
 * @param {object} p.account             { mode: 'create'|'signin', email, password, authToken?, authRefreshToken?, authExpiresAt? }
 * @param {object[]} p.profiles          [{ nuvioProfileId: 1..6, name, kids }] non-empty; the profiles must already exist
 * @param {object} p.aiostreamsParams    { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams   { baseTemplate, enabledCategories, enabledDiscoverFolderIds, categoryOrder, discoverFolderOrder, apiKeys, language }
 * @param {object} [p.watchly]           { defaults, tmdbApiKey, geminiApiKey, rpdbApiKey } (null = no Watchly)
 * @param {object} [p.retry]             Previous return value of this function: its shared configs, backups and finished profiles are reused
 * @param {object[]} p.collectionsJson   Nuvio-Collections.json array
 * @param {object} p.nuvioSettingsTemplate Nuvio-Settings.json platform map
 * @param {function} p.onStep
 * @returns {Promise<{account, addons, addonPasswordSource, warnings, profiles}>} throws only for bad input, auth, profile listing or shared config creation
 */
export async function runNuvioSetup({ instances, account, profiles: targets, aiostreamsParams, aiometadataParams, watchly = null, retry = null, collectionsJson, nuvioSettingsTemplate, proxyBase, onStep, nuvio = createNuvioAdapter() }) {
  validateNuvioTargets(targets);
  const step = (name, data) => { onStep?.(name, data); return data; };

  // 1) Nuvio account
  const { auth, accountSummary } = await resolveNuvioAuth(nuvio, account);
  step('account', accountSummary);

  // 2) Read pass (no writes): resolve every profile and back up what it has today. A profile that
  // "uses primary addons" is backed up from profile 1. Finished profiles of a retry are kept as they are.
  const nuvioProfiles = await nuvio.getProfiles(auth.token);
  const previous = new Map((retry?.profiles || []).map((r) => [r.profileIndex, r]));
  const backups = new Map(); // addons profile index -> backup entries, read at most once
  for (const r of previous.values()) if (r.backupTaken) backups.set(r.profileIndex, r.previousAddons);

  const results = new Map(); // profile index -> result
  const pending = [];
  for (const target of targets) {
    const idx = target.nuvioProfileId;
    const prior = previous.get(idx);
    if (prior?.status === 'done') { results.set(idx, prior); continue; }

    const entry = nuvioProfiles.find((e) => e.profile_index === idx);
    const result = { profileIndex: idx, name: entry?.name || target.name, status: 'failed', error: null, backupTaken: false, previousAddons: [], watchly: null, settings: null };
    results.set(idx, result);
    if (!entry) { result.error = `Profile ${idx} was not found on this Nuvio account.`; continue; }

    try {
      if (prior?.backupTaken) {
        result.previousAddons = prior.previousAddons; // the profile may be half-written: keep its first backup
      } else {
        const source = entry.uses_primary_addons ? 1 : idx;
        if (!backups.has(source)) backups.set(source, buildNuvioPreviousAddons(await nuvio.listAddons(auth.token, source)));
        result.previousAddons = backups.get(source);
      }
      result.backupTaken = true;
      step('backup', { profileIndex: idx, profileName: entry.name, count: result.previousAddons.length, addons: result.previousAddons });
      pending.push({ result, entry });
    } catch (err) {
      result.error = toError(err).message;
    }
  }

  const summary = {
    account: accountSummary,
    addons: retry?.addons ?? {},
    addonPasswordSource: retry?.addonPasswordSource ?? 'account',
    warnings: [...(retry?.warnings || [])],
    profiles: [],
  };

  if (pending.length > 0) {
    // 3) Shared configs, one shared password (own account password first, generated one if rejected).
    if (!summary.addons.aiostreams || !summary.addons.aiometadata) {
      const bundleArgs = { instances, aiostreamsParams, aiometadataParams, watchlyBody: null, target: 'nuvio', proxyBase };
      let addonBundle;
      try {
        addonBundle = await createAddonBundle({ ...bundleArgs, password: account.password });
      } catch (err) {
        const firstError = toError(err);
        if (!shouldRetryWithGeneratedPassword(firstError, account.password)) throw firstError;

        summary.addonPasswordSource = 'generated';
        addonBundle = await createAddonBundle({ ...bundleArgs, password: randomPassword() });
      }
      summary.addons = { aiostreams: addonBundle.addons.aiostreams, aiometadata: addonBundle.addons.aiometadata };
      summary.warnings.push(...addonBundle.warnings);
      step('aiostreams', summary.addons.aiostreams);
      step('aiometadata', summary.addons.aiometadata);
    }

    // Filter collections to the user's enabled categories once; p_collections_json is a real JSON value,
    // not a JSON-encoded string (verified Task 2). pushCollections signature: (token, profileId, collections)
    const filteredCollections = filterCollections(collectionsJson, aiometadataParams.baseTemplate.config.catalogs, {
      enabledCategories: aiometadataParams.enabledCategories,
      enabledDiscoverFolderIds: aiometadataParams.enabledDiscoverFolderIds,
      categoryOrder: aiometadataParams.categoryOrder,
      discoverFolderOrder: aiometadataParams.discoverFolderOrder,
      categoryExceptions: aiometadataParams.categoryExceptions || [],
    });

    // 4) Write pass, strictly sequential: updateProfile pushes the whole profile list (read-modify-write).
    // Nuvio addon order: Watchly first (watch history), then AIOMetadata (catalog source), then AIOStreams (stream source).
    for (const { result, entry } of pending) {
      const idx = result.profileIndex;
      try {
        if (watchly) {
          const body = buildWatchlyBody(watchly.defaults, {
            target: 'nuvio',
            nuvioAccessToken: auth.token,
            nuvioRefreshToken: auth.refreshToken,
            nuvioExpiresAt: auth.expiresAt,
            nuvioProfileId: idx,
            nuvioProfileName: entry.name,
            tmdbApiKey: watchly.tmdbApiKey,
            geminiApiKey: watchly.geminiApiKey,
            rpdbApiKey: watchly.rpdbApiKey,
          });
          result.watchly = await createWatchlySummary(instances, body, summary.warnings);
          step('watchly', { profileIndex: idx, profileName: entry.name, ...result.watchly });
        }

        if (entry.uses_primary_addons) {
          await nuvio.updateProfile(auth.token, idx, { uses_primary_addons: false });
        }
        step('profile', { profileIndex: idx, profileName: entry.name });

        const addons = [
          ...(result.watchly ? [{ url: result.watchly.manifestUrl, name: 'Watchly', sort_order: 0 }] : []),
          { url: summary.addons.aiometadata.manifestUrl, name: 'AIOMetadata', sort_order: 1 },
          { url: summary.addons.aiostreams.manifestUrl, name: 'AIOStreams', sort_order: 2 },
        ];
        await nuvio.replaceAddons(auth.token, idx, addons);
        step('addons', { count: addons.length, profileIndex: idx, profileName: entry.name });

        await nuvio.pushCollections(auth.token, idx, filteredCollections);
        step('collections', { groupCount: filteredCollections.length, profileIndex: idx, profileName: entry.name });

        result.settings = await applyNuvioProfileSettings(nuvio, auth.token, idx, nuvioSettingsTemplate, aiometadataParams);
        step('settings', { ...result.settings, profileIndex: idx, profileName: entry.name });

        result.status = 'done';
        result.error = null;
      } catch (err) {
        result.status = 'failed';
        result.error = toError(err).message;
        step('profile_failed', { profileIndex: idx, profileName: entry.name, error: result.error });
      }
    }
  }

  summary.profiles = targets.map((t) => results.get(t.nuvioProfileId));
  return summary;
}

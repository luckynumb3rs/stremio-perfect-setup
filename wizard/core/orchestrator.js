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
  // Kids-only runs have no AIOMetadata (BingeCat provides the catalogs): aiometadataParams is null then.
  const aiometadata = aiometadataParams
    ? await createAiometadataSummary(instances, aiometadataParams, password, target, warnings)
    : null;

  let watchly = null;
  if (watchlyBody) {
    watchly = await createWatchlySummary(instances, watchlyBody, warnings);
  }

  return { addons: { aiostreams, ...(aiometadata ? { aiometadata } : {}), ...(watchly ? { watchly } : {}) }, warnings };
}

/** A profile with this name that was not on the account when the user connected (and was not created earlier in this run). */
async function findCreatedProfile(bc, name) {
  if (!bc.known || !bc.adapter.listProfiles) return null;
  const wanted = String(name).trim().toLowerCase();
  const fresh = (await bc.adapter.listProfiles(bc.token)).filter((p) => !bc.known.has(p.id) && String(p.name).trim().toLowerCase() === wanted);
  return fresh.length === 1 ? fresh[0] : null;
}

/**
 * Applies the BingeCat template to one profile and returns its addon URLs. Used per Nuvio profile and for Stremio.
 * A new BingeCat profile is announced (step 'bingecat_profile') BEFORE its settings are written, so a later failure
 * still reports the id and a retry reuses it instead of creating another one. Nothing is ever deleted on BingeCat.
 * @param {object} bc { adapter, token, mainProfileId, templates: { standard, kids }, targets: { [key]: profileId | 'new' },
 *   providerAuthKey?: string, providerRefreshToken?: string, geminiApiKey?: string,
 *   stremioConnected?: boolean, nuvioConnected?: boolean,
 *   known?: Set<number> (profile ids on the account at connect time, to recognise a profile created by a lost response),
 *   createdKeys?: Set<number> (rows whose profile an earlier attempt created),
 *   kidsProfileIds?: Set<number> (BingeCat profiles already of the kids type; every other profile of a Kids row is switched first) }
 */
async function applyBingecatProfile(bc, { key, name, kids, surface }, step) {
  let profileId = bc.targets[key];
  // true also when an earlier attempt of this run created the profile (the store remembers that as reason 'created')
  let created = !!bc.createdKeys?.has(key);
  let kidsType = !!bc.kidsProfileIds?.has(profileId);
  if (profileId === 'new') {
    let profile;
    try {
      profile = await bc.adapter.createProfile(bc.token, { name, kids });
    } catch (err) {
      // After an unclear failure the profile may exist anyway (create is not idempotent). Adopt it instead of letting a retry create another.
      const unclear = err?.code === 'network' || err?.code === 'bad_response' || err?.status >= 500;
      const found = unclear ? await findCreatedProfile(bc, name) : null;
      if (!found) throw err;
      profile = found;
    }
    profileId = profile.id;
    created = true;
    kidsType = profile.type === 'kids';
    bc.known?.add(profileId);
    step('bingecat_profile', { key, profileId, name: profile.name, kids, type: profile.type });
  }
  if (kids && profileId === bc.mainProfileId) throw new Error('The BingeCat main profile can never be a Kids profile.');
  // The kids type applies its own defaults on save, so switch BEFORE the template overwrites them. Covers a manually chosen
  // normal profile, a create BingeCat did not answer as kids and an adopted profile. A repeat is harmless; nothing is deleted.
  if (kids && !kidsType) {
    try {
      await bc.adapter.setProfileType(bc.token, profileId, 'kids');
    } catch (err) {
      throw new Error(`Could not switch the BingeCat profile for ${name} to a Kids profile: ${toError(err).message} The profile was kept and nothing was deleted. Press Retry to try again.`);
    }
    step('bingecat_profile_type', { key, profileId, type: 'kids' });
  }

  // Stremio history sync is writable and must be connected before the settings PATCH.
  // Nuvio history sync is enabled by BingeCat after its final connection step below.
  if (surface === 'stremio' && !bc.stremioConnected && bc.adapter.connectStremio) {
    if (!bc.providerAuthKey) throw new Error('BingeCat needs the signed-in Stremio session to connect watch history. Go back to the Account step and sign in again.');
    await bc.adapter.connectStremio(bc.token, profileId, bc.providerAuthKey);
    bc.stremioConnected = true;
    step('bingecat_connection', { provider: 'stremio' });
  }
  if (bc.geminiApiKey && !bc.aiKeysConfigured && bc.adapter.setAiKeys) {
    await bc.adapter.setAiKeys(bc.token, bc.mainProfileId, { geminiApiKey: bc.geminiApiKey });
    bc.aiKeysConfigured = true;
    step('bingecat_ai_key', { provider: 'gemini' });
  }
  const template = kids ? bc.templates.kids : bc.templates.standard;
  await bc.adapter.applyTemplate(bc.token, profileId, template, { historySource: surface, isMain: profileId === bc.mainProfileId });
  // The template decides whether the AI-search addon is installed (search enabled = Kids template today).
  const aiSearch = surface === 'nuvio' && template.search?.search_enabled === true;
  const { url, searchUrl } = await bc.adapter.getManifests(bc.token, profileId, { surface, aiSearch });
  step('bingecat', { profileName: name, created });
  return { profileId, created, url, searchUrl: searchUrl ?? null };
}

/**
 * BingeCat consumes/rotates the Nuvio refresh grant. This must run after every direct Nuvio write,
 * and no Nuvio token may be used after it. Profiles are linked only after the account connection succeeds.
 */
async function finalizeBingecatNuvio(bc, pending, step) {
  const ready = pending.filter(({ result }) => result.status === 'written' && result.bingecat);
  if (ready.length === 0 || !bc.adapter.connectNuvio) return;

  if (!bc.nuvioConnected) {
    if (!bc.providerRefreshToken) throw new Error('BingeCat needs the Nuvio refresh session to connect watch history. Go back to the Account step and sign in again.');
    await bc.adapter.connectNuvio(bc.token, bc.mainProfileId, bc.providerRefreshToken);
    bc.nuvioConnected = true;
    step('bingecat_connection', { provider: 'nuvio' });
  }

  if (!bc.adapter.linkNuvioProfile) return;
  for (const { result } of ready) {
    try {
      await bc.adapter.linkNuvioProfile(bc.token, result.bingecat.profileId, result.profileIndex);
    } catch (err) {
      result.status = 'failed';
      result.error = `BingeCat could not link Nuvio profile ${result.profileIndex}: ${toError(err).message}`;
      step('profile_failed', { profileIndex: result.profileIndex, profileName: result.name, error: result.error });
    }
  }
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
 * @param {object} p.instances         { aiostreams: string[], aiometadata: string[], watchly?: string[], bingecat?: string[] } – ordered service instances; first is primary where applicable
 * @param {object} p.account           { mode: 'create'|'signin', email, password }
 * @param {object} p.aiostreamsParams  { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams { baseTemplate, enabledCategories, enabledDiscoverFolderIds, categoryOrder, discoverFolderOrder, apiKeys, language }
 * @param {object} [p.watchlyBody]     Merged Watchly TokenRequest body (null/undefined = skip Watchly)
 * @param {function} p.onStep          (name, data) => void; progress callback
 */
export async function runStremioSetup({ instances, account, aiostreamsParams, aiometadataParams, watchlyBody, proxyBase, onStep, kids = false, bingecat = null }) {
  if (kids && !bingecat) throw new Error('A Kids setup needs BingeCat. Connect BingeCat first.');
  if (bingecat && !bingecat.token) throw new Error('BingeCat is not connected. Connect BingeCat again.');
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
      aiometadataParams: kids ? null : aiometadataParams, // Kids: BingeCat provides the catalogs
      watchlyBody: kids ? null : (watchlyBody ?? null),
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
      aiometadataParams: kids ? null : aiometadataParams,
      watchlyBody: kids ? null : (watchlyBody ?? null),
      password: randomPassword(),
      target: 'stremio',
      proxyBase,
    });
  }

  summary.addons.aiostreams = addonBundle.addons.aiostreams;
  if (addonBundle.addons.aiometadata) {
    summary.addons.aiometadata = addonBundle.addons.aiometadata;
  }
  if (addonBundle.addons.watchly) {
    summary.addons.watchly = addonBundle.addons.watchly;
  }
  summary.warnings.push(...addonBundle.warnings);
  step('aiostreams', summary.addons.aiostreams);
  if (summary.addons.aiometadata) step('aiometadata', summary.addons.aiometadata);
  if (summary.addons.watchly) {
    step('watchly', summary.addons.watchly);
  }
  if (bingecat) {
    summary.addons.bingecat = await applyBingecatProfile(bingecat, { key: 0, name: kids ? 'Kids' : 'Stremio', kids, surface: 'stremio' }, step);
  }

  // 4) ATOMIC install: push only after all configs succeeded
  const cinemetaDescriptor = await resolveCinemetaDescriptor(existing);
  const collection = buildAddonCollection(existing, {
    aiometadata: summary.addons.aiometadata?.manifestUrl,
    aiostreams: summary.addons.aiostreams.manifestUrl,
    watchly: summary.addons.watchly?.manifestUrl,
    bingecat: summary.addons.bingecat?.url,
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

function validateNuvioTargets(profiles, bingecat) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error('Nuvio: select at least one profile to set up.');
  }
  if (bingecat && !bingecat.token) throw new Error('BingeCat is not connected. Connect BingeCat again.');
  if (profiles.some((p) => p?.kids) && !bingecat) {
    throw new Error('A Kids profile needs BingeCat. Connect BingeCat first.');
  }
  const seen = new Set();
  for (const p of profiles) {
    const id = p?.nuvioProfileId;
    if (!Number.isInteger(id) || id < 1 || id > MAX_NUVIO_PROFILES) {
      throw new Error('Nuvio: every profile must exist before install (ids 1-6). Go back to the Account step.');
    }
    if (seen.has(id)) throw new Error(`Nuvio: profile ${id} is selected twice.`);
    seen.add(id);
    if (p.kids && bingecat.targets?.[id] === undefined) {
      throw new Error(`Nuvio: Kids profile "${p.name}" has no BingeCat profile selected.`);
    }
  }
}

/**
 * Full Nuvio setup flow for one or more profiles of one account.
 * Shared AIOStreams / AIOMetadata configs are created once; Watchly (if requested) once per profile.
 * Each profile is installed as a unit: a failure marks only that profile failed and never undoes finished ones.
 * @param {object} p
 * @param {object} p.instances           { aiostreams: string[], aiometadata: string[], watchly?: string[], bingecat?: string[] } – ordered service instances; first is primary where applicable
 * @param {object} p.account             { mode: 'create'|'signin', email, password, authToken?, authRefreshToken?, authExpiresAt? }
 * @param {object[]} p.profiles          [{ nuvioProfileId: 1..6, name, kids }] non-empty; the profiles must already exist
 * @param {object} p.aiostreamsParams    { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams   { baseTemplate, enabledCategories, enabledDiscoverFolderIds, categoryOrder, discoverFolderOrder, apiKeys, language }
 * @param {object} [p.watchly]           { defaults, tmdbApiKey, geminiApiKey, rpdbApiKey } (null = no Watchly)
 * @param {object} [p.retry]             Previous return value of this function: its shared configs, backups and finished profiles are reused
 * @param {object[]} p.collectionsJson   Nuvio-Collections.json array
 * @param {boolean|null} [p.pinCollections] true/false sets `pinToTop` on every collection group (collections above or below the Watchly/BingeCat
 *                                       catalogs); null keeps the template's value
 * @param {{standard: object, full: object}} p.nuvioSettingsTemplates Nuvio settings platform maps
 * @param {function} p.onStep
 * @returns {Promise<{account, addons, addonPasswordSource, warnings, profiles}>} throws only for bad input, auth, profile listing or shared config creation
 */
export async function runNuvioSetup({ instances, account, profiles: targets, aiostreamsParams, aiometadataParams, watchly = null, bingecat = null, pinCollections = null, retry = null, collectionsJson, nuvioSettingsTemplates, nuvioSettingsTemplate, proxyBase, onStep, nuvio = createNuvioAdapter() }) {
  validateNuvioTargets(targets, bingecat);
  const step = (name, data) => { onStep?.(name, data); return data; };

  // 1) Nuvio account
  const { auth, accountSummary } = await resolveNuvioAuth(nuvio, account);
  if (bingecat && !bingecat.nuvioConnected) bingecat.providerRefreshToken = auth.refreshToken;
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
    const result = { profileIndex: idx, name: entry?.name || target.name, kids: !!target.kids, status: 'pending', error: null, backupTaken: false, previousAddons: [], watchly: prior?.watchly ?? null, bingecat: null, settings: null };
    results.set(idx, result);
    if (!entry) { result.status = 'failed'; result.error = `Profile ${idx} was not found on this Nuvio account.`; continue; }

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
      pending.push({ result, entry, target });
    } catch (err) {
      result.status = 'failed';
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
    // AIOMetadata is only for Standard profiles: a Kids-only run does not create it (BingeCat provides the catalogs).
    const needsMeta = pending.some((p) => !p.target.kids);
    if (!summary.addons.aiostreams || (needsMeta && !summary.addons.aiometadata)) {
      const bundleArgs = { instances, aiostreamsParams, aiometadataParams: needsMeta ? aiometadataParams : null, watchlyBody: null, target: 'nuvio', proxyBase };
      let addonBundle;
      try {
        addonBundle = await createAddonBundle({ ...bundleArgs, password: account.password });
      } catch (err) {
        const firstError = toError(err);
        if (!shouldRetryWithGeneratedPassword(firstError, account.password)) throw firstError;

        summary.addonPasswordSource = 'generated';
        addonBundle = await createAddonBundle({ ...bundleArgs, password: randomPassword() });
      }
      summary.addons = { aiostreams: addonBundle.addons.aiostreams, ...(addonBundle.addons.aiometadata ? { aiometadata: addonBundle.addons.aiometadata } : {}) };
      summary.warnings.push(...addonBundle.warnings);
      step('aiostreams', summary.addons.aiostreams);
      if (summary.addons.aiometadata) step('aiometadata', summary.addons.aiometadata);
    }

    // Filter collections to the user's enabled categories once; p_collections_json is a real JSON value,
    // not a JSON-encoded string (verified Task 2). pushCollections signature: (token, profileId, collections)
    const matchingCollections = needsMeta
      ? filterCollections(collectionsJson, aiometadataParams.baseTemplate.config.catalogs, {
        enabledCategories: aiometadataParams.enabledCategories,
        enabledDiscoverFolderIds: aiometadataParams.enabledDiscoverFolderIds,
        categoryOrder: aiometadataParams.categoryOrder,
        discoverFolderOrder: aiometadataParams.discoverFolderOrder,
        categoryExceptions: aiometadataParams.categoryExceptions || [],
      })
      : [];
    // copies, so the shared template object is never changed
    const filteredCollections = pinCollections === null
      ? matchingCollections
      : matchingCollections.map((group) => ({ ...group, pinToTop: pinCollections === true }));

    // Watchly stores a Nuvio refresh grant, while BingeCat takes over and rotates the
    // grant that is posted to its partner endpoint. Use a separate Nuvio session for
    // Watchly so the grant handed to BingeCat is never reused by Watchly afterward.
    const needsWatchlySession = !!bingecat && !!watchly && pending.some(({ result, target }) => (
      result.status !== 'failed' && !result.watchly && !target.kids
    ));
    const watchlyAuth = needsWatchlySession
      ? await nuvio.login(account.email, account.password)
      : auth;

    if (watchly) {
      for (const { result, entry, target } of pending) {
        if (result.status === 'failed' || result.watchly || target.kids) continue;
        try {
          const body = buildWatchlyBody(watchly.defaults, {
            target: 'nuvio',
            nuvioAccessToken: watchlyAuth.token,
            nuvioRefreshToken: watchlyAuth.refreshToken,
            nuvioExpiresAt: watchlyAuth.expiresAt,
            nuvioProfileId: result.profileIndex,
            nuvioProfileName: entry.name,
            tmdbApiKey: watchly.tmdbApiKey,
            geminiApiKey: watchly.geminiApiKey,
            rpdbApiKey: watchly.rpdbApiKey,
          });
          result.watchly = await createWatchlySummary(instances, body, summary.warnings);
          step('watchly', { profileIndex: result.profileIndex, profileName: entry.name, ...result.watchly });
        } catch (err) {
          result.status = 'failed';
          result.error = toError(err).message;
          step('profile_failed', { profileIndex: result.profileIndex, profileName: entry.name, error: result.error });
        }
      }
    }

    // 4) Write pass, strictly sequential: updateProfile pushes the whole profile list (read-modify-write).
    // Addon order. Standard: Watchly (watch history), BingeCat, AIOMetadata (catalog source), AIOStreams (stream source).
    // Kids: BingeCat, BingeCat AI Search (only when the template enables search), AIOStreams; no Watchly or AIOMetadata, and empty collections.
    for (const { result, entry, target } of pending) {
      const idx = result.profileIndex;
      const kids = !!target.kids;
      if (result.status === 'failed') continue;
      try {
        // Prepare the BingeCat addon before the Nuvio write; the Nuvio account connection itself happens
        // only after every direct Nuvio write has completed.
        if (bingecat && bingecat.targets?.[idx] !== undefined) {
          result.bingecat = await applyBingecatProfile(bingecat, { key: idx, name: entry.name, kids, surface: 'nuvio' }, (name, data) => step(name, { ...data, profileIndex: idx }));
        }

        if (entry.uses_primary_addons) {
          await nuvio.updateProfile(auth.token, idx, { uses_primary_addons: false });
        }
        step('profile', { profileIndex: idx, profileName: entry.name });

        const addons = [
          ...(result.watchly ? [{ url: result.watchly.manifestUrl, name: 'Watchly' }] : []),
          ...(result.bingecat ? [{ url: result.bingecat.url, name: 'BingeCat' }] : []),
          ...(result.bingecat?.searchUrl ? [{ url: result.bingecat.searchUrl, name: 'BingeCat AI Search' }] : []),
          ...(kids ? [] : [{ url: summary.addons.aiometadata.manifestUrl, name: 'AIOMetadata' }]),
          { url: summary.addons.aiostreams.manifestUrl, name: 'AIOStreams' },
        ].map((addon, i) => ({ ...addon, sort_order: i }));
        await nuvio.replaceAddons(auth.token, idx, addons);
        step('addons', { count: addons.length, profileIndex: idx, profileName: entry.name });

        // The push replaces ALL collections of the profile. Standard: ours. Kids: none (our collections need AIOMetadata,
        // and whatever the profile had before pointed at addons that were just replaced).
        const collectionsToPush = kids ? [] : filteredCollections;
        await nuvio.pushCollections(auth.token, idx, collectionsToPush);
        step('collections', { groupCount: collectionsToPush.length, profileIndex: idx, profileName: entry.name });

        const settingsTemplate = target.fullSettings
          ? (nuvioSettingsTemplates?.full ?? nuvioSettingsTemplates?.standard ?? nuvioSettingsTemplate)
          : (nuvioSettingsTemplates?.standard ?? nuvioSettingsTemplate);
        if (!settingsTemplate) throw new Error('The Nuvio settings template is missing.');
        result.settings = await applyNuvioProfileSettings(nuvio, auth.token, idx, settingsTemplate, aiometadataParams);
        step('settings', { ...result.settings, profileIndex: idx, profileName: entry.name });

        result.status = 'written';
        result.error = null;
      } catch (err) {
        result.status = 'failed';
        result.error = toError(err).message;
        step('profile_failed', { profileIndex: idx, profileName: entry.name, error: result.error });
      }
    }

    // The Nuvio partner connection rotates the refresh grant and ends the safe window for using Nuvio tokens.
    // Keep this as the final Nuvio-related operation in the run.
    if (bingecat) {
      try {
        await finalizeBingecatNuvio(bingecat, pending, step);
      } catch (err) {
        const message = `BingeCat could not connect Nuvio after the Nuvio setup completed: ${toError(err).message}`;
        for (const { result } of pending) {
          if (result.status === 'written' && result.bingecat) {
            result.status = 'failed';
            result.error = message;
            step('profile_failed', { profileIndex: result.profileIndex, profileName: result.name, error: message });
          }
        }
      }
    }

    for (const { result } of pending) {
      if (result.status === 'written') result.status = 'done';
    }
  }

  summary.profiles = targets.map((t) => results.get(t.nuvioProfileId));
  return summary;
}

// Orchestrator — full Stremio + Nuvio flows.
// Install is ATOMIC: the ordered addon collection is pushed only after all configs succeed.
// If any config step fails, the account is left untouched.

import { createStremioAdapter, buildAddonCollection } from './adapters/stremio.js';
import { createWithFallbacks } from './adapters/aiostreams.js';
import { createAiometadataAdapter } from './adapters/aiometadata.js';
import { createNuvioAdapter } from './adapters/nuvio.js';
import { buildAioMetadataConfig } from './catalog-config.js';
import { filterCollections } from './nuvio-collections.js';

function randomPassword(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? crypto.getRandomValues(new Uint32Array(len))
    : Array.from({ length: len }, () => Math.floor(Math.random() * 1e9));
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

/**
 * Full Stremio setup flow.
 * @param {object} p
 * @param {object} p.instances         { aiostreams: {primary, fallbacks[]}, aiometadata: {primary, fallbacks[]} }
 * @param {object} p.account           { mode: 'create'|'signin', email, password }
 * @param {object} p.aiostreamsParams  { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams { baseTemplate, enabledCategories, enabledDiscoverFolderIds, apiKeys, language }
 * @param {function} p.onStep          (name, data) => void — progress callback
 */
export async function runStremioSetup({ instances, account, aiostreamsParams, aiometadataParams, onStep }) {
  const summary = { account: null, addons: {}, warnings: [] };
  const step = (name, data) => { onStep?.(name, data); return data; };

  // 1) Account
  const stremio = createStremioAdapter();
  let auth;
  if (account.mode === 'create') {
    auth = await stremio.register(account.email, account.password);
    summary.account = { service: 'stremio', email: account.email, password: account.password, created: true };
  } else {
    auth = await stremio.login(account.email, account.password);
    summary.account = { service: 'stremio', email: account.email, created: false };
  }
  step('account', summary.account);

  // 2) AIOStreams config (with fallbacks)
  const aioPassword = randomPassword();
  const aioInstances = [instances.aiostreams.primary, ...(instances.aiostreams.fallbacks || [])];
  const aioResult = await createWithFallbacks(aioInstances, { ...aiostreamsParams, password: aioPassword });
  summary.addons.aiostreams = {
    instance: aioResult.primary.instanceUrl,
    uuid: aioResult.primary.uuid,
    password: aioPassword,
    manifestUrl: aioResult.primary.manifestUrl,
    fallbacks: aioResult.all.filter((r) => r.ok && r !== aioResult.primary).map((r) => r.manifestUrl),
  };
  for (const r of aioResult.all.filter((r) => !r.ok)) {
    summary.warnings.push(`AIOStreams fallback ${r.instanceUrl} failed: ${r.error}`);
  }
  step('aiostreams', summary.addons.aiostreams);

  // 3) AIOMetadata config
  const { config: aioMetaConfig } = buildAioMetadataConfig(aiometadataParams.baseTemplate, {
    ...aiometadataParams,
    target: 'stremio',
  });
  const aioMetaPassword = randomPassword();
  const aioMetaInstances = [instances.aiometadata.primary, ...(instances.aiometadata.fallbacks || [])];
  let aioMetaResult = null;
  for (const instanceUrl of aioMetaInstances) {
    try {
      const adapter = createAiometadataAdapter(instanceUrl);
      // createConfig(config, password) — password is a top-level API field (not nested in config)
      aioMetaResult = await adapter.createConfig(aioMetaConfig, aioMetaPassword);
      aioMetaResult = { ...aioMetaResult, instanceUrl };
      break;
    } catch (err) {
      summary.warnings.push(`AIOMetadata ${instanceUrl} failed: ${err.message}`);
    }
  }
  if (!aioMetaResult) throw new Error('All AIOMetadata instances failed — see warnings');
  summary.addons.aiometadata = {
    instance: aioMetaResult.instanceUrl,
    uuid: aioMetaResult.userUUID,
    // installUrl is returned directly; manifestUrl is the same value (verified Task 1)
    manifestUrl: aioMetaResult.manifestUrl || aioMetaResult.installUrl,
  };
  step('aiometadata', summary.addons.aiometadata);

  // 4) ATOMIC install — push only after all configs succeeded
  const existing = await stremio.getAddons(auth.authKey);
  const collection = buildAddonCollection(existing, {
    aiometadata: summary.addons.aiometadata.manifestUrl,
    aiostreams: aioResult.primary.manifestUrl,
  }, { cleanCinemeta: { removeSearch: true, removeCatalogs: true, removeMetadata: true } });
  await stremio.setAddons(auth.authKey, collection);
  step('install', { count: collection.length, order: collection.map((a) => a.manifest?.name || a.transportUrl) });

  return summary;
}

/**
 * Full Nuvio setup flow.
 * @param {object} p
 * @param {object} p.instances           { aiostreams: {primary, fallbacks[]}, aiometadata: {primary, fallbacks[]} }
 * @param {object} p.account             { mode: 'create'|'signin', email, password }
 * @param {object} p.aiostreamsParams    { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams   { baseTemplate, enabledCategories, enabledDiscoverFolderIds, apiKeys, language }
 * @param {object[]} p.collectionsJson   nuvio-collections.json array
 * @param {function} p.onStep
 */
export async function runNuvioSetup({ instances, account, aiostreamsParams, aiometadataParams, collectionsJson, onStep }) {
  const summary = { account: null, addons: {}, warnings: [] };
  const step = (name, data) => { onStep?.(name, data); return data; };

  // 1) Nuvio account
  const nuvio = createNuvioAdapter();
  let auth;
  if (account.mode === 'create') {
    auth = await nuvio.signup(account.email, account.password);
    summary.account = { service: 'nuvio', email: account.email, password: account.password, created: true };
  } else {
    auth = await nuvio.login(account.email, account.password);
    summary.account = { service: 'nuvio', email: account.email, created: false };
  }
  step('account', summary.account);

  // 2) Get first profile — use profile_index field (verified Task 2)
  const profiles = await nuvio.getProfiles(auth.token);
  const profile = profiles[0];
  if (!profile) throw new Error('Nuvio: no profiles found — log into the Nuvio app first to create a profile');
  const profileIndex = profile.profile_index;
  step('profile', { profileIndex });

  // 3) AIOStreams config
  const aioPassword = randomPassword();
  const aioInstances = [instances.aiostreams.primary, ...(instances.aiostreams.fallbacks || [])];
  const aioResult = await createWithFallbacks(aioInstances, { ...aiostreamsParams, password: aioPassword });
  summary.addons.aiostreams = {
    instance: aioResult.primary.instanceUrl,
    uuid: aioResult.primary.uuid,
    password: aioPassword,
    manifestUrl: aioResult.primary.manifestUrl,
    fallbacks: aioResult.all.filter((r) => r.ok && r !== aioResult.primary).map((r) => r.manifestUrl),
  };
  for (const r of aioResult.all.filter((r) => !r.ok)) {
    summary.warnings.push(`AIOStreams fallback ${r.instanceUrl} failed: ${r.error}`);
  }
  step('aiostreams', summary.addons.aiostreams);

  // 4) AIOMetadata config (Nuvio target: showInHome=false — shown via collections instead)
  const { config: aioMetaConfig } = buildAioMetadataConfig(aiometadataParams.baseTemplate, {
    ...aiometadataParams,
    target: 'nuvio',
  });
  const aioMetaPassword = randomPassword();
  const aioMetaInstances = [instances.aiometadata.primary, ...(instances.aiometadata.fallbacks || [])];
  let aioMetaResult = null;
  for (const instanceUrl of aioMetaInstances) {
    try {
      // createConfig(config, password) — password is top-level (verified Task 1)
      aioMetaResult = await createAiometadataAdapter(instanceUrl).createConfig(aioMetaConfig, aioMetaPassword);
      aioMetaResult = { ...aioMetaResult, instanceUrl };
      break;
    } catch (err) {
      summary.warnings.push(`AIOMetadata ${instanceUrl} failed: ${err.message}`);
    }
  }
  if (!aioMetaResult) throw new Error('All AIOMetadata instances failed — see warnings');
  summary.addons.aiometadata = {
    instance: aioMetaResult.instanceUrl,
    uuid: aioMetaResult.userUUID,
    manifestUrl: aioMetaResult.manifestUrl || aioMetaResult.installUrl,
  };
  step('aiometadata', summary.addons.aiometadata);

  // 5) ATOMIC install — push addons then collections only after all configs succeed.
  // Nuvio addon order: AIOMetadata first (catalog source), then AIOStreams (stream source).
  // p_addons expects {url, sort_order} objects (verified Task 2; NOT a JSON string).
  // pushAddons signature: (token, addons) — profileIndex is not sent for addon push.
  const addons = [
    { url: summary.addons.aiometadata.manifestUrl, sort_order: 1 },
    { url: summary.addons.aiostreams.manifestUrl,  sort_order: 2 },
  ];
  await nuvio.pushAddons(auth.token, addons);
  step('addons', { count: addons.length });

  // Filter collections to user's enabled categories, then push.
  // p_collections_json is a real JSON value — NOT a JSON-encoded string (verified Task 2).
  // pushCollections signature: (token, profileId, collections)
  const catalogs = aiometadataParams.baseTemplate.config.catalogs;
  const { enabledCategories, enabledDiscoverFolderIds } = aiometadataParams;
  const filteredCollections = filterCollections(collectionsJson, catalogs, {
    enabledCategories,
    enabledDiscoverFolderIds,
  });
  await nuvio.pushCollections(auth.token, profileIndex, filteredCollections);
  step('collections', { groupCount: filteredCollections.length });

  return summary;
}

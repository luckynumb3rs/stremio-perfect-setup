// Phase 1 orchestrator — Stremio MVP path.
// Wires the adapters together: ensure account -> build & save AIOStreams (+ AIOMetadata stub) ->
// install ordered collection -> return a credential summary. Idempotent step results.
//
// AIOMetadata, Watchly, Nuvio, Trakt are stubbed/flagged for later phases (see AUTOMATION-PLAN.md).

import { createStremioAdapter, buildAddonCollection } from './adapters/stremio.js';
import { createWithFallbacks } from './adapters/aiostreams.js';

export async function runStremioSetup({ config, inputs, services, credentials, account, templates, onStep }) {
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

  // 2) AIOStreams config (primary + fallbacks)
  const aioStreamsPassword = randomPassword();
  const instances = [config.instances.aiostreams.primary, ...(config.instances.aiostreams.fallbacks || [])];
  const aiostreams = await createWithFallbacks(instances, {
    template: templates.aiostreams,
    inputs,
    services,
    credentials,
    password: aioStreamsPassword,
  });
  summary.addons.aiostreams = {
    instance: aiostreams.primary.instanceUrl,
    uuid: aiostreams.primary.uuid,
    password: aioStreamsPassword,
    manifestUrl: aiostreams.primary.manifestUrl,
    fallbacks: aiostreams.all.filter((r) => r.ok && r !== aiostreams.primary).map((r) => r.manifestUrl),
  };
  for (const r of aiostreams.all.filter((r) => !r.ok)) {
    summary.warnings.push(`AIOStreams fallback ${r.instanceUrl} failed: ${r.error}`);
  }
  step('aiostreams', summary.addons.aiostreams);

  // 3) AIOMetadata — PHASE 2 (endpoint to be confirmed). For now flag it.
  if (config.instances.aiometadata?.primary) {
    summary.warnings.push('AIOMetadata install is implemented in Phase 2 (save endpoint pending live verification).');
  }

  // 4) Install ordered addon collection on Stremio (replaces Cinebye).
  const existing = await stremio.getAddons(auth.authKey);
  const collection = buildAddonCollection(existing, {
    aiostreams: aiostreams.primary.manifestUrl,
    // aiometadata: <phase 2>, watchly: <phase 2>
  }, { cleanCinemeta: { removeSearch: true, removeCatalogs: true, removeMetadata: true } });
  await stremio.setAddons(auth.authKey, collection);
  step('install', { count: collection.length, order: collection.map((a) => a.manifest?.name || a.transportUrl) });

  return summary;
}

function randomPassword(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? crypto.getRandomValues(new Uint32Array(len))
    : Array.from({ length: len }, () => Math.floor(Math.random() * 1e9));
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

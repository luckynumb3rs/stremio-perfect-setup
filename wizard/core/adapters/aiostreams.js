// AIOStreams adapter: creates a stored user config on an instance and returns the manifest URL.
// Contract confirmed from Viren070/AIOStreams and internal API notes (§2).
//
// CORS note: all known community instances respond to OPTIONS /api/v1/user without
// Access-Control-Allow-Origin headers, causing browsers to block the preflight.
// The adapter supports an optional `proxyBase` parameter which, when set, prefixes
// the API URL so requests are relayed through a CORS-capable proxy
// (e.g. "https://proxy.numb3rs.stream" or a self-hosted worker).

import { resolveTemplate } from '../template-engine.js';

const API_VERSION = 'v1';

function normalizeBase(instanceUrl) {
  return instanceUrl.replace(/\/+$/, '');
}

function resolveConfigPayload({ template, inputs, services, credentials, serviceCredentials, configOverride }) {
  let config = resolveTemplate(template, { inputs, services, credentials, serviceCredentials });
  if (configOverride && typeof configOverride === 'object') {
    config = { ...config, ...configOverride };
  }
  return config;
}

function normalizeAddonName(value) {
  // Collapse runs of non-alphanumerics to single spaces (instead of stripping them) so we keep
  // word boundaries. This lets us tell "Comet" apart from "Comet TorBox": AIOStreams' real error
  // is "Failed to fetch manifest for <name> <identifier>" (getAddonName appends a
  // displayIdentifier/identifier), so the error name is the preset name plus a trailing label.
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// True when a preset name and an error-derived addon name refer to the same addon. They match when
// equal, or when one is a leading word-prefix of the other — covering the identifier AIOStreams
// appends to the preset name in manifest-failure errors (e.g. preset "Comet" vs error "Comet TorBox").
function addonNameMatches(presetName, targetName) {
  if (!presetName || !targetName) return false;
  if (presetName === targetName) return true;
  return targetName.startsWith(`${presetName} `) || presetName.startsWith(`${targetName} `);
}

export function extractFailedManifestAddons(message) {
  const text = String(message || '');
  const matches = text.matchAll(/Failed to fetch manifest for\s+(.+?)(?=[:.,\n]|$)/gi);
  const names = [];
  for (const match of matches) {
    const name = String(match[1] || '').trim().replace(/^["'`]+|["'`]+$/g, '');
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export function disableInternalAddons(config, addonNames) {
  if (!Array.isArray(config?.presets) || !Array.isArray(addonNames) || addonNames.length === 0) {
    return { config, disabledAddonNames: [] };
  }

  const targets = addonNames.map(normalizeAddonName).filter(Boolean);
  if (targets.length === 0) return { config, disabledAddonNames: [] };

  const nextConfig = structuredClone(config);
  const disabledAddonNames = [];

  for (const preset of nextConfig.presets) {
    const presetNames = [
      preset?.options?.name,
      preset?.name,
      preset?.type,
      preset?.instanceId,
    ].map(normalizeAddonName);

    if (!presetNames.some((name) => targets.some((target) => addonNameMatches(name, target)))) continue;
    if (preset.enabled === false) continue;

    preset.enabled = false;
    disabledAddonNames.push(preset?.options?.name || preset?.name || preset?.type || preset?.instanceId);
  }

  return { config: nextConfig, disabledAddonNames: [...new Set(disabledAddonNames)] };
}

// How many of the addons an instance named in its failure are actually present (and still enabled)
// in our template — i.e. how many we could disable to try to repair this instance. Opaque failures
// (403s, generic 400s with no parseable manifest name) and names that don't map to a preset count 0.
function repairableAddonCount(errorMessage, config) {
  const names = extractFailedManifestAddons(errorMessage);
  if (names.length === 0) return 0;
  return disableInternalAddons(config, names).disabledAddonNames.length;
}

async function tryCreateUntilSuccess(instances, createAttempt) {
  const results = [];
  for (const instanceUrl of instances) {
    try {
      const success = { instanceUrl, ok: true, ...(await createAttempt(instanceUrl)) };
      results.push(success);
      return { primary: success, results };
    } catch (err) {
      results.push({ instanceUrl, ok: false, error: String(err.message || err) });
    }
  }
  return { primary: null, results };
}

/**
 * Build the final fetch URL, optionally routing through a CORS proxy.
 * proxyBase examples:
 *   ""                               → direct request (may fail due to CORS)
 *   "https://proxy.numb3rs.stream"   → append the raw target URL as a path
 *   "https://proxy.example/?url="    → append the encoded target URL as a query value
 *   "https://proxy.example/{url}"    → replace placeholder with the raw target URL
 *   "https://proxy.example/{url_encoded}" → replace placeholder with the encoded target URL
 */
function buildUrl(targetUrl, proxyBase) {
  if (!proxyBase) return targetUrl;
  const trimmed = proxyBase.replace(/\/+$/, '');
  if (trimmed.includes('{url_encoded}')) {
    return trimmed.replace('{url_encoded}', encodeURIComponent(targetUrl));
  }
  if (trimmed.includes('{url}')) {
    return trimmed.replace('{url}', targetUrl);
  }
  // Query-style proxies usually expect the target as an encoded value.
  if (trimmed.includes('?') || trimmed.endsWith('=')) {
    return trimmed + encodeURIComponent(targetUrl);
  }
  // Path-style proxies expect the raw target URL after the slash:
  // https://proxy.example/https://upstream.example/path
  return trimmed + '/' + targetUrl;
}

export function createAioStreamsAdapter(instanceUrl, { proxyBase = '' } = {}) {
  const base = normalizeBase(instanceUrl);
  return {
    base,
    async saveConfig({ config, password, addonPassword }) {
      const headers = { 'content-type': 'application/json' };
      if (addonPassword) headers['x-aiostreams-addon-password'] = addonPassword;

      const apiUrl = buildUrl(`${base}/api/${API_VERSION}/user`, proxyBase);

      let res;
      try {
        res = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ config, password }),
        });
      } catch (err) {
        const message = String(err?.message || err);
        const isCors = /Failed to fetch|NetworkError|Load failed|CORS/i.test(message);
        if (isCors) {
          throw new Error(
            `[CORS] AIOStreams at ${base} is unreachable from your browser, this is a CORS issue. ` +
            `The instance is online and reachable, but its server does not send the ` +
            `Access-Control-Allow-Origin header required for browser requests. ` +
            `To work around this, set a CORS proxy URL in config.json under "proxyBase" ` +
            `(e.g. "https://proxy.numb3rs.stream") and rebuild the wizard.`
          );
        }
        throw new Error(`AIOStreams ${base}: network error: ${message}`);
      }
      if (res.status !== 201) {
        let detail = '';
        try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
        if (!detail) detail = await res.text().catch(() => '');
        throw new Error(
          `AIOStreams ${base}: configuration rejected by the server (HTTP ${res.status}).` +
          (detail ? ` Details: ${detail.slice(0, 300)}` : '')
        );
      }
      const body = await res.json();
      const data = body.data || body;
      const { uuid, encryptedPassword } = data;
      if (!uuid || !encryptedPassword) throw new Error(`AIOStreams ${base}: server returned an incomplete response (missing uuid or encryptedPassword)`);
      return {
        uuid,
        encryptedPassword,
        password,
        manifestUrl: `${base}/stremio/${uuid}/${encryptedPassword}/manifest.json`,
      };
    },
    /**
     * Resolve the repo template with the user's inputs + credentials, store it, return identifiers.
     * @returns {Promise<{uuid, encryptedPassword, manifestUrl, password}>}
     */
    async createConfig({ template, inputs, services, credentials, serviceCredentials, password, addonPassword, configOverride }) {
      const config = resolveConfigPayload({ template, inputs, services, credentials, serviceCredentials, configOverride });
      return this.saveConfig({ config, password, addonPassword });
    },

    /** Verify an instance is reachable + lists templates (health probe). */
    async health() {
      const res = await fetch(`${base}/api/${API_VERSION}/health`).catch(() => null);
      return Boolean(res && res.ok);
    },
  };
}

// Try instances in order until one accepts the config. Later entries are fallbacks that are
// only attempted if earlier instances fail. params may include `proxyBase` for CORS proxy
// support and `_postResolveOverride` to patch the resolved config before POSTing
// (useful for testing without a TMDB key).
//
// Strategy when every instance rejects the config:
//   1. The first attempt always sends the template with every addon enabled (the normal case).
//   2. If all instances fail, we remember which addons each instance reported as broken. AIOStreams'
//      fetchManifests uses Promise.all, so an instance may surface only one broken addon at a time —
//      so we pick the instance that named the FEWEST broken-but-repairable addons (ties broken by
//      order), disable only the addon(s) THAT instance named, and retry on THAT same instance,
//      repeating until it accepts or there is nothing left we can disable.
//   3. If that committed instance still can't be salvaged, we fall back to the next-fewest instance
//      and repair it from scratch using only the addons IT named.
//   4. If no instance can be made to work, the combined error is surfaced to the user.
// This avoids disabling addons an instance never complained about, and avoids deploying to an
// instance where a different addon is the real problem.
//
// MAX_DISABLE_ROUNDS bounds the repair loop per instance so a misbehaving instance can't loop forever.
const MAX_DISABLE_ROUNDS = 12;

// Repair a single instance: disable only the addons it reports as broken, retrying on that same
// instance until it accepts the config or there is nothing left to disable. Returns the successful
// result and the addons that had to be disabled, or { ok: false } if the instance can't be salvaged.
async function repairInstance(instanceUrl, baseConfig, firstError, createAttempt) {
  let config = baseConfig;
  let lastError = firstError;
  const disabled = [];

  for (let round = 0; round <= MAX_DISABLE_ROUNDS; round++) {
    const names = extractFailedManifestAddons(lastError);
    if (names.length === 0) break; // opaque failure — nothing actionable to disable
    const { config: nextConfig, disabledAddonNames } = disableInternalAddons(config, names);
    if (disabledAddonNames.length === 0) break; // named addons aren't in our template / already off
    disabled.push(...disabledAddonNames);
    config = nextConfig;

    try {
      const success = { instanceUrl, ok: true, ...(await createAttempt(instanceUrl, config)) };
      return { ok: true, success, disabled: [...new Set(disabled)] };
    } catch (err) {
      lastError = String(err.message || err);
    }
  }

  return { ok: false, error: lastError, disabled: [...new Set(disabled)] };
}

export async function createWithFallbacks(instances, params) {
  const { proxyBase, _postResolveOverride, ...createParams } = params;
  const configOverride = _postResolveOverride || undefined;
  const baseConfig = resolveConfigPayload({ ...createParams, configOverride });

  const createAttempt = async (instanceUrl, config) => {
    const adapter = createAioStreamsAdapter(instanceUrl, { proxyBase });
    return adapter.saveConfig({
      config,
      password: createParams.password,
      addonPassword: createParams.addonPassword,
    });
  };

  // Step 1: normal attempt with every addon enabled. First instance to accept wins.
  const round0 = await tryCreateUntilSuccess(instances, (instanceUrl) => createAttempt(instanceUrl, baseConfig));
  // `all` carries the final per-instance outcome (one entry per instance, in order). It starts as
  // the round-0 failures and is upgraded to the success entry for whichever instance we recover.
  const all = [...round0.results];
  if (round0.primary) {
    return { primary: round0.primary, all, disabledInternalAddons: [], retryWarnings: [] };
  }

  // Step 2: every instance rejected the config. Rank the instances that named at least one addon we
  // can actually disable, fewest-broken first (ties broken by original order), and try to repair
  // each in turn — committing to one instance at a time and disabling only what it reports.
  const candidates = round0.results
    .map((result, index) => ({ result, index, repairable: repairableAddonCount(result.error, baseConfig) }))
    .filter((candidate) => candidate.repairable > 0)
    .sort((a, b) => a.repairable - b.repairable || a.index - b.index);

  let primary = null;
  let disabledInternalAddons = [];
  for (const candidate of candidates) {
    const outcome = await repairInstance(candidate.result.instanceUrl, baseConfig, candidate.result.error, createAttempt);
    if (outcome.ok) {
      primary = outcome.success;
      disabledInternalAddons = outcome.disabled;
      all[candidate.index] = outcome.success; // reflect that this instance ultimately succeeded
      break;
    }
  }

  const uniqueDisabled = [...new Set(disabledInternalAddons)];
  const retryWarnings = uniqueDisabled.length > 0
    ? [
        `AIOStreams disabled ${uniqueDisabled.join(', ')} because ${uniqueDisabled.length === 1 ? 'it was' : 'they were'} not reachable at the moment. Your account was created successfully and it is fine to continue using it. You can log in to the AIOStreams configuration later (provided below) and try re-enabling ${uniqueDisabled.length === 1 ? 'it' : 'them'} manually. The configuration that was installed includes multiple redundant scrapers, so you could also leave ${uniqueDisabled.length === 1 ? 'it' : 'them'} disabled if you're happy with the results you get.`,
      ]
    : [];

  if (!primary) {
    const results = round0.results;
    const allCors = results.every((r) => r.error?.includes('[CORS]'));
    const errors = results.map((r) => r.error?.replace('[CORS] ', '')).join('\n\n');
    if (allCors) {
      throw new Error(
        `[CORS_ALL] Unable to create your AIOStreams configuration, all ${results.length} instance${results.length !== 1 ? 's' : ''} ` +
        `blocked the browser request due to missing CORS headers.\n\n` +
        `This is a server-side configuration issue on the AIOStreams instances, not a problem with your setup. ` +
        `Your options are:\n` +
        `  • Ask the instance owner to enable CORS on their server.\n` +
        `  • Set "proxyBase" in config.json to route through a CORS proxy ` +
        `(e.g. "https://proxy.numb3rs.stream") and rebuild.\n` +
        `  • Use the AIOStreams web interface directly at the instance URL and paste your manifest URL into the wizard.`
      );
    }
    throw new Error(`All AIOStreams instances failed:\n\n${errors}`);
  }
  return { primary, all, disabledInternalAddons: uniqueDisabled, retryWarnings };
}

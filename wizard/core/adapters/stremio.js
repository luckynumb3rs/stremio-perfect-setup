// Stremio account adapter: talks to api.strem.io (CORS-friendly, browser-callable).
// Contract confirmed from Stremio/stremio-api-client and internal API notes (§1).

const DEFAULT_ENDPOINT = 'https://api.strem.io';
export const OFFICIAL_CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json';

async function rpc(endpoint, method, params, authKey) {
  let res;
  try {
    res = await fetch(`${endpoint}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authKey: authKey ?? null, ...params }),
    });
  } catch (err) {
    throw new Error(`Could not reach Stremio (${method}): ${err?.message || err}. Please check your connection and try again.`);
  }
  if (res.status !== 200) throw new Error(`Stremio ${method} failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) {
    const code = body.error.code;
    const msg = body.error.message || JSON.stringify(body.error);
    // Provide context-specific messages for common errors
    if (method === 'register' && /already/i.test(msg)) {
      throw new Error(`That email address already has a Stremio account. Please sign in instead, or use a different email address.`);
    }
    if (method === 'login' && /password|credential|auth/i.test(msg)) {
      throw new Error(`Incorrect email or password. Please double-check your Stremio credentials and try again.`);
    }
    if (
      method === 'addonCollectionSet'
      && (code === 20004 || /max descriptor size reached/i.test(msg))
    ) {
      throw new Error(
        `Stremio could not install AIOMetadata because its manifest is too large for Stremio (${msg}), which means there are too many catalogs enabled. ` +
        `Go to the Catalogs page from the left sidebar, change/disable some catalogs and try again.`
      );
    }
    throw new Error(`Stremio ${method}: ${msg}`);
  }
  if (!body.result) throw new Error(`Stremio ${method}: received an empty response from the server.`);
  return body.result;
}

export function createStremioAdapter(endpoint = DEFAULT_ENDPOINT) {
  return {
    async login(email, password) {
      const r = await rpc(endpoint, 'login', { email, password });
      return { authKey: r.authKey, user: r.user };
    },
    async register(email, password) {
      const r = await rpc(endpoint, 'register', { email, password });
      return { authKey: r.authKey, user: r.user };
    },
    async getAddons(authKey) {
      const r = await rpc(endpoint, 'addonCollectionGet', { update: true, addFromURL: [] }, authKey);
      return r.addons || [];
    },
    async setAddons(authKey, addons) {
      return rpc(endpoint, 'addonCollectionSet', { addons }, authKey);
    },
  };
}

function inferTransportName(transportUrl) {
  return /^https?:\/\//i.test(String(transportUrl || '')) ? 'http' : '';
}

function findAddon(existing, matcher) {
  return existing.find((addon) => matcher(addon?.transportUrl || '', addon?.manifest?.id || '', addon?.manifest?.name || ''));
}

function findCinemetaAddon(existing) {
  return findAddon(existing, (transportUrl, manifestId, manifestName) =>
    transportUrl.includes('cinemeta')
    || manifestId.includes('cinemeta')
    || manifestName.toLowerCase() === 'cinemeta'
  );
}

function findLocalFilesAddon(existing) {
  return findAddon(existing, (transportUrl, manifestId) =>
    transportUrl.includes('local') || manifestId.includes('org.stremio.local')
  );
}

// Build an ordered addon descriptor list for the Perfect Setup.
// `existing` is the current collection (to preserve Cinemeta/Local Files manifests + apply patches).
// `manifests` = { aiometadata, aiostreams, watchly? } -> resolved manifest objects or URLs.
export function buildAddonCollection(existing, manifests, opts = {}) {
  const cinemeta = opts.cinemetaDescriptor || findCinemetaAddon(existing);
  const localFiles = findLocalFilesAddon(existing);

  // Optionally patch Cinemeta (remove search/catalogs/metadata)
  // See the internal API notes (§1) for the verified shape.
  const patchedCinemeta = opts.cleanCinemeta && cinemeta
    ? patchCinemeta(cinemeta, opts.cleanCinemeta)
    : cinemeta;

  const order = [];
  if (patchedCinemeta) order.push(patchedCinemeta);
  if (manifests.watchly) order.push(toDescriptor(manifests.watchly));
  if (manifests.aiometadata) order.push(toDescriptor(manifests.aiometadata));
  if (manifests.aiostreams) order.push(toDescriptor(manifests.aiostreams));
  if (localFiles) order.push(localFiles);
  return order;
}

function toDescriptor(m) {
  if (typeof m === 'string') {
    return {
      transportUrl: m,
      transportName: inferTransportName(m),
      manifest: undefined,
      flags: {},
    };
  }
  return m; // already a descriptor
}

export async function fetchAddonDescriptor(transportUrl, fetchImpl = fetch, baseDescriptor = {}) {
  let res;
  try {
    res = await fetchImpl(transportUrl);
  } catch (err) {
    throw new Error(`Could not fetch add-on manifest from ${transportUrl}: ${err?.message || err}`);
  }

  if (!res.ok) {
    throw new Error(`Could not fetch add-on manifest from ${transportUrl}: HTTP ${res.status}`);
  }

  let manifest;
  try {
    manifest = await res.json();
  } catch (err) {
    throw new Error(`Add-on manifest at ${transportUrl} did not return valid JSON: ${err?.message || err}`);
  }

  return {
    transportUrl,
    transportName: inferTransportName(transportUrl),
    flags: {},
    ...baseDescriptor,
    manifest,
  };
}

export async function hydrateAddonCollection(addons, fetchImpl = fetch) {
  return Promise.all(addons.map(async (addon) => {
    if (!addon?.transportUrl || addon.manifest) return addon;
    return fetchAddonDescriptor(addon.transportUrl, fetchImpl, addon);
  }));
}

export async function resolveCinemetaDescriptor(existing = [], fetchImpl = fetch) {
  const existingCinemeta = findCinemetaAddon(existing);

  try {
    return await fetchAddonDescriptor(OFFICIAL_CINEMETA_URL, fetchImpl, {
      flags: existingCinemeta?.flags || { official: true, protected: true },
    });
  } catch (err) {
    if (existingCinemeta) return structuredClone(existingCinemeta);
    throw new Error(`Could not fetch the official Cinemeta manifest to apply the built-in patches: ${err?.message || err}`);
  }
}

// Reproduce Cinebye's three patches by trimming Cinemeta's advertised resources.
//
// VERIFIED 2026-05-31 against live Cinemeta v3.0.12 (com.linvo.cinemeta) from a fresh account:
//   manifest.resources = ["catalog", "meta", "addon_catalog"] - plain strings, no objects.
//   Catalogs with search: movie/top and series/top each have
//     extra: [{name:"genre",...}, {name:"search"}, {name:"skip"}]
//     extraSupported: ["search","genre","skip"]
//   The filter below (checking both extra[].name and extraSupported) is correct for both fields.
//   The resources filter (string vs object guard) is correct; resources are plain strings.
function patchCinemeta(descriptor, { removeSearch, removeCatalogs, removeMetadata }) {
  const d = structuredClone(descriptor);
  if (!d.manifest) return d;
  if (removeCatalogs) d.manifest.catalogs = [];
  if (removeMetadata && Array.isArray(d.manifest.resources)) {
    // resources are plain strings ("catalog", "meta", "addon_catalog"); guard handles future object form too
    d.manifest.resources = d.manifest.resources.filter((r) => (typeof r === 'string' ? r : r.name) !== 'meta');
  }
  // removeSearch: drop catalogs that declare search support via extra[].name or extraSupported
  if (removeSearch && Array.isArray(d.manifest.catalogs)) {
    d.manifest.catalogs = d.manifest.catalogs.filter(
      (c) => !(c.extra || []).some((e) => e.name === 'search') && !(c.extraSupported || []).includes('search')
    );
  }
  return d;
}

// Stremio account adapter — talks to api.strem.io (CORS-friendly, browser-callable).
// Contract confirmed from Stremio/stremio-api-client (see API-NOTES.md §1).

const DEFAULT_ENDPOINT = 'https://api.strem.io';

async function rpc(endpoint, method, params, authKey) {
  const res = await fetch(`${endpoint}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authKey: authKey ?? null, ...params }),
  });
  if (res.status !== 200) throw new Error(`Stremio ${method} failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`Stremio ${method}: ${body.error.message || JSON.stringify(body.error)}`);
  if (!body.result) throw new Error(`Stremio ${method}: no result`);
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

// Build an ordered addon descriptor list for the Perfect Setup.
// `existing` is the current collection (to preserve Cinemeta/Local Files manifests + apply patches).
// `manifests` = { aiometadata, aiostreams, watchly? } -> resolved manifest objects or URLs.
export function buildAddonCollection(existing, manifests, opts = {}) {
  const find = (idOrUrl) =>
    existing.find((a) => a.transportUrl?.includes(idOrUrl) || a.manifest?.id?.includes(idOrUrl));

  const cinemeta = find('cinemeta') || find('com.linvo.cinemeta');
  const localFiles = find('local') || find('org.stremio.local');

  // Optionally patch Cinemeta (remove search/catalogs/metadata) — see API-NOTES.md §1 (verify shape).
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
  if (typeof m === 'string') return { transportUrl: m, transportName: '', manifest: undefined, flags: {} };
  return m; // already a descriptor
}

// Reproduce Cinebye's three patches by trimming Cinemeta's advertised resources.
//
// VERIFIED 2026-05-31 against live Cinemeta v3.0.12 (com.linvo.cinemeta) from a fresh account:
//   manifest.resources = ["catalog", "meta", "addon_catalog"]  — plain strings, no objects.
//   Catalogs with search: movie/top and series/top each have
//     extra: [{name:"genre",...}, {name:"search"}, {name:"skip"}]
//     extraSupported: ["search","genre","skip"]
//   The filter below (checking both extra[].name and extraSupported) is correct for both fields.
//   The resources filter (string vs object guard) is correct — resources are plain strings.
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

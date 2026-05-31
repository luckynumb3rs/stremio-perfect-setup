// Nuvio adapter: talks to the Supabase-backed Nuvio Public API.
//
// VERIFIED (2026-05-30) via NuvioTV/AddonSyncService.kt, CollectionSyncService.kt,
//   ProfileSyncService.kt, SupabaseModels.kt, NuvioMobile/supabaseSyncService.ts
//
// VERIFIED: CORS = open (Access-Control-Allow-Origin: * confirmed via OPTIONS probe)
// VERIFIED: anon key source = PLACEHOLDER; key is in local.properties (gitignored)
//   in both NuvioMedia/NuvioTV and NuvioMedia/NuvioMobile repos. Never committed.
//   To find it: build either app from source with your own local.properties, or
//   intercept a live app's network traffic (apikey header on any Supabase request).
// VERIFIED: auth response field = access_token  (standard Supabase auth shape)
// VERIFIED: profile id field = profile_index    (Int, default 1 = primary profile)
// VERIFIED: sync_push_addons p_addons = JSON array of objects (NOT a JSON string)
//   Shape: { p_addons: [{url: string, sort_order: number, enabled?: boolean, name?: string}] }
//   Note: the task brief assumed p_addons_json (string), but source code shows p_addons (array).
// VERIFIED: sync_push_collections p_collections_json = real JSON value (NOT a string)
//   Shape: { p_profile_id: number, p_collections_json: JsonArray }
// VERIFIED: sync_pull_profiles = called with {}; returns SupabaseProfile[] with profile_index field

const SUPABASE_BASE = 'https://dpyhjjcoabcglfmgecug.supabase.co';
const SUPABASE_ANON_KEY = 'REPLACE_WITH_ANON_KEY';

function anonHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
  };
}

async function rpc(path, token, body) {
  const res = await fetch(`${SUPABASE_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Nuvio ${path} failed: HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export function createNuvioAdapter() {
  return {
    async signup(email, password) {
      const res = await fetch(`${SUPABASE_BASE}/auth/v1/signup`, {
        method: 'POST',
        headers: anonHeaders(),
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(`Nuvio signup failed: HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`Nuvio signup: ${body.error.message || body.error}`);
      return { token: body.access_token, userId: body.user?.id };
    },

    async login(email, password) {
      const res = await fetch(`${SUPABASE_BASE}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: anonHeaders(),
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(`Nuvio login failed: HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`Nuvio login: ${body.error.message || body.error}`);
      return { token: body.access_token, userId: body.user?.id };
    },

    // Returns array of profiles; each has profile_index (Int) as the profile id.
    // Primary profile is always profile_index = 1.
    async getProfiles(token) {
      const data = await rpc('/rest/v1/rpc/sync_pull_profiles', token, {});
      return Array.isArray(data) ? data : (data.profiles || []);
    },

    // addons = [{url, sort_order, enabled?, name?}]
    // p_addons is a JSON array of objects, not a JSON-encoded string.
    async pushAddons(token, addons) {
      return rpc('/rest/v1/rpc/sync_push_addons', token, {
        p_addons: addons.map((addon, i) => ({
          url: addon.url,
          sort_order: typeof addon.sort_order === 'number' ? addon.sort_order : i,
          ...(typeof addon.enabled === 'boolean' ? { enabled: addon.enabled } : {}),
          ...(addon.name ? { name: addon.name } : {}),
        })),
      });
    },

    // collections = JSON-serialisable array (real value, not stringified).
    // p_collections_json is passed as a real JSON value, not a JSON-encoded string.
    async pushCollections(token, profileId, collections) {
      return rpc('/rest/v1/rpc/sync_push_collections', token, {
        p_profile_id: profileId,
        p_collections_json: Array.isArray(collections) ? collections : [],
      });
    },

    async pullCollections(token, profileId) {
      const data = await rpc('/rest/v1/rpc/sync_pull_collections', token, {
        p_profile_id: profileId,
      });
      // Response: [{profile_id, collections_json, updated_at}]; first row's collections_json
      const rows = Array.isArray(data) ? data : [];
      return rows.length > 0 ? (rows[0].collections_json ?? []) : [];
    },
  };
}

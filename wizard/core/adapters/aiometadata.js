// AIOMetadata adapter: creates a stored user config on an instance and returns the manifest URL.
// VERIFIED 2026-05-30 against https://aiometadata.viren070.me
//
// VERIFIED: endpoint = POST /api/config/save
//   Request body: { password: string, config: { language, apiKeys, catalogs, ... } }
//   Response (HTTP 200): { success: true, userUUID: string, installUrl: string, message: string }
//   Note: "password" is a top-level field, NOT nested inside "config".
//   Note: without "password" field the API returns HTTP 400 { error: "Password is required" }.
//
// VERIFIED: manifest URL = https://<instance>/stremio/<userUUID>/manifest.json
//   Confirmed HTTP 200 on the live instance.
//   The response also returns the full URL directly in the "installUrl" field.
//
// VERIFIED: CORS = open (Access-Control-Allow-Origin: *) on all tested endpoints.
//
// VERIFIED: capabilities endpoint = GET /api/config
//   Returns instance-level fields (not user caps):
//   { tmdb, tvdb, fanart, rpdb, mdblist, gemini, trakt, simkl, customDescriptionBlurb,
//     addonVersion, hasBuiltInTvdb, hasBuiltInTmdb, catalogTTL, simklTrendingPageSizeOptions,
//     traktSearchEnabled }
//   No maxCatalogs / maxEnabledCatalogs field found, so no explicit catalog limit is advertised.
//
// VERIFIED: DELETE endpoint = NOT supported. Both DELETE /api/config/save and DELETE /api/config
//   return HTTP 404. Configs cannot be deleted via the API.

const DEFAULT_INSTANCE = 'https://aiometadata.viren070.me';

function normalizeBase(url) {
  return url.replace(/\/+$/, '');
}

export function createAiometadataAdapter(instanceUrl = DEFAULT_INSTANCE) {
  const base = normalizeBase(instanceUrl);
  return {
    base,

    /**
     * Fetch instance-level capabilities (API keys present, addon version, TTL, etc.).
     * No maxCatalogs field exists; the API does not advertise a catalog limit.
     * @returns {Promise<object>}
     */
    async getCapabilities() {
      const res = await fetch(`${base}/api/config`);
      if (!res.ok) throw new Error(`AIOMetadata /api/config failed: HTTP ${res.status}`);
      return res.json();
    },

    /**
     * Save a user config on the instance and return identifiers + manifest URL.
     *
     * @param {object} config AIOMetadata config object ({ language, apiKeys, catalogs, ... })
     * @param {string} password Required by the API; used to authenticate future updates (if any).
     * @returns {Promise<{ userUUID: string, password: string, manifestUrl: string, installUrl: string }>}
     */
    async createConfig(config, password) {
      if (!password) throw new Error('AIOMetadata createConfig: password is required');
      const res = await fetch(`${base}/api/config/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, config }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`AIOMetadata createConfig failed: HTTP ${res.status} ${txt.slice(0, 200)}`);
      }
      const body = await res.json();
      // Actual field names from verified response:
      const userUUID = body.userUUID;
      const installUrl = body.installUrl;
      if (!userUUID) throw new Error('AIOMetadata: no userUUID in save response');
      // installUrl is returned directly; reconstruct as fallback in case it is ever absent.
      const manifestUrl = installUrl ?? `${base}/stremio/${userUUID}/manifest.json`;
      return { userUUID, password, manifestUrl, installUrl };
    },

    /** Verify the instance is reachable (health probe). */
    async health() {
      const res = await fetch(`${base}/api/config`).catch(() => null);
      return Boolean(res && res.ok);
    },
  };
}

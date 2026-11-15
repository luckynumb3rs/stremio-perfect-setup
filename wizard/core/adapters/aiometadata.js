// AIOMetadata adapter: creates a stored user config on an instance and returns the manifest URL.
// VERIFIED 2026-05-30 against https://aiometadata.viren070.me
//
// VERIFIED: endpoint = POST /api/config/save
//   Request body: { password: string, config: { language, apiKeys, catalogs, ... } }
//   Response (HTTP 200): { success: true, userUUID: string, installUrl: string, message: string }
//   Note: "password" is a top-level field, NOT nested inside "config".
//   Note: without "password" field the API returns HTTP 400 { error: "Password is required" }.
//   Note: since AIOMetadata v3.5.0 this endpoint only creates configs. A body that contains
//   "userUUID" returns HTTP 400 ("Saving creates a new configuration; change an existing one
//   through /api/config/update/:userUUID").
//
// VERIFIED: update endpoint = PUT /api/config/update/:userUUID
//   Tested 2026-11-15 against AIOMetadata 2.14.0 and 3.9.0 (official Docker images).
//   Request body: { password: string, config: { ... } }
//   Response (HTTP 200): { success: true, userUUID: string, installUrl: string, message: string }
//   A wrong password returns HTTP 401 { error: "Invalid UUID or password" }. The UUID and the
//   manifest URL do not change. CORS preflight allows PUT.
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

function normalizeBase(url) {
  return url.replace(/\/+$/, '');
}

export function createAiometadataAdapter(instanceUrl) {
  if (!instanceUrl) throw new Error('createAiometadataAdapter: instanceUrl is required');
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
      let res;
      try {
        res = await fetch(`${base}/api/config/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, config }),
        });
      } catch (err) {
        throw new Error(`AIOMetadata at ${base} is unreachable: ${err?.message || err}. Check your internet connection or try again shortly.`);
      }
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.error || (await res.json())?.message || ''; } catch { /* ignore */ }
        if (!detail) detail = await res.text().catch(() => '');
        throw new Error(
          `AIOMetadata at ${base} rejected the configuration (HTTP ${res.status}).` +
          (detail ? ` Server said: ${String(detail).slice(0, 300)}` : '')
        );
      }
      const body = await res.json();
      const userUUID = body.userUUID;
      const installUrl = body.installUrl;
      if (!userUUID) throw new Error(`AIOMetadata at ${base}: no userUUID in the server response, the save may have failed silently.`);
      const manifestUrl = installUrl ?? `${base}/stremio/${userUUID}/manifest.json`;
      return { userUUID, password, manifestUrl, installUrl };
    },

    /** Verify the instance is reachable (health probe). */
    async health() {
      const res = await fetch(`${base}/api/config`).catch(() => null);
      return Boolean(res && res.ok);
    },

    /**
     * Update an existing config in place via PUT /api/config/update/:userUUID.
     * The server checks the password and keeps the same UUID, so the installed manifest URL
     * stays valid. Used by the Done page to attach a Trakt tokenId after install.
     *
     * @param {object} config  Full config with traktTokenId merged into apiKeys.
     * @param {string} password  The addon password set during initial save.
     * @param {string} userUUID  The existing user UUID to update.
     */
    async updateConfig(config, password, userUUID) {
      if (!password) throw new Error('AIOMetadata updateConfig: password is required');
      if (!userUUID) throw new Error('AIOMetadata updateConfig: userUUID is required');
      let res;
      try {
        res = await fetch(`${base}/api/config/update/${encodeURIComponent(userUUID)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, config }),
        });
      } catch (err) {
        throw new Error(`AIOMetadata at ${base} is unreachable: ${err?.message || err}. Check your internet connection or try again shortly.`);
      }
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.error || (await res.json())?.message || ''; } catch { /* ignore */ }
        if (!detail) detail = await res.text().catch(() => '');
        throw new Error(
          `AIOMetadata at ${base} rejected the config update (HTTP ${res.status}).` +
          (detail ? ` Server said: ${String(detail).slice(0, 300)}` : '')
        );
      }
      const body = await res.json();
      return { userUUID: body.userUUID ?? userUUID };
    },

    /**
     * Validate a Trakt tokenId returned on the AIOMetadata OAuth callback page.
     * The user copies the tokenId from the callback page and pastes it into the wizard.
     *
     * @param {string} tokenId  The UUID shown on /api/auth/trakt/callback.
     * @returns {Promise<{ provider: string, username: string, status: string }>}
     */
    async validateTokenId(tokenId) {
      if (!tokenId) throw new Error('AIOMetadata validateTokenId: tokenId is required');
      let res;
      try {
        res = await fetch(`${base}/api/oauth/token/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId }),
        });
      } catch (err) {
        throw new Error(`AIOMetadata at ${base} is unreachable: ${err?.message || err}. Check your internet connection or try again shortly.`);
      }
      if (!res.ok) {
        throw new Error(`Token ID validation failed at ${base} (HTTP ${res.status}). Please make sure you pasted the correct Token ID.`);
      }
      return res.json();
    },
  };
}

// Watchly adapter: submits a config to a Watchly instance and returns the manifest URL.
// API: POST /tokens/ with TokenRequest body → { token, manifestUrl, expiresInSeconds }
// The token equals the Stremio user_id; manifest URL is deterministic: {HOST}/{token}/manifest.json
// Stremio identity (authKey or email+password) is required for the Stremio history source.
// The Nuvio history source uses a Nuvio session and selected profile instead.
//
// The wizard currently supports Stremio and Nuvio as history sources. OAuth-based
// Trakt/Simkl sources are still outside this flow because they need an OAuth callback.

function normalizeBase(url) {
  return url.replace(/\/+$/, '');
}

export function buildWatchlyBody(defaults = {}, options = {}) {
  const {
    target = 'stremio',
    stremioAuthKey,
    nuvioAccessToken,
    nuvioRefreshToken,
    nuvioExpiresAt,
    nuvioProfileId,
    nuvioProfileName,
    tmdbApiKey,
    geminiApiKey,
    rpdbApiKey,
  } = options;

  const base = { ...defaults };
  const common = {
    ...base,
    tmdb_api_key: tmdbApiKey,
    ...(geminiApiKey ? { gemini_api_key: geminiApiKey } : {}),
    ...(rpdbApiKey ? { poster_rating: { provider: 'rpdb', api_key: rpdbApiKey } } : {}),
  };

  if (target === 'nuvio') {
    if (!nuvioAccessToken || !Number.isInteger(nuvioProfileId) || nuvioProfileId < 1 || nuvioProfileId > 6) {
      throw new Error('Watchly requires a Nuvio session and selected profile.');
    }

    const { authKey: _authKey, ...withoutStremioIdentity } = common;
    const profileName = String(nuvioProfileName || '').trim();
    return {
      ...withoutStremioIdentity,
      watch_history_source: 'nuvio',
      nuvio_access_token: nuvioAccessToken,
      nuvio_profile_id: nuvioProfileId,
      ...(nuvioRefreshToken ? { nuvio_refresh_token: nuvioRefreshToken } : {}),
      ...(Number.isFinite(nuvioExpiresAt) ? { nuvio_expires_at: nuvioExpiresAt } : {}),
      ...(profileName ? { nuvio_profile_name: profileName } : {}),
    };
  }

  if (!stremioAuthKey) {
    throw new Error('Watchly requires a Stremio identity.');
  }

  return {
    ...common,
    authKey: stremioAuthKey,
    watch_history_source: 'stremio',
  };
}

export function createWatchlyAdapter(instanceUrl) {
  if (!instanceUrl) throw new Error('createWatchlyAdapter: instanceUrl is required');
  const base = normalizeBase(instanceUrl);
  return {
    base,

    /**
     * Submit the full TokenRequest body to Watchly and return { token, manifestUrl }.
     * @param {object} body  Merged Watchly.json defaults + injected identity/keys.
     */
    async createConfig(body) {
      let res;
      try {
        res = await fetch(`${base}/tokens/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new Error(`Watchly at ${base} is unreachable: ${err?.message || err}. Check your internet connection or try again shortly.`);
      }

      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.detail || ''; } catch { /* ignore */ }
        if (!detail) detail = await res.text().catch(() => '');
        if (res.status === 400 && /stremio identity|stremio/i.test(String(detail))) {
          throw new Error('Watchly requires a valid Stremio login to set up. Please check the Stremio credentials on the Watchly page and try again.');
        }
        if (res.status === 400 && /nuvio account|nuvio/i.test(String(detail))) {
          throw new Error('Watchly requires a valid Nuvio session to use Nuvio watch history. Please go back and sign in to Nuvio again.');
        }
        throw new Error(
          `Watchly at ${base} rejected the configuration (HTTP ${res.status}).` +
          (detail ? ` Server said: ${String(detail).slice(0, 300)}` : '')
        );
      }

      const responseBody = await res.json();
      const token = responseBody.token;
      if (!token) throw new Error(`Watchly at ${base}: no token in the server response, the save may have failed silently.`);
      const manifestUrl = responseBody.manifestUrl ?? `${base}/${token}/manifest.json`;
      return { token, manifestUrl };
    },

    /** Health probe — checks the base manifest endpoint. */
    async health() {
      const res = await fetch(`${base}/manifest.json`).catch(() => null);
      return Boolean(res && res.ok);
    },
  };
}

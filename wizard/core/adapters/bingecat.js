// BingeCat adapter: talks to the public BingeCat API (https://bingecat.com/openapi.json) with an OAuth token.
// VERIFIED 2026-10-23 (docs/_internal spec section 3):
//   - OAuth: authorization code + PKCE S256, public client (no secret), token valid 7 days, CORS allows the wizard origins.
//   - Headers on every API call: Authorization: Bearer, bingecat-api-key (= client id), bingecat-api-version: 1.
//   - Writes are limited to about 1 per 3 s (429 + Retry-After, which can be 0): space them, retry on 429.
//   - PATCH /profiles/{id}/settings validates the whole body: send all sections in ONE call. Sub-profiles inherit
//     `metadata` (sending it gives 409), so it is only sent for the main profile.
//   - POST /profiles creates a normal sub-profile and is NOT idempotent: a failed create is never retried here.
//   - The wizard never deletes anything on BingeCat (this adapter has no DELETE).
// Pending from the BingeCat dev (kids profile type, addon settings, API keys, connect Stremio/Nuvio, onboarding skip,
// official AI-search URL): see the drop-in points marked `ponytail:` below.

export const BINGECAT_SCOPES = ['settings:read', 'settings:write', 'profiles:read', 'profiles:write', 'catalogs:read'];
const WRITE_GAP_MS = 3500;
const MAX_RETRIES = 4;
const HISTORY_SOURCES = ['stremio', 'nuvio'];

export class BingecatError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'BingecatError';
    this.code = code;
    this.status = status;
  }
}

function base64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Resolves a BingeCat template (API format: { section: { field: value } }) into the PATCH body.
 * Strips `$comment`, fills {{HISTORY_SOURCE}}, drops `metadata` for sub-profiles (they inherit it).
 * Throws before any request if a placeholder is unresolved.
 */
export function resolveBingecatTemplate(template, { historySource, isMain }) {
  if (!HISTORY_SOURCES.includes(historySource)) {
    throw new Error(`BingeCat history source must be one of ${HISTORY_SOURCES.join(', ')}.`);
  }
  const body = JSON.parse(JSON.stringify(template).replaceAll('{{HISTORY_SOURCE}}', historySource));
  delete body.$comment;
  if (!isMain) delete body.metadata;
  if (JSON.stringify(body).includes('{{')) {
    throw new Error('The BingeCat template has an unresolved placeholder.');
  }
  return body;
}

/** The Nuvio AI-search addon lives next to the main one: .../nuvio/manifest.json -> .../nuvio/search/manifest.json (verified). */
export function deriveSearchManifestUrl(url) {
  // ponytail: derived, not official; read the official field instead once the BingeCat dev exposes it
  if (typeof url !== 'string' || !/\/nuvio\/manifest\.json$/.test(url)) {
    throw new Error('Unexpected BingeCat Nuvio manifest URL, cannot derive the AI search addon.');
  }
  return url.replace(/\/nuvio\/manifest\.json$/, '/nuvio/search/manifest.json');
}

function describeError(status, body) {
  const code = body?.error ?? '';
  const detail = body?.message ? ` (${String(body.message).slice(0, 200)})` : '';
  if (status === 401) return ['unauthorized', 'The BingeCat connection expired or was revoked. Connect BingeCat again.'];
  if (code === 'insufficient_scope') return ['insufficient_scope', 'BingeCat access was not fully approved. Connect again and approve all permissions.'];
  if (code === 'root_account_required') return ['root_account_required', 'Only the BingeCat account owner can do this. Connect with the main account.'];
  if (code === 'profile_limit_reached') return ['profile_limit_reached', 'Your BingeCat account has reached its profile limit. Map to an existing profile instead of creating one.'];
  if (['unknown_settings', 'invalid_settings', 'metadata_settings_inherited', 'setting_rejected'].includes(code)) {
    return [code, `BingeCat rejected the settings template${detail}. The template is out of date, please report this.`];
  }
  if (status === 404) return ['not_found', 'That BingeCat profile no longer exists.'];
  if (status === 429) return ['rate_limited', 'BingeCat is rate limiting requests. Please try again in a minute.'];
  return [code || 'http_error', `BingeCat returned an error (HTTP ${status})${detail}.`];
}

/**
 * @param {object} p
 * @param {string} [p.baseUrl]   default https://bingecat.com
 * @param {string} p.clientId    OAuth client id, also sent as the bingecat-api-key header
 * @param {(ms:number)=>Promise<void>} [p.sleep]  test seam
 * @param {()=>number} [p.now]                    test seam (ms)
 */
export function createBingecatAdapter({ baseUrl = 'https://bingecat.com', clientId, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  if (!clientId) throw new Error('createBingecatAdapter: clientId is required');
  const base = baseUrl.replace(/\/+$/, '');
  let lastWriteAt = -Infinity; // ponytail: writes are awaited one after another by the caller; a real queue is needed if they ever run in parallel

  async function request(method, path, token, body) {
    const isWrite = method !== 'GET';
    for (let attempt = 0; ; attempt += 1) {
      if (isWrite) {
        const wait = lastWriteAt + WRITE_GAP_MS - now();
        if (wait > 0) await sleep(wait);
      }
      let res;
      try {
        res = await fetch(`${base}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'bingecat-api-key': clientId,
            'bingecat-api-version': '1',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        // No retry: a POST may have been processed already (create is not idempotent).
        throw new BingecatError('network', 'BingeCat could not be reached. Check your connection and try again.');
      }
      if (isWrite) lastWriteAt = now();

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        await sleep(Math.min(Math.max(retryAfter, 4), 60) * 1000);
        continue;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const [code, message] = describeError(res.status, json);
        throw new BingecatError(code, message, res.status);
      }
      return json;
    }
  }

  return {
    base,

    /** PKCE authorize URL. Keep {state, verifier} in memory and check state on the way back. */
    async buildAuthorizeUrl({ redirectUri, scopes = BINGECAT_SCOPES }) {
      const verifier = base64url(randomBytes(32));
      const challenge = base64url(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      const state = `bingecat-${base64url(randomBytes(16))}`;
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      });
      return { url: `${base}/oauth/authorize?${params}`, state, verifier };
    },

    /** Exchanges the code for a token. No client secret (public client); the refresh token is discarded (refresh needs a secret). */
    async exchangeCode({ code, verifier, redirectUri, scopes = BINGECAT_SCOPES }) {
      let res;
      try {
        res = await fetch(`${base}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'bingecat-api-key': clientId, 'bingecat-api-version': '1' },
          body: JSON.stringify({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier }),
        });
      } catch {
        throw new BingecatError('network', 'BingeCat could not be reached. Check your connection and try again.');
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.access_token) {
        throw new BingecatError('oauth_failed', 'BingeCat did not accept the sign-in. Please try connecting again.', res.status);
      }
      const granted = String(Array.isArray(json.scope) ? json.scope.join(' ') : json.scope ?? '').split(/\s+/);
      if (!scopes.every((s) => granted.includes(s))) {
        throw new BingecatError('insufficient_scope', 'BingeCat access was not fully approved. Connect again and approve all permissions.');
      }
      return { token: json.access_token, expiresAt: Math.floor(now() / 1000) + (Number(json.expires_in) || 3600) };
    },

    /** The account's profiles, merged with their settings (age cap hint) and the Nuvio profiles they are linked to. */
    async loadProfiles(token, { withNuvio = false } = {}) {
      const list = (await request('GET', '/api/v1/profiles', token))?.profiles ?? [];
      const nuvio = withNuvio ? ((await request('GET', '/api/v1/nuvio/profiles', token))?.profiles ?? []) : [];
      const profiles = [];
      for (const p of list) {
        const settings = (await request('GET', `/api/v1/profiles/${p.id}/settings`, token))?.settings ?? {};
        profiles.push({
          id: p.id,
          name: p.name,
          isMain: !!p.is_main,
          // ponytail: the API exposes no profile type yet; an age cap in recommendations/content filters is the best hint of a kids profile
          ageLimited: settings.recommendations?.max_age_certification_us != null || settings.content_filters?.max_age_certification_us != null,
          type: p.profile_type, // undefined until the dev exposes it
          boundNuvio: nuvio.filter((n) => (n.bound_profile_ids ?? []).includes(p.id)).map((n) => ({ id: n.id, name: n.name })),
          settings,
        });
      }
      return profiles;
    },

    /** Creates a NORMAL sub-profile (the API rejects profile_type/kids until the dev ships it). Never retried. */
    async createProfile(token, { name }) {
      // ponytail: send `kids`/`profile_type` here once the API accepts it
      const created = await request('POST', '/api/v1/profiles', token, { name });
      if (!created?.id) throw new BingecatError('bad_response', 'BingeCat did not return the new profile.');
      return { id: created.id, name: created.name ?? name };
    },

    /** Applies a template to a profile with ONE settings PATCH. */
    async applyTemplate(token, profileId, template, { historySource, isMain }) {
      const body = resolveBingecatTemplate(template, { historySource, isMain });
      // ponytail: add force-top false, cinemeta observe, history sync and the Gemini key to the templates once the dev exposes those settings
      const res = await request('PATCH', `/api/v1/profiles/${profileId}/settings`, token, body);
      return { appliedSections: res?.applied_sections ?? Object.keys(body) };
    },

    /** Addon manifest URL(s) of a profile; they contain a secret, never log them. */
    async getManifests(token, profileId, { surface, aiSearch = false }) {
      const res = await request('GET', `/api/v1/profiles/${profileId}/catalogs?surface=${surface}`, token);
      const url = res?.manifest?.url;
      if (!url) throw new BingecatError('bad_response', 'BingeCat did not return an addon URL for this profile.');
      return { url, ...(aiSearch && surface === 'nuvio' ? { searchUrl: deriveSearchManifestUrl(url) } : {}) };
    },
  };
}

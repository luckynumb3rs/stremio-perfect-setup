// Nuvio adapter: talks to the public Nuvio API.

const NUVIO_API_BASE = 'https://api.nuvio.tv';
const NUVIO_PUBLISHABLE_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN';
const DEFAULT_PROFILE_COLOR = '#1E88E5';

function anonHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': NUVIO_PUBLISHABLE_KEY,
  };
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'apikey': NUVIO_PUBLISHABLE_KEY,
    'Authorization': `Bearer ${token}`,
  };
}

function toProfileIndex(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const profileIndex = Math.trunc(n);
  return profileIndex >= 1 ? profileIndex : null;
}

function normalizeProfile(profile) {
  const profileIndex = toProfileIndex(profile?.profile_index ?? profile?.id);
  if (!profileIndex) return null;

  return {
    profile_index: profileIndex,
    name: String(profile?.name || '').trim() || `Profile ${profileIndex}`,
    avatar_color_hex: String(profile?.avatar_color_hex || profile?.avatarColorHex || '').trim() || DEFAULT_PROFILE_COLOR,
    avatar_id: profile?.avatar_id ?? profile?.avatarId ?? null,
    avatar_url: profile?.avatar_url ?? profile?.avatarUrl ?? null,
    uses_primary_addons: profileIndex === 1 ? false : !!(profile?.uses_primary_addons ?? profile?.usesPrimaryAddons),
    uses_primary_plugins: profileIndex === 1 ? false : !!(profile?.uses_primary_plugins ?? profile?.usesPrimaryPlugins),
  };
}

function normalizeProfiles(profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  const deduped = new Map();

  for (const profile of list) {
    const normalized = normalizeProfile(profile);
    if (!normalized || deduped.has(normalized.profile_index)) continue;
    deduped.set(normalized.profile_index, normalized);
  }

  return Array.from(deduped.values()).sort((a, b) => a.profile_index - b.profile_index);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)]));
}

function mergeJson(base, patch) {
  const merged = isPlainObject(base) ? cloneJson(base) : {};
  for (const [key, value] of Object.entries(isPlainObject(patch) ? patch : {})) {
    if (isPlainObject(value)) {
      merged[key] = mergeJson(merged[key], value);
    } else {
      merged[key] = cloneJson(value);
    }
  }
  return merged;
}

function toPlatform(platform) {
  const value = String(platform || '').trim().toLowerCase();
  return value || null;
}

export function mergeNuvioSettingsBlob(base, patch, fallbackVersion = 1) {
  const baseBlob = isPlainObject(base) ? base : {};
  const patchBlob = isPlainObject(patch) ? patch : {};
  const merged = mergeJson(baseBlob, patchBlob);

  merged.version = patchBlob.version ?? baseBlob.version ?? fallbackVersion;
  merged.features = mergeJson(baseBlob.features, patchBlob.features);
  return merged;
}

function normalizePlaceholderReplacements(replacements) {
  const entries = Object.entries(isPlainObject(replacements) ? replacements : {})
    .map(([key, value]) => [String(key).trim().toUpperCase(), String(value ?? '').trim()]);
  return Object.fromEntries(entries.filter(([key]) => key));
}

function resolveTemplateString(input, replacements, unresolved) {
  return String(input).replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/gi, (_, key) => {
    const normalizedKey = String(key).trim().toUpperCase();
    const replacement = replacements[normalizedKey];
    if (replacement === undefined || replacement === '') {
      unresolved.add(normalizedKey);
      return '';
    }
    return replacement;
  });
}

function resolveTemplateValue(value, replacements, unresolved) {
  if (typeof value === 'string') {
    return resolveTemplateString(value, replacements, unresolved);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplateValue(entry, replacements, unresolved));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, resolveTemplateValue(entry, replacements, unresolved)])
  );
}

export function resolveNuvioSettingsTemplate(template, replacements = {}) {
  const normalizedReplacements = normalizePlaceholderReplacements(replacements);
  const entries = [];
  const skipped = [];

  for (const [platformKey, blob] of Object.entries(isPlainObject(template) ? template : {})) {
    const platform = toPlatform(platformKey);
    if (!platform || !isPlainObject(blob)) continue;

    const unresolved = new Set();
    const settingsJson = resolveTemplateValue(blob, normalizedReplacements, unresolved);
    if (unresolved.size > 0) {
      skipped.push({ platform, unresolved: Array.from(unresolved).sort() });
      continue;
    }

    entries.push({
      platform,
      fallbackVersion: Number.isFinite(Number(settingsJson.version)) ? Number(settingsJson.version) : 1,
      settingsJson,
    });
  }

  return { entries, skipped };
}

function profilePayload(profile) {
  const normalized = normalizeProfile(profile);
  if (!normalized) return null;

  return {
    profile_index: normalized.profile_index,
    name: normalized.name,
    avatar_color_hex: normalized.avatar_color_hex,
    uses_primary_addons: normalized.uses_primary_addons,
    uses_primary_plugins: normalized.uses_primary_plugins,
    avatar_id: normalized.avatar_url ? null : (normalized.avatar_id || null),
    avatar_url: normalized.avatar_url || null,
  };
}

function extractScalar(body) {
  if (typeof body === 'string') return body;
  if (Array.isArray(body) && typeof body[0] === 'string') return body[0];
  return null;
}

async function readAuthError(res) {
  let detail = '';
  let code = '';

  try {
    const body = await res.clone().json();
    detail = body?.msg || body?.message || body?.error_description || body?.error?.message || body?.error || '';
    code = body?.error_code || body?.code || '';
  } catch {
    detail = await res.text().catch(() => '');
  }

  code = code || res.headers.get('x-sb-error-code') || res.headers.get('sb-error-code') || '';
  return { detail: String(detail || '').trim(), code: String(code || '').trim() };
}

async function readResponseBody(res) {
  if (res.status === 204) return null;

  const text = await res.text().catch(() => '');
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isApiKeyError(detail, code) {
  return /api key|missing_api_key|invalid_api_key|unauthorized/i.test(`${code} ${detail}`);
}

function formatAuthError(service, action, status, detail, code) {
  if (isApiKeyError(detail, code)) {
    return `${service} ${action} is temporarily unavailable because the public API key configured in the wizard is invalid. Please update the Nuvio publishable key and try again.`;
  }

  if (/already registered|already exists|duplicate/i.test(detail)) {
    return 'An account with that email already exists on Nuvio. Please sign in instead, or use a different email address.';
  }

  if (/invalid login credentials|invalid credentials|wrong password|incorrect password/i.test(detail)) {
    return 'Incorrect email or password for your Nuvio account. Please double-check and try again.';
  }

  if (/validate email address|invalid format/i.test(detail)) {
    return `Nuvio rejected that email address: ${detail}`;
  }

  if (detail) {
    return `${service} ${action} failed: ${detail}`;
  }

  return `${service} ${action} failed (HTTP ${status}). Please try again.`;
}

async function rpc(path, token, body) {
  const res = await fetch(`${NUVIO_API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Nuvio ${path} failed: HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  return readResponseBody(res);
}

async function rest(path, token, options = {}) {
  const { method = 'GET', headers = {}, body } = options;
  const res = await fetch(`${NUVIO_API_BASE}${path}`, {
    method,
    headers: {
      ...authHeaders(token),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Nuvio ${path} failed: HTTP ${res.status} ${txt.slice(0, 200)}`);
  }

  if (res.status === 204) return null;

  const text = await res.text().catch(() => '');
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createNuvioAdapter() {
  return {
    async signup(email, password) {
      let res;
      try {
        res = await fetch(`${NUVIO_API_BASE}/auth/v1/signup`, {
          method: 'POST',
          headers: anonHeaders(),
          body: JSON.stringify({ email, password }),
        });
      } catch (err) {
        throw new Error(`Could not reach the Nuvio server: ${err?.message || err}. Please check your connection and try again.`);
      }
      if (!res.ok) {
        const { detail, code } = await readAuthError(res);
        throw new Error(formatAuthError('Nuvio', 'account creation', res.status, detail, code));
      }
      const body = await readResponseBody(res);
      const payload = isPlainObject(body) ? body : {};
      if (payload.error) {
        const msg = payload.error.message || String(payload.error);
        if (/already registered|already exists|duplicate/i.test(msg)) {
          throw new Error('An account with that email already exists on Nuvio. Please sign in instead, or use a different email address.');
        }
        throw new Error(`Nuvio signup failed: ${msg}`);
      }

      if (!payload.access_token) {
        // Some successful signup responses do not include a session payload.
        return this.login(email, password);
      }

      return { token: payload.access_token, userId: payload.user?.id };
    },

    async login(email, password) {
      let res;
      try {
        res = await fetch(`${NUVIO_API_BASE}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: anonHeaders(),
          body: JSON.stringify({ email, password }),
        });
      } catch (err) {
        throw new Error(`Could not reach the Nuvio server: ${err?.message || err}. Please check your connection and try again.`);
      }
      if (!res.ok) {
        const { detail, code } = await readAuthError(res);
        throw new Error(formatAuthError('Nuvio', 'sign-in', res.status, detail, code));
      }
      const body = await readResponseBody(res);
      const payload = isPlainObject(body) ? body : {};
      if (payload.error) {
        const msg = payload.error.message || String(payload.error);
        if (/invalid|wrong|password|credential/i.test(msg)) {
          throw new Error('Incorrect email or password for your Nuvio account. Please double-check and try again.');
        }
        throw new Error(`Nuvio sign-in failed: ${msg}`);
      }
      if (!payload.access_token) {
        throw new Error('Nuvio sign-in succeeded but did not return an access token. Please try again.');
      }
      return { token: payload.access_token, userId: payload.user?.id };
    },

    async getProfiles(token) {
      const data = await rpc('/rest/v1/rpc/sync_pull_profiles', token, {});
      return normalizeProfiles(Array.isArray(data) ? data : (data?.profiles || []));
    },

    async saveProfiles(token, profiles) {
      const payload = normalizeProfiles(profiles).map(profilePayload).filter(Boolean);
      await rpc('/rest/v1/rpc/sync_push_profiles', token, { p_profiles: payload });
      return normalizeProfiles(payload);
    },

    async createProfile(token, { name }) {
      const profiles = await this.getProfiles(token);
      const usedIndexes = new Set(profiles.map((profile) => profile.profile_index));
      let profileIndex = 1;

      while (usedIndexes.has(profileIndex)) {
        profileIndex += 1;
      }

      const profile = normalizeProfile({
        profile_index: profileIndex,
        name,
        avatar_color_hex: DEFAULT_PROFILE_COLOR,
        uses_primary_addons: false,
        uses_primary_plugins: false,
        avatar_id: null,
        avatar_url: null,
      });

      await this.saveProfiles(token, [...profiles, profile]);
      return profile;
    },

    async updateProfile(token, profileIndex, updates) {
      const normalizedProfileIndex = toProfileIndex(profileIndex);
      if (!normalizedProfileIndex) {
        throw new Error('Nuvio updateProfile failed: invalid profile id.');
      }

      const profiles = await this.getProfiles(token);
      const index = profiles.findIndex((profile) => profile.profile_index === normalizedProfileIndex);
      if (index < 0) {
        throw new Error(`Nuvio profile ${normalizedProfileIndex} was not found on this account.`);
      }

      const nextProfile = normalizeProfile({
        ...profiles[index],
        ...updates,
        profile_index: normalizedProfileIndex,
      });

      const nextProfiles = [...profiles];
      nextProfiles[index] = nextProfile;
      await this.saveProfiles(token, nextProfiles);
      return nextProfile;
    },

    async getProfileSettings(token, profileIndex, platform) {
      const normalizedProfileIndex = toProfileIndex(profileIndex);
      const normalizedPlatform = toPlatform(platform);
      if (!normalizedProfileIndex) {
        throw new Error('Nuvio getProfileSettings failed: invalid profile id.');
      }
      if (!normalizedPlatform) {
        throw new Error('Nuvio getProfileSettings failed: invalid platform.');
      }

      const data = await rpc('/rest/v1/rpc/sync_pull_profile_settings_blob', token, {
        p_profile_id: normalizedProfileIndex,
        p_platform: normalizedPlatform,
      });
      const rows = Array.isArray(data) ? data : (data ? [data] : []);
      const row = rows[0] || {};

      return {
        profileId: toProfileIndex(row.profile_id) || normalizedProfileIndex,
        platform: normalizedPlatform,
        settingsJson: isPlainObject(row.settings_json) ? row.settings_json : {},
        updatedAt: row.updated_at || null,
      };
    },

    async pushProfileSettings(token, profileIndex, platform, settingsJson) {
      const normalizedProfileIndex = toProfileIndex(profileIndex);
      const normalizedPlatform = toPlatform(platform);
      if (!normalizedProfileIndex) {
        throw new Error('Nuvio pushProfileSettings failed: invalid profile id.');
      }
      if (!normalizedPlatform) {
        throw new Error('Nuvio pushProfileSettings failed: invalid platform.');
      }

      const payload = isPlainObject(settingsJson) ? settingsJson : {};
      await rpc('/rest/v1/rpc/sync_push_profile_settings_blob', token, {
        p_profile_id: normalizedProfileIndex,
        p_platform: normalizedPlatform,
        p_settings_json: payload,
      });

      return {
        profileId: normalizedProfileIndex,
        platform: normalizedPlatform,
        settingsJson: payload,
      };
    },

    async getSyncOwner(token) {
      const data = await rpc('/rest/v1/rpc/get_sync_owner', token, {});
      const ownerId = extractScalar(data);
      if (!ownerId) {
        throw new Error('Nuvio get_sync_owner failed: could not resolve sync owner.');
      }
      return ownerId;
    },

    async listAddons(token, profileId) {
      const ownerId = await this.getSyncOwner(token);
      const query = new URLSearchParams({
        select: '*',
        user_id: `eq.${ownerId}`,
        profile_id: `eq.${String(profileId)}`,
        order: 'sort_order.asc,created_at.asc',
      });
      const data = await rest(`/rest/v1/addons?${query.toString()}`, token);
      return Array.isArray(data) ? data : [];
    },

    async clearAddons(token, profileId) {
      const addons = await this.listAddons(token, profileId);
      await Promise.all(addons.map((addon) => {
        const query = new URLSearchParams({
          id: `eq.${String(addon.id)}`,
          profile_id: `eq.${String(profileId)}`,
        });
        return rest(`/rest/v1/addons?${query.toString()}`, token, { method: 'DELETE' });
      }));
    },

    async addAddon(token, profileId, addon) {
      const ownerId = await this.getSyncOwner(token);
      return rest('/rest/v1/addons', token, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: [{
          user_id: ownerId,
          profile_id: profileId,
          url: addon.url,
          name: addon.name || '',
          enabled: addon.enabled !== false,
          sort_order: typeof addon.sort_order === 'number' ? addon.sort_order : 0,
        }],
      });
    },

    async replaceAddons(token, profileId, addons) {
      await this.clearAddons(token, profileId);
      for (const [index, addon] of addons.entries()) {
        await this.addAddon(token, profileId, {
          ...addon,
          sort_order: typeof addon.sort_order === 'number' ? addon.sort_order : index,
        });
      }
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
      const rows = Array.isArray(data) ? data : [];
      return rows.length > 0 ? (rows[0].collections_json ?? []) : [];
    },
  };
}

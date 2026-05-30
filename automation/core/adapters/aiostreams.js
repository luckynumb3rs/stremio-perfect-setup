// AIOStreams adapter — creates a stored user config on an instance and returns the manifest URL.
// Contract confirmed from Viren070/AIOStreams (see API-NOTES.md §2). CORS is open (`*`).

import { resolveTemplate } from '../template-engine.js';

const API_VERSION = 'v1';

function normalizeBase(instanceUrl) {
  return instanceUrl.replace(/\/+$/, '');
}

export function createAioStreamsAdapter(instanceUrl) {
  const base = normalizeBase(instanceUrl);
  return {
    base,
    /**
     * Resolve the repo template with the user's inputs + credentials, store it, return identifiers.
     * @returns {Promise<{uuid, encryptedPassword, manifestUrl, password}>}
     */
    async createConfig({ template, inputs, services, credentials, password, addonPassword }) {
      const config = resolveTemplate(template, { inputs, services, credentials });
      const headers = { 'content-type': 'application/json' };
      if (addonPassword) headers['x-aiostreams-addon-password'] = addonPassword;

      const res = await fetch(`${base}/api/${API_VERSION}/user`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ config, password }),
      });
      if (res.status !== 201) {
        const text = await res.text().catch(() => '');
        throw new Error(`AIOStreams createConfig failed: HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      const body = await res.json();
      const data = body.data || body;
      const { uuid, encryptedPassword } = data;
      if (!uuid || !encryptedPassword) throw new Error('AIOStreams: missing uuid/encryptedPassword in response');
      return {
        uuid,
        encryptedPassword,
        password,
        manifestUrl: `${base}/stremio/${uuid}/${encryptedPassword}/manifest.json`,
      };
    },

    /** Verify an instance is reachable + lists templates (health probe). */
    async health() {
      const res = await fetch(`${base}/api/${API_VERSION}/health`).catch(() => null);
      return Boolean(res && res.ok);
    },
  };
}

// Create the same config across primary + fallback instances (AIOManager-style redundancy).
export async function createWithFallbacks(instances, params) {
  const results = [];
  for (const instanceUrl of instances) {
    try {
      const adapter = createAioStreamsAdapter(instanceUrl);
      results.push({ instanceUrl, ok: true, ...(await adapter.createConfig(params)) });
    } catch (err) {
      results.push({ instanceUrl, ok: false, error: String(err.message || err) });
    }
  }
  const primary = results.find((r) => r.ok);
  if (!primary) throw new Error(`All AIOStreams instances failed: ${results.map((r) => r.error).join('; ')}`);
  return { primary, all: results };
}

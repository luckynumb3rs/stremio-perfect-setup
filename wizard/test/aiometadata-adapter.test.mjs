import { createAiometadataAdapter } from '../core/adapters/aiometadata.js';

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}

console.log('\n# AIOMetadata adapter — updateConfig');

// In-memory AIOMetadata (v3.5.0+): save only creates configs, update needs the UUID and its password.
function createFakeAiometadata() {
  const configs = new Map();
  let nextId = 1;
  const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  });
  const installUrl = (userUUID) => `https://aiometadata.example/stremio/${userUUID}/manifest.json`;
  async function fetch(url, opts = {}) {
    const { pathname } = new URL(url);
    const method = (opts.method || 'GET').toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};
    if (method === 'POST' && pathname === '/api/config/save') {
      if (!body.password) return reply(400, { error: 'Password is required' });
      if (body.userUUID) return reply(400, { error: 'Saving creates a new configuration; change an existing one through /api/config/update/:userUUID' });
      const userUUID = `uuid-${nextId++}`;
      configs.set(userUUID, { password: body.password, config: body.config });
      return reply(200, { success: true, userUUID, installUrl: installUrl(userUUID), message: 'Configuration saved successfully' });
    }
    const update = pathname.match(/^\/api\/config\/update\/([^/]+)$/);
    if (method === 'PUT' && update) {
      const userUUID = decodeURIComponent(update[1]);
      if (!body.password) return reply(400, { error: 'Password is required' });
      if (!body.config) return reply(400, { error: 'Configuration data is required' });
      const stored = configs.get(userUUID);
      if (!stored || stored.password !== body.password) return reply(401, { error: 'Invalid UUID or password' });
      stored.config = body.config;
      return reply(200, { success: true, userUUID, installUrl: installUrl(userUUID), message: 'Configuration updated successfully' });
    }
    return reply(404, { error: 'Not found' });
  }
  return { configs, fetch };
}

// Attaching a Trakt token on the Done page updates the installed config in place.
{
  const originalFetch = globalThis.fetch;
  const server = createFakeAiometadata();
  globalThis.fetch = server.fetch;
  try {
    const adapter = createAiometadataAdapter('https://aiometadata.example');
    const config = { language: 'en-US', apiKeys: { tmdb: 'k' } };
    const created = await adapter.createConfig(config, 'pass123');
    let result = null;
    let error = null;
    try {
      result = await adapter.updateConfig({ ...config, apiKeys: { ...config.apiKeys, traktTokenId: 'tok-1' } }, 'pass123', created.userUUID);
    } catch (err) { error = err; }
    ok('updateConfig succeeds on an instance where save only creates configs', error === null, error?.message);
    ok('updateConfig keeps the UUID so the installed manifest URL stays valid', result?.userUUID === created.userUUID, JSON.stringify(result));
    ok('the existing config now holds the Trakt token', server.configs.get(created.userUUID)?.config?.apiKeys?.traktTokenId === 'tok-1');
    ok('no second config is created on the instance', server.configs.size === 1, `configs: ${server.configs.size}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// A wrong password is reported to the caller and the stored config stays unchanged.
{
  const originalFetch = globalThis.fetch;
  const server = createFakeAiometadata();
  globalThis.fetch = server.fetch;
  try {
    const adapter = createAiometadataAdapter('https://aiometadata.example');
    const created = await adapter.createConfig({ language: 'en-US', apiKeys: { tmdb: 'k' } }, 'pass123');
    let thrown = null;
    try {
      await adapter.updateConfig({ language: 'en-US', apiKeys: { tmdb: 'k', traktTokenId: 'tok-1' } }, 'wrong-pass', created.userUUID);
    } catch (err) { thrown = err; }
    ok('updateConfig fails when the password does not match', thrown instanceof Error);
    ok('a rejected update leaves the stored config unchanged', server.configs.get(created.userUUID)?.config?.apiKeys?.traktTokenId === undefined);
    ok('a rejected update does not create a new config', server.configs.size === 1, `configs: ${server.configs.size}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// updateConfig throws when password missing
{
  const adapter = createAiometadataAdapter('https://aiometadata.example');
  let thrown = null;
  try { await adapter.updateConfig({}, '', 'uuid'); } catch (err) { thrown = err; }
  ok('updateConfig throws when password is empty', thrown instanceof Error && thrown.message.includes('password is required'));
}

// updateConfig throws when userUUID missing
{
  const adapter = createAiometadataAdapter('https://aiometadata.example');
  let thrown = null;
  try { await adapter.updateConfig({}, 'pass', ''); } catch (err) { thrown = err; }
  ok('updateConfig throws when userUUID is empty', thrown instanceof Error && thrown.message.includes('userUUID is required'));
}

console.log('\n# AIOMetadata adapter — validateTokenId');

// validateTokenId POSTs to /api/oauth/token/info
{
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    ok('validateTokenId POSTs to /api/oauth/token/info', url.endsWith('/api/oauth/token/info'), url);
    return { ok: true, status: 200, async json() { return { provider: 'trakt', username: 'user1', status: 'valid' }; } };
  };
  try {
    const adapter = createAiometadataAdapter('https://aiometadata.example');
    const result = await adapter.validateTokenId('tok-id-xyz');
    ok('validateTokenId sends tokenId in body', capturedBody?.tokenId === 'tok-id-xyz');
    ok('validateTokenId returns provider from response', result.provider === 'trakt');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// validateTokenId throws on non-200
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try {
    const adapter = createAiometadataAdapter('https://aiometadata.example');
    let thrown = null;
    try { await adapter.validateTokenId('bad-id'); } catch (err) { thrown = err; }
    ok('validateTokenId throws on 404 with paste guidance',
      thrown instanceof Error && thrown.message.includes('pasted the correct Token ID'),
      thrown instanceof Error ? thrown.message : String(thrown));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// validateTokenId throws when tokenId missing
{
  const adapter = createAiometadataAdapter('https://aiometadata.example');
  let thrown = null;
  try { await adapter.validateTokenId(''); } catch (err) { thrown = err; }
  ok('validateTokenId throws when tokenId is empty', thrown instanceof Error && thrown.message.includes('tokenId is required'));
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

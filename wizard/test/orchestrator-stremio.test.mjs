import { runStremioSetup } from '../core/orchestrator.js';

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`);

const CINEMETA = 'https://v3-cinemeta.strem.io/manifest.json';
const cinemetaManifest = {
  id: 'com.linvo.cinemeta', name: 'Cinemeta', version: '3', resources: ['catalog', 'meta', 'addon_catalog'], types: ['movie', 'series'],
  catalogs: [{ type: 'movie', id: 'top', extra: [{ name: 'genre' }, { name: 'search' }] }],
};

/** Mocks api.strem.io, the manifest fetches and the three config services. */
function mockNetwork({ existing = [] } = {}) {
  const log = { aiostreams: 0, aiometadata: 0, watchly: 0, set: null, getCalls: 0 };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (u.startsWith('https://api.strem.io/api/')) {
      const method = u.split('/api/')[1];
      const body = JSON.parse(init.body);
      if (method === 'addonCollectionGet') return json(200, { result: { addons: existing } });
      if (method === 'addonCollectionSet') { log.set = body.addons; return json(200, { result: { success: true } }); }
      throw new Error(`unexpected Stremio method ${method}`);
    }
    if (u.endsWith('/api/v1/user')) { log.aiostreams++; return json(201, { data: { uuid: 'aios', encryptedPassword: 'enc' } }); }
    if (u.endsWith('/api/config/save')) { log.aiometadata++; return json(200, { success: true, userUUID: 'meta', installUrl: 'https://meta.example/stremio/meta/manifest.json' }); }
    if (u.endsWith('/tokens/')) { log.watchly++; return json(200, { token: 'wt', manifestUrl: 'https://watchly.example/wt/manifest.json' }); }
    if (u.endsWith('manifest.json')) {
      return json(200, u === CINEMETA ? cinemetaManifest : { id: `id:${u}`, name: u, version: '1', resources: ['catalog', 'stream'], types: ['movie'], catalogs: [] });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { log, restore: () => { globalThis.fetch = original; } };
}

function makeBingecat({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    token: 'bc-token',
    mainProfileId: 100,
    targets: { 0: 'new' },
    templates: { standard: { kind: 'std', search: { search_enabled: false } }, kids: { kind: 'kids', search: { search_enabled: true } } },
    adapter: {
      async createProfile(_t, { name, kids }) { calls.push(`create:${name}:${kids ? 'kids' : 'std'}`); return { id: 300, name }; },
      async applyTemplate(_t, id, template, { historySource, isMain }) { calls.push(`apply:${id}:${template.kind}:${historySource}:${isMain ? 'main' : 'sub'}`); if (fail) throw new Error('apply boom'); return {}; },
      async getManifests(_t, id, { surface, aiSearch }) { calls.push(`manifests:${id}:${surface}:${aiSearch ? 'search' : 'plain'}`); return { url: `https://bc.example/${id}/manifest.json` }; },
    },
  };
}

const args = (extra = {}) => ({
  instances: { aiostreams: ['https://aios.example'], aiometadata: ['https://meta.example'], watchly: ['https://watchly.example'] },
  account: { mode: 'signin', email: 'a@b.c', password: 'pass-word-123', authKey: 'ak' },
  aiostreamsParams: { template: { config: { services: [] }, metadata: { inputs: [] } }, inputs: {}, services: [], credentials: {}, serviceCredentials: {} },
  aiometadataParams: {
    baseTemplate: { config: { catalogs: [], language: 'en-US' } }, enabledCategories: new Set(), enabledDiscoverFolderIds: new Set(),
    categoryOrder: [], discoverFolderOrder: [], collections: [], categoryExceptions: [], apiKeys: { tmdb: 'K', tmdbAccess: 'A', tvdb: 'V', gemini: '', rpdb: '' }, language: 'en-US',
  },
  watchlyBody: { watch_history_source: 'stremio' },
  proxyBase: '',
  ...extra,
});
const urls = (log) => log.set.map((a) => a.transportUrl);

console.log('\n# Stremio without BingeCat keeps the old order');
{
  const net = mockNetwork();
  try { await runStremioSetup(args()); } finally { net.restore(); }
  eq('Cinemeta, Watchly, AIOMetadata, AIOStreams', urls(net.log).map((u) => u.replace(/^https:\/\/([^/]+).*/, '$1')), ['v3-cinemeta.strem.io', 'watchly.example', 'meta.example', 'aios.example']);
}

console.log('\n# Stremio Standard with BingeCat');
{
  const net = mockNetwork();
  const bc = makeBingecat();
  let result;
  try { result = await runStremioSetup(args({ bingecat: bc })); } finally { net.restore(); }
  eq('order: Cinemeta, Watchly, BingeCat, AIOMetadata, AIOStreams', urls(net.log).map((u) => u.replace(/^https:\/\/([^/]+).*/, '$1')), ['v3-cinemeta.strem.io', 'watchly.example', 'bc.example', 'meta.example', 'aios.example']);
  eq('BingeCat: new sub-profile named Stremio, standard template, stremio history, stremio manifest', bc.calls, ['create:Stremio:std', 'apply:300:std:stremio:sub', 'manifests:300:stremio:plain']);
  eq('summary carries the BingeCat profile', [result.addons.bingecat.profileId, result.addons.bingecat.created], [300, true]);
}

console.log('\n# Stremio Kids');
{
  const net = mockNetwork();
  const bc = makeBingecat();
  try { await runStremioSetup(args({ kids: true, bingecat: bc })); } finally { net.restore(); }
  eq('order: Cinemeta, BingeCat, AIOStreams (no Watchly, no AIOMetadata)', urls(net.log).map((u) => u.replace(/^https:\/\/([^/]+).*/, '$1')), ['v3-cinemeta.strem.io', 'bc.example', 'aios.example']);
  eq('no AIOMetadata or Watchly config was created', [net.log.aiometadata, net.log.watchly, net.log.aiostreams], [0, 0, 1]);
  eq('Kids template, profile named Kids', bc.calls[0] + ' ' + bc.calls[1], 'create:Kids:kids apply:300:kids:stremio:sub');
  const cinemeta = net.log.set[0].manifest;
  eq('Cinemeta lost search catalogs, all catalogs and its meta resource', [cinemeta.catalogs, cinemeta.resources.includes('meta')], [[], false]);
}

console.log('\n# Stremio guards');
{
  const net = mockNetwork();
  let threw = null;
  try { await runStremioSetup(args({ kids: true })); } catch (e) { threw = e; } finally { net.restore(); }
  ok('Kids without BingeCat throws before any request', /needs BingeCat/.test(threw?.message ?? '') && net.log.set === null && net.log.aiostreams === 0);

  const net2 = mockNetwork();
  const bad = makeBingecat({ fail: true });
  threw = null;
  try { await runStremioSetup(args({ bingecat: bad })); } catch (e) { threw = e; } finally { net2.restore(); }
  ok('a BingeCat failure aborts before the Stremio collection is written', /apply boom/.test(threw?.message ?? '') && net2.log.set === null);

  const net3 = mockNetwork();
  threw = null;
  try { await runStremioSetup(args({ bingecat: { ...makeBingecat(), token: '' } })); } catch (e) { threw = e; } finally { net3.restore(); }
  ok('BingeCat without a token throws', /not connected/.test(threw?.message ?? '') && net3.log.set === null);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

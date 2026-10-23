import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runNuvioSetup } from '../core/orchestrator.js';
import { defaultEnabledCategories } from '../core/catalog-config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (name) => JSON.parse(readFileSync(join(root, 'templates', name), 'utf8'));
const metaTemplate = readJson('AIOMetadata-All.json');
const collections = readJson('Nuvio-Collections.json');
const settingsTemplate = readJson('Nuvio-Settings.json');
const watchlyDefaults = readJson('Watchly.json');

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`);

const ORIGINAL = {
  1: [{ name: 'Old A', url: 'https://old.example/a/manifest.json' }],
  2: [{ name: 'Own B', url: 'https://old.example/b/manifest.json' }], // never read: profile 2 uses primary addons
  3: [{ name: 'Old C', url: 'https://old.example/c/manifest.json' }],
};

/** In-memory Nuvio with call log. `fail` is a set of `method:profileIndex` strings that throw. */
function makeNuvio(fail = new Set()) {
  const calls = [];
  const pushed = new Map(); // profile index -> collections pushed
  const addons = new Map(Object.entries(ORIGINAL).map(([k, v]) => [Number(k), v]));
  const profiles = [
    { profile_index: 1, name: 'Ben', uses_primary_addons: false },
    { profile_index: 2, name: 'Benci', uses_primary_addons: true },
    { profile_index: 3, name: 'Bini', uses_primary_addons: false },
  ];
  const log = (method, idx, extra) => {
    calls.push(`${method}:${idx}`);
    if (fail.has(`${method}:${idx}`)) throw new Error(`${method} ${idx} boom`);
    return extra;
  };
  return {
    calls,
    pushed,
    addons,
    profiles,
    async login() { calls.push('login'); return { token: 'fresh-token', refreshToken: 'fresh-refresh', expiresAt: Math.floor(Date.now() / 1000) + 3600 }; },
    async signup() { calls.push('signup'); throw new Error('signup must not be called'); },
    async getProfiles() { calls.push('getProfiles'); return profiles.map((p) => ({ ...p })); },
    async listAddons(_t, idx) { log('listAddons', idx); return addons.get(idx) ?? []; },
    async updateProfile(_t, idx, updates) { log('updateProfile', idx); Object.assign(profiles.find((p) => p.profile_index === idx), updates); },
    async replaceAddons(_t, idx, list) { log('replaceAddons', idx); addons.set(idx, list); },
    async pushCollections(_t, idx, collections) { log('pushCollections', idx); pushed.set(idx, collections); },
    async getProfileSettings(_t, idx, platform) { log(`getSettings-${platform}`, idx); return { settingsJson: {} }; },
    async pushProfileSettings(_t, idx, platform) { log(`pushSettings-${platform}`, idx); },
  };
}

/** Mocks the three config services. `watchlyFail` is a set of Nuvio profile ids whose Watchly call returns 500. */
function mockServices({ watchlyFail = new Set(), aiostreamsFail = false } = {}) {
  const posts = { aiostreams: 0, aiometadata: 0, watchly: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (u.endsWith('/api/v1/user')) {
      posts.aiostreams++;
      if (aiostreamsFail) return json(500, { error: { message: 'down' } });
      return json(201, { data: { uuid: 'aios-uuid', encryptedPassword: 'aios-enc' } });
    }
    if (u.endsWith('/api/config/save')) {
      posts.aiometadata++;
      return json(200, { success: true, userUUID: 'meta-uuid', installUrl: 'https://meta.example/stremio/meta-uuid/manifest.json' });
    }
    if (u.endsWith('/tokens/')) {
      const body = JSON.parse(init.body);
      posts.watchly.push(body);
      if (watchlyFail.has(body.nuvio_profile_id)) return json(500, { detail: 'nope' });
      return json(200, { token: `w-${body.nuvio_profile_id}`, manifestUrl: `https://watchly.example/w-${body.nuvio_profile_id}/manifest.json` });
    }
    throw new Error(`Unexpected fetch ${u}`);
  };
  return { posts, restore: () => { globalThis.fetch = original; } };
}

const defaults = defaultEnabledCategories(metaTemplate.config.catalogs, 'nuvio', collections, []);
function baseArgs(nuvio, extra = {}) {
  return {
    instances: { aiostreams: ['https://aios.example'], aiometadata: ['https://meta.example'], watchly: ['https://watchly.example'] },
    account: { mode: 'signin', email: 'a@b.c', password: 'pass-word-123', authToken: 'session-token', authRefreshToken: 'session-refresh', authExpiresAt: Math.floor(Date.now() / 1000) + 3600 },
    profiles: [{ nuvioProfileId: 1, name: 'Ben', kids: false }],
    aiostreamsParams: { template: { config: { services: [] }, metadata: { inputs: [] } }, inputs: {}, services: [], credentials: {}, serviceCredentials: {} },
    aiometadataParams: {
      baseTemplate: metaTemplate,
      enabledCategories: defaults.categories,
      enabledDiscoverFolderIds: defaults.discoverFolderIds,
      categoryOrder: [],
      discoverFolderOrder: [],
      collections,
      categoryExceptions: [],
      apiKeys: { tmdb: 'K', tmdbAccess: 'A', tvdb: 'V', gemini: '', rpdb: '' },
      language: 'en-US',
    },
    watchly: { defaults: watchlyDefaults, tmdbApiKey: 'K', geminiApiKey: '', rpdbApiKey: '' },
    collectionsJson: collections,
    nuvioSettingsTemplate: settingsTemplate,
    proxyBase: '',
    nuvio,
    ...extra,
  };
}
const writes = (nuvio, idx) => nuvio.calls.filter((c) => c === `replaceAddons:${idx}`).length;

console.log('\n# single profile keeps the old behaviour');
{
  const nuvio = makeNuvio();
  const svc = mockServices();
  let result;
  try { result = await runNuvioSetup(baseArgs(nuvio)); } finally { svc.restore(); }
  const [p] = result.profiles;
  eq('one profile, done', [result.profiles.length, p.status, p.error], [1, 'done', null]);
  eq('addon order: Watchly, AIOMetadata, AIOStreams',
    nuvio.addons.get(1).map((a) => [a.name, a.sort_order]), [['Watchly', 0], ['AIOMetadata', 1], ['AIOStreams', 2]]);
  eq('backup is the original addon list', p.previousAddons, [{ name: 'Old A', manifestUrl: 'https://old.example/a/manifest.json' }]);
  ok('collections and both settings platforms pushed', nuvio.calls.includes('pushCollections:1') && nuvio.calls.some((c) => c.startsWith('pushSettings-')));
  const w = svc.posts.watchly[0];
  eq('Watchly body carries profile id, name and session', [w.nuvio_profile_id, w.nuvio_profile_name, w.nuvio_access_token, w.watch_history_source], [1, 'Ben', 'session-token', 'nuvio']);
  ok('fresh session token is reused (no login)', !nuvio.calls.includes('login'));
  eq('shared configs created once', [svc.posts.aiostreams, svc.posts.aiometadata], [1, 1]);
}

console.log('\n# two profiles share the configs; Watchly and backups are per profile');
{
  const nuvio = makeNuvio();
  const svc = mockServices();
  let result;
  try {
    result = await runNuvioSetup(baseArgs(nuvio, { profiles: [{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 2, name: 'Benci', kids: false }] }));
  } finally { svc.restore(); }
  eq('both done', result.profiles.map((p) => p.status), ['done', 'done']);
  eq('one AIOStreams and one AIOMetadata config', [svc.posts.aiostreams, svc.posts.aiometadata], [1, 1]);
  eq('one Watchly config per profile', svc.posts.watchly.map((b) => b.nuvio_profile_id), [1, 2]);
  ok('distinct Watchly manifests', result.profiles[0].watchly.manifestUrl !== result.profiles[1].watchly.manifestUrl);
  eq('profile 2 (uses primary addons) is backed up from profile 1\'s ORIGINAL list',
    result.profiles[1].previousAddons, [{ name: 'Old A', manifestUrl: 'https://old.example/a/manifest.json' }]);
  ok('all backups are read before the first write', nuvio.calls.includes('listAddons:1') && nuvio.calls.lastIndexOf('listAddons:1') < nuvio.calls.indexOf('replaceAddons:1'));
  ok('profile 2 is detached before its addons are replaced', nuvio.calls.indexOf('updateProfile:2') > -1 && nuvio.calls.indexOf('updateProfile:2') < nuvio.calls.indexOf('replaceAddons:2'));
  ok('profile 2 no longer uses primary addons', nuvio.profiles[1].uses_primary_addons === false);
  ok('profile 1 is written before profile 2 (sequential)', nuvio.calls.indexOf('replaceAddons:1') < nuvio.calls.indexOf('updateProfile:2'));
}

console.log('\n# a write failure on profile 2 does not undo profile 1; Retry redoes only profile 2');
{
  const targets = [{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 2, name: 'Benci', kids: false }];
  const nuvio = makeNuvio(new Set(['replaceAddons:2']));
  let svc = mockServices();
  let first;
  try { first = await runNuvioSetup(baseArgs(nuvio, { profiles: targets })); } finally { svc.restore(); }
  eq('does not throw; [done, failed]', first.profiles.map((p) => p.status), ['done', 'failed']);
  ok('failed profile carries the error', /replaceAddons 2 boom/.test(first.profiles[1].error ?? ''));
  ok('profile 1 keeps its new addons', nuvio.addons.get(1).length === 3);

  // retry: the failure is gone
  const nuvio2 = makeNuvio();
  nuvio2.addons.set(1, nuvio.addons.get(1)); // profile 1 already replaced
  nuvio2.profiles[1].uses_primary_addons = false; // detached by the failed run
  svc = mockServices();
  let second;
  try { second = await runNuvioSetup(baseArgs(nuvio2, { profiles: targets, retry: first })); } finally { svc.restore(); }
  eq('after retry both done', second.profiles.map((p) => p.status), ['done', 'done']);
  eq('no new shared configs on retry', [svc.posts.aiostreams, svc.posts.aiometadata], [0, 0]);
  eq('only profile 2 gets a new Watchly config', svc.posts.watchly.map((b) => b.nuvio_profile_id), [2]);
  eq('only profile 2 is written', [writes(nuvio2, 1), writes(nuvio2, 2)], [0, 1]);
  ok('no addon list is re-read (first backups are kept)', !nuvio2.calls.some((c) => c.startsWith('listAddons')));
  eq('profile 2 keeps the backup from the first run', second.profiles[1].previousAddons, first.profiles[1].previousAddons);
  eq('shared configs come from the first run', second.addons, first.addons);
}

console.log('\n# Watchly failure keeps that profile untouched');
{
  const nuvio = makeNuvio();
  const svc = mockServices({ watchlyFail: new Set([3]) });
  let result;
  try {
    result = await runNuvioSetup(baseArgs(nuvio, { profiles: [{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 3, name: 'Bini', kids: false }] }));
  } finally { svc.restore(); }
  eq('[done, failed]', result.profiles.map((p) => p.status), ['done', 'failed']);
  eq('profile 3 never written', writes(nuvio, 3), 0);
  eq('profile 3 addons unchanged', nuvio.addons.get(3), ORIGINAL[3]);
}

console.log('\n# backup read failure keeps that profile untouched');
{
  const nuvio = makeNuvio(new Set(['listAddons:3']));
  const svc = mockServices();
  let result;
  try {
    result = await runNuvioSetup(baseArgs(nuvio, { profiles: [{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 3, name: 'Bini', kids: false }] }));
  } finally { svc.restore(); }
  eq('[done, failed]', result.profiles.map((p) => p.status), ['done', 'failed']);
  eq('profile 3 never written', [writes(nuvio, 3), nuvio.calls.includes('updateProfile:3')], [0, false]);
  eq('no Watchly config was made for profile 3', svc.posts.watchly.map((b) => b.nuvio_profile_id), [1]);
}

console.log('\n# a stale session is replaced by a fresh sign-in');
{
  const nuvio = makeNuvio();
  const svc = mockServices();
  try {
    await runNuvioSetup(baseArgs(nuvio, { account: { mode: 'signin', email: 'a@b.c', password: 'pass-word-123', authToken: 'old-token', authExpiresAt: Math.floor(Date.now() / 1000) + 60 } }));
  } finally { svc.restore(); }
  ok('login was called', nuvio.calls.includes('login'));
  eq('Watchly got the fresh token', svc.posts.watchly[0].nuvio_access_token, 'fresh-token');
}

console.log('\n# invalid profile selections fail before any call');
{
  for (const [label, profiles] of [['empty list', []], ['id 7', [{ nuvioProfileId: 7, name: 'x', kids: false }]], ['unsaved new profile', [{ nuvioProfileId: 'new', name: 'x', kids: false }]], ['duplicate id', [{ nuvioProfileId: 1, name: 'a', kids: false }, { nuvioProfileId: 1, name: 'b', kids: false }]]]) {
    const nuvio = makeNuvio();
    const svc = mockServices();
    let threw = false;
    try { await runNuvioSetup(baseArgs(nuvio, { profiles })); } catch { threw = true; } finally { svc.restore(); }
    ok(`${label}: throws without touching Nuvio`, threw && nuvio.calls.length === 0);
  }
}


console.log('\n# retry of a primary-addons profile that failed before its detach');
{
  const targets = [{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 2, name: 'Benci', kids: false }];
  const nuvio = makeNuvio();
  let svc = mockServices({ watchlyFail: new Set([2]) });
  let first;
  try { first = await runNuvioSetup(baseArgs(nuvio, { profiles: targets })); } finally { svc.restore(); }
  eq('profile 2 failed on Watchly, still primary', [first.profiles[1].status, nuvio.profiles[1].uses_primary_addons], ['failed', true]);
  const live1 = nuvio.addons.get(1); // profile 1 now holds the wizard's addons
  eq('profile 2 backup is profile 1\'s original list', first.profiles[1].previousAddons, [{ name: 'Old A', manifestUrl: 'https://old.example/a/manifest.json' }]);

  nuvio.calls.length = 0;
  svc = mockServices();
  let second;
  try { second = await runNuvioSetup(baseArgs(nuvio, { profiles: targets, retry: first })); } finally { svc.restore(); }
  eq('retry: both done', second.profiles.map((p) => p.status), ['done', 'done']);
  ok('retry detaches profile 2 and writes only profile 2', nuvio.calls.includes('updateProfile:2') && writes(nuvio, 2) === 1 && writes(nuvio, 1) === 0);
  eq('retry keeps the first backup (not profile 1\'s new content)', second.profiles[1].previousAddons, first.profiles[1].previousAddons);
  ok('profile 1 content was the wizard\'s own', live1.length === 3 && !nuvio.calls.some((c) => c.startsWith('listAddons')));
}

console.log('\n# retry adding a primary-addons profile after profile 1 finished');
{
  const nuvio = makeNuvio();
  const svc = mockServices();
  const original1 = [{ name: 'Old A', manifestUrl: 'https://old.example/a/manifest.json' }];
  nuvio.addons.set(1, [{ name: 'AIOStreams', url: 'https://new.example/a/manifest.json' }]); // profile 1 already replaced
  const earlier = {
    account: {}, addons: { aiostreams: { manifestUrl: 'https://x/s', uuid: 'u' }, aiometadata: { manifestUrl: 'https://x/m', uuid: 'u' } },
    addonPasswordSource: 'account', warnings: [],
    profiles: [{ profileIndex: 1, name: 'Ben', status: 'done', error: null, backupTaken: true, previousAddons: original1, watchly: null, settings: null }],
  };
  let result;
  try {
    result = await runNuvioSetup(baseArgs(nuvio, { profiles: [{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 2, name: 'Benci', kids: false }], retry: earlier }));
  } finally { svc.restore(); }
  eq('new primary profile is backed up from profile 1\'s ORIGINAL list', result.profiles[1].previousAddons, original1);
  ok('profile 1 is not read or written again', !nuvio.calls.includes('listAddons:1') && writes(nuvio, 1) === 0);
}

console.log('\n# carried backups of an earlier mount (no shared configs) are kept');
{
  const nuvio = makeNuvio();
  const svc = mockServices();
  const kept = [{ name: 'Original', manifestUrl: 'https://old.example/original/manifest.json' }];
  const carried = { profiles: [{ profileIndex: 1, name: 'Ben', status: 'failed', error: null, backupTaken: true, previousAddons: kept, watchly: null }] };
  let result;
  try { result = await runNuvioSetup(baseArgs(nuvio, { retry: carried })); } finally { svc.restore(); }
  eq('first backup wins over the profile\'s current addons', result.profiles[0].previousAddons, kept);
  ok('addons were not re-read', !nuvio.calls.includes('listAddons:1'));
  eq('shared configs are created fresh', [svc.posts.aiostreams, svc.posts.aiometadata], [1, 1]);
  eq('profile is rewritten', [result.profiles[0].status, writes(nuvio, 1)], ['done', 1]);
}

console.log('\n# a shared-config failure writes nothing');
{
  const nuvio = makeNuvio();
  const svc = mockServices({ aiostreamsFail: true });
  let threw = false;
  try { await runNuvioSetup(baseArgs(nuvio, { profiles: [{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 2, name: 'Benci', kids: false }] })); } catch { threw = true; } finally { svc.restore(); }
  ok('throws', threw);
  ok('no profile was detached or written', !nuvio.calls.some((c) => c.startsWith('replaceAddons') || c.startsWith('updateProfile') || c.startsWith('pushCollections')));
  eq('Watchly was not touched', svc.posts.watchly.length, 0);
}


/** Fake BingeCat adapter: records calls; `failApply` makes applyTemplate throw for those profile ids. */
function makeBingecat({ failApply = new Set(), mainProfileId = 100, targets = {}, createError = null, listed = [], known = null, createdKeys = null } = {}) {
  const calls = [];
  let nextId = 200;
  const adapter = {
    async createProfile(_t, { name, kids }) { calls.push(`create:${name}:${kids ? 'kids' : 'std'}`); if (createError) throw createError; return { id: nextId++, name }; },
    async listProfiles() { calls.push('list'); return listed; },
    async applyTemplate(_t, id, template, { historySource, isMain }) {
      calls.push(`apply:${id}:${template.kind}:${historySource}:${isMain ? 'main' : 'sub'}`);
      if (failApply.has(id)) throw new Error(`apply ${id} boom`);
      return { appliedSections: [] };
    },
    async getManifests(_t, id, { surface, aiSearch }) {
      calls.push(`manifests:${id}:${surface}:${aiSearch ? 'search' : 'plain'}`);
      return { url: `https://bc.example/${id}/${surface}/manifest.json`, ...(aiSearch ? { searchUrl: `https://bc.example/${id}/${surface}/search/manifest.json` } : {}) };
    },
  };
  return { adapter, calls, token: 'bc-token', mainProfileId, templates: { standard: { kind: 'std', search: { search_enabled: false } }, kids: { kind: 'kids', search: { search_enabled: true } } }, targets, ...(known ? { known } : {}), ...(createdKeys ? { createdKeys } : {}) };
}
const unclear = (code, status = 0) => Object.assign(new Error('unclear create'), { code, status });
const names = (nuvio, idx) => nuvio.addons.get(idx).map((a) => a.name);

console.log('\n# BingeCat: mixed Standard + Kids run');
{
  const nuvio = makeNuvio();
  const bc = makeBingecat({ targets: { 1: 100, 2: 'new' } });
  const events = [];
  const svc = mockServices();
  let result;
  try {
    result = await runNuvioSetup(baseArgs(nuvio, {
      profiles: [{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 2, name: 'Benci', kids: true }, { nuvioProfileId: 3, name: 'Bini', kids: false }],
      bingecat: bc,
      onStep: (name, d) => events.push(`${name}:${d?.profileIndex ?? ''}`),
    }));
  } finally { svc.restore(); }
  eq('all done', result.profiles.map((p) => p.status), ['done', 'done', 'done']);
  eq('Standard with Watchly + BingeCat: Watchly, BingeCat, AIOMetadata, AIOStreams', names(nuvio, 1), ['Watchly', 'BingeCat', 'AIOMetadata', 'AIOStreams']);
  eq('Kids: BingeCat, BingeCat AI Search directly below, AIOStreams', names(nuvio, 2), ['BingeCat', 'BingeCat AI Search', 'AIOStreams']);
  eq('Standard without a BingeCat target: no BingeCat addon', names(nuvio, 3), ['Watchly', 'AIOMetadata', 'AIOStreams']);
  eq('sort_order is sequential', nuvio.addons.get(2).map((a) => a.sort_order), [0, 1, 2]);
  eq('Kids get no Watchly config', svc.posts.watchly.map((b) => b.nuvio_profile_id), [1, 3]);
  ok('Kids get an empty collection list (existing ones removed), Standard get ours', nuvio.pushed.get(2)?.length === 0 && nuvio.pushed.get(1)?.length > 0 && nuvio.pushed.get(3)?.length > 0);
  ok('settings are pushed to the Kids profile too', nuvio.calls.some((c) => c.startsWith('pushSettings-') && c.endsWith(':2')));
  eq('one shared AIOStreams, one shared AIOMetadata', [svc.posts.aiostreams, svc.posts.aiometadata], [1, 1]);
  eq('BingeCat calls: existing main for Ben, new Kids sub-profile for Benci', bc.calls, [
    'apply:100:std:nuvio:main', 'manifests:100:nuvio:plain',
    'create:Benci:kids', 'apply:200:kids:nuvio:sub', 'manifests:200:nuvio:search',
  ]);
  ok('the created profile is announced before its settings are written', events.indexOf('bingecat_profile:2') > -1 && events.indexOf('bingecat_profile:2') < events.indexOf('bingecat:2'));
  eq('result carries kids + bingecat', [result.profiles[1].kids, result.profiles[1].bingecat?.profileId, result.profiles[1].bingecat?.created, result.profiles[0].bingecat?.created], [true, 200, true, false]);
}

console.log('\n# pinCollections sets pinToTop on every collection group');
{
  const groupsOf = (nuvio, idx) => nuvio.pushed.get(idx);
  const run = async (pin, extra = {}) => {
    const nuvio = makeNuvio();
    const svc = mockServices();
    try { await runNuvioSetup(baseArgs(nuvio, { pinCollections: pin, ...extra })); } finally { svc.restore(); }
    return groupsOf(nuvio, extra.idx ?? 1);
  };
  const unpinned = await run(false);
  ok('false: every group is unpinned', unpinned.length > 0 && unpinned.every((g) => g.pinToTop === false));
  const pinned = await run(true);
  ok('true: every group is pinned', pinned.length > 0 && pinned.every((g) => g.pinToTop === true));
  const kept = await run(null);
  ok('null keeps the template value (pinned today)', kept.every((g) => g.pinToTop === true));
  ok('the shared template object is not changed by the override', collections.every((g) => g.pinToTop === true));
}

console.log('\n# BingeCat: Kids-only run creates no AIOMetadata');
{
  const nuvio = makeNuvio();
  const bc = makeBingecat({ targets: { 1: 'new', 3: 'new' } });
  const svc = mockServices();
  let result;
  try {
    result = await runNuvioSetup(baseArgs(nuvio, { profiles: [{ nuvioProfileId: 1, name: 'Ben', kids: true }, { nuvioProfileId: 3, name: 'Bini', kids: true }], bingecat: bc, watchly: { defaults: {}, tmdbApiKey: 'x' } }));
  } finally { svc.restore(); }
  eq('both done', result.profiles.map((p) => p.status), ['done', 'done']);
  eq('AIOMetadata config is not created, AIOStreams is', [svc.posts.aiometadata, svc.posts.aiostreams], [0, 1]);
  eq('no Watchly even though it was requested', svc.posts.watchly.length, 0);
  eq('addons per Kids profile', [names(nuvio, 1), names(nuvio, 3)], [['BingeCat', 'BingeCat AI Search', 'AIOStreams'], ['BingeCat', 'BingeCat AI Search', 'AIOStreams']]);
  ok('every Kids profile has its collections cleared', nuvio.pushed.get(1)?.length === 0 && nuvio.pushed.get(3)?.length === 0);
  eq('shared addons have no AIOMetadata', Object.keys(result.addons), ['aiostreams']);
}

console.log('\n# BingeCat: a failure stays with its profile and Retry reuses the created BingeCat profile');
{
  const nuvio = makeNuvio();
  const bc = makeBingecat({ failApply: new Set([200]), targets: { 1: 100, 2: 'new' } });
  const events = [];
  let svc = mockServices();
  const targets = [{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 2, name: 'Benci', kids: true }];
  let first;
  try { first = await runNuvioSetup(baseArgs(nuvio, { profiles: targets, bingecat: bc, onStep: (n, d) => { if (n === 'bingecat_profile') events.push(d); } })); } finally { svc.restore(); }
  eq('[done, failed]', first.profiles.map((p) => p.status), ['done', 'failed']);
  ok('the failed profile\'s Nuvio side is untouched', writes(nuvio, 2) === 0 && !nuvio.calls.includes('updateProfile:2'));
  eq('the created BingeCat profile id was still reported', events.map((e) => [e.key, e.profileId]), [[2, 200]]);

  // the store records the created id as the new target; the retry must not create again
  const bc2 = makeBingecat({ targets: { 1: 100, 2: 200 } });
  svc = mockServices();
  let second;
  try { second = await runNuvioSetup(baseArgs(nuvio, { profiles: targets, bingecat: bc2, retry: first })); } finally { svc.restore(); }
  eq('after retry both done', second.profiles.map((p) => p.status), ['done', 'done']);
  ok('no second BingeCat profile is created and profile 1 is not applied again', !bc2.calls.some((c) => c.startsWith('create:')) && !bc2.calls.some((c) => c.startsWith('apply:100')));
  eq('the existing id is reused for the Kids profile', bc2.calls.filter((c) => c.startsWith('apply:')), ['apply:200:kids:nuvio:sub']);
}

console.log('\n# BingeCat: validation fails before any call');
{
  const cases = [
    ['Kids profile without BingeCat', { profiles: [{ nuvioProfileId: 1, name: 'A', kids: true }] }],
    ['BingeCat without a token', { profiles: [{ nuvioProfileId: 1, name: 'A', kids: false }], bingecat: { ...makeBingecat({ targets: { 1: 100 } }), token: '' } }],
    ['Kids profile without a BingeCat target', { profiles: [{ nuvioProfileId: 1, name: 'A', kids: true }], bingecat: makeBingecat({ targets: {} }) }],
  ];
  for (const [label, extra] of cases) {
    const nuvio = makeNuvio();
    const svc = mockServices();
    let threw = false;
    try { await runNuvioSetup(baseArgs(nuvio, extra)); } catch { threw = true; } finally { svc.restore(); }
    ok(`${label}: throws without touching anything`, threw && nuvio.calls.length === 0 && svc.posts.aiostreams === 0);
  }
}


console.log('\n# BingeCat: a lost create response does not lead to a duplicate profile');
{
  const kidsRow = [{ nuvioProfileId: 2, name: 'Benci', kids: true }];
  // the server created "Benci" (id 555) although the answer was lost: the profile is adopted, not created again
  let nuvio = makeNuvio();
  let bc = makeBingecat({ targets: { 2: 'new' }, createError: unclear('network'), listed: [{ id: 100, name: 'main' }, { id: 555, name: 'benci' }], known: new Set([100]) });
  const events = [];
  let svc = mockServices();
  let result;
  try { result = await runNuvioSetup(baseArgs(nuvio, { profiles: kidsRow, bingecat: bc, onStep: (n, d) => { if (n === 'bingecat_profile') events.push(d); } })); } finally { svc.restore(); }
  eq('adopted: done, applied to the existing id, one create attempt only', [result.profiles[0].status, bc.calls.filter((c) => c.startsWith('create:')).length, bc.calls.includes('apply:555:kids:nuvio:sub')], ['done', 1, true]);
  eq('the adopted id is reported (so the store remembers it) with the Kids flag and counts as created', [events.map((e) => [e.key, e.profileId, e.kids]), result.profiles[0].bingecat.created], [[[2, 555, true]], true]);

  // a 5xx and a 201 without id are unclear too; an unrelated same-name profile that existed before is NOT adopted
  for (const [label, err, listed, adopt] of [
    ['5xx', unclear('http_error', 502), [{ id: 556, name: 'Benci' }], true],
    ['201 without an id', unclear('bad_response', 201), [{ id: 557, name: 'Benci' }], true],
    ['same-name profile that was already there', unclear('network'), [{ id: 100, name: 'Benci' }], false],
    ['two candidates', unclear('network'), [{ id: 601, name: 'Benci' }, { id: 602, name: 'Benci' }], false],
  ]) {
    nuvio = makeNuvio();
    bc = makeBingecat({ targets: { 2: 'new' }, createError: err, listed, known: new Set([100]) });
    svc = mockServices();
    try { result = await runNuvioSetup(baseArgs(nuvio, { profiles: kidsRow, bingecat: bc })); } finally { svc.restore(); }
    eq(`${label}: ${adopt ? 'adopted' : 'profile fails, nothing is applied or written'}`, [result.profiles[0].status, writes(nuvio, 2) > 0], adopt ? ['done', true] : ['failed', false]);
  }

  // a clear rejection (limit reached) is not an unclear failure: no listing, the error is reported
  nuvio = makeNuvio();
  bc = makeBingecat({ targets: { 2: 'new' }, createError: unclear('profile_limit_reached', 409), listed: [{ id: 555, name: 'Benci' }], known: new Set([100]) });
  svc = mockServices();
  try { result = await runNuvioSetup(baseArgs(nuvio, { profiles: kidsRow, bingecat: bc })); } finally { svc.restore(); }
  ok('409 limit reached: failed without looking for a profile to adopt', result.profiles[0].status === 'failed' && !bc.calls.includes('list'));
}

console.log('\n# BingeCat: created flag survives a retry; Kids can never be applied to the main profile');
{
  const nuvio = makeNuvio();
  const bc = makeBingecat({ targets: { 2: 200 }, createdKeys: new Set([2]) });
  const svc = mockServices();
  let result;
  try { result = await runNuvioSetup(baseArgs(nuvio, { profiles: [{ nuvioProfileId: 2, name: 'Benci', kids: true }], bingecat: bc })); } finally { svc.restore(); }
  eq('a profile created by an earlier attempt is still reported as created (Done tells the user to set the Kids type)', [result.profiles[0].bingecat.created, bc.calls.some((c) => c.startsWith('create:'))], [true, false]);

  const nuvio2 = makeNuvio();
  const bad = makeBingecat({ targets: { 2: 100 }, mainProfileId: 100 });
  const svc2 = mockServices();
  try { result = await runNuvioSetup(baseArgs(nuvio2, { profiles: [{ nuvioProfileId: 2, name: 'Benci', kids: true }], bingecat: bad })); } finally { svc2.restore(); }
  ok('Kids on the main profile fails before any settings are written', result.profiles[0].status === 'failed' && /main profile can never/.test(result.profiles[0].error ?? '') && !bad.calls.some((c) => c.startsWith('apply:')) && writes(nuvio2, 2) === 0);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

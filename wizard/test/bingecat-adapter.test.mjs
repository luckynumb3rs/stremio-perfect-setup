import { createHash } from 'node:crypto';
import { createBingecatAdapter, resolveBingecatTemplate, BingecatError, BINGECAT_SCOPES } from '../core/adapters/bingecat.js';

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`);

const TOKEN = 'tok-SECRET-123';
const TEMPLATE = {
  $comment: 'strip me',
  language: { multilang_enabled: false },
  recommendations: { history_sources: ['{{HISTORY_SOURCE}}'], excluded_genres_hard: ['adult'] },
  stremio_addon: { force_top: false, cinemeta_control_mode: 'observe' },
  metadata: { language: 'en' },
};

/** Fake clock: sleep() advances now(). `responses` are consumed in order: [status, body, headers?] or an Error. */
function setup(responses = []) {
  const clock = { t: 1_000_000, sleeps: [] };
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift() ?? [200, {}];
    if (next instanceof Error) throw next;
    const [status, body, headers = {}] = next;
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  };
  const bc = createBingecatAdapter({
    clientId: 'bca_client',
    sleep: async (ms) => { clock.sleeps.push(ms); clock.t += ms; },
    now: () => clock.t,
  });
  return { bc, calls, clock, restore: () => { globalThis.fetch = original; } };
}
const run = async (responses, fn) => {
  const s = setup(responses);
  try { return { ...s, result: await fn(s) }; } finally { s.restore(); }
};
const fails = async (responses, fn) => {
  const s = setup(responses);
  try { await fn(s); return { ...s, error: null }; } catch (error) { return { ...s, error }; } finally { s.restore(); }
};

console.log('\n# resolveBingecatTemplate');
{
  const main = resolveBingecatTemplate(TEMPLATE, { historySource: 'nuvio', isMain: true });
  eq('placeholder filled, $comment stripped, metadata kept for main', [main.recommendations.history_sources, '$comment' in main, !!main.metadata], [['nuvio'], false, true]);
  const sub = resolveBingecatTemplate(TEMPLATE, { historySource: 'stremio', isMain: false });
  eq('metadata dropped for sub-profiles (they inherit it), Stremio settings retained', ['metadata' in sub, sub.recommendations.history_sources, sub.stremio_addon], [false, ['stremio'], TEMPLATE.stremio_addon]);
  ok('template object is not mutated', TEMPLATE.recommendations.history_sources[0] === '{{HISTORY_SOURCE}}' && '$comment' in TEMPLATE);
  let msg = ''; try { resolveBingecatTemplate(TEMPLATE, { historySource: 'trakt', isMain: true }); } catch (e) { msg = e.message; }
  ok('unknown history source throws', /history source/.test(msg));
  msg = ''; try { resolveBingecatTemplate({ a: { b: '{{OTHER}}' } }, { historySource: 'nuvio', isMain: true }); } catch (e) { msg = e.message; }
  ok('unresolved placeholder throws', /unresolved placeholder/.test(msg));
}

console.log('\n# OAuth');
{
  const { bc, restore } = setup();
  const a = await bc.buildAuthorizeUrl({ redirectUri: 'https://numb3rs.stream/wizard/' });
  const b = await bc.buildAuthorizeUrl({ redirectUri: 'https://numb3rs.stream/wizard/' });
  restore();
  const u = new URL(a.url);
  eq('authorize endpoint and fixed params', [u.origin + u.pathname, u.searchParams.get('response_type'), u.searchParams.get('client_id'), u.searchParams.get('code_challenge_method'), u.searchParams.get('redirect_uri'), u.searchParams.get('prompt')], ['https://bingecat.com/oauth/authorize', 'code', 'bca_client', 'S256', 'https://numb3rs.stream/wizard/', 'create']);
  eq('requests all required scopes', u.searchParams.get('scope').split(' '), BINGECAT_SCOPES);
  eq('challenge = base64url(sha256(verifier))', u.searchParams.get('code_challenge'), createHash('sha256').update(a.verifier).digest('base64url'));
  ok('state is namespaced and in the URL', a.state.startsWith('bingecat-') && u.searchParams.get('state') === a.state);
  ok('state and verifier are fresh per call', a.state !== b.state && a.verifier !== b.verifier);
  ok('verifier is long enough for PKCE (43+ chars)', a.verifier.length >= 43);
}
{
  const granted = BINGECAT_SCOPES.join(' ');
  const r = await run([[200, { access_token: TOKEN, refresh_token: 'r', expires_in: 604800, scope: granted }]], ({ bc }) => bc.exchangeCode({ code: 'c', verifier: 'v', redirectUri: 'r' }));
  eq('exchange body has no client_secret', r.calls[0].body, { grant_type: 'authorization_code', code: 'c', client_id: 'bca_client', redirect_uri: 'r', code_verifier: 'v' });
  eq('access token, refresh token and expiry (seconds) returned', r.result, { token: TOKEN, refreshToken: 'r', expiresAt: Math.floor(1_000_000 / 1000) + 604800 });
  eq('posts to /oauth/token', r.calls[0].url, 'https://bingecat.com/oauth/token');
  const partial = await fails([[200, { access_token: TOKEN, expires_in: 10, scope: 'settings:read profiles:read' }]], ({ bc }) => bc.exchangeCode({ code: 'c', verifier: 'v', redirectUri: 'r' }));
  ok('missing scope throws insufficient_scope', partial.error?.code === 'insufficient_scope');
  const bad = await fails([[400, { error: 'invalid_grant' }]], ({ bc }) => bc.exchangeCode({ code: 'c', verifier: 'v', redirectUri: 'r' }));
  ok('rejected code throws oauth_failed without the code or verifier in the message', bad.error?.code === 'oauth_failed' && !bad.error.message.includes('invalid_grant') && !/\bv\b/.test(bad.error.message));
}

console.log('\n# requests: headers, methods, write spacing');
{
  const r = await run([
    [200, { profiles: [] }],
    [200, { applied_sections: ['language'] }],
    [200, { applied_sections: ['language'] }],
  ], async ({ bc }) => {
    await bc.loadProfiles(TOKEN);
    await bc.applyTemplate(TOKEN, 5, TEMPLATE, { historySource: 'nuvio', isMain: false });
    await bc.applyTemplate(TOKEN, 6, TEMPLATE, { historySource: 'stremio', isMain: false });
  });
  ok('every call sends the BingeCat headers', r.calls.every((c) => c.headers.Authorization === `Bearer ${TOKEN}` && c.headers['bingecat-api-key'] === 'bca_client' && c.headers['bingecat-api-version'] === '1'));
  ok('only GET, POST and PATCH are ever used (no DELETE)', r.calls.every((c) => ['GET', 'POST', 'PATCH'].includes(c.method)));
  eq('first write does not wait, the second waits 3.5 s', r.clock.sleeps, [3500]);
  eq('one PATCH per applyTemplate, to the settings endpoint', r.calls.slice(1).map((c) => `${c.method} ${c.url.replace('https://bingecat.com', '')}`), ['PATCH /api/v1/profiles/5/settings', 'PATCH /api/v1/profiles/6/settings']);
  eq('Nuvio PATCH body for a sub-profile has no $comment, metadata or Stremio-only settings', Object.keys(r.calls[1].body), ['language', 'recommendations']);
  eq('Nuvio history source remains Nuvio', r.calls[1].body.recommendations.history_sources, ['nuvio']);
  eq('Stremio PATCH includes safe addon settings without history sync', r.calls[2].body.stremio_addon, { force_top: false, cinemeta_control_mode: 'observe' });
}
{
  const r = await run([[200, {}], [200, {}]], async ({ bc, clock }) => {
    await bc.applyTemplate(TOKEN, 1, TEMPLATE, { historySource: 'nuvio', isMain: true });
    clock.t += 4000; // the user's other work took longer than the gap
    await bc.applyTemplate(TOKEN, 2, TEMPLATE, { historySource: 'nuvio', isMain: true });
  });
  eq('no sleep when the last write was more than 3.5 s ago', r.clock.sleeps, []);
}

console.log('\n# provider connections, links and AI keys');
{
  const r = await run([
    [200, { connected: true, provider: 'stremio' }],
    [200, { connected: true, provider: 'nuvio', profiles: [] }],
    [200, { profile_type: 'normal' }],
    [200, { gemini: { configured: true, valid: true } }],
  ], async ({ bc }) => [
    await bc.connectStremio(TOKEN, 1, 'stremio-auth-key'),
    await bc.connectNuvio(TOKEN, 1, 'nuvio-refresh-token'),
    await bc.linkNuvioProfile(TOKEN, 2, 3),
    await bc.setAiKeys(TOKEN, 1, { geminiApiKey: 'gemini-secret' }),
  ]);
  eq('provider connection and key endpoints use the live paths and bodies', r.calls.map((c) => [c.method, c.url.replace('https://bingecat.com', ''), c.body]), [
    ['POST', '/api/v1/profiles/1/connections/stremio', { auth_key: 'stremio-auth-key' }],
    ['POST', '/api/v1/profiles/1/connections/nuvio', { refresh_token: 'nuvio-refresh-token' }],
    ['PATCH', '/api/v1/profiles/2', { nuvio_profile_id: 3 }],
    ['PUT', '/api/v1/profiles/1/ai-keys', { gemini_api_key: 'gemini-secret' }],
  ]);
  const empty = await run([[200, {}]], ({ bc }) => bc.setAiKeys(TOKEN, 1, {}));
  eq('empty AI-key update does not make a request', empty.result, null);
  eq('empty AI-key update leaves the request list empty', empty.calls.length, 0);
  const invalid = await fails([[200, { gemini: { configured: true, valid: false }, groq: { configured: false, valid: null } }]], ({ bc }) => bc.setAiKeys(TOKEN, 1, { geminiApiKey: 'bad' }));
  ok('invalid provider key is reported without echoing it', invalid.error?.code === 'invalid_ai_key' && !invalid.error.message.includes('bad'));
}

console.log('\n# 429 handling');
{
  const r = await run([[429, { error: 'rate_limited' }, { 'retry-after': '0' }], [200, { applied_sections: ['x'] }]], ({ bc }) => bc.applyTemplate(TOKEN, 1, TEMPLATE, { historySource: 'nuvio', isMain: true }));
  eq('Retry-After 0 still waits at least 4 s, then succeeds', [r.clock.sleeps[0], r.calls.length], [4000, 2]);
  const r2 = await fails(Array.from({ length: 6 }, () => [429, { error: 'rate_limited' }, { 'retry-after': '2' }]), ({ bc }) => bc.applyTemplate(TOKEN, 1, TEMPLATE, { historySource: 'nuvio', isMain: true }));
  ok('gives up after 4 retries with a rate_limited error', r2.error?.code === 'rate_limited' && r2.calls.length === 5);
  const r3 = await run([[429, {}, { 'retry-after': '500' }], [200, { applied_sections: [] }]], ({ bc }) => bc.applyTemplate(TOKEN, 1, TEMPLATE, { historySource: 'nuvio', isMain: true }));
  ok('Retry-After is capped at 60 s', r3.clock.sleeps[0] === 60000);
}

console.log('\n# errors never leak the token and map to friendly messages');
{
  const cases = [
    [401, { error: 'invalid_token' }, 'unauthorized', /Connect BingeCat again/],
    [403, { error: 'insufficient_scope' }, 'insufficient_scope', /approve all permissions/],
    [403, { error: 'root_account_required' }, 'root_account_required', /account owner/],
    [409, { error: 'profile_limit_reached' }, 'profile_limit_reached', /profile limit/],
    [400, { error: 'unknown_settings', message: 'bad field x' }, 'unknown_settings', /bad field x.*out of date/],
    [404, { error: 'not_found' }, 'not_found', /no longer exists/],
  ];
  for (const [status, body, code, re] of cases) {
    const r = await fails([[status, body]], ({ bc }) => bc.applyTemplate(TOKEN, 1, TEMPLATE, { historySource: 'nuvio', isMain: true }));
    ok(`${status} ${body.error}: ${code}`, r.error instanceof BingecatError && r.error.code === code && re.test(r.error.message) && !r.error.message.includes(TOKEN));
  }
  const net = await fails([new TypeError('Failed to fetch')], ({ bc }) => bc.createProfile(TOKEN, { name: 'Ben' }));
  ok('network error on create is not retried and is reported', net.error?.code === 'network' && net.calls.length === 1);
  const empty = await fails([[201, {}]], ({ bc }) => bc.createProfile(TOKEN, { name: 'Ben' }));
  ok('create without an id in the response is an error', empty.error?.code === 'bad_response');
}

console.log('\n# listProfiles');
{
  const r = await run([[200, { profiles: [{ id: 1, name: 'a', is_main: true, extra: 'x' }, { id: 2, name: 'b' }] }]], ({ bc }) => bc.listProfiles(TOKEN));
  eq('one GET, trimmed fields', [r.calls.length, r.result], [1, [{ id: 1, name: 'a', isMain: true }, { id: 2, name: 'b', isMain: false }]]);
}

console.log('\n# createProfile, getManifests, loadProfiles');
{
  const r = await run([[201, { id: 77, name: 'Ben', profile_type: 'kids' }], [201, { id: 78, name: 'Bini', profile_type: 'normal' }]], async ({ bc }) => [
    await bc.createProfile(TOKEN, { name: 'Ben', kids: true }),
    await bc.createProfile(TOKEN, { name: 'Bini' }),
  ]);
  eq('Kids create sends profile_type kids, Standard only the name; the answered type is returned', [r.calls.map((c) => c.body), r.result], [
    [{ name: 'Ben', profile_type: 'kids' }, { name: 'Bini' }],
    [{ id: 77, name: 'Ben', type: 'kids' }, { id: 78, name: 'Bini', type: 'normal' }],
  ]);
  const noType = await run([[201, { id: 79, name: 'Mia' }]], ({ bc }) => bc.createProfile(TOKEN, { name: 'Mia', kids: true }));
  eq('an answer without a type gives type undefined (the orchestrator then switches it)', noType.result.type, undefined);
}
{
  const r = await run([[200, { id: 2, profile_type: 'kids' }]], ({ bc }) => bc.setProfileType(TOKEN, 2, 'kids'));
  eq('setProfileType PATCHes the profile with only profile_type', [r.calls[0].method, r.calls[0].url, r.calls[0].body], ['PATCH', 'https://bingecat.com/api/v1/profiles/2', { profile_type: 'kids' }]);
  const ignored = await fails([[200, { id: 1, is_main: true, profile_type: 'normal' }]], ({ bc }) => bc.setProfileType(TOKEN, 1, 'kids'));
  ok('a 200 that ignores the type (main profile) is type_not_applied', ignored.error?.code === 'type_not_applied');
}
{
  const url = 'https://bingecat.com/stremio/u/9/nuvio/manifest.json';
  const searchUrl = 'https://bingecat.com/official-ai-search-manifest.json';
  const r = await run([[200, { manifest: { url, search_url: searchUrl } }], [200, { manifest: { url, search_url: searchUrl } }]], async ({ bc }) => [
    await bc.getManifests(TOKEN, 9, { surface: 'nuvio', aiSearch: true }),
    await bc.getManifests(TOKEN, 9, { surface: 'nuvio' }),
  ]);
  eq('uses the official AI search URL only when asked', r.result, [{ url, searchUrl }, { url }]);
  eq('surface goes in the query', r.calls[0].url, 'https://bingecat.com/api/v1/profiles/9/catalogs?surface=nuvio');
  const none = await fails([[200, { manifest: {} }]], ({ bc }) => bc.getManifests(TOKEN, 9, { surface: 'stremio' }));
  ok('missing manifest url is an error', none.error?.code === 'bad_response');
  const missingSearch = await fails([[200, { manifest: { url } }]], ({ bc }) => bc.getManifests(TOKEN, 9, { surface: 'nuvio', aiSearch: true }));
  ok('missing requested AI search url is an error', missingSearch.error?.code === 'bad_response');
}
{
  const r = await run([
    [200, { profiles: [{ id: 1, name: 'main', is_main: true, profile_type: 'normal' }, { id: 2, name: 'Tara', is_main: false, profile_type: 'kids' }] }],
    [200, { profiles: [{ id: 'n1', name: 'Tara', bound_profile_ids: [2] }] }],
    [200, { settings: { recommendations: { max_age_certification_us: null }, content_filters: { max_age_certification_us: null } } }],
    [200, { settings: { recommendations: { max_age_certification_us: 'PG' }, content_filters: {} } }],
  ], ({ bc }) => bc.loadProfiles(TOKEN, { withNuvio: true }));
  eq('profiles are merged with type, age hint and Nuvio links', r.result.map((p) => [p.id, p.isMain, p.type, p.ageLimited, p.boundNuvio]), [[1, true, 'normal', false, []], [2, false, 'kids', true, [{ id: 'n1', name: 'Tara' }]]]);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

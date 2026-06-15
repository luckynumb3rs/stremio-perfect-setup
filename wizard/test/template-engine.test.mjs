// Offline tests for the template engine, run against the REAL templates/AIOStreams.json.
// Run: node wizard/test/template-engine.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveTemplate, isVisible, evalExpr, switchKey } from '../core/template-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const template = JSON.parse(readFileSync(join(repoRoot, 'templates', 'AIOStreams.json'), 'utf8'));

let passed = 0;
let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`); }

console.log('\n# expression evaluator');
{
  const c = (inputs, services) => ({ inputs, services, credentials: {} });
  ok('services truthy when non-empty', evalExpr('services', c({}, ['torbox'])) === true);
  ok('!services truthy when empty', evalExpr('!services', c({}, [])) === true);
  ok('services falsy when empty', evalExpr('services', c({}, [])) === false);
  ok('inputs.anime bool', evalExpr('inputs.anime', c({ anime: true }, [])) === true);
  ok('and/!= combo', evalExpr('services and inputs.httpAddons != only', c({ httpAddons: 'add' }, ['rd'])) === true);
  ok('and/!= combo false', evalExpr('services and inputs.httpAddons != only', c({ httpAddons: 'only' }, ['rd'])) === false);
  ok('services.torbox matches selected service', evalExpr('services.torbox', c({}, ['torbox', 'rd'])) === true);
  ok('services.torbox false when not selected', evalExpr('services.torbox', c({}, ['rd'])) === false);
  ok('or with ==', evalExpr('services or inputs.httpAddons == only', c({ httpAddons: 'only' }, [])) === true);
  ok('parentheses', evalExpr('(services or inputs.anime) and !inputs.debridio', c({ anime: true, debridio: false }, [])) === true);
  eq('switchKey services empty -> ""', switchKey('services', c({}, [])), '');
  eq('switchKey services joined', switchKey('services', c({}, ['torbox', 'rd'])), 'torbox,rd');
  eq('switchKey formatter', switchKey('inputs.formatterChoice', c({ formatterChoice: 'color' }, [])), 'color');
}

console.log('\n# canonical operators: includes / numeric / xor');
{
  const c = (inputs, services = []) => ({ inputs, services, credentials: {} });
  // includes (array + string membership)
  ok('includes: array contains', evalExpr('inputs.coreFilter includes extended', c({ coreFilter: ['standard', 'extended'] })) === true);
  ok('includes: array missing', evalExpr('inputs.coreFilter includes extended', c({ coreFilter: ['standard'] })) === false);
  ok('includes: string substring', evalExpr('inputs.tag includes hdr', c({ tag: 'hdr10' })) === true);
  ok('includes: undefined is false', evalExpr('inputs.missing includes x', c({})) === false);
  ok('includes: negation binds outside', evalExpr('!inputs.languages includes German', c({ languages: ['English'] })) === true);
  ok('includes: negation false case', evalExpr('!inputs.languages includes German', c({ languages: ['German'] })) === false);
  // numeric comparisons
  ok('numeric >', evalExpr('inputs.n > 5', c({ n: 6 })) === true);
  ok('numeric >=', evalExpr('inputs.n >= 5', c({ n: 5 })) === true);
  ok('numeric <', evalExpr('inputs.n < 5', c({ n: 4 })) === true);
  ok('numeric <=', evalExpr('inputs.n <= 5', c({ n: 5 })) === true);
  ok('numeric > false', evalExpr('inputs.n > 5', c({ n: 3 })) === false);
  // xor (odd-count true) and precedence or < xor < and
  ok('xor true', evalExpr('inputs.a xor inputs.b', c({ a: true, b: false })) === true);
  ok('xor false (both)', evalExpr('inputs.a xor inputs.b', c({ a: true, b: true })) === false);
  ok('precedence and<or', evalExpr('inputs.a and inputs.b or inputs.c', c({ a: false, b: true, c: true })) === true);
}

console.log('\n# multi-word comparison RHS');
{
  const c = (inputs, services = []) => ({ inputs, services, credentials: {} });
  ok('multi-word RHS equals', evalExpr('inputs.lang == Portuguese (Brazil)', c({ lang: 'Portuguese (Brazil)' })) === true);
  ok('multi-word RHS then and', evalExpr('inputs.lang == Portuguese (Brazil) and inputs.x', c({ lang: 'Portuguese (Brazil)', x: true })) === true);
  ok('single-word RHS still works', evalExpr('inputs.lang != none', c({ lang: 'English' })) === true);
  // RHS values with non-word characters (e.g. "HDR10+") must tokenize and rejoin verbatim.
  ok('RHS with + via includes', evalExpr('inputs.dev includes HDR10+', c({ dev: ['HDR10+', '4k'] })) === true);
  ok('RHS with + equals', evalExpr('inputs.tag == HDR10+', c({ tag: 'HDR10+' })) === true);
  ok('RHS with + then or', evalExpr('inputs.tag == HDR10+ or inputs.x', c({ tag: 'HDR10+', x: false })) === true);
}

console.log('\n# nested subsection defaults + deep-merge');
{
  const tpl = {
    metadata: { inputs: [
      { id: 'bitrate', type: 'subsection', subOptions: [
        { id: 'bitrateCap', type: 'select-with-custom', default: '150' },
        { id: 'bitrateCapSoft', type: 'boolean', default: false },
      ] },
      { id: 'topField', type: 'boolean', default: true },
    ] },
    config: { cap: '{{inputs.bitrate.bitrateCap}}', soft: '{{inputs.bitrate.bitrateCapSoft}}', top: '{{inputs.topField}}' },
  };
  const out = resolveTemplate(tpl, { inputs: { bitrate: { bitrateCapSoft: true } } });
  eq('nested default survives partial override', out, { cap: '150', soft: true, top: true });
}

console.log('\n# selected service credentials merge');
{
  const tpl = {
    metadata: { inputs: [] },
    config: {
      services: [
        { id: 'offcloud', enabled: false, credentials: { apiKey: 'template-key' } },
        { id: 'putio', enabled: false, credentials: { token: 'template-token' } },
      ],
    },
  };
  const out = resolveTemplate(tpl, {
    services: ['offcloud', 'putio'],
    serviceCredentials: {
      offcloud: { apiKey: 'oc-key', email: 'person@example.com', password: 'secret' },
      putio: { clientId: 'put-client', token: 'put-token' },
    },
  });
  eq('service credentials preserve arbitrary provider-specific fields', out.services, [
    {
      id: 'offcloud',
      enabled: true,
      credentials: { apiKey: 'oc-key', email: 'person@example.com', password: 'secret' },
    },
    {
      id: 'putio',
      enabled: true,
      credentials: { token: 'put-token', clientId: 'put-client' },
    },
  ]);
}

console.log('\n# field visibility (UI renderer)');
{
  const inputsSchema = template.metadata.inputs;
  const byId = Object.fromEntries(inputsSchema.map((f) => [f.id, f]));
  ok('header.p2p visible when no services', isVisible(byId['header.p2p'], { inputs: {}, services: [] }) === true);
  ok('header.p2p hidden when services', isVisible(byId['header.p2p'], { inputs: {}, services: ['torbox'] }) === false);
  ok('anime field hidden without services', isVisible(byId['anime'], { inputs: {}, services: [] }) === false);
  ok('anime field shown with services', isVisible(byId['anime'], { inputs: {}, services: ['torbox'] }) === true);
  ok('seeders shown only without services', isVisible(byId['seeders'], { inputs: {}, services: [] }) === true);
  ok('seeders hidden with services', isVisible(byId['seeders'], { inputs: {}, services: ['torbox'] }) === false);
}

console.log('\n# full template resolution: P2P (no services)');
{
  const cfg = resolveTemplate(template, {
    inputs: { formatterChoice: 'flat', formatterFilename: false, languages: ['English'], languagesRequired: true, subtitles: ['en'], httpAddons: 'none', timeout: 5000, anime: false, debridio: false },
    services: [],
    credentials: { tmdbApiKey: 'TKEY', tmdbAccessToken: 'TTOK', tvdbApiKey: 'VKEY' },
  });
  ok('no __ directives leak', !JSON.stringify(cfg).includes('__if') && !JSON.stringify(cfg).includes('__switch') && !JSON.stringify(cfg).includes('__value') && !JSON.stringify(cfg).includes('__remove'));
  ok('no unresolved {{inputs}}', !JSON.stringify(cfg).includes('{{inputs'));
  ok('no leftover <template_placeholder>', !JSON.stringify(cfg).includes('<template_placeholder>'));
  ok('credentials injected', cfg.tmdbApiKey === 'TKEY' && cfg.tmdbAccessToken === 'TTOK' && cfg.tvdbApiKey === 'VKEY');
  ok('formatter chosen (flat, custom)', cfg.formatter && cfg.formatter.id === 'custom');
  ok('requiredLanguages present when languagesRequired=true', Array.isArray(cfg.requiredLanguages?.required ?? cfg.requiredLanguages));
  const rl = cfg.requiredLanguages?.required ?? cfg.requiredLanguages;
  ok('requiredLanguages flattened English + appendices', Array.isArray(rl) && rl.includes('English') && rl.includes('Original') && rl.includes('Unknown'));
  ok('timeout substituted as number somewhere', JSON.stringify(cfg).includes('5000') && !JSON.stringify(cfg).includes('"{{inputs.timeout}}"'));
  ok('services all disabled when none selected', Array.isArray(cfg.services) && cfg.services.every((s) => s.enabled === false));
  ok('TB Search omitted when TorBox is not selected', !cfg.presets.some((preset) => preset.type === 'torbox-search'));
}

console.log('\n# debrid-only presets never leak into a P2P config (Instant Debrid regression)');
{
  // Instant Debrid resolves AIOStreams with services=[] (P2P) while the user may still have
  // toggled the debrid-only Anime/Debridio inputs to true (e.g. enabled before switching to
  // Instant Debrid). The seadex preset requires a usable service, so it must be excluded.
  const cfg = resolveTemplate(template, {
    inputs: { formatterChoice: 'flat', languages: ['English'], subtitles: ['en'], httpAddons: 'none', timeout: 5000, anime: true, debridio: true, debridioApiKey: 'DBKEY' },
    services: [],
    credentials: { tmdbApiKey: 'K', tmdbAccessToken: 'A', tvdbApiKey: 'V' },
  });
  ok('seadex preset excluded in P2P even when anime=true', !cfg.presets.some((p) => p.type === 'seadex'));
  ok('animetosho preset excluded in P2P even when anime=true', !cfg.presets.some((p) => p.type === 'animetosho'));
  ok('debridio preset excluded in P2P even when debridio=true', !cfg.presets.some((p) => p.type === 'debridio'));
}

console.log('\n# debrid-only presets still included when a service IS selected');
{
  const cfg = resolveTemplate(template, {
    inputs: { formatterChoice: 'flat', languages: ['English'], subtitles: ['en'], httpAddons: 'none', timeout: 5000, anime: true, debridio: true, debridioApiKey: 'DBKEY' },
    services: ['torbox'],
    credentials: { tmdbApiKey: 'K', tmdbAccessToken: 'A', tvdbApiKey: 'V' },
  });
  ok('seadex preset included with service + anime', cfg.presets.some((p) => p.type === 'seadex'));
  ok('animetosho preset included with service + anime', cfg.presets.some((p) => p.type === 'animetosho'));
  ok('debridio preset included with service + debridio', cfg.presets.some((p) => p.type === 'debridio'));
}

console.log('\n# full template resolution: Debrid (torbox) + formatter color + filename');
{
  const cfg = resolveTemplate(template, {
    inputs: { formatterChoice: 'color', formatterFilename: true, languages: ['English', 'German'], languagesRequired: false, subtitles: ['en'], httpAddons: 'none', timeout: 8000, anime: true, debridio: false },
    services: ['torbox'],
    credentials: { tmdbApiKey: 'K', tmdbAccessToken: 'A', tvdbApiKey: 'V' },
  });
  ok('torbox enabled', cfg.services.some((s) => s.id === 'torbox' && s.enabled === true));
  ok('TB Search included when TorBox is selected', cfg.presets.some((preset) => preset.type === 'torbox-search'));
  ok('formatter color chosen', cfg.formatter && cfg.formatter.id === 'custom');
  ok('requiredLanguages dropped when languagesRequired=false', cfg.requiredLanguages === undefined || cfg.requiredLanguages === null);
  ok('formatter retain would remove, not here', cfg.formatter !== undefined);
}

console.log('\n# formatter retain removes formatter');
{
  const cfg = resolveTemplate(template, {
    inputs: { formatterChoice: 'retain', formatterFilename: false, languages: ['English'], languagesRequired: false, subtitles: ['en'], httpAddons: 'none', timeout: 5000, anime: false, debridio: false },
    services: [],
    credentials: {},
  });
  ok('formatter removed on retain', cfg.formatter === undefined);
}

console.log('\n# RPDB override keeps template default unless a key is supplied');
{
  const defaultCfg = resolveTemplate(template, {
    inputs: {},
    services: [],
    credentials: {},
  });
  ok('default RPDB key remains when none is supplied', defaultCfg.rpdbApiKey === 't0-free-rpdb');

  const overriddenCfg = resolveTemplate(template, {
    inputs: {},
    services: [],
    credentials: { rpdbApiKey: 'RPDB-PREMIUM-KEY' },
  });
  ok('supplied RPDB key overrides template default', overriddenCfg.rpdbApiKey === 'RPDB-PREMIUM-KEY');
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

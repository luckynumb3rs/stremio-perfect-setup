// Offline tests for the template engine, run against the REAL templates/AIOStreams.json.
// Run: node automation/test/template-engine.test.mjs
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
  ok('or with ==', evalExpr('services or inputs.httpAddons == only', c({ httpAddons: 'only' }, [])) === true);
  ok('parentheses', evalExpr('(services or inputs.anime) and !inputs.debridio', c({ anime: true, debridio: false }, [])) === true);
  eq('switchKey services empty -> ""', switchKey('services', c({}, [])), '');
  eq('switchKey services joined', switchKey('services', c({}, ['torbox', 'rd'])), 'torbox,rd');
  eq('switchKey formatter', switchKey('inputs.formatterChoice', c({ formatterChoice: 'color' }, [])), 'color');
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
}

console.log('\n# full template resolution: Debrid (torbox) + formatter color + filename');
{
  const cfg = resolveTemplate(template, {
    inputs: { formatterChoice: 'color', formatterFilename: true, languages: ['English', 'German'], languagesRequired: false, subtitles: ['en'], httpAddons: 'none', timeout: 8000, anime: true, debridio: false },
    services: ['torbox'],
    credentials: { tmdbApiKey: 'K', tmdbAccessToken: 'A', tvdbApiKey: 'V' },
  });
  ok('torbox enabled', cfg.services.some((s) => s.id === 'torbox' && s.enabled === true));
  ok('formatter color chosen', cfg.formatter && cfg.formatter.id === 'custom');
  ok('requiredLanguages dropped when languagesRequired=false', cfg.requiredLanguages === undefined || cfg.requiredLanguages === null);
  ok('formatter retain would remove — not here', cfg.formatter !== undefined);
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

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

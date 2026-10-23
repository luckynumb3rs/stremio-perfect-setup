import { autoMatch, validateMapping, normalizeName } from '../core/bingecat-mapper.js';

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`);
const m = (rows, profiles) => autoMatch(rows, profiles).map((r) => `${r.key}:${r.target}:${r.reason}`);
const main = { id: 1, name: 'lovetolive', isMain: true };
const sub = (id, name, extra = {}) => ({ id, name, isMain: false, ageLimited: false, ...extra });
const std = (key, name) => ({ key, name, kids: false });
const kid = (key, name) => ({ key, name, kids: true });

console.log('\n# normalizeName');
eq('case, accents and punctuation are ignored', normalizeName('  Zoë-Ann!! '), 'zoeann');
eq('null is empty', normalizeName(null), '');

console.log('\n# autoMatch: fresh account');
eq('first Standard gets main, the others are new', m([std(1, 'Ben'), std(2, 'Benci')], [main]), ['1:1:fresh-main', '2:new:new']);
eq('Kids row first: main goes to the first STANDARD row', m([kid(1, 'Tara'), std(2, 'Ben')], [main]), ['1:new:new', '2:1:fresh-main']);
eq('Kids-only run never touches main', m([kid(1, 'Tara'), kid(2, 'Bo')], [main]), ['1:new:new', '2:new:new']);

console.log('\n# autoMatch: existing account');
const acct = [main, sub(2, 'Loina'), sub(3, 'Tara', { ageLimited: true })];
eq('empty BingeCat list gives all new', m([std(1, 'Ben')], []), ['1:new:new']);
eq('non-fresh account: no automatic main for an unnamed Standard', m([std(1, 'Ben')], acct), ['1:new:new']);
eq('same name wins (case/accent-insensitive)', m([std(1, 'LOINA')], acct), ['1:2:name']);
eq('Standard can match main by name', m([std(1, 'LoveToLive')], acct), ['1:1:name']);
eq('Kids matches an age-limited sub-profile by name', m([kid(1, 'Tara')], acct), ['1:3:name']);
eq('Standard never auto-matches an age-limited profile', m([std(1, 'Tara')], acct), ['1:new:new']);
eq('Kids never matches main, even by name', m([kid(1, 'lovetolive')], acct), ['1:new:new']);
eq('each BingeCat profile is used once (second same-name row goes new)', m([std(1, 'Loina'), std(2, 'Loina')], acct), ['1:2:name', '2:new:new']);
eq('rows are processed in order', m([std(2, 'Loina'), std(1, 'Loina')], acct), ['2:2:name', '1:new:new']);

console.log('\n# autoMatch: linked');
const linked = [main, sub(2, 'Ben', { boundNuvio: [{ id: 2, name: 'Ben' }] }), sub(3, 'Ben')];
eq('linked wins over an earlier same-name row', m([std(1, 'Ben'), std(2, 'Ben')], linked), ['1:3:name', '2:2:linked']);
eq('a binding with a different name is not trusted as a link', m([std(1, 'Zed')], [main, sub(2, 'Ben', { boundNuvio: [{ id: 1, name: 'Zed' }] })]), ['1:new:new']);

console.log('\n# autoMatch: known profile type');
const typed = [main, sub(2, 'Kid', { type: 'kids' }), sub(3, 'Kid2', { type: 'normal' })];
eq('Standard never matches a typed kids profile', m([std(1, 'Kid')], typed), ['1:new:new']);
eq('Kids only matches typed kids profiles', m([kid(1, 'Kid2'), kid(2, 'Kid')], typed), ['1:new:new', '2:2:name']);

console.log('\n# validateMapping');
const rows = [std(1, 'Ben'), kid(2, 'Tara')];
const v = (mapping, profiles = acct, opts) => validateMapping(rows, mapping, profiles, opts);
const mp = (a, b) => [{ key: 1, target: a, reason: 'x' }, { key: 2, target: b, reason: 'x' }];
eq('new + new is valid (kids create warns)', [v(mp('new', 'new')).errors.length, v(mp('new', 'new')).warnings.length], [0, 1]);
ok('no kids-create warning once the API supports it', v(mp('new', 'new'), acct, { kidsCreateSupported: true }).warnings.length === 0);
ok('Kids row on main is an error', v(mp('new', 1)).errors.some((e) => e.key === 2 && /main profile can never/.test(e.message)));
ok('same target twice is an error', v(mp(2, 2)).errors.some((e) => /already used/.test(e.message)));
ok('Standard row on an age-limited profile is an error', v(mp(3, 'new')).errors.some((e) => e.key === 1 && /Kids profile/.test(e.message)));
ok('Standard row on main is only a warning', v(mp(1, 'new')).errors.length === 0 && v(mp(1, 'new')).warnings.some((w) => /main profile/.test(w.message)));
ok('overwrite warning for an existing sub-profile', v(mp(2, 'new')).warnings.some((w) => /will be overwritten/.test(w.message)));
ok('Kids row on an untyped existing profile warns', v(mp('new', 3)).warnings.some((w) => /does not tell us/.test(w.message)));
ok('linked to another Nuvio profile warns', v(mp(2, 'new'), [main, sub(2, 'Loina', { boundNuvio: [{ id: 5, name: 'X' }] })]).warnings.some((w) => /linked to another Nuvio profile/.test(w.message)));
ok('a missing row is an error', validateMapping(rows, [], acct).errors.length === 2);
ok('a vanished target is an error', v(mp(99, 'new')).errors.some((e) => /no longer exists/.test(e.message)));
const full = [main, ...Array.from({ length: 9 }, (_, i) => sub(10 + i, `P${i}`))];
ok('exceeding 10 profiles is an error', v(mp('new', 'new'), full).errors.some((e) => e.key === null && /10 profiles/.test(e.message)));
ok('10 profiles with mapping onto existing is fine', v(mp(10, 11), full).errors.length === 0);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

// Run: node --experimental-strip-types wizard/web/src/store/wizard.test.mts
import { bingecatRows, rolesOf, useWizard } from './wizard.ts';

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`);
}

const { setAioStreamsInput } = useWizard.getState();
const inputs = () => useWizard.getState().aioStreamsInputs;

console.log('\n# setAioStreamsInput: nested dotted paths');
{
  setAioStreamsInput('bitrate.bitrateCap', '200');
  eq('nested write creates branch', inputs(), { bitrate: { bitrateCap: '200' } });

  setAioStreamsInput('bitrate.bitrateCapSoft', true);
  eq('sibling write preserves branch', inputs().bitrate, { bitrateCap: '200', bitrateCapSoft: true });

  setAioStreamsInput('addonPreset', 'default');
  ok('flat write still works', inputs().addonPreset === 'default');
  eq('flat write does not disturb branch', inputs().bitrate, { bitrateCap: '200', bitrateCapSoft: true });
}

const { toggleDebridService, setDebridCredential } = useWizard.getState();

console.log('\n# Debrid service credentials');
{
  const services = () => useWizard.getState().credentials.debridServices;

  toggleDebridService('offcloud');
  eq('toggleDebridService creates empty credentials object', services(), [
    { id: 'offcloud', credentials: {} },
  ]);

  setDebridCredential('offcloud', 'apiKey', 'oc-key');
  setDebridCredential('offcloud', 'email', 'person@example.com');
  setDebridCredential('offcloud', 'password', 'secret');
  eq('setDebridCredential stores multiple fields per service', services(), [
    { id: 'offcloud', credentials: { apiKey: 'oc-key', email: 'person@example.com', password: 'secret' } },
  ]);

  toggleDebridService('offcloud');
  eq('toggleDebridService removes selected service', services(), []);
}

const { setWatchly, setInstallResult } = useWizard.getState();

console.log('\n# WatchlyState');
{
  const get = () => useWizard.getState().watchly;

  ok('watchly initial enabled = false', get().enabled === false);

  setWatchly({ enabled: true });
  ok('setWatchly enabled = true', get().enabled === true);
}

console.log('\n# Watchly target defaults');
{
  const { setTarget } = useWizard.getState();
  setWatchly({ enabled: false });
  setTarget('nuvio');
  ok('Nuvio enables Watchly by default', useWizard.getState().watchly.enabled === true);
  setWatchly({ enabled: false });
  setTarget('stremio');
  ok('Stremio keeps Watchly enabled by default', useWizard.getState().watchly.enabled === true);
}

console.log('\n# AccountInfo.userId');
{
  const { setStremioAccount } = useWizard.getState();
  setStremioAccount({ userId: 'user-xyz' });
  ok('setStremioAccount persists userId', useWizard.getState().stremioAccount.userId === 'user-xyz');
}

console.log('\n# InstallResult.watchly + aiometadata.instance/config');
{
  const get = () => useWizard.getState().installResult;

  setInstallResult({
    previousAddons: [
      { name: 'Old Addon', manifestUrl: 'https://old.example/manifest.json' },
    ],
    watchly: { manifestUrl: 'https://watchly.example/u1/manifest.json', token: 'u1' },
    aiometadata: {
      manifestUrl: 'https://meta.example/stremio/u2/manifest.json',
      uuid: 'u2',
      password: 'pw2',
      instance: 'https://meta.example',
      config: { language: 'en-US', apiKeys: { tmdb: 'k' } },
    },
  });
  eq('installResult.previousAddons', get().previousAddons, [
    { name: 'Old Addon', manifestUrl: 'https://old.example/manifest.json' },
  ]);
  ok('installResult.watchly.token', get().watchly?.token === 'u1');
  ok('installResult.watchly.manifestUrl', !!get().watchly?.manifestUrl.includes('u1'));
  ok('installResult.aiometadata.instance', get().aiometadata?.instance === 'https://meta.example');
  eq('installResult.aiometadata.config', get().aiometadata?.config, { language: 'en-US', apiKeys: { tmdb: 'k' } });
}

console.log('\n# Nuvio profile selection');
{
  const { toggleNuvioProfile, setNuvioProfiles } = useWizard.getState();
  const get = () => useWizard.getState().nuvioProfiles;

  eq('default selection is one new profile', get(), [{ nuvioProfileId: 'new', name: 'Profile 1', kids: false }]);
  eq('installResult.profiles defaults to []', useWizard.getState().installResult.profiles, []);

  setNuvioProfiles([{ nuvioProfileId: 'new', name: 'Extra', kids: false }]);
  toggleNuvioProfile({ profile_index: 3, name: 'Bini' });
  toggleNuvioProfile({ profile_index: 1, name: 'Ben' });
  eq('toggle on adds existing profiles sorted by index, new ones last', get().map(p => p.nuvioProfileId), [1, 3, 'new']);
  eq('toggle copies the profile name and kids=false', get()[0], { nuvioProfileId: 1, name: 'Ben', kids: false });

  toggleNuvioProfile({ profile_index: 3, name: 'Bini' });
  eq('toggle off removes only that profile', get().map(p => p.nuvioProfileId), [1, 'new']);
}

console.log('\n# Recommendations: Watchly / BingeCat exclusion');
{
  const st = () => useWizard.getState();
  const flags = () => [st().watchly.enabled, st().bingecat.enabled];
  st().setTarget('nuvio');
  eq('start: Watchly on, BingeCat off', flags(), [true, false]);
  st().toggleRecommendation('bingecat');
  eq('turning BingeCat on turns Watchly off (once)', flags(), [false, true]);
  st().toggleRecommendation('watchly');
  eq('turning Watchly on afterwards keeps both (the user asked for it)', flags(), [true, true]);
  st().toggleRecommendation('bingecat');
  eq('either can be turned off on its own', flags(), [true, false]);
  st().toggleRecommendation('bingecat');
  eq('and back on without touching the other', flags(), [true, true]);
  st().setTarget('nuvio');
  eq('a new target resets the choice', [...flags(), st().recoAutoExclusive], [true, false, true]);
}

console.log('\n# rolesOf and bingecatRows');
{
  const base = { target: 'nuvio' as const, stremioKids: false, bingecat: { enabled: false } };
  const ben = { nuvioProfileId: 1 as const, name: 'Ben', kids: false };
  const tara = { nuvioProfileId: 2 as const, name: 'Tara', kids: true };
  eq('mixed run has both kinds', rolesOf({ ...base, nuvioProfiles: [ben, tara] }), { hasStandard: true, hasKids: true });
  eq('Kids only has no Standard', rolesOf({ ...base, nuvioProfiles: [tara] }), { hasStandard: false, hasKids: true });
  eq('an empty list counts as Standard (sign-in still loading)', rolesOf({ ...base, nuvioProfiles: [] }), { hasStandard: true, hasKids: false });
  eq('Stremio follows the Kids toggle', [rolesOf({ ...base, target: 'stremio', nuvioProfiles: [], stremioKids: true }).hasStandard, rolesOf({ ...base, target: 'stremio', nuvioProfiles: [] }).hasStandard], [false, true]);
  eq('feature off: no BingeCat rows at all', bingecatRows({ ...base, nuvioProfiles: [ben, tara] }, false), []);
  eq('Kids rows always, Standard rows only when BingeCat is on', [
    bingecatRows({ ...base, nuvioProfiles: [ben, tara] }, true).map((r) => r.key),
    bingecatRows({ ...base, bingecat: { enabled: true }, nuvioProfiles: [ben, tara] }, true).map((r) => r.key),
  ], [[2], [1, 2]]);
  eq('new (unsaved) profiles are never rows', bingecatRows({ ...base, bingecat: { enabled: true }, nuvioProfiles: [{ nuvioProfileId: 'new', name: 'x', kids: false }] }, true), []);
  eq('Stremio row is key 0, named Kids for a Kids account', bingecatRows({ ...base, target: 'stremio', stremioKids: true, nuvioProfiles: [] }, true), [{ key: 0, name: 'Kids', kids: true }]);
  eq('Stremio Standard without BingeCat has no row', bingecatRows({ ...base, target: 'stremio', nuvioProfiles: [] }, true), []);
}

console.log('\n# Role flip guard and BingeCat state');
{
  const st = () => useWizard.getState();
  st().setTarget('nuvio');
  st().setNuvioProfiles([{ nuvioProfileId: 1, name: 'Ben', kids: false }, { nuvioProfileId: 2, name: 'Tara', kids: false }]);
  useWizard.setState({ step: 5, maxReachedStep: 9 });
  st().setNuvioProfileKids(1, true);
  eq('Kids switch on one of two Standard profiles keeps the numbering (no clamp)', st().maxReachedStep, 9);
  st().setNuvioProfileKids(0, true);
  eq('losing the last Standard profile drops the reached mark to the current step', [st().maxReachedStep, st().nuvioProfiles.map((p) => p.kids)], [5, [true, true]]);
  useWizard.setState({ step: 5, maxReachedStep: 9 });
  st().setStremioKids(true);
  eq('Stremio Kids toggle does not touch a Nuvio run', st().maxReachedStep, 9);

  st().setBingecat({ token: 't', expiresAt: 99, accountName: 'acct', enabled: true, mapping: [{ key: 1, target: 'new', reason: 'new' }, { key: 2, target: 'new', reason: 'new' }] });
  st().bingecatProfileCreated(2, { id: 77, name: 'Tara' });
  eq('a created BingeCat profile is stored and mapped (the other row is untouched)', [st().bingecat.profiles.map((p) => p.id), st().bingecat.mapping], [[77], [{ key: 1, target: 'new', reason: 'new' }, { key: 2, target: 77, reason: 'created' }]]);
  st().disconnectBingecat();
  eq('disconnect clears the token and profiles but keeps the toggle', [st().bingecat.token, st().bingecat.profiles, st().bingecat.mapping, st().bingecat.enabled], [null, [], [], true]);
}

console.log('\n# LoadedTemplates.watchly');
{
  const { setTemplates } = useWizard.getState();
  setTemplates({
    aiostreams: { items: [] },
    aiometadata: { config: {} },
    collections: [],
    settings: null,
    watchly: { watch_history_source: 'stremio', language: 'en-US' },
  });
  ok('templates.watchly is stored', !!useWizard.getState().templates?.watchly);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

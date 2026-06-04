// Run: node --experimental-strip-types wizard/web/src/store/wizard.test.mts
import { useWizard } from './wizard.ts';

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

const { setWatchly, setInstallResult } = useWizard.getState();

console.log('\n# WatchlyState');
{
  const get = () => useWizard.getState().watchly;

  ok('watchly initial enabled = false', get().enabled === false);
  ok('watchly initial nuvioStremioLogin = null', get().nuvioStremioLogin === null);

  setWatchly({ enabled: true });
  ok('setWatchly enabled = true', get().enabled === true);
  ok('setWatchly preserves nuvioStremioLogin', get().nuvioStremioLogin === null);

  setWatchly({ nuvioStremioLogin: { email: 'a@b.com', password: 'pw', authKey: 'ak', userId: 'uid1' } });
  ok('setWatchly sets nuvioStremioLogin', get().nuvioStremioLogin?.authKey === 'ak');
  ok('setWatchly preserves enabled', get().enabled === true);

  setWatchly({ nuvioStremioLogin: null });
  ok('setWatchly can clear nuvioStremioLogin', get().nuvioStremioLogin === null);
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
    watchly: { manifestUrl: 'https://watchly.example/u1/manifest.json', token: 'u1' },
    aiometadata: {
      manifestUrl: 'https://meta.example/stremio/u2/manifest.json',
      uuid: 'u2',
      password: 'pw2',
      instance: 'https://meta.example',
      config: { language: 'en-US', apiKeys: { tmdb: 'k' } },
    },
  });
  ok('installResult.watchly.token', get().watchly?.token === 'u1');
  ok('installResult.watchly.manifestUrl', !!get().watchly?.manifestUrl.includes('u1'));
  ok('installResult.aiometadata.instance', get().aiometadata?.instance === 'https://meta.example');
  eq('installResult.aiometadata.config', get().aiometadata?.config, { language: 'en-US', apiKeys: { tmdb: 'k' } });
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

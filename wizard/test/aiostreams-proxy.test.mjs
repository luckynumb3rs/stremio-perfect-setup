import {
  createAioStreamsAdapter,
  createWithFallbacks,
  extractFailedManifestAddons,
  disableInternalAddons,
} from '../core/adapters/aiostreams.js';

const target = 'https://aiostreams.example/api/v1/user';

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
  }
}

async function capturePostedUrl(proxyBase) {
  let postedUrl = '';
  globalThis.fetch = async (url) => {
    postedUrl = String(url);
    return {
      status: 201,
      async json() {
        return { data: { uuid: 'u', encryptedPassword: 'p' } };
      },
    };
  };

  const adapter = createAioStreamsAdapter('https://aiostreams.example', { proxyBase });
  await adapter.createConfig({
    template: { config: { services: [] }, metadata: { inputs: [] } },
    inputs: {},
    services: [],
    credentials: {},
    serviceCredentials: {},
    password: 'secret',
  });
  return postedUrl;
}

console.log('\n# AIOStreams proxy URL building');

ok(
  'plain proxyBase uses raw path target',
  await capturePostedUrl('https://proxy.numb3rs.stream') === target.replace('https://aiostreams.example', 'https://proxy.numb3rs.stream/https://aiostreams.example')
);

ok(
  'query proxyBase encodes target URL',
  await capturePostedUrl('https://proxy.example/?url=') === `https://proxy.example/?url=${encodeURIComponent(target)}`
);

ok(
  'raw placeholder proxyBase injects unencoded target',
  await capturePostedUrl('https://proxy.example/{url}') === `https://proxy.example/${target}`
);

ok(
  'encoded placeholder proxyBase injects encoded target',
  await capturePostedUrl('https://proxy.example/{url_encoded}') === `https://proxy.example/${encodeURIComponent(target)}`
);

console.log('\n# AIOStreams manifest failure helpers');
{
  const names = extractFailedManifestAddons('Failed to fetch manifest for Sootio. Failed to fetch manifest for HD Hub');
  ok('extractFailedManifestAddons finds all addon names', JSON.stringify(names) === JSON.stringify(['Sootio', 'HD Hub']));

  const config = {
    presets: [
      { type: 'torrentio', enabled: true, options: { name: 'Torrentio' } },
      { type: 'sootio', enabled: true, options: { name: 'Sootio' } },
    ],
  };
  const result = disableInternalAddons(config, ['Sootio']);
  ok('disableInternalAddons returns disabled name', JSON.stringify(result.disabledAddonNames) === JSON.stringify(['Sootio']));
  ok('disableInternalAddons flips matching preset off', result.config.presets[1].enabled === false);
  ok('disableInternalAddons leaves non-matching preset alone', result.config.presets[0].enabled === true);
  ok('disableInternalAddons does not mutate original config', config.presets[1].enabled === true);
}

console.log('\n# AIOStreams retries with broken internal addon disabled');
{
  let requestCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    requestCount++;
    const { config } = JSON.parse(options.body);
    const sootio = config.presets.find((preset) => preset.options?.name === 'Sootio');
    const sootioEnabled = sootio?.enabled !== false;

    if (sootioEnabled) {
      return {
        status: 400,
        async json() {
          return { error: { message: 'Failed to fetch manifest for Sootio' } };
        },
        async text() {
          return 'Failed to fetch manifest for Sootio';
        },
      };
    }

    return {
      status: 201,
      async json() {
        return { data: { uuid: 'uuid-1', encryptedPassword: 'enc-1' } };
      },
    };
  };

  const retried = await createWithFallbacks(
    ['https://instance-a.example', 'https://instance-b.example'],
    {
      template: {
        metadata: { inputs: [] },
        config: {
          presets: [
            { type: 'torrentio', enabled: true, options: { name: 'Torrentio' } },
            { type: 'sootio', enabled: true, options: { name: 'Sootio' } },
          ],
        },
      },
      inputs: {},
      services: [],
      credentials: {},
      serviceCredentials: {},
      password: 'secret',
    }
  );

  ok('createWithFallbacks retries after disabling shared failed addon', requestCount === 3);
  ok('createWithFallbacks reports disabled internal addon', JSON.stringify(retried.disabledInternalAddons) === JSON.stringify(['Sootio']));
  ok('createWithFallbacks returns retry warning', retried.retryWarnings.length === 1 && retried.retryWarnings[0].includes('Sootio'));
  ok('createWithFallbacks still returns a primary result', retried.primary?.manifestUrl === 'https://instance-a.example/stremio/uuid-1/enc-1/manifest.json');
}

console.log('\n# AIOStreams stops after first successful instance');
{
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return {
      status: 201,
      async json() {
        return { data: { uuid: 'uuid-stop', encryptedPassword: 'enc-stop' } };
      },
    };
  };

  const result = await createWithFallbacks(
    ['https://instance-a.example', 'https://instance-b.example'],
    {
      template: { metadata: { inputs: [] }, config: { presets: [] } },
      inputs: {},
      services: [],
      credentials: {},
      serviceCredentials: {},
      password: 'secret',
    }
  );

  ok('createWithFallbacks only posts to the first successful instance', seen.length === 1 && seen[0] === 'https://instance-a.example/api/v1/user');
  ok('createWithFallbacks returns the first successful manifest', result.primary?.manifestUrl === 'https://instance-a.example/stremio/uuid-stop/enc-stop/manifest.json');
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

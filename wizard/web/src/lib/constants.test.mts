// Run: node --experimental-strip-types wizard/web/src/lib/constants.test.mts
import { normalizeWizardConfig, resolveWizardConfig } from './constants.ts';

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`);
}

function withMockedRandom(values: number[], run: () => void) {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => values[index++] ?? 0;
  try {
    run();
  } finally {
    Math.random = originalRandom;
  }
}

console.log('\n# normalizeWizardConfig: shuffles instance order per load');
withMockedRandom([0, 0, 0, 0, 0, 0], () => {
  const source = {
    configurations: [
      {
        name: 'Primary',
        targets: ['stremio'],
        addonDetailsFilenamePrefix: 'addons',
        keys: {
          tmdbApiKeys: [],
          tmdbReadAccessTokens: [],
          tvdbApiKeys: [],
          geminiApiKeys: [],
          rpdbApiKeys: [],
        },
        limits: {
          stremioMaxCatalogs: 10,
        },
        instances: {
          aiostreams: ['https://aio-1.example', 'https://aio-2.example', 'https://aio-3.example'],
          aiometadata: ['https://meta-1.example', 'https://meta-2.example'],
          watchly: ['https://watch-1.example', 'https://watch-2.example'],
        },
        templates: {
          stremio: {
            aiostreams: 'templates/AIOStreams.json',
            aiometadata: 'templates/AIOMetadata.json',
          },
          nuvio: {
            aiostreams: 'templates/AIOStreams.json',
            aiometadata: 'templates/AIOMetadata.json',
            collections: 'templates/Nuvio-Collections.json',
            settings: 'templates/Nuvio-Settings.json',
          },
        },
      },
    ],
  };

  const resolved = resolveWizardConfig(source, 'stremio');
  ok('resolved config exists', !!resolved);
  eq('aiostreams order is shuffled once at load', resolved?.instances.aiostreams, [
    'https://aio-2.example',
    'https://aio-3.example',
    'https://aio-1.example',
  ]);
  eq('aiometadata order is shuffled once at load', resolved?.instances.aiometadata, [
    'https://meta-2.example',
    'https://meta-1.example',
  ]);
  eq('watchly order is shuffled once at load', resolved?.instances.watchly, [
    'https://watch-2.example',
    'https://watch-1.example',
  ]);
});

console.log('\n# normalizeWizardConfig: preserves instance membership');
withMockedRandom([0, 0, 0], () => {
  const normalized = normalizeWizardConfig({
    configurations: [
      {
        name: 'Membership',
        targets: ['stremio'],
        addonDetailsFilenamePrefix: 'addons',
        keys: {
          tmdbApiKeys: [],
          tmdbReadAccessTokens: [],
          tvdbApiKeys: [],
          geminiApiKeys: [],
          rpdbApiKeys: [],
        },
        limits: {
          stremioMaxCatalogs: 10,
        },
        instances: {
          aiostreams: ['a', 'b', 'c'],
          aiometadata: ['d', 'e'],
        },
        templates: {
          stremio: {
            aiostreams: 'templates/AIOStreams.json',
            aiometadata: 'templates/AIOMetadata.json',
          },
          nuvio: {
            aiostreams: 'templates/AIOStreams.json',
            aiometadata: 'templates/AIOMetadata.json',
            collections: 'templates/Nuvio-Collections.json',
            settings: 'templates/Nuvio-Settings.json',
          },
        },
      },
    ],
  });

  const config = normalized.configurations[0];
  eq('aiostreams membership is unchanged', [...config.instances.aiostreams].sort(), ['a', 'b', 'c']);
  eq('aiometadata membership is unchanged', [...config.instances.aiometadata].sort(), ['d', 'e']);
});

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

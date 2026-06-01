import { buildAddonCollection, hydrateAddonCollection, resolveCinemetaDescriptor } from '../core/adapters/stremio.js';

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

console.log('\n# Stremio addon collection');

{
  const existing = [
    {
      transportUrl: 'https://v3-cinemeta.strem.io/manifest.json',
      manifest: {
        id: 'com.linvo.cinemeta',
        name: 'Cinemeta',
        resources: ['catalog', 'meta', 'addon_catalog'],
        catalogs: [
          { id: 'top', extra: [{ name: 'search' }], extraSupported: ['search'] },
        ],
      },
      flags: { official: true, protected: true },
    },
    {
      transportUrl: 'http://127.0.0.1:11470/local-addon/manifest.json',
      manifest: { id: 'org.stremio.local', name: 'Local Files (without catalog support)' },
      flags: { official: true, protected: true },
    },
    {
      transportUrl: 'https://old.example/manifest.json',
      manifest: { id: 'old-addon', name: 'Old Addon' },
      flags: {},
    },
  ];

  const collection = buildAddonCollection(existing, {
    aiometadata: 'https://aiometadata.example/stremio/user/manifest.json',
    aiostreams: 'https://aiostreams.example/stremio/user/password/manifest.json',
  }, { cleanCinemeta: { removeSearch: true, removeCatalogs: true, removeMetadata: true } });

  ok('buildAddonCollection keeps only cinemeta + generated addons + local files', collection.length === 4);
  ok('buildAddonCollection inserts AIOMetadata second', collection[1].transportUrl === 'https://aiometadata.example/stremio/user/manifest.json');
  ok('buildAddonCollection inserts AIOStreams third', collection[2].transportUrl === 'https://aiostreams.example/stremio/user/password/manifest.json');
  ok('buildAddonCollection drops old addon', !collection.some((addon) => addon.transportUrl === 'https://old.example/manifest.json'));
  ok('buildAddonCollection patches Cinemeta catalogs away', collection[0].manifest.catalogs.length === 0);
  ok('buildAddonCollection patches Cinemeta metadata resource away', !collection[0].manifest.resources.includes('meta'));
  ok('buildAddonCollection uses http transport for custom manifests', collection[1].transportName === 'http' && collection[2].transportName === 'http');
}

{
  const existing = [
    {
      transportUrl: 'http://127.0.0.1:11470/local-addon/manifest.json',
      manifest: { id: 'org.stremio.local', name: 'Local Files (without catalog support)' },
      flags: { official: true, protected: true },
    },
  ];

  let resolvedUrl = '';
  const cinemetaDescriptor = await resolveCinemetaDescriptor(existing, async (url) => {
    resolvedUrl = url;
    return {
      ok: true,
      async json() {
        return {
          id: 'com.linvo.cinemeta',
          name: 'Cinemeta',
          resources: ['catalog', 'meta', 'addon_catalog'],
          catalogs: [
            { id: 'cinemeta.search', type: 'movie', extra: [{ name: 'search' }] },
            { id: 'cinemeta.search', type: 'series', extra: [{ name: 'search' }] },
            { id: 'top', type: 'movie', extra: [{ name: 'genre' }, { name: 'search' }], extraSupported: ['genre', 'search'] },
            { id: 'top', type: 'series', extra: [{ name: 'genre' }, { name: 'search' }], extraSupported: ['genre', 'search'] },
          ],
        };
      },
    };
  });

  const collection = buildAddonCollection(existing, {
    aiometadata: 'https://aiometadata.example/stremio/user/manifest.json',
    aiostreams: 'https://aiostreams.example/stremio/user/password/manifest.json',
  }, {
    cinemetaDescriptor,
    cleanCinemeta: { removeSearch: true, removeCatalogs: true, removeMetadata: true },
  });

  ok('resolveCinemetaDescriptor fetches the official Cinemeta manifest for fresh accounts', resolvedUrl === 'https://v3-cinemeta.strem.io/manifest.json');
  ok('buildAddonCollection injects official Cinemeta when the account collection omits it', collection[0].transportUrl === 'https://v3-cinemeta.strem.io/manifest.json');
  ok('buildAddonCollection patches injected Cinemeta catalogs away for fresh accounts', collection[0].manifest.catalogs.length === 0);
  ok('buildAddonCollection patches injected Cinemeta metadata resource away for fresh accounts', !collection[0].manifest.resources.includes('meta'));
  ok('buildAddonCollection preserves Local Files when injecting Cinemeta', collection[3].manifest?.id === 'org.stremio.local');
}

console.log('\n# hydrateAddonCollection');

{
  const collection = [
    {
      transportUrl: 'https://aiometadata.example/stremio/user/manifest.json',
      transportName: 'http',
      manifest: undefined,
      flags: {},
    },
    {
      transportUrl: 'https://existing.example/manifest.json',
      transportName: 'http',
      manifest: { id: 'existing', name: 'Existing' },
      flags: {},
    },
  ];

  let fetchCount = 0;
  const hydrated = await hydrateAddonCollection(collection, async (url) => {
    fetchCount++;
    return {
      ok: true,
      async json() {
        return { id: `id:${url}`, name: `Name:${url}` };
      },
    };
  });

  ok('hydrateAddonCollection fetches only missing manifests', fetchCount === 1);
  ok('hydrateAddonCollection fills manifest JSON', hydrated[0].manifest?.id === 'id:https://aiometadata.example/stremio/user/manifest.json');
  ok('hydrateAddonCollection preserves existing manifests', hydrated[1].manifest?.id === 'existing');
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

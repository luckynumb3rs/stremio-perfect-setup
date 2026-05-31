import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EXCLUDED_CATALOG_IDS, DISCOVER_EMOJIS,
  deriveCategoryKey, deriveCategories, deriveDiscoverFolders,
  defaultEnabledCategories, countEnabledCatalogs, buildAioMetadataConfig,
} from '../core/catalog-config.js';
import { filterCollections } from '../core/nuvio-collections.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const stremioTemplate = JSON.parse(readFileSync(join(root, 'templates', 'AIOMetadata.json'), 'utf8'));
const nuvioTemplate = JSON.parse(readFileSync(join(root, 'templates', 'AIOMetadata-All.json'), 'utf8'));
const collections = JSON.parse(readFileSync(join(root, 'collections', 'nuvio-collections.json'), 'utf8'));
const catalogs = stremioTemplate.config.catalogs;

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}

console.log('\n# EXCLUDED_CATALOG_IDS');
for (const id of ['tmdb.airing_today','tmdb.year','tmdb.language','tvmaze.schedule','tvdb.trending','tvdb.genres','tvdb.collections']) {
  ok(`${id} is excluded`, EXCLUDED_CATALOG_IDS.has(id));
}
ok('tmdb.top NOT excluded (popular catalog must remain visible)', !EXCLUDED_CATALOG_IDS.has('tmdb.top'));

console.log('\n# deriveCategoryKey');
ok('Streaming emoji', deriveCategoryKey('🎬 Netflix') === '🎬');
ok('Genres emoji', deriveCategoryKey('🎭 Action') === '🎭');
ok('Anime emoji', deriveCategoryKey('🍥 Airing Now') === '🍥');
ok('Brazilian flag → world', deriveCategoryKey('🇧🇷 Brazilian') === 'world');
ok('Korean flag → world', deriveCategoryKey('🇰🇷 Korean') === 'world');
ok('Discover emoji Trakt', deriveCategoryKey('🎯 Trakt Recommendations') === '🎯');
ok('Discover emoji Popular', deriveCategoryKey('🏆 Popular') === '🏆');
ok('tmdb.language category (🌐) is excluded-group', deriveCategoryKey('🌐 By Language') === '🌐');

console.log('\n# deriveCategories: non-discover categories derived from emoji');
const cats = deriveCategories(catalogs, collections);
const keys = cats.map(c => c.key);
ok('🎬 Streaming category present', keys.includes('🎬'));
ok('🎭 Genres present', keys.includes('🎭'));
ok('🍥 Anime present as own category', keys.includes('🍥'));
ok('🌍 World present (flag catalogs)', keys.includes('world'));
ok('Discover emojis NOT in regular categories', !keys.some(k => DISCOVER_EMOJIS.has(k)));
ok('Excluded emoji groups absent (🌐)', !keys.includes('🌐'));
ok('Excluded emoji groups absent (📅)', !keys.includes('📅'));
ok('Excluded emoji groups absent (⌚)', !keys.includes('⌚'));
ok('🎬 count === 28', cats.find(c => c.key === '🎬')?.count === 28);
ok('🕒 Runtime count === 4', cats.find(c => c.key === '🕒')?.count === 4);

console.log('\n# deriveDiscoverFolders: folder-granular discover section');
const discover = deriveDiscoverFolders(catalogs);
const discoverLabels = discover.map(d => d.label);
ok('Trakt folder present', discoverLabels.some(l => l.includes('Trakt')));
ok('Popular folder present', discoverLabels.some(l => l.includes('Popular')));
ok('Trending folder present', discoverLabels.some(l => l.includes('Trending')));
ok('Top Rated folder present', discoverLabels.some(l => l.includes('Top Rated')));
ok('Each discover folder has catalogIds', discover.every(d => d.catalogIds.size > 0));

console.log('\n# defaultEnabledCategories: Stremio starts from reference defaults');
const stremioDefaults = defaultEnabledCategories(catalogs, 'stremio', collections);
ok('Stremio: 🎬 Streaming enabled by default', stremioDefaults.categories.has('🎬'));
ok('Stremio: 🏰 Studios NOT enabled by default', !stremioDefaults.categories.has('🏰'));
ok('Stremio: 🌍 World NOT enabled by default', !stremioDefaults.categories.has('world'));

const nuvioDefaults = defaultEnabledCategories(nuvioTemplate.config.catalogs, 'nuvio', collections);
ok('Nuvio: 🏰 Studios enabled by default', nuvioDefaults.categories.has('🏰'));
ok('Nuvio: 🌍 World enabled by default', nuvioDefaults.categories.has('world'));

console.log('\n# countEnabledCatalogs: Stremio 120-catalog cap enforcement');
const allEnabledCategories = new Set(cats.map(c => c.key));
const allDiscoverIds = new Set(discover.map(d => d.label));
const totalWhenAll = countEnabledCatalogs(catalogs, allEnabledCategories, allDiscoverIds);
ok('All-enabled count > 120 (Stremio would overflow)', totalWhenAll > 120);
const stremioCount = countEnabledCatalogs(
  catalogs, stremioDefaults.categories, stremioDefaults.discoverFolderIds
);
ok('Stremio defaults count <= 120', stremioCount <= 120, `got ${stremioCount}`);

console.log('\n# buildAioMetadataConfig: config object ready to POST');
const cfg = buildAioMetadataConfig(stremioTemplate, {
  enabledCategories: stremioDefaults.categories,
  enabledDiscoverFolderIds: stremioDefaults.discoverFolderIds,
  target: 'stremio',
  apiKeys: { tmdb: 'K', tmdbAccess: 'A', tvdb: 'V', gemini: '', rpdb: 't0-free-rpdb' },
  language: 'en-US',
});
ok('Has config.catalogs array', Array.isArray(cfg.config.catalogs));
ok('No excluded catalog IDs present and enabled', cfg.config.catalogs.every(c =>
  !EXCLUDED_CATALOG_IDS.has(c.id) || !c.enabled));
ok('Stremio: showInHome=true for enabled catalogs', cfg.config.catalogs.filter(c => c.enabled).every(c => c.showInHome === true));
ok('apiKeys.tmdb populated', cfg.config.apiKeys?.tmdb === 'K');
ok('language set', cfg.config.language === 'en-US');

const nuvioCfg = buildAioMetadataConfig(nuvioTemplate, {
  enabledCategories: nuvioDefaults.categories,
  enabledDiscoverFolderIds: nuvioDefaults.discoverFolderIds,
  target: 'nuvio',
  apiKeys: { tmdb: 'K', tmdbAccess: 'A', tvdb: 'V', gemini: '', rpdb: 't0-free-rpdb' },
  language: 'en-US',
});
ok('Nuvio: showInHome=false for ALL enabled catalogs', nuvioCfg.config.catalogs.filter(c => c.enabled).every(c => c.showInHome === false));

// ─── nuvio-collections tests ───────────────────────────────────────────────

console.log('\n# filterCollections: Nuvio collections filtered to enabled categories');
{
  // All enabled: all 8 groups pass through
  const allCats = new Set(['🎬','🎭','🍥','🎨','🏰','🎥','🕒','world']);
  const allDiscover = new Set(deriveDiscoverFolders(catalogs).map(d => d.id));
  const all = filterCollections(collections, catalogs, { enabledCategories: allCats, enabledDiscoverFolderIds: allDiscover });
  ok('All enabled: all top-level groups present', all.length === collections.length);

  // Disable Studios: Studios group should be filtered out (no folders left)
  const noStudios = new Set(['🎬','🎭','🍥','🎨','🎥','🕒','world']);
  const filteredStudios = filterCollections(collections, catalogs, { enabledCategories: noStudios, enabledDiscoverFolderIds: allDiscover });
  const studioGroup = filteredStudios.find(g => g.title?.includes('Studios'));
  ok('Studios group absent when disabled', !studioGroup || studioGroup.folders.length === 0);

  // Disable Anime: Genres group stays but anime folders removed
  const noAnime = new Set(['🎬','🎭','🎨','🏰','🎥','🕒','world']);
  const filteredAnime = filterCollections(collections, catalogs, { enabledCategories: noAnime, enabledDiscoverFolderIds: allDiscover });
  const genreGroup = filteredAnime.find(g => g.title?.includes('Genres'));
  ok('Genres group still present when only Anime disabled', !!genreGroup);
  // Anime folders reference catalogs with IDs that have deriveCategoryKey(name) === '🍥'
  const animeCatalogIds = catalogs.filter(c => deriveCategoryKey(c.name) === '🍥').map(c => c.id);
  const hasAnimeFolders = genreGroup?.folders.some(f =>
    (f.catalogSources || []).some(s => animeCatalogIds.includes(s.catalogId))
  );
  ok('No anime folders in Genres when Anime disabled', !hasAnimeFolders);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

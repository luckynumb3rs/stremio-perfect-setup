// Catalog category logic for the AIOMetadata config builder.
// Category keys are the leading emoji character of each catalog's name.
// Country flag catalogs (regional indicator pairs) all map to the key 'world'.

// Catalog IDs that are always disabled and never shown in the wizard UI.
// Source of truth: scripts/sync-aiometadata.sh EXCLUDED_CATALOG_IDS
export const EXCLUDED_CATALOG_IDS = new Set([
  'tmdb.airing_today',
  'tmdb.year',
  'tmdb.language',
  'tvmaze.schedule',
  'tvdb.trending',
  'tvdb.genres',
  'tvdb.collections',
]);

// Emoji prefixes for the special "Discover" section (folder-granular, not category-level).
export const DISCOVER_EMOJIS = new Set(['🎯', '🏆', '🔥', '⭐']);

/**
 * Extract the leading emoji key from a catalog name.
 * Country flags (pairs of Regional Indicator symbols U+1F1E0–U+1F1FF) → 'world'.
 * All other leading emojis → that emoji character.
 */
export function deriveCategoryKey(name) {
  if (!name) return 'other';
  const chars = [...name]; // proper Unicode codepoint split
  // Regional indicator pair = country flag
  if (
    chars.length >= 2 &&
    chars[0].codePointAt(0) >= 0x1F1E0 && chars[0].codePointAt(0) <= 0x1F1FF &&
    chars[1].codePointAt(0) >= 0x1F1E0 && chars[1].codePointAt(0) <= 0x1F1FF
  ) return 'world';
  return chars[0] || 'other';
}

/**
 * Build an array of regular category objects (excludes Discover emojis and excluded IDs).
 * Each entry: { key, label, count, catalogs: catalog[] }
 * Labels sourced from nuvio-collections group titles where possible.
 * @param {object[]} catalogs    AIOMetadata catalog array
 * @param {object[]} collections nuvio-collections.json groups array
 */
export function deriveCategories(catalogs, collections) {
  // Build emoji → human label from nuvio-collections group titles
  const labelByEmoji = { world: '🌍 World' };
  for (const group of collections || []) {
    const firstChar = [...(group.title || '')][0];
    if (firstChar) labelByEmoji[firstChar] = group.title;
  }
  // 🍥 Anime is nested inside 🎭 Genres in nuvio-collections, so it won't have its own group entry
  labelByEmoji['🍥'] = '🍥 Anime';

  const map = new Map();
  for (const c of catalogs) {
    if (EXCLUDED_CATALOG_IDS.has(c.id)) continue;
    const key = deriveCategoryKey(c.name);
    if (DISCOVER_EMOJIS.has(key)) continue;
    if (!map.has(key)) {
      map.set(key, { key, label: labelByEmoji[key] || key, catalogs: [] });
    }
    map.get(key).catalogs.push(c);
  }
  return [...map.values()].map(g => ({ ...g, count: g.catalogs.length }));
}

/**
 * Build an array of discover folder objects (one per unique discover catalog name).
 * Each entry: { id (= label), emoji, label, catalogIds: Set<string> }
 */
export function deriveDiscoverFolders(catalogs) {
  const map = new Map();
  for (const c of catalogs) {
    if (EXCLUDED_CATALOG_IDS.has(c.id)) continue;
    const key = deriveCategoryKey(c.name);
    if (!DISCOVER_EMOJIS.has(key)) continue;
    if (!map.has(c.name)) {
      map.set(c.name, { id: c.name, emoji: key, label: c.name, catalogIds: new Set() });
    }
    map.get(c.name).catalogIds.add(c.id);
  }
  return [...map.values()];
}

/**
 * Derive the default enabled categories + discover folder IDs for a target.
 * A category is "on by default" only when ALL of its catalogs are enabled in the
 * base template. This ensures the Stremio 120-catalog cap is respected.
 * Stremio: mirrors AIOMetadata.json enabled flags (Studios/World/Anime partial → off)
 * Nuvio: mirrors AIOMetadata-All.json enabled flags (all non-excluded → all on)
 *
 * @returns {{ categories: Set<string>, discoverFolderIds: Set<string> }}
 */
export function defaultEnabledCategories(catalogs, target, collections) {
  const categories = new Set();
  const discoverFolderIds = new Set();
  const catObjs = deriveCategories(catalogs, collections);
  const discoverFolders = deriveDiscoverFolders(catalogs);

  for (const catObj of catObjs) {
    // A category is "on by default" only if ALL of its catalogs are enabled in the template.
    // This enforces the ~120-catalog Stremio cap: partial categories (e.g. Anime 5/16)
    // are excluded from defaults even though they exist in the UI.
    const allEnabled = catObj.catalogs.length > 0 && catObj.catalogs.every(c => c.enabled);
    if (allEnabled) categories.add(catObj.key);
  }
  for (const folder of discoverFolders) {
    const allEnabled = folder.catalogIds.size > 0 && [...folder.catalogIds].every(id => {
      const c = catalogs.find(x => x.id === id);
      return c?.enabled;
    });
    if (allEnabled) discoverFolderIds.add(folder.id);
  }
  return { categories, discoverFolderIds };
}

/**
 * Count how many catalogs would be enabled given the user's category + discover selections.
 * Used to enforce the ~120-catalog Stremio limit.
 */
export function countEnabledCatalogs(catalogs, enabledCategories, enabledDiscoverFolderIds) {
  let count = 0;
  for (const c of catalogs) {
    if (EXCLUDED_CATALOG_IDS.has(c.id)) continue;
    const key = deriveCategoryKey(c.name);
    if (DISCOVER_EMOJIS.has(key)) {
      // Discover: check if this catalog's folder is enabled
      // The folder label equals the catalog's name (folder id = c.name)
      if (enabledDiscoverFolderIds.has(c.name)) count++;
    } else {
      if (enabledCategories.has(key)) count++;
    }
  }
  return count;
}

/**
 * Build the final AIOMetadata config object from the base template + user selections.
 * Ready to POST to /api/config/save.
 *
 * @param {object} baseTemplate  Parsed AIOMetadata.json or AIOMetadata-All.json
 * @param {object} opts
 * @param {Set<string>} opts.enabledCategories       emoji keys
 * @param {Set<string>} opts.enabledDiscoverFolderIds catalog name labels
 * @param {'stremio'|'nuvio'} opts.target
 * @param {object} opts.apiKeys  { tmdb, tmdbAccess, tvdb, gemini, rpdb }
 * @param {string} opts.language e.g. 'en-US'
 */
export function buildAioMetadataConfig(baseTemplate, {
  enabledCategories, enabledDiscoverFolderIds, target, apiKeys, language,
}) {
  const showInHome = target === 'stremio'; // Stremio: true; Nuvio: false (shown via collections)

  const catalogs = baseTemplate.config.catalogs.map(c => {
    if (EXCLUDED_CATALOG_IDS.has(c.id)) return { ...c, enabled: false, showInHome: false };
    const key = deriveCategoryKey(c.name);
    const enabled = DISCOVER_EMOJIS.has(key)
      ? enabledDiscoverFolderIds.has(c.name)
      : enabledCategories.has(key);
    return { ...c, enabled, showInHome: enabled ? showInHome : false };
  });

  const config = {
    ...baseTemplate.config,
    language,
    catalogs,
    apiKeys: {
      ...(baseTemplate.config.apiKeys || {}),
      tmdb: apiKeys.tmdb || '',
      tmdbAccessToken: apiKeys.tmdbAccess || '',
      tvdb: apiKeys.tvdb || '',
      gemini: apiKeys.gemini || '',
      rpdb: apiKeys.rpdb || 't0-free-rpdb',
    },
  };

  return { config };
}

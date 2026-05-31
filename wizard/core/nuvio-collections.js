// Filter a nuvio-collections.json array to only include groups/folders
// whose content belongs to the user's enabled catalog categories.
// Anime folders nested inside the Genres group are filtered per-folder.

import { deriveCategoryKey, DISCOVER_EMOJIS } from './catalog-config.js';

/**
 * Build a lookup: catalogId → category key (emoji or 'world' or discover emoji).
 */
function buildCatalogIndex(catalogs) {
  const index = new Map();
  for (const c of catalogs) {
    index.set(c.id, { key: deriveCategoryKey(c.name), name: c.name });
  }
  return index;
}

/**
 * Determine whether a Nuvio folder's content belongs to an enabled category.
 * A folder is kept if ANY of its catalogSources maps to an enabled category.
 */
function isFolderEnabled(folder, catalogIndex, enabledCategories, enabledDiscoverFolderIds) {
  const sources = folder.catalogSources || [];
  if (sources.length === 0) return true; // no catalog sources; keep

  for (const src of sources) {
    if (!src.catalogId) continue;
    const entry = catalogIndex.get(src.catalogId);
    if (!entry) continue;
    const { key, name } = entry;

    if (DISCOVER_EMOJIS.has(key)) {
      if (enabledDiscoverFolderIds.has(name)) return true;
    } else {
      if (enabledCategories.has(key)) return true;
    }
  }
  return false;
}

/**
 * Filter a collections JSON array to match the user's enabled categories.
 * Groups with no remaining folders are removed entirely.
 *
 * @param {object[]} collections              nuvio-collections.json top-level array
 * @param {object[]} catalogs                 AIOMetadata catalog array (for id→name lookup)
 * @param {object}   opts
 * @param {Set}      opts.enabledCategories
 * @param {Set}      opts.enabledDiscoverFolderIds
 * @returns {object[]} filtered collections array
 */
export function filterCollections(collections, catalogs, { enabledCategories, enabledDiscoverFolderIds }) {
  const catalogIndex = buildCatalogIndex(catalogs);
  const result = [];

  for (const group of collections) {
    const filteredFolders = (group.folders || []).filter(folder =>
      isFolderEnabled(folder, catalogIndex, enabledCategories, enabledDiscoverFolderIds)
    );
    if (filteredFolders.length > 0) {
      result.push({ ...group, folders: filteredFolders });
    }
  }
  return result;
}

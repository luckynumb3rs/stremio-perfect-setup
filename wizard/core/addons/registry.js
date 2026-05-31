// Addon registry: describes every addon the wizard knows about.
// To add/retire an addon, edit this array. No flow code changes needed.
// status: 'active' | 'coming-soon'
// targets: array of 'stremio' and/or 'nuvio'

export const ADDON_REGISTRY = [
  {
    id: 'cinemeta',
    name: 'Cinemeta',
    description: 'Default Stremio metadata (patched to hand off to AIOMetadata)',
    targets: ['stremio'],
    status: 'active',
    internal: true, // not shown as user-facing addon; always present, patched automatically
  },
  {
    id: 'aiometadata',
    name: 'AIOMetadata',
    description: 'Metadata, catalogs, and poster ratings',
    targets: ['stremio', 'nuvio'],
    status: 'active',
  },
  {
    id: 'aiostreams',
    name: 'AIOStreams',
    description: 'Stream aggregation with smart sorting and filtering',
    targets: ['stremio', 'nuvio'],
    status: 'active',
  },
  {
    id: 'watchly',
    name: 'Watchly',
    description: 'Netflix-like recommendations and dynamic catalogs',
    targets: ['stremio'], // nuvio support pending Trakt-based library (dev in progress)
    status: 'coming-soon',
    deferredReason: 'Nuvio support pending Trakt-based library implementation by Watchly dev',
  },
];

/**
 * Return active (non-deferred) addons for a given target.
 */
export function getActiveAddons(target) {
  return ADDON_REGISTRY.filter(a => a.status === 'active' && a.targets.includes(target) && !a.internal);
}

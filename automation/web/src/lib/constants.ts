export const INSTANCES = {
  aiostreams: {
    primary: 'https://aiostreamsfortheweebsstable.midnightignite.me',
    fallbacks: ['https://aiostreams.fortheweak.cloud'],
  },
  aiometadata: {
    primary: 'https://aiometadata.viren070.me',
    fallbacks: ['https://aiometadatafortheweebs.midnightignite.me'],
  },
} as const;

// Raw GitHub URLs for templates (fetched at runtime, not bundled — files are too large to bundle)
export const TEMPLATE_URLS = {
  aiostreams:           'https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOStreams.json',
  aiometadataStremio:   'https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata.json',
  aiometadataNuvio:     'https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata-All.json',
  collections:          'https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/collections/nuvio-collections.json',
} as const;

export const RPDB_FREE_KEY = 't0-free-rpdb';

// Stremio maximum enabled catalogs — the instance's /api/config may return a specific value,
// but 120 is a safe conservative default from community documentation.
export const STREMIO_MAX_CATALOGS = 120;

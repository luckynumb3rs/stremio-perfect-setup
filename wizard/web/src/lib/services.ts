/// <reference types="vite/client" />
// All AIOStreams services with logo paths relative to the Vite base URL.
// Use resolveLogoUrl(service.logo) when setting img src.
// Logo paths do NOT have a leading slash so Vite can apply the base path correctly.

export interface Service {
  id: string;
  name: string;
  logo: string;     // relative path (no leading /) or '' if unavailable
  isDebrid: boolean;
  isUsenet: boolean;
}

// In production the compiled JS lives in /wizard/assets/, so we resolve logo
// files relative to the built bundle URL instead of relying on Vite to rewrite
// a dynamic `new URL()` pattern.
const builtAssetsBaseUrl = new URL(/* @vite-ignore */ './', import.meta.url);

/** Prepend the correct wizard asset base URL to a relative logo path. */
export function resolveLogoUrl(logo?: string | null): string {
  if (!logo) return '';
  const normalized = logo.replace(/^\/+/, '');

  // In dev, Vite serves files from /public at the site root.
  if (import.meta.env.DEV) {
    return `/${normalized}`;
  }

  // In production, public assets are copied into /wizard/assets/.
  if (normalized.startsWith('assets/')) {
    return new URL(normalized.replace(/^assets\//, ''), builtAssetsBaseUrl).toString();
  }

  return new URL(normalized, builtAssetsBaseUrl).toString();
}

export const SERVICES: Service[] = [
  { id: 'torbox',          name: 'TorBox',         logo: 'assets/logos/torbox.svg',      isDebrid: true,  isUsenet: false },
  { id: 'realdebrid',     name: 'Real-Debrid',    logo: 'assets/logos/realdebrid.png',  isDebrid: true,  isUsenet: false },
  { id: 'alldebrid',      name: 'AllDebrid',      logo: 'assets/logos/alldebrid.png',   isDebrid: true,  isUsenet: false },
  { id: 'debridlink',     name: 'Debrid-Link',    logo: 'assets/logos/debridlink.svg',  isDebrid: true,  isUsenet: false },
  { id: 'premiumize',     name: 'Premiumize',     logo: 'assets/logos/premiumize.svg',  isDebrid: true,  isUsenet: false },
  { id: 'easydebrid',     name: 'EasyDebrid',     logo: 'assets/logos/easydebrid.png',  isDebrid: true,  isUsenet: false },
  { id: 'debrider',       name: 'Debrider',       logo: 'assets/logos/debrider.svg',    isDebrid: true,  isUsenet: false },
  { id: 'pikpak',         name: 'PikPak',         logo: 'assets/logos/pikpak.png',      isDebrid: true,  isUsenet: false },
  { id: 'offcloud',       name: 'Offcloud',       logo: 'assets/logos/offcloud.png',    isDebrid: true,  isUsenet: false },
  { id: 'seedr',          name: 'Seedr',          logo: 'assets/logos/seedr.png',       isDebrid: true,  isUsenet: false },
  { id: 'putio',          name: 'Put.io',         logo: 'assets/logos/putio.svg',       isDebrid: true,  isUsenet: false },
  { id: 'easynews',       name: 'Easynews',       logo: 'assets/logos/easynews.png',    isDebrid: false, isUsenet: true  },
  { id: 'nzbdav',         name: 'NzbDAV',         logo: '',                             isDebrid: false, isUsenet: true  },
  { id: 'altmount',       name: 'AltMount',       logo: '',                             isDebrid: false, isUsenet: true  },
  { id: 'stremio_nntp',   name: 'Stremio NNTP',   logo: '',                             isDebrid: false, isUsenet: true  },
  { id: 'stremthru_newz', name: 'StremThru Newz', logo: '',                             isDebrid: false, isUsenet: true  },
];

export const DEBRID_SERVICES = SERVICES.filter(s => s.isDebrid);

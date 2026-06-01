/// <reference types="vite/client" />
import { resolveImageUrl } from './integration';

// All AIOStreams services with logo paths relative to the configured images base.

export interface Service {
  id: string;
  name: string;
  logo: string;
  isDebrid: boolean;
  isUsenet: boolean;
}

export function resolveLogoUrl(logo?: string | null): string {
  if (!logo) return '';
  return resolveImageUrl(logo);
}

export const SERVICES: Service[] = [
  { id: 'torbox',          name: 'TorBox',         logo: 'services/torbox.svg',      isDebrid: true,  isUsenet: false },
  { id: 'realdebrid',     name: 'Real-Debrid',    logo: 'services/realdebrid.png',  isDebrid: true,  isUsenet: false },
  { id: 'alldebrid',      name: 'AllDebrid',      logo: 'services/alldebrid.png',   isDebrid: true,  isUsenet: false },
  { id: 'debridlink',     name: 'Debrid-Link',    logo: 'services/debridlink.svg',  isDebrid: true,  isUsenet: false },
  { id: 'premiumize',     name: 'Premiumize',     logo: 'services/premiumize.svg',  isDebrid: true,  isUsenet: false },
  { id: 'easydebrid',     name: 'EasyDebrid',     logo: 'services/easydebrid.png',  isDebrid: true,  isUsenet: false },
  { id: 'debrider',       name: 'Debrider',       logo: 'services/debrider.svg',    isDebrid: true,  isUsenet: false },
  { id: 'pikpak',         name: 'PikPak',         logo: 'services/pikpak.png',      isDebrid: true,  isUsenet: false },
  { id: 'offcloud',       name: 'Offcloud',       logo: 'services/offcloud.png',    isDebrid: true,  isUsenet: false },
  { id: 'seedr',          name: 'Seedr',          logo: 'services/seedr.png',       isDebrid: true,  isUsenet: false },
  { id: 'putio',          name: 'Put.io',         logo: 'services/putio.svg',       isDebrid: true,  isUsenet: false },
  { id: 'easynews',       name: 'Easynews',       logo: 'services/easynews.png',    isDebrid: false, isUsenet: true  },
  { id: 'nzbdav',         name: 'NzbDAV',         logo: '',                         isDebrid: false, isUsenet: true  },
  { id: 'altmount',       name: 'AltMount',       logo: '',                         isDebrid: false, isUsenet: true  },
  { id: 'stremio_nntp',   name: 'Stremio NNTP',   logo: '',                         isDebrid: false, isUsenet: true  },
  { id: 'stremthru_newz', name: 'StremThru Newz', logo: '',                         isDebrid: false, isUsenet: true  },
];

export const DEBRID_SERVICES = SERVICES.filter(s => s.isDebrid);

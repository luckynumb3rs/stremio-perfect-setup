// All 16 AIOStreams services with mirrored logo paths.
// Logo paths are relative to the Vite public/ dir (served at /assets/logos/).
// Usenet services at the end are not "debrid" but streaming sources some users configure.

export interface Service {
  id: string;
  name: string;
  logo: string;     // path under /assets/logos/ or '' if unavailable
  isDebrid: boolean;
  isUsenet: boolean;
}

export const SERVICES: Service[] = [
  { id: 'torbox',           name: 'TorBox',         logo: '/assets/logos/torbox.svg',      isDebrid: true,  isUsenet: false },
  { id: 'realdebrid',      name: 'Real-Debrid',    logo: '/assets/logos/realdebrid.png',  isDebrid: true,  isUsenet: false },
  { id: 'alldebrid',       name: 'AllDebrid',      logo: '/assets/logos/alldebrid.png',   isDebrid: true,  isUsenet: false },
  { id: 'debridlink',      name: 'Debrid-Link',    logo: '/assets/logos/debridlink.svg',  isDebrid: true,  isUsenet: false },
  { id: 'premiumize',      name: 'Premiumize',     logo: '/assets/logos/premiumize.svg',  isDebrid: true,  isUsenet: false },
  { id: 'easydebrid',      name: 'EasyDebrid',     logo: '/assets/logos/easydebrid.png',  isDebrid: true,  isUsenet: false },
  { id: 'debrider',        name: 'Debrider',       logo: '/assets/logos/debrider.svg',    isDebrid: true,  isUsenet: false },
  { id: 'pikpak',          name: 'PikPak',         logo: '/assets/logos/pikpak.png',      isDebrid: true,  isUsenet: false },
  { id: 'offcloud',        name: 'Offcloud',       logo: '/assets/logos/offcloud.png',    isDebrid: true,  isUsenet: false },
  { id: 'seedr',           name: 'Seedr',          logo: '/assets/logos/seedr.png',       isDebrid: true,  isUsenet: false },
  { id: 'putio',           name: 'Put.io',         logo: '',                              isDebrid: true,  isUsenet: false },
  { id: 'easynews',        name: 'Easynews',       logo: '/assets/logos/easynews.png',    isDebrid: false, isUsenet: true  },
  { id: 'nzbdav',          name: 'NzbDAV',         logo: '',                              isDebrid: false, isUsenet: true  },
  { id: 'altmount',        name: 'AltMount',       logo: '',                              isDebrid: false, isUsenet: true  },
  { id: 'stremio_nntp',    name: 'Stremio NNTP',   logo: '',                              isDebrid: false, isUsenet: true  },
  { id: 'stremthru_newz',  name: 'StremThru Newz', logo: '',                              isDebrid: false, isUsenet: true  },
];

export const DEBRID_SERVICES = SERVICES.filter(s => s.isDebrid);

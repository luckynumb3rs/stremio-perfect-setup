function resolveGuideRoot(): URL {
  return new URL('../', window.location.href);
}

export function getGuideUrl(): string {
  return resolveGuideRoot().toString();
}

export function getGuideStatsUrl(): string {
  return new URL('assets/data/guide-stats.json', resolveGuideRoot()).toString();
}

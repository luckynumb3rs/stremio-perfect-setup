import { resolveDataUrl } from './integration';

function resolveSiteRoot(): URL {
  return new URL('../', window.location.href);
}

function hasUrlScheme(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

export function resolveSiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('#') || trimmed.startsWith('?') || trimmed.startsWith('//') || hasUrlScheme(trimmed)) {
    return trimmed;
  }
  return new URL(trimmed, resolveSiteRoot()).toString();
}

export function getGuideUrl(): string {
  return resolveSiteRoot().toString();
}

export function getGuideStatsUrl(): string {
  return resolveDataUrl('guide-stats.json');
}

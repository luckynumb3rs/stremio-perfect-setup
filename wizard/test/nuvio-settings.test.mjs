import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mergeNuvioSettingsBlob,
  resolveNuvioSettingsTemplate,
} from '../core/adapters/nuvio.js';

let passed = 0;
let failed = 0;

const root = fileURLToPath(new URL('../..', import.meta.url));
const template = JSON.parse(readFileSync(join(root, 'templates', 'Nuvio-Settings.json'), 'utf8'));

function ok(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
}

console.log('\n# Nuvio settings template resolution');
{
  const { entries, skipped } = resolveNuvioSettingsTemplate(template, {
    TMDB_API_KEY: 'TMDB-KEY-123',
  });
  const tv = entries.find((entry) => entry.platform === 'tv');
  const mobile = entries.find((entry) => entry.platform === 'mobile');

  ok('Template resolves TV platform blob', !!tv);
  ok('Template resolves mobile platform blob when TMDB key is present', !!mobile);
  ok('Template substitutes tmdb_api_key placeholder', mobile?.settingsJson?.features?.tmdb_settings?.tmdb_api_key?.value === 'TMDB-KEY-123');
  ok('Template does not skip platforms when placeholders are resolved', skipped.length === 0);
}

console.log('\n# Nuvio settings template skip behavior');
{
  const { entries, skipped } = resolveNuvioSettingsTemplate(template, {});
  const tv = entries.find((entry) => entry.platform === 'tv');
  const mobileSkip = skipped.find((entry) => entry.platform === 'mobile');

  ok('TV platform still resolves without TMDB key', !!tv);
  ok('Mobile platform is skipped when TMDB key placeholder is missing', !!mobileSkip);
  ok('Missing placeholder is reported', mobileSkip?.unresolved?.includes('TMDB_API_KEY') === true);
}

console.log('\n# Nuvio TV settings merge');
{
  const merged = mergeNuvioSettingsBlob({
    version: 1,
    features: {
      theme_settings: {
        selected_theme: { type: 'string', value: 'dark' },
      },
      tmdb_settings: {
        tmdb_language: { type: 'string', value: 'de' },
        tmdb_use_artwork: { type: 'boolean', value: false },
      },
    },
  }, template.tv, 1);

  ok('TV merge preserves unrelated theme settings', merged.features.theme_settings.selected_theme.value === 'dark');
  ok('TV merge enables follow_addons_order', merged.features.layout_settings.follow_addons_order.value === true);
  ok('TV merge enables prefer_external_meta_addon_detail', merged.features.layout_settings.prefer_external_meta_addon_detail.value === true);
  ok('TV merge forces tmdb_use_artwork on', merged.features.tmdb_settings.tmdb_use_artwork.value === true);
  ok('TV merge preserves tmdb_language', merged.features.tmdb_settings.tmdb_language.value === 'de');
  ok('TV merge enables tmdb_use_release_dates', merged.features.tmdb_settings.tmdb_use_release_dates.value === true);
}

console.log('\n# Nuvio mobile TMDB merge');
{
  const { entries } = resolveNuvioSettingsTemplate(template, {
    TMDB_API_KEY: 'TMDB-KEY-123',
  });
  const mobileTemplate = entries.find((entry) => entry.platform === 'mobile')?.settingsJson;
  const merged = mergeNuvioSettingsBlob({
    version: 3,
    features: {
      theme_settings: {
        selected_theme: { type: 'string', value: 'light' },
      },
    },
  }, mobileTemplate, 3);

  ok('Mobile merge preserves unrelated theme settings', merged.features.theme_settings.selected_theme.value === 'light');
  ok('Mobile merge reuses tmdb_api_key', merged.features.tmdb_settings.tmdb_api_key.value === 'TMDB-KEY-123');
  ok('Mobile merge enables tmdb_enabled', merged.features.tmdb_settings.tmdb_enabled.value === true);
  ok('Mobile merge enables tmdb_use_season_posters', merged.features.tmdb_settings.tmdb_use_season_posters.value === true);
  ok('Mobile merge enables tmdb_use_collections', merged.features.tmdb_settings.tmdb_use_collections.value === true);
}

console.log('\n# Nuvio settings merge defaults');
{
  const merged = mergeNuvioSettingsBlob(null, template.tv, 1);
  ok('Merge creates version when base is empty', merged.version === 1);
  ok('Merge creates features object when base is empty', typeof merged.features === 'object' && merged.features !== null);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

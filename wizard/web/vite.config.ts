import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface WizardIntegrationConfig {
  repoRoot: string;
  images: string;
  data: string;
  theme: string;
  metadata: string;
}

interface WizardMetadata {
  path: string;
  title: string;
  description: string;
  ga4Id: string;
  wizardPageTitle: string;
  addonDetailsTitle: string;
}

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '../..');
const wizardRoot = path.resolve(repoRoot, 'wizard');

function readYamlScalar(raw: string, key: string) {
  const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function loadIntegrationConfig(): WizardIntegrationConfig {
  const configPath = path.resolve(wizardRoot, 'integration.config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as WizardIntegrationConfig;
}

function loadMetadata(metadataPath: string): WizardMetadata {
  const configPath = path.resolve(wizardRoot, metadataPath);
  const raw = fs.readFileSync(configPath, 'utf8');
  const title = readYamlScalar(raw, 'title');
  const description = readYamlScalar(raw, 'description');
  const ga4Id = readYamlScalar(raw, 'google_analytics');

  return {
    path: metadataPath,
    title,
    description,
    ga4Id,
    wizardPageTitle: `${title} Wizard`.trim(),
    addonDetailsTitle: `${title} - Add-on Details`.trim(),
  };
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function joinPath(basePath: string, relativePath?: string) {
  const base = trimSlashes(basePath);
  const relative = trimSlashes(relativePath ?? '');
  if (!base) return relative;
  if (!relative) return base;
  return `${base}/${relative}`;
}

function usesParentTraversal(value: string) {
  return /^\.{2}(\/|$)/.test(value);
}

function resolveDevFsBase(configuredPath: string) {
  if (!usesParentTraversal(configuredPath)) return undefined;
  return path.resolve(wizardRoot, configuredPath);
}

function resolveHtmlAssetUrl(basePath: string, relativePath: string, command: 'build' | 'serve') {
  if (command === 'serve') {
    const devFsBase = resolveDevFsBase(basePath);
    if (devFsBase) {
      const fsPath = joinPath(devFsBase, relativePath);
      return encodeURI(`/@fs/${fsPath.replace(/^\/+/, '')}`);
    }
  }

  return joinPath(basePath, relativePath);
}

function replaceAllTokens(html: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (nextHtml, [token, value]) => nextHtml.split(token).join(value),
    html,
  );
}

export default defineConfig(({ command }) => {
  const integrationConfig = loadIntegrationConfig();
  const metadata = loadMetadata(integrationConfig.metadata);
  const resolvedIntegration = {
    repoRoot: integrationConfig.repoRoot,
    images: integrationConfig.images,
    data: integrationConfig.data,
    repoRootDevFsBase: resolveDevFsBase(integrationConfig.repoRoot),
    imagesDevFsBase: resolveDevFsBase(integrationConfig.images),
    dataDevFsBase: resolveDevFsBase(integrationConfig.data),
    metadata,
  };
  const faviconUrl = resolveHtmlAssetUrl(integrationConfig.images, 'logo.svg', command);
  const themeCssUrl = resolveHtmlAssetUrl(integrationConfig.theme, 'shared.css', command);

  return {
    plugins: [
      react(),
      {
        name: 'wizard-html-integration',
        transformIndexHtml(html) {
          return replaceAllTokens(html, {
            '__WIZARD_HTML_TITLE__': metadata.wizardPageTitle,
            '__WIZARD_FAVICON_URL__': faviconUrl,
            '__WIZARD_THEME_CSS_URL__': themeCssUrl,
          });
        },
      },
    ],
    base: './',
    build: { outDir: 'dist' },
    define: {
      __WIZARD_INTEGRATION__: JSON.stringify(resolvedIntegration),
    },
    resolve: {
      alias: {
        '@core': path.resolve(configDir, '../core'),
      },
    },
    publicDir: 'public',
    server: {
      fs: {
        allow: [repoRoot],
      },
    },
  };
});

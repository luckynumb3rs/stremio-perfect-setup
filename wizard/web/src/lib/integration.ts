interface WizardMetadata {
  path: string;
  title: string;
  description: string;
  ga4Id: string;
  wizardPageTitle: string;
  addonDetailsTitle: string;
}

interface WizardIntegrationConfig {
  repoRoot: string;
  images: string;
  data: string;
  metadata: WizardMetadata;
  repoRootDevFsBase?: string;
  imagesDevFsBase?: string;
  dataDevFsBase?: string;
}

const integration = __WIZARD_INTEGRATION__ as WizardIntegrationConfig;

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

function resolveWizardRoot(): URL {
  return new URL('./', window.location.href);
}

function resolveConfiguredUrl(basePath: string, relativePath: string | undefined, devFsBase?: string) {
  if (import.meta.env.DEV && devFsBase) {
    const fsPath = joinPath(devFsBase, relativePath);
    return encodeURI(`/@fs/${fsPath.replace(/^\/+/, '')}`);
  }

  return new URL(joinPath(basePath, relativePath), resolveWizardRoot()).toString();
}

export const wizardMetadata = integration.metadata;

export function resolveRepoUrl(relativePath?: string) {
  return resolveConfiguredUrl(integration.repoRoot, relativePath, integration.repoRootDevFsBase);
}

export function resolveImageUrl(relativePath?: string) {
  return resolveConfiguredUrl(integration.images, relativePath, integration.imagesDevFsBase);
}

export function resolveDataUrl(relativePath?: string) {
  return resolveConfiguredUrl(integration.data, relativePath, integration.dataDevFsBase);
}

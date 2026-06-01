/// <reference types="vite/client" />

declare global {
  const __WIZARD_INTEGRATION__: {
    repoRoot: string;
    images: string;
    data: string;
    repoRootDevFsBase?: string;
    imagesDevFsBase?: string;
    dataDevFsBase?: string;
    metadata: {
      path: string;
      title: string;
      description: string;
      ga4Id: string;
      wizardPageTitle: string;
      addonDetailsTitle: string;
    };
  };

  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export {};

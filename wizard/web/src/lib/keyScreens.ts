export type KeyScreenId = 'debrid' | 'tmdb' | 'tvdb' | 'gemini' | 'rpdb';

export interface KeyScreen {
  id: KeyScreenId;
  label: string;
  description: string;
  instruction: string;
  optional?: boolean;
  enabled?: boolean;
}

export const KEY_SCREEN_START_STEP = 2;

export const KEY_SCREENS: KeyScreen[] = [
  {
    id: 'debrid',
    label: '⚡ Debrid',
    description: 'A **Debrid service** is a paid tool that gives you instant access to fast, cached streams with no P2P throttling or legal risk. It dramatically improves streaming quality and reliability. Select one or more services below and enter your API key for each. You can find your API key in each service\'s account or settings page. **Skip if you prefer free 🧲 P2P / 🌐 HTTP mode.**',
    instruction: 'Select one or more services below, then paste the API key for each selected provider. You can usually find the key in the service\'s account dashboard or API settings page.',
    optional: true,
  },
  {
    id: 'tmdb',
    label: '🎥 TMDB',
    description: 'The Movie Database (TMDB) powers the metadata, posters, and catalog content in AIOMetadata, and serves to filter out bad results in AIOStreams. Without these keys, the catalog addon cannot display movie and TV show information. You need **two separate credentials** from your TMDB account.',
    instruction: 'Sign up for a free account at [TMDB](https://www.themoviedb.org) and log in. Navigate to **Settings** (profile icon on the top right) then **API**. Generate a new key, fill the form with whatever info, and click **Subscribe**. Access your API keys and copy both the short **API Key** and the long **API Read Access Token**.',
  },
  {
    id: 'tvdb',
    label: '📺 TVDB',
    description: 'TheTVDB provides enhanced metadata for TV series, especially for episodic content. This improves episode data accuracy and series information.',
    instruction: 'Sign up for a free account at [TVDB](https://www.thetvdb.com) and log in. Go to [this](https://www.thetvdb.com/api-information) page, click **Get Started**, fill the form with whatever info but make sure to select **Less than $50k per year** in *Company/Project Revenue*. **Submit**, and copy the **API Key**.',
  },
  {
    id: 'gemini',
    label: '✨ Gemini',
    description: 'A Google Gemini API key enables AI-powered search in AIOMetadata. Optional, but recommended for AI searches, to search not only for movie or show names, but also e.g. “movies like Batman” or more complex searches.',
    instruction: 'Go to [Google AI Studio](https://aistudio.google.com), sign in with your Google account, and accept the terms if prompted. If a key doesn\'t get created automatically, click on **Create API Key** and copy the new generated key.',
    optional: true,
  },
  {
    id: 'rpdb',
    label: '⭐ RPDB',
    description: 'Ratings Poster DB (RPDB) adds IMDb and Rotten Tomatoes rating overlays directly onto movie and show posters, making it easy to see review scores at a glance without opening each title.',
    instruction: 'Buy your own key from [RPDB](https://www.ratingposterdb.com) if you want to personalize the posters. If you leave the field empty, the wizard can use the free built-in RPDB key.',
    optional: true,
  },
];

export const ACTIVE_KEY_SCREENS = KEY_SCREENS.filter(screen => screen.enabled !== false);

export const AIO_SECTION_START_STEP = KEY_SCREEN_START_STEP + ACTIVE_KEY_SCREENS.length;

export function getCatalogStep(sectionCount: number) {
  return AIO_SECTION_START_STEP + sectionCount;
}

export function getInstallStep(sectionCount: number) {
  return getCatalogStep(sectionCount) + 1;
}

export function getDoneStep(sectionCount: number) {
  return getInstallStep(sectionCount) + 1;
}

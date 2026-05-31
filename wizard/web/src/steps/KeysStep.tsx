import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { MarkdownText } from '../components/MarkdownText';
import { useWizard } from '../store/wizard';
import { RPDB_FREE_KEY } from '../lib/constants';

interface KeyScreen {
  id: 'tmdb' | 'tvdb' | 'gemini' | 'rpdb';
  title: string;
  description: string;
  instruction: string;
  optional?: boolean;
}

const KEY_SCREENS: KeyScreen[] = [
  {
    id: 'tmdb',
    title: 'TMDB API Keys',
    description: 'The Movie Database (TMDB) powers the metadata, posters, and catalog content in AIOMetadata. Without these keys, the catalog addon cannot display movie and TV show information.\n\nYou need **two separate credentials** from your TMDB account.',
    instruction: 'Go to [themoviedb.org](https://www.themoviedb.org) and log in. Navigate to **Settings** (profile icon top-right) then **API**. Copy both the short **API Key** and the long **API Read Access Token**.',
  },
  {
    id: 'tvdb',
    title: 'TVDB API Key (Optional)',
    description: 'TheTVDB provides enhanced metadata for TV series, especially for episodic content. This is optional but recommended if you watch a lot of TV shows, as it improves episode data accuracy and series information.',
    instruction: 'Go to [thetvdb.com](https://www.thetvdb.com) and log in. Navigate to your **Dashboard** (profile menu), then **API Keys**, and create a new key.',
    optional: true,
  },
  {
    id: 'gemini',
    title: 'Gemini AI Key (Optional)',
    description: 'A Google Gemini API key enables AI-powered plot descriptions and summaries in AIOMetadata. This is entirely optional - without it, standard TMDB descriptions are used instead.\n\nGemini has a generous free tier so you can use it at no cost.',
    instruction: 'Go to [aistudio.google.com](https://aistudio.google.com) and sign in with your Google account. Click **Get API Key**, then **Create API key in new project**. Copy the generated key.',
    optional: true,
  },
  {
    id: 'rpdb',
    title: 'RPDB Poster Ratings',
    description: 'Rating Poster DB (RPDB) adds IMDb and Rotten Tomatoes rating overlays directly onto movie and show posters, making it easy to see review scores at a glance without opening each title.\n\nA **free tier key is already pre-filled** - no account or sign-up required. You can upgrade to a premium key at [ratingposterdb.com](https://www.ratingposterdb.com) for higher resolution overlays.',
    instruction: 'The free key is already pre-filled below. Leave it as-is to use the free tier. Replace it with your premium key from [ratingposterdb.com](https://www.ratingposterdb.com) if you have one.',
    optional: true,
  },
];

interface Props { keyIndex: number; }

export function KeysStep({ keyIndex }: Props) {
  const screen = KEY_SCREENS[keyIndex];
  const { credentials, setCredentials, nextStep } = useWizard();

  if (!screen) { nextStep(); return null; }

  const isRequired = !screen.optional;
  const canContinue = !isRequired || (
    screen.id === 'tmdb'
      ? credentials.tmdbApiKey.length > 10 && credentials.tmdbAccessToken.length > 20
      : true
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border)', borderRadius: '8px',
    padding: '0.5rem 0.75rem', fontSize: '0.875rem',
    background: 'var(--panel)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <WizardShell>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>
        {screen.title}
      </h2>
      <MarkdownText
        text={screen.description}
        style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.65 }}
      />

      <div style={{
        background: 'var(--panel-2)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem',
      }}>
        <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.35rem' }}>👉 How to get it:</div>
        <MarkdownText text={screen.instruction} style={{ color: 'var(--muted)' }} />
      </div>

      {screen.id === 'tmdb' && (
        <>
          <label style={{ display: 'block', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
              API Key <span style={{ color: '#e53e3e' }}>*</span>
            </span>
            <input
              type="password"
              value={credentials.tmdbApiKey}
              onChange={e => setCredentials({ tmdbApiKey: e.target.value })}
              placeholder="Paste your short API key here..."
              style={{ ...inputStyle, marginTop: '0.35rem' }}
            />
          </label>
          <label style={{ display: 'block' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
              API Read Access Token <span style={{ color: '#e53e3e' }}>*</span>
            </span>
            <input
              type="password"
              value={credentials.tmdbAccessToken}
              onChange={e => setCredentials({ tmdbAccessToken: e.target.value })}
              placeholder="Paste your long JWT token (eyJh...) here..."
              style={{ ...inputStyle, marginTop: '0.35rem' }}
            />
          </label>
        </>
      )}

      {screen.id === 'tvdb' && (
        <input
          type="password"
          value={credentials.tvdbApiKey}
          onChange={e => setCredentials({ tvdbApiKey: e.target.value })}
          placeholder="Paste your TVDB API key..."
          style={inputStyle}
        />
      )}

      {screen.id === 'gemini' && (
        <input
          type="password"
          value={credentials.geminiApiKey}
          onChange={e => setCredentials({ geminiApiKey: e.target.value })}
          placeholder="Paste your Gemini API key..."
          style={inputStyle}
        />
      )}

      {screen.id === 'rpdb' && (
        <input
          type="text"
          value={credentials.rpdbApiKey}
          onChange={e => setCredentials({ rpdbApiKey: e.target.value })}
          placeholder={RPDB_FREE_KEY}
          style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }}
        />
      )}

      <NextButton onClick={nextStep} disabled={!canContinue} />
      {screen.optional && (
        <button
          onClick={nextStep}
          style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.35rem' }}
        >
          Skip for now
        </button>
      )}
    </WizardShell>
  );
}

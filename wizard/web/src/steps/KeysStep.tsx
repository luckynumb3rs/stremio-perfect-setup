import type { CSSProperties } from 'react';
import type { ReactNode } from 'react';
import { Gift, KeyRound, Search, TriangleAlert, Users } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { MarkdownText } from '../components/MarkdownText';
import { useWizard } from '../store/wizard';
import { ACTIVE_KEY_SCREENS, type KeyScreenId } from '../lib/keyScreens';
import { DEBRID_SERVICES, resolveLogoUrl } from '../lib/services';
import { hasConfiguredKeyArray, hasConfiguredTmdbFallback } from '../lib/sharedKeys';

interface Props { keyIndex: number; }

type ServiceScreenId = Exclude<KeyScreenId, 'debrid'>;
type CredentialFieldId = 'tmdbApiKey' | 'tmdbAccessToken' | 'tvdbApiKey' | 'geminiApiKey' | 'rpdbApiKey';

const SHARED_INSTRUCTIONS_WALKTHROUGH = 'For a longer walkthrough with screenshots and service-specific notes, open [📝 Accounts Preparation](guide/1-Accounts).';

const SHARED_INSTRUCTIONS_KEY_DISCLAIMER = 'Using your own API key is usually the most reliable option for long-term use. If you leave a field empty, the wizard will use a shared fallback key when one is available for that service, but shared keys can reach their limits sooner and are not guaranteed on every screen.';

interface CredentialField {
  id: CredentialFieldId;
  label: string;
  placeholder: string;
  type?: 'password' | 'text';
  required?: boolean;
  monospace?: boolean;
}

const SCREEN_FIELDS: Record<ServiceScreenId, CredentialField[]> = {
  tmdb: [
    {
      id: 'tmdbApiKey',
      label: 'API Key',
      placeholder: 'Paste your short API key here...',
      required: true,
      type: 'password',
    },
    {
      id: 'tmdbAccessToken',
      label: 'API Read Access Token',
      placeholder: 'Paste your long Read Access Token here...',
      required: true,
      type: 'password',
    },
  ],
  tvdb: [
    {
      id: 'tvdbApiKey',
      label: 'API Key',
      placeholder: 'Paste your TVDB API key...',
      required: true,
      type: 'password',
    },
  ],
  gemini: [
    {
      id: 'geminiApiKey',
      label: 'API Key',
      placeholder: 'Paste your Gemini API key...',
      type: 'password',
    },
  ],
  rpdb: [
    {
      id: 'rpdbApiKey',
      label: 'API Key',
      placeholder: 'Paste your RPDB API key...',
      type: 'text',
      monospace: true,
    },
  ],
};

function getScreenFallbackAvailability(
  screenId: ServiceScreenId,
  hasTmdbFallback: boolean,
  hasTvdbFallback: boolean,
  hasGeminiFallback: boolean,
  hasRpdbFallback: boolean,
) {
  if (screenId === 'tmdb') return hasTmdbFallback;
  if (screenId === 'tvdb') return hasTvdbFallback;
  if (screenId === 'gemini') return hasGeminiFallback;
  if (screenId === 'rpdb') return hasRpdbFallback;
  return false;
}

function getContinueState(screenId: ServiceScreenId, values: Record<CredentialFieldId, string>, hasConfiguredFallback: boolean) {
  if (screenId === 'tmdb') {
    const apiKey = values.tmdbApiKey.trim();
    const accessToken = values.tmdbAccessToken.trim();
    const hasAnyInput = apiKey.length > 0 || accessToken.length > 0;
    const hasCompleteInput = apiKey.length > 0 && accessToken.length > 0;

    if (!hasAnyInput) {
      return {
        canContinue: hasConfiguredFallback,
        label: hasConfiguredFallback ? 'Skip and use shared TMDB keys' : 'Enter your TMDB keys to continue',
      };
    }

    return {
      canContinue: hasCompleteInput,
      label: hasCompleteInput ? 'Continue' : 'Enter both TMDB keys to continue',
    };
  }

  if (screenId === 'tvdb') {
    const hasInput = values.tvdbApiKey.trim().length > 0;
    if (!hasInput) {
      return {
        canContinue: hasConfiguredFallback,
        label: hasConfiguredFallback ? 'Skip and use shared TVDB key' : 'Enter your TVDB key to continue',
      };
    }
    return { canContinue: true, label: 'Continue' };
  }

  if (screenId === 'gemini') {
    if (!values.geminiApiKey.trim().length) {
      return {
        canContinue: true,
        label: hasConfiguredFallback ? 'Skip and use shared Gemini key' : 'Continue without AI-Powered Search',
      };
    }

    return {
      canContinue: true,
      label: 'Continue',
    };
  }

  if (values.rpdbApiKey.trim().length > 0) {
    return { canContinue: true, label: 'Continue' };
  }

  return {
    canContinue: true,
    label: hasConfiguredFallback ? 'Skip and use free RPDB key' : 'Continue with default RPDB key',
  };
}

function getDebridContinueState(debridServices: Array<{ id: string; apiKey: string }>) {
  if (debridServices.length === 0) {
    return {
      canContinue: true,
      label: 'Continue with 🧲 P2P / 🌐 HTTP only',
    };
  }

  const missingKeyCount = debridServices.filter((service) => service.apiKey.trim().length === 0).length;
  if (missingKeyCount === 0) {
    return {
      canContinue: true,
      label: 'Continue',
    };
  }

  return {
    canContinue: false,
    label: missingKeyCount === debridServices.length
      ? 'Enter an API key or deselect the service(s)'
      : 'Enter an API key for each selected service',
  };
}

function getContinueIcon(screenId: KeyScreenId, label: string, canContinue: boolean): ReactNode {
  if (!canContinue) return <TriangleAlert size={16} />;
  if (/shared|free|p2p|http/i.test(label)) return <Users size={16} />;
  if (/default/i.test(label)) return <Gift size={16} />;
  if (/without ai-powered search/i.test(label)) return <Search size={16} />;
  if (screenId !== 'debrid') return <KeyRound size={16} />;
  return <KeyRound size={16} />;
}

export function KeysStep({ keyIndex }: Props) {
  const screen = ACTIVE_KEY_SCREENS[keyIndex];
  const {
    credentials,
    setCredentials,
    toggleDebridService,
    setDebridApiKey,
    nextStep,
    wizardConfig,
  } = useWizard();

  if (!screen) { nextStep(); return null; }

  const inputStyle: CSSProperties = {
    width: '100%',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    background: 'var(--panel)',
    color: 'var(--text)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const hasTmdbFallback = hasConfiguredTmdbFallback(wizardConfig);
  const hasTvdbFallback = hasConfiguredKeyArray(wizardConfig, 'tvdbApiKeys');
  const hasGeminiFallback = hasConfiguredKeyArray(wizardConfig, 'geminiApiKeys');
  const hasRpdbFallback = hasConfiguredKeyArray(wizardConfig, 'rpdbApiKeys');
  const fallbackAvailable = screen.id === 'debrid'
    ? false
    : getScreenFallbackAvailability(screen.id, hasTmdbFallback, hasTvdbFallback, hasGeminiFallback, hasRpdbFallback);

  const fieldValues: Record<CredentialFieldId, string> = {
    tmdbApiKey: credentials.tmdbApiKey,
    tmdbAccessToken: credentials.tmdbAccessToken,
    tvdbApiKey: credentials.tvdbApiKey,
    geminiApiKey: credentials.geminiApiKey,
    rpdbApiKey: credentials.rpdbApiKey,
  };

  const continueState = screen.id === 'debrid'
    ? getDebridContinueState(credentials.debridServices)
    : getContinueState(screen.id, fieldValues, fallbackAvailable);
  const continueIcon = getContinueIcon(screen.id, continueState.label, continueState.canContinue);
  const credentialFields = screen.id === 'debrid' ? [] : SCREEN_FIELDS[screen.id];
  const sharedInstructionParts = [
    SHARED_INSTRUCTIONS_WALKTHROUGH,
    screen.id === 'debrid' ? '' : SHARED_INSTRUCTIONS_KEY_DISCLAIMER,
  ].filter(Boolean);
  const instructionsText = `${screen.instruction}\n\n${sharedInstructionParts.join('\n\n')}`;

  return (
    <WizardShell>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem', textAlign: 'center' }}>
        {screen.label}
      </h2>
      <MarkdownText
        text={screen.description}
        style={{
          color: 'var(--muted)',
          fontSize: '0.875rem',
          margin: '0 auto 1rem',
          lineHeight: 1.65,
          textAlign: 'center',
          maxWidth: '44rem',
        }}
      />

      <div className="wizard-notice" style={{ marginBottom: '1rem' }}>
        <div className="wizard-notice__title">ℹ️ Instructions</div>
        <MarkdownText text={instructionsText} style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }} />
      </div>

      {screen.id === 'debrid' && (
        <>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Select services (you can pick multiple)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
            {DEBRID_SERVICES.map((service) => {
              const selected = credentials.debridServices.some(d => d.id === service.id);
              const logoUrl = resolveLogoUrl(service.logo);
              return (
                <button
                  key={service.id}
                  type="button"
                  className="wizard-hover-lift"
                  onClick={() => toggleDebridService(service.id)}
                  style={{
                    padding: '0.6rem 0.4rem',
                    border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '10px',
                    background: selected ? 'var(--panel-2)' : 'var(--panel)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt={service.name} style={{ height: '24px', width: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--muted)' }}>{service.name[0]}</span>
                  )}
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>
                    {service.name}
                  </span>
                </button>
              );
            })}
          </div>

          {credentials.debridServices.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                API Keys
              </p>
              {credentials.debridServices.map((debridService) => {
                const service = DEBRID_SERVICES.find(candidate => candidate.id === debridService.id);
                return (
                  <label key={debridService.id} style={{ display: 'block' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
                      {service?.name} API Key
                    </span>
                    <input
                      type="password"
                      value={debridService.apiKey}
                      onChange={e => setDebridApiKey(debridService.id, e.target.value)}
                      placeholder={`Paste your ${service?.name} API key...`}
                      style={{ ...inputStyle, marginTop: '0.35rem' }}
                    />
                  </label>
                );
              })}
              {!continueState.canContinue && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626', lineHeight: 1.5 }}>
                  Enter an API key for every selected debrid service, or deselect them to continue with P2P / HTTP only.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {screen.id !== 'debrid' && credentialFields.map((field, index) => (
        <label key={field.id} style={{ display: 'block', marginBottom: index < credentialFields.length - 1 ? '0.75rem' : 0 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
            {field.label}
            {field.required && <span style={{ color: '#e53e3e' }}> *</span>}
          </span>
          <input
            type={field.type ?? 'password'}
            value={fieldValues[field.id]}
            onChange={(event) => setCredentials({ [field.id]: event.target.value } as Partial<typeof credentials>)}
            placeholder={field.placeholder}
            style={{
              ...inputStyle,
              marginTop: '0.35rem',
              fontFamily: field.monospace ? "'IBM Plex Mono', monospace" : inputStyle.fontFamily,
            }}
          />
        </label>
      ))}

      <NextButton
        onClick={nextStep}
        disabled={!continueState.canContinue}
        label={continueState.label}
        icon={continueIcon}
      />
    </WizardShell>
  );
}

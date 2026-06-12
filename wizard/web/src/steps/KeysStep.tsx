import type { CSSProperties } from 'react';
import type { ReactNode } from 'react';
import { Gift, KeyRound, Search, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { MarkdownText } from '../components/MarkdownText';
import { useWizard } from '../store/wizard';
import { ACTIVE_KEY_SCREENS, type KeyScreenId } from '../lib/keyScreens';
import { DEBRID_SERVICES, getServiceById, getServiceCredentialFields, resolveLogoUrl } from '../lib/services';
import { hasConfiguredKeyArray, hasConfiguredTmdbFallback } from '../lib/sharedKeys';
import { INSTANT_DEBRID_SERVICE_IDS } from '../lib/instantDebrid';

interface Props { keyIndex: number; }

type ServiceScreenId = Exclude<KeyScreenId, 'debrid'>;
type CredentialFieldId = 'tmdbApiKey' | 'tmdbAccessToken' | 'tvdbApiKey' | 'geminiApiKey' | 'rpdbApiKey';

const SHARED_INSTRUCTIONS_WALKTHROUGH = 'For a longer walkthrough with screenshots and service-specific notes, open [📝 Accounts Preparation](guide/1-Accounts).';

const SHARED_INSTRUCTIONS_KEY_DISCLAIMER = 'Using your own API key is usually the most reliable option for long-term use. If you leave a field empty, the wizard will use a shared fallback key (except Gemini) when one is available for that service, but shared keys can reach their limits sooner and are not guaranteed on every screen.';

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

function getDebridContinueState(debridServices: Array<{ id: string; credentials: Record<string, string> }>) {
  if (debridServices.length === 0) {
    return {
      canContinue: true,
      label: 'Continue with 🧲 P2P / 🌐 HTTP only',
    };
  }

  const requiredFieldCount = debridServices.reduce((count, selectedService) => {
    const service = getServiceById(selectedService.id);
    return count + getServiceCredentialFields(service).filter((field) => field.required !== false).length;
  }, 0);

  const missingCredentialCount = debridServices.reduce((count, selectedService) => {
    const service = getServiceById(selectedService.id);
    const missing = getServiceCredentialFields(service)
      .filter((field) => field.required !== false)
      .filter((field) => !(selectedService.credentials?.[field.id] ?? '').trim()).length;
    return count + missing;
  }, 0);

  if (missingCredentialCount === 0) {
    return {
      canContinue: true,
      label: 'Continue',
    };
  }

  return {
    canContinue: false,
    label: missingCredentialCount === requiredFieldCount
      ? 'Enter the required credentials or deselect the service(s)'
      : 'Enter the required credentials for each selected service',
  };
}

function getContinueIcon(screenId: KeyScreenId, label: string, canContinue: boolean): ReactNode {
  if (!canContinue) return <TriangleAlert size={16} />;
  if (/shared|free|p2p|http/i.test(label)) return <Users size={16} />;
  if (/default/i.test(label)) return <Gift size={16} />;
  if (/without ai-powered search/i.test(label)) return <Search size={16} />;
  return <KeyRound size={16} />;
}

export function KeysStep({ keyIndex }: Props) {
  const screen = ACTIVE_KEY_SCREENS[keyIndex];
  const {
    credentials,
    setCredentials,
    toggleDebridService,
    setDebridCredential,
    nextStep,
    wizardConfig,
    target,
    nuvioInstantDebrid,
    setNuvioInstantDebrid,
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

  const isNuvio = target === 'nuvio';
  const hasQualifyingService = credentials.debridServices.some(
    (d) => (INSTANT_DEBRID_SERVICE_IDS as readonly string[]).includes(d.id)
  );
  const hasNonQualifyingService = credentials.debridServices.some(
    (d) => !(INSTANT_DEBRID_SERVICE_IDS as readonly string[]).includes(d.id)
  );
  const showInstantDebridToggle = isNuvio && screen.id === 'debrid' && hasQualifyingService && !hasNonQualifyingService;

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

  const effectiveContinueState = screen.id === 'debrid' && nuvioInstantDebrid && continueState.canContinue
    ? { ...continueState, label: 'Continue with Instant Debrid' }
    : continueState;

  const continueIcon = getContinueIcon(screen.id, effectiveContinueState.label, effectiveContinueState.canContinue);
  const credentialFields = screen.id === 'debrid' ? [] : SCREEN_FIELDS[screen.id];
  const sharedInstructionParts = [
    SHARED_INSTRUCTIONS_WALKTHROUGH,
    screen.id === 'debrid' ? '' : SHARED_INSTRUCTIONS_KEY_DISCLAIMER,
  ].filter(Boolean);
  const instructionsText = `${screen.instruction}\n\n${sharedInstructionParts.join('\n\n')}`;

  return (
    <WizardShell onSubmit={effectiveContinueState.canContinue ? nextStep : undefined}>
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
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
              maxWidth: 'calc(6 * 118px + 5 * 0.5rem)',
              marginInline: 'auto',
            }}
          >
            {DEBRID_SERVICES.map((service) => {
              const selected = credentials.debridServices.some(d => d.id === service.id);
              const logoUrl = resolveLogoUrl(service.logo);
              const divider = selected ? 'var(--accent)' : 'var(--border)';
              const isInstantDebridLocked = nuvioInstantDebrid && !(INSTANT_DEBRID_SERVICE_IDS as readonly string[]).includes(service.id);
              return (
                <div
                  key={service.id}
                  style={{
                    flex: '0 0 118px',
                    border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '10px',
                    background: selected ? 'var(--panel-2)' : 'var(--panel)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                    opacity: isInstantDebridLocked ? 0.4 : 1,
                    pointerEvents: isInstantDebridLocked ? 'none' : undefined,
                    cursor: isInstantDebridLocked ? 'not-allowed' : undefined,
                  } as CSSProperties}
                >
                  <button
                    type="button"
                    className="debrid-card__select"
                    onClick={() => toggleDebridService(service.id)}
                    aria-pressed={selected}
                    disabled={isInstantDebridLocked}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: '0.6rem 0.4rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.35rem',
                      width: '100%',
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
                  {service.url && (
                    <a
                      href={service.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="debrid-card__link"
                      style={{
                        borderTop: `1px solid ${divider}`,
                        padding: '0.4rem 0.3rem',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        color: 'var(--accent)',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <UserPlus size={11} style={{ flex: '0 0 auto' }} />
                      Create Account
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {credentials.debridServices.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                Credentials
              </p>
              {credentials.debridServices.map((debridService) => {
                const service = DEBRID_SERVICES.find(candidate => candidate.id === debridService.id);
                const credentialFields = getServiceCredentialFields(service);
                const credentialsUrlLabel = service?.credentialsUrlLabel
                  ?? (credentialFields.length === 1 && credentialFields[0]?.id === 'apiKey'
                    ? 'Get API Key'
                    : 'Open Credentials Page');
                return (
                  <div key={debridService.id} style={{ display: 'block', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.85rem', background: 'var(--panel)' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
                        {service?.name} Credentials
                      </span>
                      {service?.credentialsUrl && (
                        <a
                          href={service.credentialsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="wizard-secondary-btn"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.8125rem',
                            whiteSpace: 'nowrap',
                            textDecoration: 'none',
                          }}
                        >
                          <KeyRound size={14} style={{ flex: '0 0 auto' }} />
                          {credentialsUrlLabel}
                        </a>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {credentialFields.map((field) => (
                        <label key={field.id} style={{ display: 'block' }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' }}>
                            {field.label}
                            {field.required !== false && <span style={{ color: '#e53e3e' }}> *</span>}
                          </span>
                          <input
                            type={field.type === 'email' ? 'email' : (field.type ?? 'password')}
                            value={debridService.credentials?.[field.id] ?? ''}
                            onChange={(e) => setDebridCredential(debridService.id, field.id, e.target.value)}
                            placeholder={field.placeholder}
                            style={{ ...inputStyle, marginTop: '0.35rem' }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!continueState.canContinue && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626', lineHeight: 1.5 }}>
                  Enter every required credential for the selected debrid services, or deselect them to continue with P2P / HTTP only.
                </p>
              )}
            </div>
          )}

          {showInstantDebridToggle && (
            <div
              className={`wizard-hover-lift${nuvioInstantDebrid ? '' : ' wizard-hover-lift--guide'}`}
              style={{
                '--wizard-hover-selected-bg': 'var(--panel-2)',
                '--wizard-hover-selected-border': 'var(--accent)',
                '--wizard-hover-selected-color': 'var(--text)',
                borderRadius: '14px',
                border: `2px solid ${nuvioInstantDebrid ? 'var(--accent)' : 'var(--border)'}`,
                background: nuvioInstantDebrid ? 'var(--panel-2)' : 'var(--panel)',
                transition: 'all 0.15s',
                overflow: 'hidden',
                marginBottom: '0.5rem',
              } as CSSProperties}
            >
              <button
                type="button"
                onClick={() => setNuvioInstantDebrid(!nuvioInstantDebrid)}
                aria-pressed={nuvioInstantDebrid}
                style={{
                  width: '100%', border: 'none', background: 'transparent',
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                  padding: '0.95rem 1rem', display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>⚡ Instant Debrid</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.45rem', flex: '0 0 auto' }}>
                  <div
                    aria-hidden="true"
                    style={{
                      width: '3rem', height: '1.7rem', borderRadius: '999px',
                      background: nuvioInstantDebrid ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 70%, var(--panel) 30%)',
                      border: `1px solid ${nuvioInstantDebrid ? 'var(--accent)' : 'var(--border)'}`,
                      padding: '0.12rem', display: 'flex', alignItems: 'center',
                      justifyContent: nuvioInstantDebrid ? 'flex-end' : 'flex-start',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ width: '1.2rem', height: '1.2rem', borderRadius: '999px', background: '#fff', display: 'block' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: nuvioInstantDebrid ? 'var(--accent)' : 'var(--muted)' }}>
                    {nuvioInstantDebrid ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </button>
              <div style={{
                borderTop: `1px solid ${nuvioInstantDebrid ? 'var(--accent)' : 'var(--border)'}`,
                padding: '0.65rem 1rem',
                background: 'var(--panel-2)',
              }}>
                <div className="wizard-notice__title" style={{ marginBottom: '0.3rem' }}>ℹ️ Note</div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text)', lineHeight: 1.6 }}>
                  This feature is still new. It may deliver results slightly faster, but typically returns fewer and less well-organized streams than the standard mode. Unlike the standard mode, it does not definitively exclude P2P streams.
                </p>
              </div>
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
        disabled={!effectiveContinueState.canContinue}
        label={effectiveContinueState.label}
        icon={continueIcon}
      />
    </WizardShell>
  );
}

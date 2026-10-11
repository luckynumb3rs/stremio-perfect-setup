import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';
import { resolveLogoUrl } from '../lib/services';

export function WatchlyStep() {
  const {
    target, stremioAccount, nuvioAccount, watchly,
    setWatchly, nextStep,
  } = useWizard();

  const isNuvio = target === 'nuvio';
  const appName = isNuvio ? 'Nuvio' : 'Stremio';
  const account = isNuvio ? nuvioAccount : stremioAccount;
  const nuvioProfileId = nuvioAccount.profileId;
  const hasValidNuvioProfile = typeof nuvioProfileId === 'number'
    && Number.isInteger(nuvioProfileId)
    && nuvioProfileId >= 1
    && nuvioProfileId <= 6;
  const connected = isNuvio
    ? !!nuvioAccount.authToken && hasValidNuvioProfile
    : !!stremioAccount.authKey;
  const selectedProfile = isNuvio
    ? nuvioAccount.profiles?.find((profile) => profile.profile_index === nuvioAccount.profileId)
    : null;
  const profileName = selectedProfile?.name?.trim() || nuvioAccount.profileName?.trim() || '';
  const canContinue = !watchly.enabled || connected;
  const logoUrl = resolveLogoUrl(`services/${isNuvio ? 'nuvio.png' : 'stremio.svg'}`);

  const cardStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    padding: '1rem',
    borderRadius: '12px',
    border: `2px solid ${connected ? 'var(--accent)' : 'var(--border)'}`,
    background: connected ? 'var(--panel-2)' : 'var(--panel)',
  };

  return (
    <WizardShell onSubmit={canContinue ? nextStep : undefined}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem' }}>
          🤖 Watchly
        </h2>
        <p className="page-description">
          Watchly is a full-blown recommendations addon that provides Netflix-like suggestions and dynamic catalogs based on your watch history. It's optional and free to skip.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setWatchly({ enabled: !watchly.enabled })}
        role="switch"
        aria-checked={watchly.enabled}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1rem',
          borderRadius: '10px',
          border: `1px solid ${watchly.enabled ? 'var(--accent)' : 'var(--border)'}`,
          background: watchly.enabled ? 'rgba(99,102,241,0.06)' : 'var(--panel)',
          color: 'var(--text)',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Install Watchly</span>
        <span
          aria-hidden="true"
          style={{
            width: '40px', height: '22px', borderRadius: '11px',
            background: watchly.enabled ? 'var(--accent)' : 'var(--border)',
            position: 'relative', transition: 'background 0.15s', flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: '3px',
            left: watchly.enabled ? '21px' : '3px',
            width: '16px', height: '16px', borderRadius: '50%',
            background: '#fff', transition: 'left 0.15s',
          }} />
        </span>
      </button>

      {watchly.enabled && (
        <>
          <p style={{
            fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            margin: '1rem 0 0.6rem',
          }}>
            Watch history source
          </p>

          <div style={cardStyle}>
            {logoUrl ? (
              <img src={logoUrl} alt={appName} style={{ height: '36px', width: '36px', objectFit: 'contain', flexShrink: 0 }} />
            ) : (
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--accent)', flexShrink: 0 }}>{appName}</div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.95rem' }}>{appName}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.45, marginTop: '0.15rem' }}>
                {connected ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--accent)', fontWeight: 600, flexWrap: 'wrap' }}>
                    <Check size={13} />
                    {account.email}
                    {isNuvio && profileName ? ` · ${profileName}` : ''}
                  </span>
                ) : (
                  `The ${appName} account is not connected. Go back to the Account step and sign in again.`
                )}
              </div>
            </div>
          </div>

          <div className="wizard-notice" style={{ marginTop: '1rem' }}>
            <div className="wizard-notice__title">🔒 Privacy note</div>
            <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
              Watchly needs the selected {appName} session to read your watch history. The wizard sends the session token(s) to the selected Watchly instance; your {appName} password is never sent to Watchly.
            </div>
          </div>
        </>
      )}

      <NextButton
        onClick={nextStep}
        disabled={!canContinue}
        label="Make Magic Happen"
        icon={(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 4V2" />
            <path d="M15 10V8" />
            <path d="M19 6h2" />
            <path d="M9 6H7" />
            <path d="m18 3 1 1" />
            <path d="m11 10 1 1" />
            <path d="m18 9-1-1" />
            <path d="m11 2 1 1" />
            <path d="m14 7-9 9 2 2 9-9-2-2Z" />
          </svg>
        )}
      />
    </WizardShell>
  );
}

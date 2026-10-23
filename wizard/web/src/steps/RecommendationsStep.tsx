import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { rolesOf, useWizard } from '../store/wizard';
import { isBingecatOn } from '../lib/constants';
import { resolveLogoUrl } from '../lib/services';
import { BingecatCard, useBingecatStatus } from './BingecatCard';

function ToggleRow({ label, description, checked, onClick }: { label: string; description?: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={checked}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        padding: '0.85rem 1rem',
        borderRadius: '10px',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
        background: checked ? 'rgba(99,102,241,0.06)' : 'var(--panel)',
        color: 'var(--text)',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
      }}
    >
      <span>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem' }}>{label}</span>
        {description && <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.4 }}>{description}</span>}
      </span>
      <span
        aria-hidden="true"
        style={{
          width: '40px', height: '22px', borderRadius: '11px',
          background: checked ? 'var(--accent)' : 'var(--border)',
          position: 'relative', transition: 'background 0.15s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: '3px',
          left: checked ? '21px' : '3px',
          width: '16px', height: '16px', borderRadius: '50%',
          background: '#fff', transition: 'left 0.15s',
        }} />
      </span>
    </button>
  );
}

export function RecommendationsStep() {
  const {
    target, stremioAccount, nuvioAccount, nuvioProfiles, stremioKids, watchly, bingecat, wizardConfig,
    setWatchly, toggleRecommendation, nextStep,
  } = useWizard();

  const featureOn = isBingecatOn(wizardConfig);
  const { hasStandard } = rolesOf({ target, nuvioProfiles, stremioKids });
  const bc = useBingecatStatus();
  const isNuvio = target === 'nuvio';
  const appName = isNuvio ? 'Nuvio' : 'Stremio';
  const account = isNuvio ? nuvioAccount : stremioAccount;
  const hasValidNuvioProfiles = nuvioProfiles.length > 0
    && nuvioProfiles.every((t) => typeof t.nuvioProfileId === 'number'
      && Number.isInteger(t.nuvioProfileId) && t.nuvioProfileId >= 1 && t.nuvioProfileId <= 6);
  const connected = isNuvio
    ? !!nuvioAccount.authToken && hasValidNuvioProfiles
    : !!stremioAccount.authKey;
  const profileNames = isNuvio
    ? nuvioProfiles.filter((t) => !t.kids).map((t) => t.name.trim()).filter(Boolean).join(', ')
    : '';
  // Kids profiles never get Watchly, so it only matters when there are Standard profiles.
  const watchlyActive = watchly.enabled && hasStandard;
  const canContinue = (!watchlyActive || connected) && bc.ready;
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
  const sectionLabel: CSSProperties = {
    fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', margin: '1rem 0 0.6rem',
  };

  return (
    <WizardShell onSubmit={canContinue ? nextStep : undefined}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem' }}>
          🤖 Recommendations
        </h2>
        <p className="page-description">
          {hasStandard
            ? <>Watchly is a full-blown recommendations addon that provides Netflix-like suggestions and dynamic catalogs based on your watch history. It's optional and free to skip.{isNuvio && ' It is set up separately for each profile you selected.'}</>
            : 'Kids profiles use BingeCat for kid-safe recommendations, catalogs and search.'}
          {featureOn && hasStandard && ' BingeCat is another recommendations addon; you can use one of them or both.'}
        </p>
      </div>

      {hasStandard && (
        <ToggleRow
          label="Install Watchly"
          checked={watchly.enabled}
          onClick={() => (featureOn ? toggleRecommendation('watchly') : setWatchly({ enabled: !watchly.enabled }))}
        />
      )}

      {watchlyActive && (
        <>
          <p style={sectionLabel}>Watch history source</p>
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
                    {profileNames ? ` · ${profileNames}` : ''}
                  </span>
                ) : (
                  `The ${appName} account is not connected. Go back to the Account step and sign in again.`
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {featureOn && hasStandard && (
        <div style={{ marginTop: '1rem' }}>
          <ToggleRow
            label="Install BingeCat"
            description="Requires a free BingeCat account."
            checked={bingecat.enabled}
            onClick={() => toggleRecommendation('bingecat')}
          />
        </div>
      )}

      {bc.rows.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <BingecatCard />
        </div>
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

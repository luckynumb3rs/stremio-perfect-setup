import { Check } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { rolesOf, useWizard } from '../store/wizard';
import { isBingecatConfigured } from '../lib/constants';
import { resolveLogoUrl } from '../lib/services';
import { BingecatCard, useBingecatStatus } from './BingecatCard';

/** On/off switch (decorative track + knob inside a button, so the whole control is one accessible switch). */
function Switch({ checked, locked = false, label, onClick }: { checked: boolean; locked?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={locked}
      onClick={onClick}
      style={{ background: 'none', border: 'none', padding: 0, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.65 : 1, flexShrink: 0, display: 'flex' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '40px', height: '22px', borderRadius: '11px',
          background: checked ? 'var(--accent)' : 'var(--border)',
          position: 'relative', transition: 'background 0.15s', display: 'block',
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

/** Same pill as the Connected state of the Trakt cards on the Done page. */
function ConnectedBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', background: 'rgba(34,197,94,0.14)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
      <Check size={11} /> Connected
    </span>
  );
}

/** One recommendation addon: title (+ badge) and switch on top, centered description, optional notice, extra content when on. */
function RecoCard({ title, badge, description, notice, checked, locked, onToggle, children }: {
  title: string; badge?: ReactNode; description: string; notice?: string; checked: boolean; locked?: boolean; onToggle: () => void; children?: ReactNode;
}) {
  return (
    <div style={{ borderRadius: '12px', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, background: checked ? 'rgba(99,102,241,0.06)' : 'var(--panel)', padding: '0.9rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{title}{badge}</span>
        <Switch checked={checked} locked={locked} label={`Install ${title}`} onClick={onToggle} />
      </div>
      <p style={{ margin: '0.5rem 0 0', textAlign: 'center', fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--muted)' }}>{description}</p>
      {notice && (
        <p style={{ margin: '0.6rem 0 0', textAlign: 'center', fontSize: '0.78rem', lineHeight: 1.5, color: '#b45309' }}>{notice}</p>
      )}
      {checked && children && <div style={{ marginTop: '0.85rem' }}>{children}</div>}
    </div>
  );
}

export function RecommendationsStep() {
  const {
    target, stremioAccount, nuvioAccount, nuvioProfiles, stremioKids, watchly, bingecat, wizardConfig, pinCollections,
    setWatchly, setBingecat, setPinCollections, nextStep,
  } = useWizard();

  const featureOn = isBingecatConfigured(wizardConfig);
  const { hasStandard, hasKids } = rolesOf({ target, nuvioProfiles, stremioKids });
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
  // Kids profiles never get Watchly, so its switch only matters when there are Standard profiles.
  const watchlyActive = watchly.enabled && hasStandard;
  // BingeCat is one switch for the run, and it cannot be off while a Kids profile exists.
  const bingecatShown = featureOn && (hasStandard || hasKids);
  const bingecatOn = bingecatShown && (bingecat.enabled || hasKids);
  const canContinue = (!watchlyActive || connected) && bc.ready;
  // Collections exist on Nuvio only, and only Standard profiles get them. The choice matters when a recommendations addon adds its own catalogs.
  const showPinCollections = isNuvio && hasStandard && (watchlyActive || bingecatOn);
  const pinnedNames = [watchlyActive && 'Watchly', bingecatOn && 'BingeCat'].filter(Boolean).join(' and ');
  const logoUrl = resolveLogoUrl(`services/${isNuvio ? 'nuvio.png' : 'stremio.svg'}`);

  const sourceCardStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    padding: '0.85rem',
    borderRadius: '10px',
    border: `1px solid ${connected ? 'var(--accent)' : 'var(--border)'}`,
    background: connected ? 'var(--panel-2)' : 'var(--panel)',
  };
  const sectionLabel: CSSProperties = {
    fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem', textAlign: 'center',
  };

  return (
    <WizardShell onSubmit={canContinue ? nextStep : undefined}>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem' }}>
          🤖 Recommendations
        </h2>
        <p className="page-description">
          Recommendation addons build personalized suggestions and extra catalogs from what you watch.
          They are optional and free to skip.
        </p>
      </div>

      {bingecatShown && hasStandard && (
        <div className="wizard-notice" style={{ marginBottom: '1rem' }}>
          <div className="wizard-notice__title">💡 Good to Know</div>
          <div>
            Watchly and BingeCat do the same job, so it is recommended to use only one of them.
            Installing both can give you redundant catalogs.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {hasStandard && (
          <RecoCard
            title="Watchly"
            description={`Watchly is a recommendations addon that gives you Netflix-like suggestions and dynamic catalogs based on your watch history.${isNuvio ? ' It is set up separately for each profile you selected.' : ''}`}
            checked={watchly.enabled}
            onToggle={() => setWatchly({ enabled: !watchly.enabled })}
          >
            <p style={sectionLabel}>Watch History Source</p>
            <div style={sourceCardStyle}>
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
          </RecoCard>
        )}

        {bingecatShown && (
          <RecoCard
            title="BingeCat"
            badge={bingecatOn && bc.connected ? <ConnectedBadge /> : undefined}
            description={`BingeCat is a recommendations and search addon with personalized catalogs based on what you watch${hasKids ? ', and kid-safe settings for Kids profiles' : ''}.`}
            notice={hasKids
              ? `BingeCat is required for Kids profiles, so it cannot be turned off.${watchlyActive ? ' Watchly will only be installed on your other profiles, not on the Kids profiles.' : ''}`
              : undefined}
            checked={bingecatOn}
            locked={hasKids}
            onToggle={() => setBingecat({ enabled: !bingecat.enabled })}
          >
            <BingecatCard />
          </RecoCard>
        )}
      </div>

      {showPinCollections && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.85rem 1rem', borderRadius: '10px', border: `1px solid ${pinCollections ? 'var(--accent)' : 'var(--border)'}`, background: pinCollections ? 'rgba(99,102,241,0.06)' : 'var(--panel)' }}>
            <span>
              <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>Pin Collections on Top</span>
              <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                Show your collections above the {pinnedNames} catalogs on the Nuvio home screen. Turn off to show them below.
              </span>
            </span>
            <Switch checked={pinCollections} label="Pin Collections on Top" onClick={() => setPinCollections(!pinCollections)} />
          </div>
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

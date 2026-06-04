import { useState, type CSSProperties } from 'react';
import { ArrowRight, Loader2, LogIn, UserPlus, UserRound } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { MarkdownText } from '../components/MarkdownText';
import { useWizard } from '../store/wizard';

// @ts-ignore
import { createStremioAdapter } from '@core/adapters/stremio.js';
// @ts-ignore
import { createNuvioAdapter } from '@core/adapters/nuvio.js';

const CREATE_NEW_PROFILE_VALUE = '__create_new_profile__';

export function AccountStep() {
  const MIN_PASSWORD_LENGTHS = {
    stremio: {
      signin: 4,
      create: 8,
    },
    nuvio: {
      signin: 6,
      create: 8,
    },
  } as const;
  const { target, stremioAccount, nuvioAccount, setStremioAccount, setNuvioAccount, nextStep } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const account = target === 'stremio' ? stremioAccount : nuvioAccount;
  const appName = target === 'stremio' ? 'Stremio' : 'Nuvio';
  const isNuvio = target === 'nuvio';
  const nuvioProfiles = isNuvio ? (account.profiles ?? []) : [];
  const hasLoadedNuvioProfileStep = isNuvio
    && account.mode === 'signin'
    && typeof account.authToken === 'string'
    && account.authToken.length > 0;
  const isCreatingNuvioProfile = hasLoadedNuvioProfileStep && !!account.createNewProfile;
  const minPasswordLength = MIN_PASSWORD_LENGTHS[target ?? 'stremio'][account.mode];

  const isValidEmail    = account.email.includes('@');
  const isValidPassword = account.password.length >= minPasswordLength;
  const requiresProfileName = isNuvio && (account.mode === 'create' || isCreatingNuvioProfile);
  const isValidProfileName = !requiresProfileName || !!account.profileName?.trim();
  const hasSelectedProfile = !hasLoadedNuvioProfileStep || isCreatingNuvioProfile || Number.isFinite(account.profileId);
  const canAttempt = isValidEmail && isValidPassword && isValidProfileName && hasSelectedProfile && !loading;
  const buttonLabel = loading
    ? (
      account.mode === 'create'
        ? 'Creating account...'
        : isCreatingNuvioProfile
        ? 'Creating profile...'
        : hasLoadedNuvioProfileStep
        ? 'Continuing...'
        : isNuvio
        ? 'Loading profiles...'
        : 'Signing in...'
    )
    : hasLoadedNuvioProfileStep
    ? account.createNewProfile
      ? 'Create profile and continue'
      : 'Continue with profile'
    : 'Continue';
  const buttonLeadingIcon = loading
    ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
    : hasLoadedNuvioProfileStep
    ? <UserRound size={16} />
    : account.mode === 'create'
    ? <UserPlus size={16} />
    : <LogIn size={16} />;

  function updateAccount(next: Partial<typeof account>) {
    if (target === 'stremio') {
      setStremioAccount({
        ...next,
        authKey: undefined,
        authError: undefined,
      });
      return;
    }

    setNuvioAccount({
      ...next,
      authToken: undefined,
      authError: undefined,
      profileId: undefined,
      createNewProfile: false,
      profiles: [],
    });
  }

  async function handleContinue() {
    if (!canAttempt) return;

    setLoading(true);
    setError('');
    try {
      if (target === 'stremio') {
        const adapter = createStremioAdapter();
        const auth = account.mode === 'create'
          ? await adapter.register(account.email, account.password)
          : await adapter.login(account.email, account.password);
        setStremioAccount({ authKey: auth.authKey, userId: (auth as { userId?: string | null }).userId ?? undefined });
      } else {
        const adapter = createNuvioAdapter();
        if (account.mode === 'create') {
          const auth = await adapter.signup(account.email, account.password);
          const profile = await adapter.createProfile(auth.token, {
            name: account.profileName?.trim() || 'Profile 1',
          });
          if (!profile) {
            throw new Error('Nuvio account was created, but the initial profile could not be created.');
          }
          setNuvioAccount({
            authToken: auth.token,
            profileId: profile.profile_index,
            createNewProfile: false,
            profiles: [profile],
          });
        } else if (hasLoadedNuvioProfileStep) {
          if (isCreatingNuvioProfile) {
            const profile = await adapter.createProfile(account.authToken, {
              name: account.profileName?.trim() || 'Profile 1',
            });
            if (!profile) {
              throw new Error('Nuvio sign-in succeeded, but the new profile could not be created.');
            }
            const profiles = [...nuvioProfiles, profile]
              .sort((a, b) => a.profile_index - b.profile_index);
            setNuvioAccount({
              profiles,
              profileId: profile.profile_index,
              profileName: profile.name,
              createNewProfile: false,
            });
          }
          nextStep();
          return;
        } else {
          const auth = await adapter.login(account.email, account.password);
          const profiles = await adapter.getProfiles(auth.token);
          const selectedProfileId = profiles.some(profile => profile.profile_index === account.profileId)
            ? account.profileId
            : profiles[0]?.profile_index;
          const selectedProfile = profiles.find((profile) => profile.profile_index === selectedProfileId);

          setNuvioAccount({
            authToken: auth.token,
            profiles,
            profileId: profiles.length ? selectedProfileId : undefined,
            profileName: selectedProfile?.name ?? account.profileName,
            createNewProfile: profiles.length === 0,
          });
          return;
        }
      }
      nextStep();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const descKey = `${target ?? 'stremio'}-${account.mode}`;
  const descriptions: Record<string, string> = {
    'stremio-create': 'We will create a new Stremio account and install your addons automatically.',
    'stremio-signin': 'We will sign into your existing Stremio account and install your addons.',
    'nuvio-create':   'We will create a new Nuvio account, create its first profile, and install your addons automatically.',
    'nuvio-signin':   'We will sign into your existing Nuvio account, load its profiles, and install your addons and collections into an existing profile or a new one you create here.',
  };

  const inputStyle: React.CSSProperties = {
    marginTop: '0.35rem', width: '100%',
    border: '1px solid var(--border)', borderRadius: '8px',
    padding: '0.5rem 0.75rem', fontSize: '0.875rem',
    background: 'var(--panel)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <WizardShell>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>
        Your {appName} Account
      </h2>
      <MarkdownText
        text={descriptions[descKey] ?? ''}
        style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6 }}
      />

      <div className="wizard-notice" style={{ marginBottom: '1.25rem' }}>
        <div className="wizard-notice__title">🔒 Privacy</div>
        <div>
          No login credentials, API keys, or setup values are collected or stored by the wizard during this process.
          Everything runs locally in your browser.
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {(['create', 'signin'] as const).map(m => (
          <button
            key={m}
            type="button"
            className={`wizard-hover-lift${account.mode === m ? '' : ' wizard-hover-lift--guide'}`}
            onClick={() => { updateAccount({ mode: m }); setError(''); }}
            style={{
              '--wizard-hover-selected-bg': 'var(--accent)',
              '--wizard-hover-selected-border': 'var(--accent)',
              '--wizard-hover-selected-color': '#fff',
              padding: '0.7rem 1rem', borderRadius: '10px', fontSize: '0.875rem',
              fontWeight: 600, border: `1px solid ${account.mode === m ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer', transition: 'all 0.15s',
              background: account.mode === m ? 'var(--accent)' : 'var(--panel-2)',
              color: account.mode === m ? '#fff' : 'var(--muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
              flex: 1,
            } as CSSProperties}
          >
            {m === 'create' ? <UserPlus size={15} /> : <LogIn size={15} />}
            {m === 'create' ? 'Create account' : 'Sign in'}
          </button>
        ))}
      </div>

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Email address</span>
        <input
          type="email"
          value={account.email}
          onChange={e => { updateAccount({ email: e.target.value }); setError(''); }}
          placeholder="you@example.com"
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
          Password
          <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>(min. {minPasswordLength} characters)</span>
        </span>
        <input
          type="password"
          value={account.password}
          onChange={e => { updateAccount({ password: e.target.value }); setError(''); }}
          placeholder="Enter your password..."
          style={inputStyle}
        />
      </label>

      {isNuvio && (account.mode === 'create' || isCreatingNuvioProfile) && (
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Profile name</span>
          <input
            type="text"
            value={account.profileName ?? ''}
            onChange={e => {
              if (account.mode === 'create') {
                updateAccount({ profileName: e.target.value });
              } else {
                setNuvioAccount({ profileName: e.target.value });
              }
              setError('');
            }}
            placeholder="Profile 1"
            style={inputStyle}
          />
        </label>
      )}

      {hasLoadedNuvioProfileStep && (
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Profile</span>
          <select
            value={account.createNewProfile ? CREATE_NEW_PROFILE_VALUE : String(account.profileId ?? '')}
            onChange={e => {
              if (e.target.value === CREATE_NEW_PROFILE_VALUE) {
                setNuvioAccount({ createNewProfile: true, profileId: undefined });
              } else {
                const selectedProfileId = Number(e.target.value);
                const selectedProfile = nuvioProfiles.find((profile) => profile.profile_index === selectedProfileId);
                setNuvioAccount({
                  createNewProfile: false,
                  profileId: selectedProfileId,
                  profileName: selectedProfile?.name ?? account.profileName,
                });
              }
              setError('');
            }}
            style={inputStyle}
          >
            {nuvioProfiles.length === 0 && (
              <option value={CREATE_NEW_PROFILE_VALUE}>Create new profile</option>
            )}
            {nuvioProfiles.map((profile) => (
              <option key={profile.profile_index} value={profile.profile_index}>
                {profile.name || `Profile ${profile.profile_index}`}
              </option>
            ))}
            {nuvioProfiles.length > 0 && (
              <option value={CREATE_NEW_PROFILE_VALUE}>Create new profile</option>
            )}
          </select>
          <p style={{ marginTop: '0.45rem', color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.45 }}>
            {account.createNewProfile
              ? 'A new Nuvio profile will be created and then configured by the wizard when you continue.'
              : 'The selected Nuvio profile will have its current addons replaced and its collections updated by the wizard.'}
          </p>
        </label>
      )}

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
          padding: '0.6rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.8125rem', color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      <button
        type="button"
        className="wizard-primary-btn"
        onClick={handleContinue}
        disabled={!canAttempt}
        style={{
          width: '100%',
          marginTop: '1.25rem',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}
      >
        <span className="wizard-primary-btn__icon" aria-hidden="true">{buttonLeadingIcon}</span>
        <span className="wizard-primary-btn__label">{buttonLabel}</span>
        <span className="wizard-primary-btn__icon" aria-hidden="true"><ArrowRight size={16} /></span>
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </WizardShell>
  );
}

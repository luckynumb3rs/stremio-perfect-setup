import { useState, type CSSProperties } from 'react';
import { ArrowRight, Loader2, LogIn, Plus, UserPlus, UserRound, X } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { MarkdownText } from '../components/MarkdownText';
import { useWizard, sortNuvioProfiles, type NuvioProfileOption, type NuvioProfileTarget } from '../store/wizard';
import { resolveImageUrl } from '../lib/integration';
import { isBingecatOn } from '../lib/constants';

// @ts-ignore
import { createStremioAdapter } from '@core/adapters/stremio.js';
// @ts-ignore
import { createNuvioAdapter, MAX_NUVIO_PROFILES } from '@core/adapters/nuvio.js';

const DEFAULT_AVATAR_COLOR = '#1E88E5';

/** Small on/off switch used for the Kids option. */
function KidsSwitch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none',
        cursor: 'pointer', color: 'var(--text)', font: 'inherit', fontSize: '0.8rem', padding: '0.15rem 0',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '34px', height: '18px', borderRadius: '9px', position: 'relative', flexShrink: 0,
          background: checked ? 'var(--accent)' : 'var(--border)', transition: 'background 0.15s',
        }}
      >
        <span style={{
          position: 'absolute', top: '2px', left: checked ? '18px' : '2px', width: '14px', height: '14px',
          borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
        }} />
      </span>
      <span>Kids</span>
    </button>
  );
}

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
  const {
    target, stremioAccount, nuvioAccount, nuvioProfiles, stremioKids, wizardConfig,
    setStremioAccount, setNuvioAccount, setNuvioProfiles, setNuvioProfileKids, setStremioKids, toggleNuvioProfile, setInstallResult, setBingecat, nextStep,
  } = useWizard();
  const kidsAvailable = isBingecatOn(wizardConfig);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const account = target === 'stremio' ? stremioAccount : nuvioAccount;
  const appName = target === 'stremio' ? 'Stremio' : 'Nuvio';
  const isNuvio = target === 'nuvio';
  const existingProfiles: NuvioProfileOption[] = isNuvio ? (account.profiles ?? []) : [];
  // Signed in (or account already created): the profiles are loaded and can be picked.
  const hasLoadedNuvioProfileStep = isNuvio
    && typeof account.authToken === 'string'
    && account.authToken.length > 0;
  // Profile section is shown after sign-in, and straight away when creating an account.
  const showProfileSection = isNuvio && (account.mode === 'create' || hasLoadedNuvioProfileStep);
  const newEntries = nuvioProfiles.filter((t) => t.nuvioProfileId === 'new');
  const newCount = newEntries.length;
  const totalProfiles = existingProfiles.length + newCount;
  const minPasswordLength = MIN_PASSWORD_LENGTHS[target ?? 'stremio'][account.mode];

  const isValidEmail    = account.email.includes('@');
  const isValidPassword = account.password.length >= minPasswordLength;
  const hasValidSelection = !showProfileSection
    || (nuvioProfiles.length > 0
      && newEntries.every((t) => t.name.trim().length > 0)
      && totalProfiles <= MAX_NUVIO_PROFILES);
  const canAttempt = isValidEmail && isValidPassword && hasValidSelection && !loading;
  const profileWord = (n: number) => (n === 1 ? 'profile' : 'profiles');
  const buttonLabel = loading
    ? (
      hasLoadedNuvioProfileStep
        ? (newCount > 0 ? `Creating ${profileWord(newCount)}...` : 'Continuing...')
        : account.mode === 'create'
        ? 'Creating account...'
        : isNuvio
        ? 'Loading profiles...'
        : 'Signing in...'
    )
    : hasLoadedNuvioProfileStep
    ? newCount > 0
      ? `Create ${profileWord(newCount)} and continue`
      : `Continue with ${nuvioProfiles.length} ${profileWord(nuvioProfiles.length)}`
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
      authRefreshToken: undefined,
      authExpiresAt: undefined,
      authError: undefined,
      profiles: [],
    });
    // Install results (and their backups) of an earlier run belong to the old account.
    if (next.email !== undefined || next.mode !== undefined) {
      setInstallResult({ profiles: [] });
      // BingeCat mapping entries are per Nuvio profile of this account
      if (useWizard.getState().bingecat.mapping.length > 0) setBingecat({ mapping: [] });
    }
    // Picks of existing profiles belong to the old account. A mode switch restarts the list
    // (create starts with one new profile, sign-in with none until the account's profiles load).
    setNuvioProfiles(next.mode
      ? (next.mode === 'create' ? [{ nuvioProfileId: 'new', name: 'Profile 1', kids: false }] : [])
      : nuvioProfiles.filter((t) => t.nuvioProfileId === 'new'));
  }

  /** Creates the 'new' profiles one after another; each success is stored right away, so a failure never re-creates earlier ones. */
  async function createPendingProfiles(adapter: ReturnType<typeof createNuvioAdapter>, token: string) {
    let profiles = [...existingProfiles];
    let targets = [...nuvioProfiles];
    for (let i = 0; i < targets.length; i++) {
      if (targets[i].nuvioProfileId !== 'new') continue;
      const profile: NuvioProfileOption | null = await adapter.createProfile(token, { name: targets[i].name.trim() });
      if (!profile) throw new Error('Nuvio could not create the profile. Please try again.');
      profiles = [...profiles, profile].sort((a, b) => a.profile_index - b.profile_index);
      targets = targets.map((t, j) => (j === i ? { nuvioProfileId: profile.profile_index, name: profile.name, kids: t.kids } : t));
      setNuvioAccount({ profiles });
      setNuvioProfiles(sortNuvioProfiles(targets));
    }
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
        if (hasLoadedNuvioProfileStep) {
          // Signed in already (or the account was created and profile creation stopped halfway): finish creating profiles.
          let token = account.authToken as string;
          const expiresSoon = !!account.authExpiresAt && account.authExpiresAt - Math.floor(Date.now() / 1000) <= 300;
          if (newCount > 0 && expiresSoon) {
            const auth = await adapter.login(account.email, account.password);
            token = auth.token;
            setNuvioAccount({
              authToken: auth.token,
              authRefreshToken: auth.refreshToken ?? undefined,
              authExpiresAt: auth.expiresAt ?? undefined,
            });
          }
          await createPendingProfiles(adapter, token);
        } else if (account.mode === 'create') {
          const auth = await adapter.signup(account.email, account.password);
          // Store the session first: if a profile fails below, Continue resumes instead of signing up again.
          setNuvioAccount({
            authToken: auth.token,
            authRefreshToken: auth.refreshToken ?? undefined,
            authExpiresAt: auth.expiresAt ?? undefined,
            profiles: [],
          });
          await createPendingProfiles(adapter, auth.token);
        } else {
          const auth = await adapter.login(account.email, account.password);
          const profiles: NuvioProfileOption[] = await adapter.getProfiles(auth.token);
          setNuvioAccount({
            authToken: auth.token,
            authRefreshToken: auth.refreshToken ?? undefined,
            authExpiresAt: auth.expiresAt ?? undefined,
            profiles,
          });
          const first: NuvioProfileTarget[] = profiles.length
            ? [{ nuvioProfileId: profiles[0].profile_index, name: profiles[0].name, kids: false }]
            : [];
          const added = nuvioProfiles.filter((t) => t.nuvioProfileId === 'new');
          setNuvioProfiles(first.length + added.length > 0
            ? sortNuvioProfiles([...first, ...added])
            : [{ nuvioProfileId: 'new', name: 'Profile 1', kids: false }]);
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

  function addNewProfile() {
    setNuvioProfiles([...nuvioProfiles, { nuvioProfileId: 'new', name: `Profile ${totalProfiles + 1}`, kids: false }]);
    setError('');
  }
  function renameNewProfile(index: number, name: string) {
    setNuvioProfiles(nuvioProfiles.map((t, i) => (i === index ? { ...t, name } : t)));
    setError('');
  }
  function removeProfile(index: number) {
    setNuvioProfiles(nuvioProfiles.filter((_, i) => i !== index));
    setError('');
  }

  const descKey = `${target ?? 'stremio'}-${account.mode}`;
  const descriptions: Record<string, string> = {
    'stremio-create': 'We will create a new Stremio account and install your addons automatically.',
    'stremio-signin': 'We will sign into your existing Stremio account, replace your current addons with this setup, and show you a backup list of your previous addons at the end.',
    'nuvio-create':   'We will create a new Nuvio account with the profiles you name, and install your addons automatically.',
    'nuvio-signin':   'We will sign into your existing Nuvio account, load its profiles, replace the addons of the profiles you select with this setup, and show you a backup list of the previous addons at the end.',
  };

  const inputStyle: React.CSSProperties = {
    marginTop: '0.35rem', width: '100%',
    border: '1px solid var(--border)', borderRadius: '8px',
    padding: '0.5rem 0.75rem', fontSize: '0.875rem',
    background: 'var(--panel)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box',
  };
  const cardStyle = (selected: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', textAlign: 'left',
    padding: '0.6rem 0.75rem', borderRadius: '10px', cursor: 'pointer', color: 'var(--text)',
    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    background: selected ? 'var(--panel-2)' : 'var(--panel)',
  });
  const avatarStyle = (color?: string | null): CSSProperties => ({
    width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
    background: color || DEFAULT_AVATAR_COLOR, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700,
  });

  const logoUrl = resolveImageUrl(`services/${isNuvio ? 'nuvio.png' : 'stremio.svg'}`);

  return (
    <WizardShell onSubmit={canAttempt ? handleContinue : undefined}>
      {logoUrl && (
        <div style={{ textAlign: 'center', marginBottom: '0.85rem' }}>
          <img src={logoUrl} alt={appName} style={{ height: '42px', maxWidth: '140px', objectFit: 'contain', margin: '0 auto', display: 'block' }} />
        </div>
      )}
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem', textAlign: 'center' }}>
        Your {appName} Account
      </h2>
      <MarkdownText
        text={descriptions[descKey] ?? ''}
        style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6, textAlign: 'center' }}
      />

      <div className="wizard-notice" style={{ marginBottom: '1.25rem' }}>
        <div className="wizard-notice__title">🔒 Privacy</div>
        <div>
          No login credentials, API keys, or setup values are collected or stored by the wizard during this process.
          Everything runs locally in your browser.
        </div>
      </div>

      {/* Locked while a request runs, so the selection cannot change under the async handlers */}
      <fieldset disabled={loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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

      {kidsAvailable && target === 'stremio' && (
        <div style={{ marginTop: '0.75rem' }}>
          <KidsSwitch checked={stremioKids} onChange={setStremioKids} label="This is a Kids account" />
          <p style={{ margin: '0.2rem 0 0', color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.45 }}>
            A Kids account gets BingeCat with kid-safe settings instead of the standard catalogs and recommendations.
          </p>
        </div>
      )}

      {showProfileSection && (
        <div style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
            {account.mode === 'create' ? 'Profiles' : 'Profiles to set up'}
          </span>
          <div role="group" aria-label="Nuvio profiles" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.45rem' }}>
            {existingProfiles.map((profile) => {
              const selected = nuvioProfiles.some((t) => t.nuvioProfileId === profile.profile_index);
              const name = profile.name || `Profile ${profile.profile_index}`;
              const targetIndex = nuvioProfiles.findIndex((t) => t.nuvioProfileId === profile.profile_index);
              return (
                <div key={profile.profile_index}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => { toggleNuvioProfile(profile); setError(''); }}
                  style={cardStyle(selected)}
                >
                  <span style={avatarStyle(profile.avatar_color_hex)} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600 }}>{name}</span>
                    {selected && (
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                        Addons and collections replaced, addon backup shown at the end
                        {profile.uses_primary_addons && ' · uses the main profile\'s addons today, it gets its own'}
                      </span>
                    )}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent)' : 'transparent',
                      boxShadow: selected ? 'inset 0 0 0 3px var(--panel-2)' : 'none',
                    }}
                  />
                </button>
                {kidsAvailable && selected && (
                  <div style={{ padding: '0.25rem 0.75rem 0' }}>
                    <KidsSwitch
                      checked={nuvioProfiles[targetIndex]?.kids ?? false}
                      onChange={(kids) => { setNuvioProfileKids(targetIndex, kids); setError(''); }}
                      label={`${name} is a Kids profile`}
                    />
                  </div>
                )}
                </div>
              );
            })}

            {nuvioProfiles.map((entry, index) => entry.nuvioProfileId === 'new' && (
              <div key={`new-${index}`} style={{ ...cardStyle(true), cursor: 'default' }}>
                <span style={avatarStyle()} aria-hidden="true"><Plus size={14} /></span>
                <input
                  type="text"
                  aria-label="New profile name"
                  value={entry.name}
                  onChange={e => renameNewProfile(index, e.target.value)}
                  placeholder={`Profile ${existingProfiles.length + 1}`}
                  style={{ ...inputStyle, marginTop: 0, flex: 1 }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', flexShrink: 0 }}>new</span>
                {kidsAvailable && (
                  <KidsSwitch
                    checked={entry.kids}
                    onChange={(kids) => { setNuvioProfileKids(index, kids); setError(''); }}
                    label={`${entry.name || 'New profile'} is a Kids profile`}
                  />
                )}
                {nuvioProfiles.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ${entry.name || 'new profile'}`}
                    onClick={() => removeProfile(index)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: '0.2rem' }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}

            {totalProfiles < MAX_NUVIO_PROFILES && (
              <button
                type="button"
                onClick={addNewProfile}
                style={{ ...cardStyle(false), borderStyle: 'dashed', color: 'var(--muted)', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 600 }}
              >
                <Plus size={15} /> Add new profile
              </button>
            )}
          </div>
          <p style={{ marginTop: '0.45rem', color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.45 }}>
            {nuvioProfiles.length === 0
              ? 'Select at least one profile.'
              : `Nuvio allows up to ${MAX_NUVIO_PROFILES} profiles per account.${newCount > 0 ? ' New profiles are created when you continue.' : ''}`}
          </p>
        </div>
      )}

      </fieldset>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
          padding: '0.6rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.8125rem', color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      {account.mode === 'signin' && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
          padding: '0.7rem 0.85rem', marginTop: '0.75rem', fontSize: '0.8125rem', color: '#92400e', lineHeight: 1.55,
        }}>
          <strong style={{ display: 'block', marginBottom: '0.2rem' }}>⚠️ IMPORTANT: Existing addons will be removed!</strong>
          Completing this wizard replaces every addon currently installed on your {appName} account{isNuvio ? ' profiles you select' : ''}.
          A list of their Manifest URLs from your {appName} settings will be shown in the end so you can reinstall them manually afterwards if needed.
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

import { useState, type CSSProperties } from 'react';
import { ArrowRight, Loader2, LogIn } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { useWizard } from '../store/wizard';

// @ts-ignore
import { createStremioAdapter } from '@core/adapters/stremio.js';

export function WatchlyStep() {
  const {
    target, stremioAccount, watchly,
    setWatchly, nextStep,
  } = useWizard();

  const [loginLoading, setLoginLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState(watchly.nuvioStremioLogin?.email ?? '');
  const [loginPassword, setLoginPassword] = useState(watchly.nuvioStremioLogin?.password ?? '');
  const [loginError, setLoginError] = useState('');

  const isNuvio = target === 'nuvio';
  const canContinue = !watchly.enabled || (isNuvio ? !!watchly.nuvioStremioLogin : !!stremioAccount.authKey);

  const inputStyle: CSSProperties = {
    marginTop: '0.35rem', width: '100%',
    border: '1px solid var(--border)', borderRadius: '8px',
    padding: '0.5rem 0.75rem', fontSize: '0.875rem',
    background: 'var(--panel)', color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box',
  };

  async function handleNuvioLogin() {
    if (!loginEmail.includes('@') || loginPassword.length < 4) {
      setLoginError('Please enter a valid email and password (min. 4 characters).');
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    try {
      const adapter = createStremioAdapter();
      const auth = await adapter.login(loginEmail, loginPassword);
      setWatchly({
        nuvioStremioLogin: {
          email: loginEmail,
          password: loginPassword,
          authKey: auth.authKey,
          userId: (auth as { userId?: string | null }).userId ?? '',
        },
      });
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <WizardShell>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>
        🍿 Watchly
      </h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
        Watchly provides Netflix-like recommendations and dynamic catalogs based on your watch history.
        It is optional — you can always add it later by running the wizard again.
      </p>

      {/* Master toggle */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1rem', borderRadius: '10px',
          border: `1px solid ${watchly.enabled ? 'var(--accent)' : 'var(--border)'}`,
          background: watchly.enabled ? 'rgba(99,102,241,0.06)' : 'var(--panel)',
          marginBottom: '1rem', cursor: 'pointer',
        }}
        onClick={() => { setWatchly({ enabled: !watchly.enabled }); setLoginError(''); }}
        role="checkbox"
        aria-checked={watchly.enabled}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setWatchly({ enabled: !watchly.enabled }); }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
          Install Watchly
        </span>
        <span style={{
          width: '40px', height: '22px', borderRadius: '11px',
          background: watchly.enabled ? 'var(--accent)' : 'var(--border)',
          position: 'relative', transition: 'background 0.15s', flexShrink: 0,
        }}>
          <span style={{
            position: 'absolute', top: '3px',
            left: watchly.enabled ? '21px' : '3px',
            width: '16px', height: '16px', borderRadius: '50%',
            background: '#fff', transition: 'left 0.15s',
          }} />
        </span>
      </div>

      {watchly.enabled && (
        <>
          {/* Stremio identity */}
          <div style={{ marginBottom: '0.85rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
              🎞️ Stremio account{' '}
              <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.78rem' }}>(required by Watchly)</span>
            </p>

            {!isNuvio ? (
              /* Stremio target — pre-filled from step 1 */
              <div style={{
                padding: '0.5rem 0.75rem', background: 'var(--panel-2)',
                borderRadius: '8px', fontSize: '0.875rem',
                border: '1px solid var(--border)',
              }}>
                <span style={{ color: 'var(--muted)' }}>Account: </span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{stremioAccount.email}</span>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', color: 'var(--accent)' }}>✓ pre-filled</span>
              </div>
            ) : watchly.nuvioStremioLogin ? (
              /* Nuvio — logged in */
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.5rem 0.75rem', background: 'var(--panel-2)',
                borderRadius: '8px', fontSize: '0.875rem', border: '1px solid var(--border)',
              }}>
                <span>
                  <span style={{ color: 'var(--muted)' }}>Signed in as </span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{watchly.nuvioStremioLogin.email}</span>
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', color: 'var(--accent)' }}>✓</span>
                </span>
                <button
                  type="button"
                  onClick={() => { setWatchly({ nuvioStremioLogin: null }); setLoginEmail(''); setLoginPassword(''); }}
                  style={{ fontSize: '0.78rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem 0.3rem' }}
                >
                  Change
                </button>
              </div>
            ) : (
              /* Nuvio — need Stremio login */
              <>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.6rem' }}>
                  Enter your Stremio credentials so Watchly can identify your configuration.
                  This account is only used to store your Watchly config and is not modified.
                </p>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Email</span>
                  <input
                    type="email" value={loginEmail}
                    onChange={e => { setLoginEmail(e.target.value); setLoginError(''); }}
                    placeholder="you@example.com" style={inputStyle}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Password</span>
                  <input
                    type="password" value={loginPassword}
                    onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }}
                    placeholder="Enter your password..." style={inputStyle}
                  />
                </label>
                {loginError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.6rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.8125rem', color: '#dc2626' }}>
                    {loginError}
                  </div>
                )}
                <button
                  type="button"
                  className="wizard-primary-btn"
                  onClick={handleNuvioLogin}
                  disabled={loginLoading || !loginEmail.includes('@') || loginPassword.length < 4}
                  style={{ width: '100%', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}
                >
                  {loginLoading
                    ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Signing in...</>
                    : <><LogIn size={15} /> Sign in to Stremio</>}
                </button>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </>
            )}
          </div>

          {/* Trakt / Simkl — disabled in v1 */}
          <div style={{ marginBottom: '0.85rem', opacity: 0.45, pointerEvents: 'none' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.25rem' }}>
              🎯 Trakt / 📽 Simkl
              <span style={{ marginLeft: '0.5rem', fontWeight: 400, fontSize: '0.78rem', color: 'var(--muted)' }}>
                (coming soon)
              </span>
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>
              Support for Trakt/Simkl as watch history source will be available once Watchly supports it.
            </p>
          </div>

          {/* Privacy disclosure */}
          <div className="wizard-notice" style={{ marginBottom: '1rem' }}>
            <div className="wizard-notice__title">🔒 Privacy note</div>
            <div style={{ fontSize: '0.82rem' }}>
              Unlike the other add-ons set up by this wizard, your Watchly configuration
              (including your Stremio identity) is sent to the selected Watchly instance.
              It is not processed locally.
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        className="wizard-primary-btn"
        onClick={nextStep}
        disabled={!canContinue}
        style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
      >
        <span className="wizard-primary-btn__label">
          {watchly.enabled ? 'Continue' : 'Skip and continue'}
        </span>
        <span className="wizard-primary-btn__icon" aria-hidden="true"><ArrowRight size={16} /></span>
      </button>
    </WizardShell>
  );
}

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { MarkdownText } from '../components/MarkdownText';
import { useWizard } from '../store/wizard';

// @ts-ignore
import { createStremioAdapter } from '@core/adapters/stremio.js';
// @ts-ignore
import { createNuvioAdapter } from '@core/adapters/nuvio.js';

export function AccountStep() {
  const { target, stremioAccount, nuvioAccount, setStremioAccount, setNuvioAccount, nextStep } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const account    = target === 'stremio' ? stremioAccount : nuvioAccount;
  const setAccount = target === 'stremio' ? setStremioAccount : setNuvioAccount;
  const appName    = target === 'stremio' ? 'Stremio' : 'Nuvio';

  const isValidEmail    = account.email.includes('@');
  const isValidPassword = account.password.length >= 8;
  const canAttempt      = isValidEmail && isValidPassword && !loading;

  function updateAccount(next: Partial<typeof account>) {
    setAccount({
      ...next,
      authKey: undefined,
      authToken: undefined,
      authError: undefined,
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
        setStremioAccount({ authKey: auth.authKey });
      } else {
        // Nuvio: attempt; gracefully handle placeholder anon key
        try {
          const adapter = createNuvioAdapter();
          const auth = account.mode === 'create'
            ? await adapter.signup(account.email, account.password)
            : await adapter.login(account.email, account.password);
          setNuvioAccount({ authToken: auth.token });
        } catch (nuvioErr: unknown) {
          const msg = nuvioErr instanceof Error ? nuvioErr.message : String(nuvioErr);
          // Placeholder anon key = not yet configured; skip auth, let install handle it
          if (msg.includes('401') || msg.includes('apikey') || msg.includes('REPLACE_WITH')) {
            setNuvioAccount({ authToken: '' });
            nextStep();
            return;
          }
          throw nuvioErr;
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
    'stremio-create': 'We will create a new Stremio account and install your addons automatically. You can log in later at [web.stremio.com](https://web.stremio.com).',
    'stremio-signin': 'We will sign into your existing Stremio account and install your addons. Make sure to use the same credentials you use on the Stremio app.',
    'nuvio-create':   'We will create a new Nuvio account. After setup, open the Nuvio app and sign in with these credentials to see your addons and collections.',
    'nuvio-signin':   'We will sign into your existing Nuvio account to sync your addons and collections.',
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

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {(['create', 'signin'] as const).map(m => (
          <button
            key={m}
            onClick={() => { updateAccount({ mode: m }); setError(''); }}
            style={{
              padding: '0.4rem 1.1rem', borderRadius: '999px', fontSize: '0.875rem',
              fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: account.mode === m ? 'var(--accent)' : 'var(--panel-2)',
              color: account.mode === m ? '#fff' : 'var(--muted)',
            }}
          >
            {m === 'create' ? 'Create new account' : 'Sign in'}
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
          <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>(min. 8 characters)</span>
        </span>
        <input
          type="password"
          value={account.password}
          onChange={e => { updateAccount({ password: e.target.value }); setError(''); }}
          placeholder="Enter your password..."
          style={inputStyle}
        />
      </label>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
          padding: '0.6rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.8125rem', color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={!canAttempt}
        style={{
          width: '100%', marginTop: '1.25rem', padding: '0.75rem 1.5rem',
          background: !canAttempt
            ? 'var(--border)'
            : 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
          color: !canAttempt ? 'var(--muted)' : '#fff',
          fontWeight: 600, fontSize: '0.95rem', borderRadius: '10px', border: 'none',
          cursor: !canAttempt ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          boxShadow: !canAttempt ? 'none' : '0 4px 14px rgba(109, 58, 242, 0.3)',
          transition: 'opacity 0.15s',
          opacity: !canAttempt ? 0.55 : 1,
        }}
      >
        {loading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
        {loading
          ? (account.mode === 'create' ? 'Creating account...' : 'Signing in...')
          : 'Continue'
        }
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </WizardShell>
  );
}

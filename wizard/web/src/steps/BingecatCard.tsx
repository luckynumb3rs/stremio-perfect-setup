import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Loader2, Unplug } from 'lucide-react';
import { bingecatRows, useWizard } from '../store/wizard';
import { isBingecatOn } from '../lib/constants';
import { bingecatRedirectUri, listenForBingecatCallback } from '../lib/bingecatAuth';

// @ts-ignore
import { createBingecatAdapter } from '@core/adapters/bingecat.js';
// @ts-ignore
import { mergeMapping, validateMapping } from '@core/bingecat-mapper.js';

/** Seconds of token life that must remain to start an install (the install itself takes a while). */
const MIN_TOKEN_LIFE = 600;

const REASON_LABEL: Record<string, string> = {
  linked: 'Linked',
  name: 'Same Name',
  'fresh-main': 'New Account',
  new: 'New',
  created: 'Created',
  manual: 'Chosen',
};

interface Issue { key: number | null; message: string }

/** Connection + mapping status, shared by the card and the Continue button of the Recommendations step. */
export function useBingecatStatus() {
  const s = useWizard();
  const rows = bingecatRows(s, isBingecatOn(s.wizardConfig));
  const { token, expiresAt, profiles, mapping } = s.bingecat;
  const expired = !!token && !!expiresAt && expiresAt - Math.floor(Date.now() / 1000) < MIN_TOKEN_LIFE;
  const connected = !!token && !expired;
  const check: { errors: Issue[]; warnings: Issue[] } = rows.length > 0 && connected
    ? validateMapping(rows, mapping, profiles, { kidsCreateSupported: false })
    : { errors: [], warnings: [] };
  const mapped = rows.every((r) => mapping.some((m) => m.key === r.key));
  const templatesLoaded = !!s.templates?.bingecat;
  return { rows, connected, expired, templatesLoaded, errors: check.errors, warnings: check.warnings, ready: rows.length === 0 || (templatesLoaded && connected && mapped && check.errors.length === 0) };
}

export function BingecatCard() {
  const target = useWizard((s) => s.target);
  const cfg = useWizard((s) => s.wizardConfig?.bingecat);
  const { token, accountName, profiles, mapping } = useWizard((s) => s.bingecat);
  const { setBingecat, disconnectBingecat } = useWizard.getState();
  const { rows, connected, expired, templatesLoaded, errors, warnings } = useBingecatStatus();
  const adapter = useMemo(() => (cfg ? createBingecatAdapter({ baseUrl: cfg.baseUrl, clientId: cfg.clientId }) : null), [cfg]);
  const pending = useRef<{ state: string; verifier: string; redirectUri: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'loading'>('idle');
  const [error, setError] = useState('');

  // The popup hands back code + state; only the state we started is accepted.
  useEffect(() => listenForBingecatCallback(async (message) => {
    const p = pending.current;
    if (!p || !adapter || message.state !== p.state) return;
    pending.current = null;
    if (message.error || !message.code) {
      setStatus('idle');
      setError('BingeCat access was not granted. Click Connect to try again.');
      return;
    }
    setStatus('loading');
    try {
      const session = await adapter.exchangeCode({ code: message.code, verifier: p.verifier, redirectUri: p.redirectUri });
      const loaded = await adapter.loadProfiles(session.token, { withNuvio: useWizard.getState().target === 'nuvio' });
      if (!loaded.some((x: { isMain: boolean }) => x.isMain)) {
        // every BingeCat account has a main profile; if it is missing the account setup on bingecat.com is not finished
        setError('This BingeCat account has no profile yet. Finish (or skip) the setup on bingecat.com, then click Connect again.');
        return;
      }
      useWizard.getState().setBingecat({
        token: session.token,
        expiresAt: session.expiresAt,
        accountName: loaded.find((x: { isMain: boolean }) => x.isMain)?.name ?? '',
        profiles: loaded,
        mapping: [],
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus('idle');
    }
  }), [adapter]);

  // Keep the mapping in step with the profiles that need BingeCat: new or changed rows are matched automatically,
  // rows that did not change keep their entry (manual picks, created ids).
  const sig = (list: { key: number; name: string; kids: boolean }[]) => list.map((r) => `${r.key}|${r.name}|${r.kids}`).join(';');
  const rowSig = sig(rows);
  useEffect(() => {
    if (!connected) return;
    if (sig(mapping) !== rowSig) setBingecat({ mapping: mergeMapping(rows, mapping, profiles) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, rowSig, profiles]);

  async function connect() {
    if (!adapter) return;
    setError('');
    // Open the window synchronously inside the click, otherwise popup blockers stop it.
    const popup = window.open('', 'bingecat-oauth', 'popup,width=520,height=760');
    if (!popup) {
      setError('Your browser blocked the BingeCat window. Allow pop-ups for this site and click Connect again.');
      return;
    }
    popup.opener = null; // the popup must not be able to reach this window
    try {
      const redirectUri = bingecatRedirectUri();
      const { url, state, verifier } = await adapter.buildAuthorizeUrl({ redirectUri });
      pending.current = { state, verifier, redirectUri };
      popup.location.href = url;
      setStatus('waiting');
    } catch (err) {
      popup.close();
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function cancel() {
    pending.current = null;
    setStatus('idle');
  }

  function pick(key: number, value: string) {
    setBingecat({ mapping: mapping.map((m) => (m.key === key ? { ...m, target: value === 'new' ? 'new' : Number(value), reason: 'manual' } : m)) });
  }

  const small: CSSProperties = { fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 };
  const button: CSSProperties = { padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' };
  const ghost: CSSProperties = { ...button, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' };

  // The card around this (title, description, toggle, Connected badge) lives in the Recommendations step.
  return (
    <div>
      {!connected && status === 'idle' && (
        <div style={{ textAlign: 'center' }}>
          {expired && <p style={{ ...small, margin: '0 0 0.6rem' }}>Your BingeCat connection is about to expire. Connect again.</p>}
          <div style={{ ...small, maxWidth: '34rem', margin: '0 auto 0.8rem' }}>
            <p style={{ margin: '0 0 0.3rem', fontWeight: 600, color: 'var(--text)' }}>When you click the button, a BingeCat window opens:</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', textAlign: 'left' }}>
              <li>If you already have a BingeCat account, sign in with it.</li>
              <li>If you don&apos;t, press <strong>Create a new account</strong> on the sign-in page. Another window opens: fill in your details and create the account, and it closes when you are done.</li>
              <li>Then sign in, skip BingeCat&apos;s own setup wizard, and authorize access for this wizard.</li>
            </ul>
          </div>
          <button type="button" style={button} onClick={connect}>Connect / Create BingeCat</button>
        </div>
      )}

      {status !== 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={small}>{status === 'waiting' ? 'Waiting for BingeCat… finish signing in and approve access in the BingeCat window.' : 'Connecting…'}</span>
          {status === 'waiting' && <button type="button" style={ghost} onClick={cancel}>Cancel</button>}
        </div>
      )}

      {error && <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: '#dc2626' }}>{error}</p>}
      {!templatesLoaded && <p style={{ margin: '0.6rem 0 0', fontSize: '0.8rem', color: '#dc2626' }}>The BingeCat templates could not be loaded. Reload the wizard and try again.</p>}

      {connected && status === 'idle' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={small}>{accountName ? `Account: ${accountName}` : 'BingeCat account connected'}</span>
            <button type="button" style={ghost} onClick={() => { disconnectBingecat(); setError(''); }}><Unplug size={13} style={{ verticalAlign: '-2px' }} /> Disconnect</button>
          </div>

          <p style={{ ...small, margin: '0.8rem 0 0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {target === 'nuvio' ? 'BingeCat Profile for Each Nuvio Profile' : 'BingeCat Profile'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {rows.map((row) => {
              const entry = mapping.find((m) => m.key === row.key);
              const own = [...errors.map((e) => ({ ...e, level: 'error' as const })), ...warnings.map((w) => ({ ...w, level: 'warn' as const }))].filter((i) => i.key === row.key);
              return (
                <div key={row.key} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.6rem 0.7rem', background: 'var(--panel)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{row.name}</strong>
                    {row.kids && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.05rem 0.4rem', borderRadius: '8px', background: 'var(--accent)', color: '#fff' }}>Kids</span>}
                    <span style={{ ...small, marginLeft: 'auto' }}>{REASON_LABEL[entry?.reason ?? 'new']}</span>
                  </div>
                  <select
                    aria-label={`BingeCat profile for ${row.name}`}
                    value={String(entry?.target ?? 'new')}
                    onChange={(e) => pick(row.key, e.target.value)}
                    style={{ marginTop: '0.4rem', width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'var(--panel)', color: 'var(--text)' }}
                  >
                    <option value="new">Create New BingeCat Profile</option>
                    {profiles.map((p: { id: number; name: string; isMain: boolean }) => (
                      <option key={p.id} value={String(p.id)}>{p.name}{p.isMain ? ' (main profile)' : ''}</option>
                    ))}
                  </select>
                  {own.map((i, idx) => (
                    <p key={idx} style={{ margin: '0.35rem 0 0', fontSize: '0.76rem', lineHeight: 1.45, color: i.level === 'error' ? '#dc2626' : '#b45309' }}>
                      {i.level === 'error' ? '✕ ' : '⚠ '}{i.message}
                    </p>
                  ))}
                </div>
              );
            })}
            {errors.filter((e) => e.key === null).map((e, i) => (
              <p key={i} style={{ margin: 0, fontSize: '0.78rem', color: '#dc2626' }}>✕ {e.message}</p>
            ))}
          </div>
          <p style={{ ...small, margin: '0.6rem 0 0' }}>
            The wizard only creates or updates BingeCat profiles. It never deletes anything on BingeCat.
          </p>
        </>
      )}
    </div>
  );
}

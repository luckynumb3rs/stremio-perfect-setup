import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { NotificationCards } from '../components/NotificationCards';
import { WizardShell } from '../components/WizardShell';
import { useWizard } from '../store/wizard';
import { getGuideUrl } from '../lib/site';
import { trackWizardCompletion } from '../lib/analytics';
import { wizardMetadata } from '../lib/integration';

function toConfigureUrl(manifestUrl: string) {
  const [baseUrl, search = ''] = manifestUrl.split('?');
  const configureBase = baseUrl.endsWith('/manifest.json')
    ? `${baseUrl.slice(0, -'/manifest.json'.length)}/configure`
    : `${baseUrl.replace(/\/$/, '')}/configure`;
  return search ? `${configureBase}?${search}` : configureBase;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export function DoneStep() {
  const {
    credentials,
    installResult,
    nuvioAccount,
    stremioAccount,
    target,
    wizardConfig,
  } = useWizard();
  const { aiostreams, aiometadata, addonPasswordSource, warnings, error } = installResult;
  const guideUrl = getGuideUrl();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const isUsingAccountPassword = addonPasswordSource === 'account';
  const accountMode = target === 'nuvio' ? nuvioAccount.mode : stremioAccount.mode;
  const addonDetailsFilename = wizardConfig?.addonDetailsFilename ?? '';
  const credentialsCardStyle = {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '1rem',
  } as const;
  const addonCardStyle = {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '0.9rem',
  } as const;
  const addonTitleStyle = {
    marginBottom: '0.5rem',
    fontSize: '0.95rem',
  } as const;
  const addonTitleRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    flexWrap: 'wrap',
  } as const;
  const metaTextStyle = {
    color: 'var(--muted)',
    margin: 0,
  } as const;
  const metaValueStyle = {
    color: 'var(--text)',
  } as const;
  const copyableValueRowStyle = {
    width: '100%',
    marginTop: '0.45rem',
    padding: '0.45rem 0.55rem',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--panel-2)',
    color: 'var(--accent)',
    cursor: 'pointer',
    font: 'inherit',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
  } as const;
  const copyActionButtonStyle = {
    border: '1px solid var(--border)',
    background: 'var(--panel)',
    color: 'var(--accent)',
    borderRadius: '6px',
    padding: '0.2rem 0.4rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem',
    cursor: 'pointer',
    font: 'inherit',
    lineHeight: 1,
    flex: '0 0 auto',
  } as const;

  const addons = useMemo(() => (
    [
      aiostreams
        ? {
            id: 'aiostreams',
            name: '📚 AIOStreams',
            uuid: aiostreams.uuid,
            password: aiostreams.password,
            manifestUrl: aiostreams.manifestUrl,
            configureUrl: toConfigureUrl(aiostreams.manifestUrl),
          }
        : null,
      aiometadata
        ? {
            id: 'aiometadata',
            name: '🔎 AIOMetadata',
            uuid: aiometadata.uuid,
            password: aiometadata.password,
            manifestUrl: aiometadata.manifestUrl,
            configureUrl: toConfigureUrl(aiometadata.manifestUrl),
          }
        : null,
    ].filter(Boolean)
  ), [aiostreams, aiometadata]) as Array<{
    id: string;
    name: string;
    uuid: string;
    password: string;
    manifestUrl: string;
    configureUrl: string;
  }>;

  async function handleCopy(copyKey: string, value: string) {
    try {
      await copyText(value);
      setCopiedKey(copyKey);
      window.setTimeout(() => setCopiedKey(current => current === copyKey ? null : current), 1800);
    } catch {
      setCopiedKey(null);
    }
  }

  function togglePasswordVisibility(addonId: string) {
    setVisiblePasswords(current => ({
      ...current,
      [addonId]: !current[addonId],
    }));
  }

  useEffect(() => {
    if (error || !target) return;

    const runId = addons.map(addon => addon.uuid).filter(Boolean).join(':') || `${target}-setup`;

    trackWizardCompletion({
      accountMode,
      addonCount: addons.length,
      debridServiceCount: credentials.debridServices.length,
      runId,
      target,
    });
  }, [accountMode, addons, credentials.debridServices.length, error, target]);

  function handleDownload() {
    if (!addonDetailsFilename) return;

    const lines = [
      wizardMetadata.addonDetailsTitle,
      '',
      ...addons.flatMap(addon => [
        `${addon.name}`,
        `UUID: ${addon.uuid}`,
        isUsingAccountPassword
          ? 'Password: same as your account password'
          : `Password: ${addon.password}`,
        `Manifest URL: ${addon.manifestUrl}`,
        `Configure URL: ${addon.configureUrl}`,
        '',
      ]),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = addonDetailsFilename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function renderCopyStatus(copyKey: string) {
    return copiedKey === copyKey ? <span>Copied</span> : <Copy size={12} />;
  }

  return (
    <WizardShell showBack={false}>
      {error ? (
        <>
          <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong 😕</h2>
          <p className="text-red-500 text-sm bg-red-50 rounded-lg p-3 mb-4">{error}</p>
          <p className="text-gray-500 text-sm">
            Check the error above and try again, or follow the{' '}
            <a href={guideUrl} target="_blank" rel="noopener noreferrer" className="guide-pill-link">
              manual guide
            </a>.
          </p>
        </>
      ) : (
        <>
          <div className="text-4xl mb-3 text-center">🎉</div>
          <h2 className="text-xl font-bold text-center mb-1">And now you're really done!</h2>
          <p className="text-gray-500 text-sm text-center mb-5">
            {target === 'stremio'
              ? 'Open Stremio and sign in. Your addons are installed and ready.'
              : 'Open Nuvio and sign in. Your addons and collections are ready.'}
          </p>

          {addons.length > 0 && (
            <>
              <div className="text-xs font-mono space-y-4" style={credentialsCardStyle}>
                <p
                  className="font-sans font-semibold text-sm mb-1"
                  style={{ color: 'var(--text)', marginTop: 0 }}
                >
                  📋 Your credentials (save these!)
                </p>
                <div
                  style={{
                    marginBottom: '0.85rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                    lineHeight: 1.55,
                    textAlign: 'center',
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  {isUsingAccountPassword
                    ? `These add-ons use your ${target === 'stremio' ? 'Stremio' : 'Nuvio'} account password. You can change each add-on password later from its configuration page if you want.`
                    : `Your ${target === 'stremio' ? 'Stremio' : 'Nuvio'} account password was not accepted by the add-on configurations, so a stronger shared add-on password was generated and used for all add-ons below.`}
                </div>
                {addons.map((addon) => (
                  <div key={addon.id} style={addonCardStyle}>
                    <div style={addonTitleStyle}>
                      <div style={addonTitleRowStyle}>
                        <span>{addon.name}</span>
                        <a
                          href={addon.configureUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="guide-pill-link"
                          aria-label={`Open ${addon.name} configuration`}
                        >
                          <span>Customize More</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                    <div style={copyableValueRowStyle}>
                      <span style={{ color: 'var(--muted)', flex: '0 0 auto' }}>UUID:</span>
                      <span
                        style={{
                          ...metaValueStyle,
                          flex: '1 1 auto',
                          minWidth: 0,
                          wordBreak: 'break-all',
                          textAlign: 'left',
                        }}
                      >
                        {addon.uuid}
                      </span>
                      <button
                        onClick={() => handleCopy(`${addon.id}-uuid`, addon.uuid)}
                        type="button"
                        aria-label={`Copy ${addon.name} UUID`}
                        style={copyActionButtonStyle}
                      >
                        {renderCopyStatus(`${addon.id}-uuid`)}
                      </button>
                    </div>
                    {!isUsingAccountPassword && (
                      <div style={copyableValueRowStyle}>
                        <span style={{ color: 'var(--muted)', flex: '0 0 auto' }}>Password:</span>
                        <span
                          style={{
                            ...metaValueStyle,
                            flex: '1 1 auto',
                            minWidth: 0,
                            wordBreak: 'break-all',
                            textAlign: 'left',
                          }}
                        >
                          {visiblePasswords[addon.id] ? addon.password : '•'.repeat(Math.max(addon.password.length, 8))}
                        </span>
                        <button
                          onClick={() => togglePasswordVisibility(addon.id)}
                          type="button"
                          aria-label={`${visiblePasswords[addon.id] ? 'Hide' : 'Show'} ${addon.name} password`}
                          style={copyActionButtonStyle}
                        >
                          {visiblePasswords[addon.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        <button
                          onClick={() => handleCopy(`${addon.id}-password`, addon.password)}
                          type="button"
                          aria-label={`Copy ${addon.name} password`}
                          style={copyActionButtonStyle}
                        >
                          {renderCopyStatus(`${addon.id}-password`)}
                        </button>
                      </div>
                    )}
                    <div style={copyableValueRowStyle}>
                      <span style={{ color: 'var(--muted)', flex: '0 0 auto' }}>Manifest:</span>
                      <span style={{ flex: '1 1 auto', minWidth: 0, wordBreak: 'break-all' }}>
                        {addon.manifestUrl}
                      </span>
                      <button
                        onClick={() => handleCopy(`${addon.id}-manifest`, addon.manifestUrl)}
                        type="button"
                        aria-label={`Copy ${addon.name} manifest URL`}
                        style={copyActionButtonStyle}
                      >
                        {renderCopyStatus(`${addon.id}-manifest`)}
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleDownload}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.45rem',
                    cursor: 'pointer',
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  <Download size={16} />
                  Download all add-on details
                </button>
              </div>
              <NotificationCards notifications={wizardConfig?.doneStepNotifications} target={target} />
            </>
          )}

          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 mb-4">
              <p className="font-semibold mb-1">A few warnings:</p>
              {warnings.map((w, i) => <p key={i}>• {w}</p>)}
            </div>
          )}

        </>
      )}
    </WizardShell>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { NotificationCards } from '../components/NotificationCards';
import { WizardShell } from '../components/WizardShell';
import { useWizard } from '../store/wizard';
import { getGuideUrl } from '../lib/site';
import { buildWizardCompletionPayload, trackWizardCompletion } from '../lib/analytics';
import { wizardMetadata } from '../lib/integration';
import { resolveLogoUrl } from '../lib/services';
// @ts-ignore
import { createStremioAdapter } from '@core/adapters/stremio.js';
// @ts-ignore
import { createAiometadataAdapter } from '@core/adapters/aiometadata.js';

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

function sanitizeFilenameSegment(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
}

export function DoneStep() {
  const {
    credentials,
    installResult,
    nuvioAccount,
    stremioAccount,
    target,
    templates,
    wizardConfig,
    aioStreamsInputs,
    catalogSelection,
    watchly,
  } = useWizard();
  const { aiostreams, aiometadata, addonPasswordSource, previousAddons, warnings: rawWarnings, error } = installResult;
  const warnings = rawWarnings.filter(w => !w.includes('tried but failed'));
  const guideUrl = getGuideUrl();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Trakt scrobbling (Stremio only)
  const [scrobbleStatus, setScrobbleStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [scrobbleError, setScrobbleError] = useState<string | null>(null);

  // AIOMetadata Trakt
  type MetaTraktStep = 'idle' | 'awaiting_token_id' | 'saving' | 'connected';
  const [metaTraktStep, setMetaTraktStep] = useState<MetaTraktStep>('idle');
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [metaTraktError, setMetaTraktError] = useState<string | null>(null);
  const isUsingAccountPassword = addonPasswordSource === 'account';
  const accountMode = target === 'nuvio' ? nuvioAccount.mode : stremioAccount.mode;
  const visiblePreviousAddons = accountMode === 'signin' ? previousAddons : [];
  const selectedNuvioProfileName = useMemo(() => {
    const selectedProfile = (nuvioAccount.profiles ?? [])
      .find((profile) => profile.profile_index === nuvioAccount.profileId);
    return selectedProfile?.name?.trim() || nuvioAccount.profileName?.trim() || '';
  }, [nuvioAccount.profileId, nuvioAccount.profileName, nuvioAccount.profiles]);
  const addonDetailsFilename = useMemo(() => {
    const prefix = wizardConfig?.addonDetailsFilenamePrefix?.trim() ?? '';
    if (!prefix || !target) return '';

    const providerLabel = target === 'stremio' ? 'Stremio' : 'Nuvio';
    const email = sanitizeFilenameSegment(
      (target === 'stremio' ? stremioAccount.email : nuvioAccount.email).trim(),
    );
    if (!email) return '';

    const parts = [
      prefix,
      `[${providerLabel}]`,
      `[${email}]`,
    ];

    if (target === 'nuvio') {
      const profileName = sanitizeFilenameSegment(selectedNuvioProfileName);
      if (profileName) {
        parts.push(`[${profileName}]`);
      }
    }

    return `${parts.join('')}.txt`;
  }, [nuvioAccount.email, selectedNuvioProfileName, stremioAccount.email, target, wizardConfig?.addonDetailsFilenamePrefix]);
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

  const watchlyEmail = target === 'stremio'
    ? stremioAccount.email
    : watchly.nuvioStremioLogin?.email ?? '';

  const addons = useMemo(() => (
    [
      installResult.watchly ? {
        id: 'watchly', name: '🤖 Watchly',
        uuid: watchlyEmail
          ? `${watchlyEmail} (${installResult.watchly.token})`
          : installResult.watchly.token,
        password: '',
        passwordLabel: 'same as your account password',
        manifestUrl: installResult.watchly.manifestUrl,
        configureUrl: toConfigureUrl(installResult.watchly.manifestUrl),
      } : null,
      aiometadata
        ? {
            id: 'aiometadata',
            name: '🔎 AIOMetadata',
            uuid: aiometadata.uuid,
            password: aiometadata.password,
            passwordLabel: isUsingAccountPassword ? 'same as your account password' : null,
            manifestUrl: aiometadata.manifestUrl,
            configureUrl: toConfigureUrl(aiometadata.manifestUrl),
          }
        : null,
      aiostreams
        ? {
            id: 'aiostreams',
            name: '📚 AIOStreams',
            uuid: aiostreams.uuid,
            password: aiostreams.password,
            passwordLabel: isUsingAccountPassword ? 'same as your account password' : null,
            manifestUrl: aiostreams.manifestUrl,
            configureUrl: toConfigureUrl(aiostreams.manifestUrl),
          }
        : null,
    ].filter(Boolean)
  ), [aiostreams, aiometadata, installResult.watchly, isUsingAccountPassword, watchlyEmail]) as Array<{
    id: string;
    name: string;
    uuid: string;
    password: string;
    passwordLabel: string | null;
    manifestUrl: string;
    configureUrl: string;
  }>;
  const hasDownloadableDetails = addons.length > 0 || visiblePreviousAddons.length > 0;

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

  async function handleScrobbleConnect() {
    setScrobbleStatus('connecting');
    setScrobbleError(null);
    try {
      const userId = stremioAccount.userId;
      const authKey = stremioAccount.authKey;
      if (!userId || !authKey) throw new Error('Stremio account details are not available. Please restart the wizard.');

      window.open(`https://www.strem.io/trakt/auth/${userId}`, '_blank');

      const stremio = createStremioAdapter();
      const deadline = Date.now() + 3 * 60 * 1000;
      await new Promise<void>((resolve, reject) => {
        const interval = window.setInterval(async () => {
          if (Date.now() > deadline) {
            clearInterval(interval);
            reject(new Error('Timed out waiting for Trakt authorization. Please try again.'));
            return;
          }
          try {
            const user = await stremio.getUser(authKey);
            if (user?.trakt) { clearInterval(interval); resolve(); }
          } catch { /* ignore individual poll errors */ }
        }, 3000);
      });
      setScrobbleStatus('connected');
    } catch (err: unknown) {
      setScrobbleStatus('error');
      setScrobbleError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleAiometadataTraktOpen() {
    if (!installResult.aiometadata?.instance) return;
    window.open(`${installResult.aiometadata.instance}/api/auth/trakt/authorize`, '_blank');
    setMetaTraktStep('awaiting_token_id');
    setMetaTraktError(null);
    setTokenIdInput('');
  }

  async function handleTokenIdSubmit() {
    const trimmed = tokenIdInput.trim();
    if (!trimmed) return;
    const meta = installResult.aiometadata;
    if (!meta?.instance || !meta.uuid || !meta.password) {
      setMetaTraktError('AIOMetadata result is incomplete. Cannot connect Trakt.');
      return;
    }
    setMetaTraktStep('saving');
    setMetaTraktError(null);
    try {
      const adapter = createAiometadataAdapter(meta.instance);
      await adapter.validateTokenId(trimmed);
      const updatedConfig = {
        ...(meta.config ?? {}),
        apiKeys: {
          ...((meta.config as { apiKeys?: Record<string, unknown> })?.apiKeys ?? {}),
          traktTokenId: trimmed,
        },
      };
      await adapter.updateConfig(updatedConfig, meta.password, meta.uuid);
      setMetaTraktStep('connected');
    } catch (err: unknown) {
      setMetaTraktStep('awaiting_token_id');
      setMetaTraktError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    if (error || !target) return;

    const runId = addons.map(addon => addon.uuid).filter(Boolean).join(':') || `${target}-setup`;
    const eventParams = buildWizardCompletionPayload({
      accountMode,
      addonCount: addons.length,
      target,
      credentials,
      aioStreamsInputs,
      catalogSelection,
      templates,
      wizardConfig,
    });

    trackWizardCompletion({
      accountMode,
      eventParams,
      runId,
      target,
    });
  }, [accountMode, addons, aioStreamsInputs, catalogSelection, credentials, error, target, templates, wizardConfig]);

  function handleDownload() {
    if (!addonDetailsFilename || !hasDownloadableDetails) return;

    const lines = [
      wizardMetadata.addonDetailsTitle,
      '',
      '----------------------------------------------',
      '',
      ...(addons.length > 0 ? [
        'Configured Addons',
        '',
        ...addons.flatMap(addon => [
          `${addon.name}`,
          `UUID: ${addon.uuid}`,
          ...(addon.passwordLabel || addon.password
            ? [
                addon.passwordLabel
                  ? `Password: ${addon.passwordLabel}`
                  : `Password: ${addon.password}`,
              ]
            : []),
          `Manifest URL: ${addon.manifestUrl}`,
          `Configure URL: ${addon.configureUrl}`,
          '',
        ]),
      ] : []),
      ...(visiblePreviousAddons.length > 0 ? [
        '----------------------------------------------',
        '',
        '🗄️ Previous Addons',
        '',
        ...visiblePreviousAddons.flatMap(addon => [
          `${addon.name}`,
          `Manifest URL: ${addon.manifestUrl}`,
          '',
        ]),
      ] : []),
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

  function renderDetailsCard() {
    if (!hasDownloadableDetails) return null;

    return (
      <div className="text-xs font-mono space-y-4" style={credentialsCardStyle}>
        <p
          className="font-sans font-semibold text-sm mb-1"
          style={{ color: 'var(--text)', marginTop: 0 }}
        >
          {addons.length > 0 ? '📋 Your credentials (save these!)' : '📋 Your addon backup'}
        </p>
        {addons.length > 0 && (
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
              ? `These addons use your ${target === 'stremio' ? 'Stremio' : 'Nuvio'} account password. You can change each addon password later from its configuration page if you want.`
              : `Your ${target === 'stremio' ? 'Stremio' : 'Nuvio'} account password was not accepted by the addon configurations, so a stronger shared addon password was generated and used for all addons below.`}
          </div>
        )}
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
            {(addon.passwordLabel || addon.password) && (
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
                  {addon.passwordLabel
                    ? addon.passwordLabel
                    : visiblePasswords[addon.id]
                    ? addon.password
                    : '•'.repeat(Math.max(addon.password.length, 8))}
                </span>
                {!addon.passwordLabel && (
                  <>
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
                  </>
                )}
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
        {visiblePreviousAddons.length > 0 && (
          <div style={{ ...addonCardStyle, fontFamily: 'system-ui, sans-serif' }}>
            <p
              style={{
                color: 'var(--text)',
                fontSize: '0.9rem',
                fontWeight: 600,
                marginTop: 0,
                marginBottom: '0.4rem',
              }}
            >
              🗄️ Previous Addons (Backup)
            </p>
            <p style={{ ...metaTextStyle, marginBottom: '0.75rem', fontSize: '0.82rem', lineHeight: 1.5, textAlign: 'center' }}>
              These are the addons that were on your account before the wizard replaced them. Keep this list in case you want to restore anything manually.
            </p>
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {visiblePreviousAddons.map((addon, index) => (
                <div
                  key={`${addon.manifestUrl}-${index}`}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    background: 'var(--panel)',
                  }}
                >
                  <p style={{ color: 'var(--text)', fontSize: '0.86rem', fontWeight: 600, marginTop: 0, marginBottom: '0.45rem' }}>
                    {addon.name}
                  </p>
                  <div style={copyableValueRowStyle}>
                    <span style={{ color: 'var(--muted)', flex: '0 0 auto' }}>Manifest:</span>
                    <span style={{ flex: '1 1 auto', minWidth: 0, wordBreak: 'break-all' }}>
                      {addon.manifestUrl}
                    </span>
                    <a
                      href={addon.manifestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${addon.name} manifest URL`}
                      style={copyActionButtonStyle}
                    >
                      <ExternalLink size={12} />
                    </a>
                    <button
                      onClick={() => handleCopy(`previous-addon-${index}`, addon.manifestUrl)}
                      type="button"
                      aria-label={`Copy ${addon.name} manifest URL`}
                      style={copyActionButtonStyle}
                    >
                      {renderCopyStatus(`previous-addon-${index}`)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
          Download all addon details
        </button>
      </div>
    );
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
          {visiblePreviousAddons.length > 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              {renderDetailsCard()}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-4xl mb-3 text-center">🎉</div>
          <h2 className="text-xl font-bold text-center mb-1">And now you're really done!</h2>
          <p className="page-description" style={{ marginBottom: '2rem' }}>
            {target === 'stremio'
              ? 'Open Stremio and sign in. Your account is ready and you can start watching. Check further down below to optionally integrate Trakt.'
              : 'Open Nuvio and sign in. Your account is ready and you can start watching. Check further down below to optionally integrate Trakt.'}
          </p>

          {hasDownloadableDetails && (
            <>
              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 mb-4">
                  <p className="font-semibold mb-1">A few warnings:</p>
                  {warnings.map((w, i) => <p key={i}>• {w}</p>)}
                </div>
              )}
              {renderDetailsCard()}
              {/* Trakt integration card */}
              {((target === 'stremio' || target === 'nuvio') || !!aiometadata) && (() => {
                const traktLogo = resolveLogoUrl('services/trakt.png');
                const stremioLogo = resolveLogoUrl('services/stremio.svg');
                const nuvioLogo = resolveLogoUrl('services/nuvio.png');
                const traktCardCount = Number(target === 'stremio' || target === 'nuvio') + Number(!!aiometadata);
                const cardStyle = {
                  padding: '0.9rem', borderRadius: '10px', textAlign: 'center' as const,
                  border: '1px solid rgba(255,230,236,0.2)', transition: 'border-color 0.15s',
                  display: 'flex', flexDirection: 'column' as const, justifyContent: 'center',
                };
                const connectedBadge = (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(167,243,208,1)', background: 'rgba(167,243,208,0.12)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                    <Check size={11} /> Connected
                  </span>
                );
                return (
                  <div
                    style={{
                      background: 'rgba(95, 24, 43, 0.68)',
                      border: '1px solid rgba(255, 230, 236, 0.2)',
                      borderRadius: '12px',
                      padding: '0.95rem 1rem',
                      marginBottom: '1rem',
                      color: 'rgba(255, 255, 255, 0.96)',
                      boxShadow: '0 10px 24px rgba(57, 7, 21, 0.22)',
                      textAlign: 'center',
                    }}
                  >
                    <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.3rem', marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      {traktLogo ? <img src={traktLogo} alt="Trakt" style={{ height: '18px', objectFit: 'contain' }} /> : null}
                      Trakt Integration
                    </p>
                    <p style={{ fontSize: '0.8rem', marginTop: 0, marginBottom: '0.85rem', opacity: 0.8, lineHeight: 1.5 }}>
                      Trakt is optional, but recommended. You can connect it directly to avoid manual configuration later.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: traktCardCount > 1 ? '1fr 1fr' : '1fr', gap: '0.6rem' }}>

                      {/* Scrobbling card */}
                      {(target === 'stremio' || target === 'nuvio') && (
                        <div style={{ ...cardStyle, background: scrobbleStatus === 'connected' ? 'rgba(167,243,208,0.08)' : 'rgba(255,255,255,0.05)', borderColor: scrobbleStatus === 'connected' ? 'rgba(167,243,208,0.4)' : 'rgba(255,230,236,0.2)' }}>
                          {(target === 'stremio' ? stremioLogo : nuvioLogo) && (
                            <img
                              src={target === 'stremio' ? stremioLogo : nuvioLogo}
                              alt={target === 'stremio' ? 'Stremio' : 'Nuvio'}
                              style={{ height: '22px', objectFit: 'contain', marginBottom: '0.5rem', display: 'block', margin: '0 auto 0.5rem' }}
                            />
                          )}
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            Scrobbling
                            {scrobbleStatus === 'connected' && connectedBadge}
                          </div>
                          <p style={{ fontSize: '0.75rem', opacity: 0.8, lineHeight: 1.45, margin: '0 0 0.6rem' }}>
                            {target === 'stremio'
                              ? 'Automatically log what you watch in Stremio to your Trakt history.'
                              : 'You need to go to Nuvio app settings to integrate Trakt.'}
                          </p>
                          {target === 'stremio' && scrobbleStatus !== 'connected' && (
                            <>
                              <button
                                type="button"
                                onClick={handleScrobbleConnect}
                                disabled={scrobbleStatus === 'connecting'}
                                style={{
                                  padding: '0.4rem 0.7rem', borderRadius: '7px',
                                  border: '1px solid rgba(255,230,236,0.35)',
                                  background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.95)',
                                  fontSize: '0.8rem', fontWeight: 600, cursor: scrobbleStatus === 'connecting' ? 'default' : 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                                  width: 'fit-content', margin: '0 auto',
                                }}
                              >
                                {scrobbleStatus === 'connecting'
                                  ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Connecting…</>
                                  : 'Connect'}
                              </button>
                              {scrobbleError && (
                                <p style={{ fontSize: '0.75rem', color: 'rgba(252,165,165,1)', marginTop: '0.35rem', marginBottom: 0 }}>
                                  {scrobbleError}
                                </p>
                              )}
                            </>
                          )}
                          {target === 'nuvio' && (
                            <button
                              type="button"
                              disabled
                              style={{
                                padding: '0.4rem 0.7rem', borderRadius: '7px',
                                border: '1px solid rgba(255,230,236,0.2)',
                                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
                                fontSize: '0.8rem', fontWeight: 600, cursor: 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 'fit-content', margin: '0 auto', opacity: 0.75,
                              }}
                            >
                              Connect
                            </button>
                          )}
                        </div>
                      )}

                      {/* AIOMetadata Trakt card */}
                      {!!aiometadata && (
                        <div style={{ ...cardStyle, background: metaTraktStep === 'connected' ? 'rgba(167,243,208,0.08)' : 'rgba(255,255,255,0.05)', borderColor: metaTraktStep === 'connected' ? 'rgba(167,243,208,0.4)' : 'rgba(255,230,236,0.2)' }}>
                          <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem', lineHeight: 1 }}>🔎</div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            AIOMetadata
                            {metaTraktStep === 'connected' && connectedBadge}
                          </div>
                          <p style={{ fontSize: '0.75rem', opacity: 0.8, lineHeight: 1.45, margin: '0 0 0.6rem' }}>
                            Enable AIOMetadata to access personal or public Trakt catalogs.
                          </p>
                          {metaTraktStep === 'connected' ? null : metaTraktStep === 'idle' ? (
                            <button
                              type="button"
                              onClick={handleAiometadataTraktOpen}
                              style={{
                                padding: '0.4rem 0.7rem', borderRadius: '7px',
                                border: '1px solid rgba(255,230,236,0.35)',
                                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.95)',
                                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 'fit-content', margin: '0 auto',
                              }}
                            >
                              Connect
                            </button>
                          ) : (
                            <>
                              <p style={{ fontSize: '0.75rem', opacity: 0.85, lineHeight: 1.4, margin: '0 0 0.45rem' }}>
                                Authorize in the Trakt tab that opened, then copy the <strong>Token ID</strong> shown on that page and paste it here.
                              </p>
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <input
                                  type="text"
                                  value={tokenIdInput}
                                  onChange={e => setTokenIdInput(e.target.value)}
                                  placeholder="Paste Token ID"
                                  style={{
                                    flex: 1, padding: '0.35rem 0.5rem', borderRadius: '6px',
                                    border: '1px solid rgba(255,230,236,0.35)',
                                    background: 'rgba(255,255,255,0.12)', color: '#fff',
                                    fontSize: '0.78rem', outline: 'none', minWidth: 0,
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={handleTokenIdSubmit}
                                  disabled={!tokenIdInput.trim() || metaTraktStep === 'saving'}
                                  style={{
                                    padding: '0.35rem 0.6rem', borderRadius: '6px',
                                    border: '1px solid rgba(255,230,236,0.35)',
                                    background: 'rgba(255,255,255,0.15)', color: '#fff',
                                    fontSize: '0.78rem', fontWeight: 600, flexShrink: 0,
                                    cursor: !tokenIdInput.trim() || metaTraktStep === 'saving' ? 'default' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                                  }}
                                >
                                  {metaTraktStep === 'saving'
                                    ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                                    : 'Confirm'}
                                </button>
                              </div>
                              {metaTraktError && (
                                <p style={{ fontSize: '0.75rem', color: 'rgba(252,165,165,1)', marginTop: '0.3rem', marginBottom: 0 }}>
                                  {metaTraktError}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              <NotificationCards notifications={wizardConfig?.doneStepNotifications} target={target} />
            </>
          )}

        </>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </WizardShell>
  );
}

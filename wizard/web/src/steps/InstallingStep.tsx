import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { useWizard } from '../store/wizard';
import { resolveSharedKeySelection, hasConfiguredKeyArray } from '../lib/sharedKeys';

// @ts-ignore
import { runStremioSetup, runNuvioSetup } from '@core/orchestrator.js';

interface LogEntry {
  id: number;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

const STEP_LABELS: Record<string, string> = {
  account:     'Account ready',
  profile:     'Profile loaded',
  aiostreams:  'AIOStreams configuration saved',
  aiometadata: 'AIOMetadata configuration saved',
  addons:      'Add-ons installed',
  collections: 'Collections installed',
  settings:    'Settings updated',
  install:     'Add-ons applied to your account',
};

export function InstallingStep() {
  const wizard = useWizard();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const ran = useRef(false);
  let nextId = useRef(0);

  const push = (message: string, type: LogEntry['type'] = 'info') =>
    setLog(l => [...l, { id: nextId.current++, type, message }]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    try {
      const {
        target, stremioAccount, nuvioAccount, credentials, aioStreamsInputs,
        catalogSelection, templates, wizardConfig,
      } = wizard;

      if (!templates) {
        throw new Error('Template data has not finished loading yet. Please go back to the previous step and wait a moment before trying again.');
      }
      if (!wizardConfig) {
        throw new Error(`No active config.json block is available for the selected target "${target ?? 'unknown'}".`);
      }

      const userTmdbApiKey = credentials.tmdbApiKey.trim();
      const userTmdbAccessToken = credentials.tmdbAccessToken.trim();
      const hasAnyUserTmdbInput = userTmdbApiKey.length > 0 || userTmdbAccessToken.length > 0;
      const hasCompleteUserTmdbInput = userTmdbApiKey.length > 0 && userTmdbAccessToken.length > 0;

      if (hasAnyUserTmdbInput && !hasCompleteUserTmdbInput) {
        throw new Error('TMDB requires both the API Key and the Read Access Token when you provide your own credentials.');
      }

      const requestedSharedKeyIds = [
        !hasCompleteUserTmdbInput ? 'tmdbApiKeys' : null,
        !hasCompleteUserTmdbInput ? 'tmdbReadAccessTokens' : null,
        !credentials.tvdbApiKey.trim() ? 'tvdbApiKeys' : null,
        !credentials.geminiApiKey.trim() && hasConfiguredKeyArray(wizardConfig, 'geminiApiKeys') ? 'geminiApiKeys' : null,
        !credentials.rpdbApiKey.trim() && hasConfiguredKeyArray(wizardConfig, 'rpdbApiKeys') ? 'rpdbApiKeys' : null,
      ].filter((keyId): keyId is 'tmdbApiKeys' | 'tmdbReadAccessTokens' | 'tvdbApiKeys' | 'geminiApiKeys' | 'rpdbApiKeys' => Boolean(keyId));

      const sharedKeys = requestedSharedKeyIds.length
        ? await resolveSharedKeySelection(wizardConfig, requestedSharedKeyIds)
        : { tmdbApiKey: '', tmdbAccessToken: '', tvdbApiKey: '', geminiApiKey: '', rpdbApiKey: '' };

      const effectiveCredentials = {
        tmdbApiKey: hasCompleteUserTmdbInput ? userTmdbApiKey : sharedKeys.tmdbApiKey,
        tmdbAccessToken: hasCompleteUserTmdbInput ? userTmdbAccessToken : sharedKeys.tmdbAccessToken,
        tvdbApiKey: credentials.tvdbApiKey.trim() || sharedKeys.tvdbApiKey,
        geminiApiKey: credentials.geminiApiKey.trim() || sharedKeys.geminiApiKey,
        rpdbApiKey: credentials.rpdbApiKey.trim() || sharedKeys.rpdbApiKey,
      };

      if (!effectiveCredentials.tmdbApiKey || !effectiveCredentials.tmdbAccessToken) {
        throw new Error('TMDB keys are required. Enter your own keys or add shared TMDB keys to config.json.');
      }

      if (!effectiveCredentials.tvdbApiKey) {
        throw new Error('A TVDB API key is required. Enter your own key or add a shared TVDB key to config.json.');
      }

      const effectiveInstances = wizardConfig.instances;
      const proxyBase = wizardConfig.proxyBase ?? '';

      push('Building your personalised AIOStreams configuration…');

      const aiostreamsParams = {
        template: templates.aiostreams,
        inputs: aioStreamsInputs,
        services: credentials.debridServices.map((d: { id: string }) => d.id),
        credentials: {
          tmdbApiKey: effectiveCredentials.tmdbApiKey,
          tmdbAccessToken: effectiveCredentials.tmdbAccessToken,
          tvdbApiKey: effectiveCredentials.tvdbApiKey,
          geminiApiKey: effectiveCredentials.geminiApiKey,
          rpdbApiKey: effectiveCredentials.rpdbApiKey,
        },
        serviceCredentials: Object.fromEntries(
          credentials.debridServices.map((d: { id: string; apiKey: string }) => [d.id, { apiKey: d.apiKey }])
        ),
      };

      push('Loading the AIOMetadata template for your setup…');
      const aiometadataBaseTemplate = templates.aiometadata as Record<string, unknown>;

      const aiometadataParams = {
        baseTemplate: aiometadataBaseTemplate,
        enabledCategories: catalogSelection.enabledCategories,
        enabledDiscoverFolderIds: catalogSelection.enabledDiscoverFolderIds,
        apiKeys: {
          tmdb:       effectiveCredentials.tmdbApiKey,
          tmdbAccess: effectiveCredentials.tmdbAccessToken,
          tvdb:       effectiveCredentials.tvdbApiKey,
          gemini:     effectiveCredentials.geminiApiKey,
          rpdb:       effectiveCredentials.rpdbApiKey,
        },
        language: (aiometadataBaseTemplate as { config?: { language?: string } }).config?.language ?? 'en-US',
      };

      const onStep = (name: string, data: unknown) => {
        const label = STEP_LABELS[name];
        if (!label) return;

        // Produce friendly supplementary details for key steps
        let detail = '';
        if (name === 'account') {
          const d = data as { created?: boolean; email?: string };
          detail = d?.created
            ? `New account created for ${d.email ?? ''}.`
            : `Signed in as ${d.email ?? ''}.`;
        } else if (name === 'profile') {
          const d = data as { profileIndex?: number; profileName?: string };
          detail = d?.profileName
            ? `${d.profileName} (Profile ${d.profileIndex ?? ''}).`
            : `Profile ${d?.profileIndex ?? ''}.`;
        } else if (name === 'aiostreams') {
          const d = data as { instance?: string };
          detail = `Saved on ${d?.instance ?? ''}.`;
        } else if (name === 'aiometadata') {
          const d = data as { instance?: string };
          detail = `Saved on ${d?.instance ?? ''}.`;
        } else if (name === 'install') {
          const d = data as { count?: number };
          detail = `${d?.count ?? 0} add-on${(d?.count ?? 0) !== 1 ? 's' : ''} in your collection.`;
        } else if (name === 'addons') {
          const d = data as { count?: number; profileName?: string; profileIndex?: number };
          const profileLabel = d?.profileName
            ? ` for ${d.profileName} (Profile ${d.profileIndex ?? ''})`
            : '';
          detail = `${d?.count ?? 0} add-on${(d?.count ?? 0) !== 1 ? 's' : ''} pushed to your Nuvio account${profileLabel}.`;
        } else if (name === 'collections') {
          const d = data as { groupCount?: number };
          detail = `${d?.groupCount ?? 0} collection group${(d?.groupCount ?? 0) !== 1 ? 's' : ''} configured.`;
        } else if (name === 'settings') {
          const d = data as { appliedPlatforms?: string[]; skippedPlatforms?: string[] };
          const applied = Array.isArray(d?.appliedPlatforms) ? d.appliedPlatforms.join(', ') : '';
          const skipped = Array.isArray(d?.skippedPlatforms) && d.skippedPlatforms.length
            ? ` Skipped: ${d.skippedPlatforms.join(', ')}.`
            : '';
          detail = applied ? `Applied to ${applied}.${skipped}` : skipped.trim();
        }

        push(`${label}${detail ? ': ' + detail : ''}`, 'success');
      };

      type SetupResult = {
        addons: {
          aiostreams?: { manifestUrl?: string; uuid?: string; password?: string };
          aiometadata?: { manifestUrl?: string; uuid?: string; password?: string };
        };
        addonPasswordSource?: 'account' | 'generated';
        warnings: string[];
      };

      let result: SetupResult;

      const account = target === 'stremio' ? stremioAccount : nuvioAccount;
      const setupFn = target === 'stremio' ? runStremioSetup : runNuvioSetup;
      const extraParams = target === 'nuvio'
        ? {
            collectionsJson: templates.nuvioCollections as object[],
            nuvioSettingsTemplate: templates.nuvioSettings as Record<string, unknown>,
          }
        : {};

      push(`Connecting to your ${target === 'stremio' ? 'Stremio' : 'Nuvio'} account…`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (setupFn as any)({
        instances: effectiveInstances,
        account,
        aiostreamsParams,
        aiometadataParams,
        proxyBase,
        onStep,
        ...extraParams,
      });

      // Surface non-fatal warnings
      if (result.warnings?.length) {
        for (const w of result.warnings) {
          push(`Note: ${w}`, 'warning');
        }
      }

      const aios = result.addons.aiostreams;
      const meta = result.addons.aiometadata;
      wizard.setInstallResult({
        aiostreams:  aios ? { manifestUrl: aios.manifestUrl ?? '', uuid: aios.uuid ?? '', password: aios.password ?? '' } : null,
        aiometadata: meta ? { manifestUrl: meta.manifestUrl ?? '', uuid: meta.uuid ?? '', password: meta.password ?? '' } : null,
        addonPasswordSource: result.addonPasswordSource ?? 'account',
        warnings: result.warnings,
        error: null,
      });

      push('Everything is set up and ready to go!', 'success');
      setDone(true);
      setTimeout(() => wizard.nextStep(), 1200);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      wizard.setInstallResult({ error: msg });
      setFatal(msg);
      push('Setup could not be completed. See the error below.', 'error');
    }
  }

  const iconFor = (type: LogEntry['type']) => {
    if (type === 'success')  return '✓';
    if (type === 'warning')  return '⚠';
    if (type === 'error')    return '✕';
    return '·';
  };
  const colorFor = (type: LogEntry['type']) => {
    if (type === 'success')  return 'var(--accent)';
    if (type === 'warning')  return '#d97706';
    if (type === 'error')    return '#dc2626';
    return 'var(--muted)';
  };

  return (
    <WizardShell showBack={false}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>
          {done ? 'All done! 🎉' : fatal ? 'Setup failed' : 'Setting everything up…'}
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.55 }}>
          {done
            ? 'Your streaming setup has been configured and installed. Tap Continue below to see your results.'
            : fatal
            ? 'An error occurred during setup. The details are shown below.'
            : 'Please keep this window open, the wizard is creating your configurations and installing them.'}
        </p>
      </div>

      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '1rem',
          minHeight: '160px',
          maxHeight: '320px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {log.map((entry) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: colorFor(entry.type), flexShrink: 0, marginTop: '1px' }}>
              {iconFor(entry.type)}
            </span>
            <span style={{ fontSize: '0.85rem', color: entry.type === 'error' ? colorFor('error') : 'var(--text)', lineHeight: 1.55 }}>
              {entry.message}
            </span>
          </motion.div>
        ))}

        {!done && !fatal && (
          <motion.div
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 500, marginTop: '0.25rem' }}
          >
            Working…
          </motion.div>
        )}
      </div>

      {fatal && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.9rem 1rem',
            background: 'rgba(220,38,38,0.07)',
            border: '1px solid rgba(220,38,38,0.25)',
            borderRadius: '8px',
          }}
        >
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.4rem' }}>Error details</p>
          <pre style={{
            fontSize: '0.78rem',
            color: '#b91c1c',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.6,
            margin: 0,
            fontFamily: 'inherit',
          }}>
            {fatal}
          </pre>
          <button
            onClick={() => {
              ran.current = false;
              setLog([]);
              setFatal(null);
              setDone(false);
              wizard.setInstallResult({ error: null });
              ran.current = false;
              // Small delay to allow state to settle before re-running
              setTimeout(() => {
                ran.current = false;
                run();
              }, 100);
            }}
            style={{
              marginTop: '0.75rem',
              padding: '0.4rem 0.9rem',
              borderRadius: '6px',
              border: '1px solid rgba(220,38,38,0.4)',
              background: 'rgba(220,38,38,0.1)',
              color: '#b91c1c',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <RotateCcw size={14} />
            Try again
          </button>
        </div>
      )}
    </WizardShell>
  );
}

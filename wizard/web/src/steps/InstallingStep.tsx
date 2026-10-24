import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { bingecatRows, rolesOf, useWizard } from '../store/wizard';
import { isBingecatOn } from '../lib/constants';
import { resolveSharedKeySelection, hasConfiguredKeyArray } from '../lib/sharedKeys';

// @ts-ignore
import { runStremioSetup, runNuvioSetup } from '@core/orchestrator.js';
// @ts-ignore
import { buildWatchlyBody } from '@core/adapters/watchly.js';
// @ts-ignore
import { createBingecatAdapter } from '@core/adapters/bingecat.js';
import { buildInstantDebridSettingsPatch } from '../lib/instantDebrid';

interface LogEntry {
  id: number;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) &&
        result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const STEP_LABELS: Record<string, string> = {
  account:     'Account ready',
  backup:      'Existing addons backed up',
  profile:     'Profile loaded',
  profile_failed: 'Profile could not be set up',
  aiostreams:  'AIOStreams configuration saved',
  aiometadata: 'AIOMetadata configuration saved',
  watchly:     'Watchly configuration saved',
  bingecat:    'BingeCat profile configured',
  addons:      'Addons installed',
  collections: 'Collections installed',
  settings:    'Settings updated',
  install:     'Addons applied to your account',
};

export function InstallingStep() {
  const wizard = useWizard();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  // Nuvio: profiles that failed while others finished. The run result is kept so Retry only redoes the failed ones.
  const [partial, setPartial] = useState<{ failed: { profileIndex: number; name: string; error: string }[]; doneCount: number } | null>(null);
  const lastSummary = useRef<unknown>(null);
  const shownWarnings = useRef(0);
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

  // A fresh Install mount (e.g. the user went back and ran the wizard again) starts without the in-memory run result.
  // Carry over the first backups of the earlier run, so a profile that was already replaced (or half-written) is not
  // backed up again from its new content. Everything else is redone; the profiles are only used as backup holders.
  function carriedBackups() {
    const earlier = useWizard.getState().installResult.profiles.filter((p) => p.backupTaken);
    return earlier.length ? { profiles: earlier.map((p) => ({ ...p, status: 'failed' })) } : null;
  }

  async function run() {
    wizard.setInstallRunning(true);
    const stepAtStart = useWizard.getState().step;
    try {
      const {
        target, stremioAccount, nuvioAccount, credentials, aioStreamsInputs,
        catalogSelection, templates, wizardConfig, watchly, instantDebrid, nuvioProfiles,
      } = wizard;

      if (!templates) {
        throw new Error('Template data has not finished loading yet. Please go back to the previous step and wait a moment before trying again.');
      }
      if (!wizardConfig) {
        throw new Error(`No active config.json block is available for the selected target "${target ?? 'unknown'}".`);
      }

      if (target === 'nuvio' && (nuvioProfiles.length === 0 || nuvioProfiles.some((t) => t.nuvioProfileId === 'new'))) {
        throw new Error('No Nuvio profile is ready to set up. Go back to the Account step and select or create at least one profile.');
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

      const useInstantDebrid = target === 'nuvio' && instantDebrid;
      const aiostreamsParams = {
        template: templates.aiostreams,
        inputs: aioStreamsInputs,
        services: useInstantDebrid ? [] : credentials.debridServices.map((d: { id: string }) => d.id),
        credentials: {
          tmdbApiKey: effectiveCredentials.tmdbApiKey,
          tmdbAccessToken: effectiveCredentials.tmdbAccessToken,
          tvdbApiKey: effectiveCredentials.tvdbApiKey,
          geminiApiKey: effectiveCredentials.geminiApiKey,
          rpdbApiKey: effectiveCredentials.rpdbApiKey,
        },
        serviceCredentials: useInstantDebrid ? {} : Object.fromEntries(
          credentials.debridServices.map((service) => [
            service.id,
            Object.fromEntries(
              Object.entries(service.credentials).filter(([, value]) => String(value ?? '').trim().length > 0)
            ),
          ])
        ),
      };

      push('Loading the AIOMetadata template for your setup…');
      const aiometadataBaseTemplate = templates.aiometadata as Record<string, unknown>;

      const aiometadataParams = {
        baseTemplate: aiometadataBaseTemplate,
        enabledCategories: catalogSelection.enabledCategories,
        enabledDiscoverFolderIds: catalogSelection.enabledDiscoverFolderIds,
        categoryOrder: catalogSelection.categoryOrder,
        discoverFolderOrder: catalogSelection.discoverFolderOrder,
        collections: (templates.collections ?? []) as object[],
        categoryExceptions: wizardConfig.catalogSelectionExceptions ?? [],
        apiKeys: {
          tmdb:       effectiveCredentials.tmdbApiKey,
          tmdbAccess: effectiveCredentials.tmdbAccessToken,
          tvdb:       effectiveCredentials.tvdbApiKey,
          gemini:     effectiveCredentials.geminiApiKey,
          rpdb:       effectiveCredentials.rpdbApiKey,
        },
        language: (aiometadataBaseTemplate as { config?: { language?: string } }).config?.language ?? 'en-US',
      };

      // Assemble Watchly body if enabled and instances are configured
      const effectiveWatchlyInstances = effectiveInstances.watchly ?? [];
      // Read fresh (not from the render snapshot): a Retry must see the BingeCat profiles created by the previous attempt.
      const live = useWizard.getState();
      const featureOn = isBingecatOn(wizardConfig);
      const { hasStandard, hasKids } = rolesOf({ target, nuvioProfiles: live.nuvioProfiles, stremioKids: live.stremioKids });
      const watchlyEnabled = watchly.enabled && effectiveWatchlyInstances.length > 0 && hasStandard;

      // BingeCat: Kids profiles always, Standard profiles when the user turned it on.
      const bcRows = bingecatRows(live, featureOn);
      let bingecatParam: Record<string, unknown> | null = null;
      if (bcRows.length > 0) {
        const bc = live.bingecat;
        const config = wizardConfig.bingecat;
        const main = bc.profiles.find((p) => p.isMain);
        if (!config || !templates.bingecat) {
          throw new Error('The BingeCat templates did not load. Reload the wizard and try again.');
        }
        if (!bc.token || !bc.expiresAt || bc.expiresAt - Math.floor(Date.now() / 1000) < 300) {
          throw new Error('The BingeCat connection expired. Go back to the Recommendations step and connect BingeCat again.');
        }
        if (!main) throw new Error('Could not find your BingeCat main profile. Disconnect and connect BingeCat again.');
        const targets: Record<number, number | 'new'> = {};
        for (const row of bcRows) {
          const entry = bc.mapping.find((m) => m.key === row.key);
          if (!entry) throw new Error(`Choose a BingeCat profile for ${row.name} on the Recommendations step.`);
          targets[row.key] = entry.target;
        }
        bingecatParam = {
          adapter: createBingecatAdapter({ baseUrl: config.baseUrl, clientId: config.clientId }),
          token: bc.token,
          mainProfileId: main.id,
          templates: templates.bingecat,
          targets,
          // lets the orchestrator recognise a profile created by a lost response, and remember which rows were created earlier
          known: new Set(bc.profiles.map((p) => p.id)),
          createdKeys: new Set(bc.mapping.filter((m) => m.reason === 'created').map((m) => m.key)),
          // profiles that are already Kids ones; every other profile of a Kids row is switched before its settings are written
          kidsProfileIds: new Set(bc.profiles.filter((p) => p.type === 'kids').map((p) => p.id)),
        };
      }

      let watchlyBody: Record<string, unknown> | null = null;
      // Nuvio: the orchestrator builds one Watchly body per profile from these.
      let nuvioWatchly: Record<string, unknown> | null = null;
      if (watchlyEnabled) {
        const watchlyDefaults = (templates.watchly ?? {}) as Record<string, unknown>;
        if (target === 'stremio') {
          if (!stremioAccount.authKey) {
            throw new Error('Watchly is enabled but no Stremio identity is available. Go back to the Account step and sign in again.');
          }
          watchlyBody = buildWatchlyBody(watchlyDefaults, {
            target: 'stremio',
            stremioAuthKey: stremioAccount.authKey,
            tmdbApiKey: effectiveCredentials.tmdbApiKey,
            geminiApiKey: effectiveCredentials.geminiApiKey,
            rpdbApiKey: effectiveCredentials.rpdbApiKey,
          });
        } else {
          nuvioWatchly = {
            defaults: watchlyDefaults,
            tmdbApiKey: effectiveCredentials.tmdbApiKey,
            geminiApiKey: effectiveCredentials.geminiApiKey,
            rpdbApiKey: effectiveCredentials.rpdbApiKey,
          };
        }
      }

      const onStep = (name: string, data: unknown) => {
        if (name === 'bingecat_profile') {
          // Remember the new BingeCat profile right away, so a Retry reuses it instead of creating another one.
          const d = data as { key: number; profileId: number; name: string; kids: boolean; type?: string };
          useWizard.getState().bingecatProfileCreated(d.key, { id: d.profileId, name: d.name, kids: !!d.kids, type: d.type });
          return;
        }
        if (name === 'bingecat_profile_type') {
          // A profile was switched to Kids: remember it, so a Retry does not switch it again and Standard rows can't take it over.
          const d = data as { profileId: number; type: string };
          const bingecat = useWizard.getState().bingecat;
          useWizard.getState().setBingecat({ profiles: bingecat.profiles.map((p) => (p.id === d.profileId ? { ...p, type: d.type } : p)) });
          return;
        }
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
        } else if (name === 'backup') {
          const d = data as { count?: number; profileIndex?: number; profileName?: string; addons?: Array<{ name?: string; manifestUrl?: string }> };
          // Stremio keeps its single backup at the top level; Nuvio backups come back per profile in the result.
          if (d?.profileIndex === undefined) {
            const previousAddons = (d?.addons ?? []).filter((addon): addon is { name: string; manifestUrl: string } =>
              !!addon?.name && !!addon?.manifestUrl
            );
            wizard.setInstallResult({ previousAddons });
          }
          detail = `${d?.count ?? 0} addon${(d?.count ?? 0) !== 1 ? 's' : ''} saved for reference${d?.profileName ? ` for ${d.profileName}` : ''}.`;
        } else if (name === 'aiostreams') {
          const d = data as { instance?: string };
          detail = `Saved on ${d?.instance ?? ''}.`;
        } else if (name === 'aiometadata') {
          const d = data as { instance?: string };
          detail = `Saved on ${d?.instance ?? ''}.`;
        } else if (name === 'watchly') {
          const d = data as { instance?: string; profileName?: string };
          detail = `Saved on ${d?.instance ?? ''}${d?.profileName ? ` for ${d.profileName}` : ''}.`;
        } else if (name === 'install') {
          const d = data as { count?: number };
          detail = `${d?.count ?? 0} addon${(d?.count ?? 0) !== 1 ? 's' : ''} in your collection.`;
        } else if (name === 'addons') {
          const d = data as { count?: number; profileName?: string; profileIndex?: number };
          const profileLabel = d?.profileName
            ? ` for ${d.profileName} (Profile ${d.profileIndex ?? ''})`
            : '';
          detail = `${d?.count ?? 0} addon${(d?.count ?? 0) !== 1 ? 's' : ''} pushed to your Nuvio account${profileLabel}.`;
        } else if (name === 'collections') {
          const d = data as { groupCount?: number; profileName?: string };
          detail = (d?.groupCount ?? 0) === 0
            ? `Existing collections removed${d?.profileName ? ` for ${d.profileName}` : ''}.`
            : `${d?.groupCount ?? 0} collection group${(d?.groupCount ?? 0) !== 1 ? 's' : ''} configured${d?.profileName ? ` for ${d.profileName}` : ''}.`;
        } else if (name === 'bingecat') {
          const d = data as { profileName?: string; created?: boolean };
          detail = `${d?.created ? 'Created and set up' : 'Updated'}${d?.profileName ? ` for ${d.profileName}` : ''}.`;
        } else if (name === 'profile_failed') {
          const d = data as { profileName?: string; error?: string };
          detail = `${d?.profileName ?? 'A profile'}: ${d?.error ?? 'unknown error'}`;
        } else if (name === 'settings') {
          const d = data as { appliedPlatforms?: string[]; skippedPlatforms?: string[]; profileName?: string };
          const applied = Array.isArray(d?.appliedPlatforms) ? d.appliedPlatforms.join(', ') : '';
          const skipped = Array.isArray(d?.skippedPlatforms) && d.skippedPlatforms.length
            ? ` Skipped: ${d.skippedPlatforms.join(', ')}.`
            : '';
          detail = applied ? `Applied to ${applied}${d?.profileName ? ` for ${d.profileName}` : ''}.${skipped}` : skipped.trim();
        }

        push(`${label}${detail ? ': ' + detail : ''}`, name === 'profile_failed' ? 'error' : 'success');
      };

      type SetupResult = {
        addons: {
          bingecat?: { profileId: number; created: boolean; url: string; searchUrl: string | null };
          aiostreams?: { manifestUrl?: string; uuid?: string; password?: string };
          aiometadata?: {
            manifestUrl?: string; uuid?: string; password?: string;
            instance?: string; config?: Record<string, unknown>;
          };
          watchly?: { manifestUrl?: string; token?: string };
        };
        addonPasswordSource?: 'account' | 'generated';
        previousAddons?: Array<{ name: string; manifestUrl: string }>;
        /** Nuvio only */
        profiles?: Array<{
          profileIndex: number; name: string; status: 'done' | 'failed'; error: string | null; backupTaken: boolean;
          kids: boolean;
          bingecat: { profileId: number; created: boolean; url: string; searchUrl: string | null } | null;
          previousAddons: Array<{ name: string; manifestUrl: string }>;
          watchly: { manifestUrl?: string; token?: string } | null;
        }>;
        warnings: string[];
      };

      let result: SetupResult;

      const account = target === 'stremio' ? stremioAccount : nuvioAccount;
      const setupFn = target === 'stremio' ? runStremioSetup : runNuvioSetup;
      if (target === 'nuvio' && !templates.settings) {
        throw new Error('The Nuvio settings template is missing from the active config. Check wizard/config.json and try again.');
      }
      let nuvioSettingsTemplate = templates.settings as Record<string, unknown>;
      if (useInstantDebrid) {
        const patch = buildInstantDebridSettingsPatch(credentials.debridServices);
        if (patch) {
          nuvioSettingsTemplate = deepMerge(nuvioSettingsTemplate, patch);
        }
      }
      const extraParams = target === 'nuvio'
        ? {
            profiles: nuvioProfiles,
            watchly: nuvioWatchly,
            bingecat: bingecatParam,
            // collections above/below the Watchly/BingeCat catalogs: only when one of them is on, otherwise the template decides
            pinCollections: hasStandard && (watchlyEnabled || (featureOn && (live.bingecat.enabled || hasKids))) ? live.pinCollections : null,
            retry: lastSummary.current ?? carriedBackups(),
            collectionsJson: templates.collections as object[],
            nuvioSettingsTemplate,
          }
        : { watchlyBody, kids: live.stremioKids && featureOn, bingecat: bingecatParam };

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

      // Surface non-fatal warnings (a retry result repeats the earlier ones: show only the new ones)
      const warningsBefore = target === 'nuvio' && lastSummary.current ? shownWarnings.current : 0;
      for (const w of (result.warnings ?? []).slice(warningsBefore)) {
        push(`Note: ${w}`, 'warning');
      }
      if (target === 'nuvio') {
        lastSummary.current = result;
        shownWarnings.current = result.warnings?.length ?? 0;
      }

      const aios = result.addons.aiostreams;
      const meta = result.addons.aiometadata;
      const watchlyResult = result.addons.watchly;
      wizard.setInstallResult({
        aiostreams: aios
          ? { manifestUrl: aios.manifestUrl ?? '', uuid: aios.uuid ?? '', password: aios.password ?? '' }
          : null,
        aiometadata: meta
          ? {
              manifestUrl: meta.manifestUrl ?? '',
              uuid: meta.uuid ?? '',
              password: meta.password ?? '',
              instance: meta.instance ?? '',
              config: meta.config ?? {},
            }
          : null,
        watchly: watchlyResult
          ? { manifestUrl: watchlyResult.manifestUrl ?? '', token: watchlyResult.token ?? '' }
          : null,
        previousAddons: result.previousAddons ?? [],
        profiles: (result.profiles ?? []).map((p) => ({
          profileIndex: p.profileIndex,
          name: p.name,
          status: p.status,
          error: p.error,
          backupTaken: p.backupTaken,
          kids: p.kids,
          bingecat: p.bingecat,
          previousAddons: p.previousAddons,
          watchly: p.watchly ? { manifestUrl: p.watchly.manifestUrl ?? '', token: p.watchly.token ?? '' } : null,
        })),
        bingecat: result.addons.bingecat ?? null,
        addonPasswordSource: result.addonPasswordSource ?? 'account',
        warnings: result.warnings,
        error: null,
      });

      const failedProfiles = (result.profiles ?? []).filter((p) => p.status !== 'done');
      if (failedProfiles.length > 0) {
        const doneCount = (result.profiles ?? []).length - failedProfiles.length;
        setPartial({
          failed: failedProfiles.map((p) => ({ profileIndex: p.profileIndex, name: p.name, error: p.error ?? 'Unknown error' })),
          doneCount,
        });
        // Nothing finished: the results page shows the failure together with the backups of what was already replaced.
        if (doneCount === 0) wizard.setInstallResult({ error: 'None of the selected profiles could be set up.' });
        push('Some profiles could not be set up. The profiles that finished stay as they are.', 'warning');
        return;
      }

      push('Everything is set up and ready to go!', 'success');
      setDone(true);
      // only advance if the user is still on this step
      setTimeout(() => { if (useWizard.getState().step === stepAtStart) wizard.nextStep(); }, 1200);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      wizard.setInstallResult({ error: msg });
      setFatal(msg);
      push('Setup could not be completed. See the error below.', 'error');
    } finally {
      wizard.setInstallRunning(false);
    }
  }

  function restart(clearLog: boolean) {
    if (clearLog) setLog([]);
    else push('Retrying the profiles that failed…');
    setFatal(null);
    setPartial(null);
    setDone(false);
    wizard.setInstallResult({ error: null });
    ran.current = false;
    // Small delay to allow state to settle before re-running
    setTimeout(() => {
      ran.current = false;
      run();
    }, 100);
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
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.35rem' }}>
          {done ? 'All done! 🎉' : partial ? 'Some profiles need attention' : fatal ? 'Setup failed' : 'Setting everything up…'}
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.55 }}>
          {done
            ? 'Your streaming setup has been configured and installed. Tap Continue below to see your results.'
            : partial
            ? 'Not every profile could be set up. The profiles that finished stay as they are, and a retry only redoes the ones that failed.'
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

        {!done && !fatal && !partial && (
          <motion.div
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 500, marginTop: '0.25rem' }}
          >
            Working…
          </motion.div>
        )}
      </div>

      {partial && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.9rem 1rem',
            background: 'rgba(217,119,6,0.07)',
            border: '1px solid rgba(217,119,6,0.3)',
            borderRadius: '8px',
          }}
        >
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#b45309', marginBottom: '0.4rem' }}>
            {partial.failed.length === 1 ? 'This profile' : 'These profiles'} could not be set up
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.6 }}>
            {partial.failed.map((f) => (
              <li key={f.profileIndex}><strong>{f.name}</strong>: {f.error}</li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => restart(false)}
              style={{
                padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer',
                border: '1px solid rgba(217,119,6,0.5)', background: 'rgba(217,119,6,0.12)',
                color: '#b45309', fontSize: '0.82rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '0.35rem',
              }}
            >
              <RotateCcw size={14} />
              Retry Failed Profiles
            </button>
            <button
              onClick={() => wizard.nextStep()}
              style={{
                padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--panel)',
                color: 'var(--text)', fontSize: '0.82rem', fontWeight: 600,
              }}
            >
              Continue to Results
            </button>
          </div>
        </div>
      )}

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
          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.4rem' }}>Error Details</p>
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
            onClick={() => restart(true)}
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
            Try Again
          </button>
        </div>
      )}
    </WizardShell>
  );
}

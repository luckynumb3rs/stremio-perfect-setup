import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { WizardShell } from '../components/WizardShell';
import { useWizard } from '../store/wizard';
import { INSTANCES, TEMPLATE_URLS } from '../lib/constants';

// @ts-ignore
import { runStremioSetup, runNuvioSetup } from '@core/orchestrator.js';

export function InstallingStep() {
  const wizard = useWizard();
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    run();
  }, []);

  const STEP_MESSAGES: Record<string, string> = {
    account: 'Account authenticated.',
    profile: 'Nuvio profile loaded.',
    aiostreams: 'AIOStreams configuration created.',
    aiometadata: 'AIOMetadata configuration created.',
    addons: 'Addons installed on Nuvio.',
    collections: 'Collections installed on Nuvio.',
    install: 'Addons installed on your account.',
  };

  async function run() {
    const push = (msg: string) => setLog(l => [...l, msg]);
    try {
      const {
        target, stremioAccount, nuvioAccount, credentials, aioStreamsInputs,
        catalogSelection, templates,
      } = wizard;

      if (!templates) throw new Error('Templates not loaded. Please go back and try again.');

      push('Building AIOStreams configuration…');
      const aiostreamsParams = {
        template: templates.aiostreams,
        inputs: aioStreamsInputs,
        services: credentials.debridServices.map((d: { id: string }) => d.id),
        credentials: {
          tmdbApiKey: credentials.tmdbApiKey,
          tmdbAccessToken: credentials.tmdbAccessToken,
          tvdbApiKey: credentials.tvdbApiKey,
          geminiApiKey: credentials.geminiApiKey,
        },
        serviceCredentials: Object.fromEntries(
          credentials.debridServices.map((d: { id: string; apiKey: string }) => [d.id, { apiKey: d.apiKey }])
        ),
      };

      // Fetch the correct AIOMetadata base template for the target
      push('Fetching AIOMetadata template…');
      const metaUrl = target === 'nuvio' ? TEMPLATE_URLS.aiometadataNuvio : TEMPLATE_URLS.aiometadataStremio;
      const aiometadataBaseTemplate = await fetch(metaUrl).then(r => r.json());

      const aiometadataParams = {
        baseTemplate: aiometadataBaseTemplate,
        enabledCategories: catalogSelection.enabledCategories,
        enabledDiscoverFolderIds: catalogSelection.enabledDiscoverFolderIds,
        apiKeys: {
          tmdb: credentials.tmdbApiKey,
          tmdbAccess: credentials.tmdbAccessToken,
          tvdb: credentials.tvdbApiKey,
          gemini: credentials.geminiApiKey,
          rpdb: credentials.rpdbApiKey,
        },
        language: aiometadataBaseTemplate.config?.language ?? 'en-US',
      };

      const onStep = (name: string) => push(`✓ ${STEP_MESSAGES[name] ?? name}`);

      let result: { addons: { aiostreams?: { manifestUrl?: string; uuid?: string; password?: string }; aiometadata?: { manifestUrl?: string; uuid?: string } }; warnings: string[] };

      if (target === 'stremio') {
        result = await runStremioSetup({
          instances: INSTANCES,
          account: stremioAccount,
          aiostreamsParams,
          aiometadataParams,
          onStep,
        });
      } else {
        result = await runNuvioSetup({
          instances: INSTANCES,
          account: nuvioAccount,
          aiostreamsParams,
          aiometadataParams,
          collectionsJson: templates.collections as object[],
          onStep,
        });
      }

      const aios = result.addons.aiostreams;
      const meta = result.addons.aiometadata;
      wizard.setInstallResult({
        aiostreams: aios ? { manifestUrl: aios.manifestUrl ?? '', uuid: aios.uuid ?? '', password: aios.password ?? '' } : null,
        aiometadata: meta ? { manifestUrl: meta.manifestUrl ?? '', uuid: meta.uuid ?? '' } : null,
        warnings: result.warnings,
        error: null,
      });
      setDone(true);
      wizard.nextStep();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      wizard.setInstallResult({ error: msg });
      push(`❌ ${msg}`);
    }
  }

  return (
    <WizardShell showBack={false}>
      <h2 className="text-xl font-bold mb-4">Setting everything up…</h2>
      <div className="space-y-2 min-h-[80px]">
        {log.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-gray-700"
          >
            {msg}
          </motion.div>
        ))}
        {!done && (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="text-sm text-accent font-medium"
          >
            Working…
          </motion.div>
        )}
      </div>
    </WizardShell>
  );
}

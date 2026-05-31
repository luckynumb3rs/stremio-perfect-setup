import { WizardShell } from '../components/WizardShell';
import { useWizard } from '../store/wizard';
import { getGuideUrl } from '../lib/site';

export function DoneStep() {
  const { installResult, target } = useWizard();
  const { aiostreams, aiometadata, warnings, error } = installResult;
  const guideUrl = getGuideUrl();

  return (
    <WizardShell showBack={false}>
      {error ? (
        <>
          <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong 😕</h2>
          <p className="text-red-500 text-sm bg-red-50 rounded-lg p-3 mb-4">{error}</p>
          <p className="text-gray-500 text-sm">
            Check the error above and try again, or follow the{' '}
            <a href={guideUrl} target="_blank" rel="noopener" className="text-accent underline">
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
              ? 'Open web.stremio.com and sign in. Your addons are installed in the right order.'
              : 'Open the Nuvio app and sign in. Your addons and collections are ready.'}
          </p>

          {(aiostreams || aiometadata) && (
            <div className="bg-gray-50 rounded-xl p-4 text-xs font-mono space-y-3 mb-4 border border-gray-200">
              <p className="font-sans font-semibold text-gray-700 text-sm mb-1">📋 Your credentials (save these!)</p>
              {aiostreams && (
                <div>
                  <p className="text-gray-500">AIOStreams UUID: <span className="text-gray-800 select-all">{aiostreams.uuid}</span></p>
                  <p className="text-gray-500 break-all">
                    Manifest:{' '}
                    <a href={aiostreams.manifestUrl} target="_blank" rel="noopener" className="text-accent">
                      {aiostreams.manifestUrl}
                    </a>
                  </p>
                </div>
              )}
              {aiometadata && (
                <div>
                  <p className="text-gray-500">AIOMetadata UUID: <span className="text-gray-800 select-all">{aiometadata.uuid}</span></p>
                  <p className="text-gray-500 break-all">
                    Manifest:{' '}
                    <a href={aiometadata.manifestUrl} target="_blank" rel="noopener" className="text-accent">
                      {aiometadata.manifestUrl}
                    </a>
                  </p>
                </div>
              )}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 mb-4">
              <p className="font-semibold mb-1">A few warnings:</p>
              {warnings.map((w, i) => <p key={i}>• {w}</p>)}
            </div>
          )}

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700 mb-4">
            🤖 <strong>Watchly</strong> (Netflix-like recommendations) coming soon!
          </div>

          <p className="text-xs text-gray-400 text-center">
            Enjoying the Nuvio collections?{' '}
            <a
              href="https://nuvioapp.space/community-collections/nuvio-perfect-collections-incl-dynamic-backdrops-2"
              target="_blank"
              rel="noopener"
              className="text-accent underline"
            >
              Support the creator
            </a>{' '}by visiting the community page.
          </p>
        </>
      )}
    </WizardShell>
  );
}

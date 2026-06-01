import { useEffect } from 'react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';

// @ts-ignore
import { deriveCategories, deriveDiscoverFolders, defaultEnabledCategories, countEnabledCatalogs } from '@core/catalog-config.js';

interface Category { key: string; label: string; count: number; }
interface DiscoverFolder { id: string; label: string; }

export function CatalogStep() {
  const { target, templates, catalogSelection, setCatalogSelection, nextStep, wizardConfig } = useWizard();
  const template = templates?.aiometadata as { config?: { catalogs?: object[] } } | null;
  const collectionsRaw = (templates?.nuvioCollections ?? []) as object[];
  const stremioMaxCatalogs = wizardConfig?.limits.stremioMaxCatalogs ?? null;

  if (!template?.config?.catalogs) {
    return <WizardShell><p className="text-gray-400 text-sm">Loading catalogs…</p></WizardShell>;
  }

  const catalogs = template.config.catalogs;
  const categories: Category[] = deriveCategories(catalogs, collectionsRaw ?? []);
  const discoverFolders: DiscoverFolder[] = deriveDiscoverFolders(catalogs);
  const { enabledCategories, enabledDiscoverFolderIds } = catalogSelection;

  // Seed defaults once (when Set is empty)
  useEffect(() => {
    if (enabledCategories.size > 0 || enabledDiscoverFolderIds.size > 0) return;
    const defaults = defaultEnabledCategories(catalogs, target ?? 'stremio', collectionsRaw ?? []);
    setCatalogSelection({
      enabledCategories: defaults.categories,
      enabledDiscoverFolderIds: defaults.discoverFolderIds,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enabledCount: number = countEnabledCatalogs(catalogs, enabledCategories, enabledDiscoverFolderIds);
  const overLimit = target === 'stremio' && stremioMaxCatalogs !== null && enabledCount > stremioMaxCatalogs;

  function tileStyle(selected: boolean): React.CSSProperties {
    return {
      borderColor: selected ? 'var(--accent)' : 'var(--border)',
      background: selected
        ? 'color-mix(in srgb, var(--panel-2) 78%, var(--accent) 22%)'
        : 'var(--panel)',
      color: 'var(--text)',
    };
  }

  function toggleCategory(key: string) {
    const next = new Set(enabledCategories);
    if (next.has(key)) next.delete(key); else next.add(key);
    setCatalogSelection({ enabledCategories: next });
  }

  function toggleDiscover(id: string) {
    const next = new Set(enabledDiscoverFolderIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCatalogSelection({ enabledDiscoverFolderIds: next });
  }

  return (
    <WizardShell>
      <h2 className="text-xl font-bold mb-1">Choose your catalogs</h2>
      <p className="text-gray-500 text-sm mb-4 leading-relaxed">
        Pick which catalog sections you want. Each group adds browsable rows to your app.
        {target === 'stremio' && stremioMaxCatalogs !== null && ` Stremio supports up to ${stremioMaxCatalogs} catalogs.`}
      </p>

      {overLimit && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          ⚠️ <strong>Too many catalogs!</strong> Stremio supports up to ~{stremioMaxCatalogs}.
          You have {enabledCount} enabled. Please disable some categories below.
        </div>
      )}

      {/* Discover section, folder-granular */}
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">🔭 Discover</p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {discoverFolders.map((f: DiscoverFolder) => (
          <button
            key={f.id}
            onClick={() => toggleDiscover(f.id)}
            className="p-2.5 border-2 rounded-xl text-left transition-all"
            style={tileStyle(enabledDiscoverFolderIds.has(f.id))}
          >
            <span className="text-sm font-semibold">{f.label}</span>
          </button>
        ))}
      </div>

      {/* Regular categories */}
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Categories</p>
      <div className="flex flex-col gap-2">
        {categories.map((cat: Category) => (
          <button
            key={cat.key}
            onClick={() => toggleCategory(cat.key)}
            className="px-4 py-3 border-2 rounded-xl flex justify-between items-center transition-all"
            style={tileStyle(enabledCategories.has(cat.key))}
          >
            <span className="font-semibold text-sm">{cat.label}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {cat.count} catalogs {enabledCategories.has(cat.key) ? '✓' : ''}
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-right">{enabledCount} catalogs enabled</p>

      <NextButton onClick={nextStep} disabled={overLimit} label="Finish Setup" />
    </WizardShell>
  );
}

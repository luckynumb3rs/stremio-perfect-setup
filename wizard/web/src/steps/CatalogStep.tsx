import { useEffect, type CSSProperties } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';

// @ts-ignore
import {
  countEnabledCatalogs,
  defaultEnabledCategories,
  deriveCategories,
  deriveDiscoverFolders,
  normalizeCategoryOrder,
  normalizeDiscoverFolderOrder,
} from '@core/catalog-config.js';

interface Category { key: string; label: string; count: number; }
interface DiscoverFolder { id: string; label: string; }
interface CategoryBlock { id: string; keys: string[]; items: Category[]; }

interface CatalogTileProps {
  label: string;
  meta?: string;
  selected: boolean;
  isDragging: boolean;
  style: CSSProperties;
  onToggle: () => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildCategoryBlocks(categories: Category[], orderedKeys: string[], target: 'stremio' | 'nuvio' | null): CategoryBlock[] {
  const categoryByKey = new Map(categories.map((category) => [category.key, category]));
  if (target !== 'nuvio') {
    return orderedKeys
      .map((key) => categoryByKey.get(key))
      .filter((category): category is Category => Boolean(category))
      .map((category) => ({ id: category.key, keys: [category.key], items: [category] }));
  }

  const linkedKeys = ['🎭', '🍥'].filter((key) => orderedKeys.includes(key) && categoryByKey.has(key));
  const linkedSet = new Set(linkedKeys);
  const blocks: CategoryBlock[] = [];
  let linkedAdded = false;

  for (const key of orderedKeys) {
    const category = categoryByKey.get(key);
    if (!category) continue;

    if (linkedSet.has(key)) {
      if (linkedAdded) continue;
      linkedAdded = true;
      blocks.push({
        id: linkedKeys.length > 1 ? 'linked:genres-anime' : linkedKeys[0],
        keys: linkedKeys,
        items: linkedKeys
          .map((linkedKey) => categoryByKey.get(linkedKey))
          .filter((item): item is Category => Boolean(item)),
      });
      continue;
    }

    blocks.push({ id: category.key, keys: [category.key], items: [category] });
  }

  return blocks;
}

function CatalogTile({
  label,
  meta,
  selected,
  isDragging,
  style,
  onToggle,
  onDragStart,
}: CatalogTileProps) {
  return (
    <div
      className={`wizard-catalog-tile wizard-hover-lift${selected ? '' : ' wizard-hover-lift--guide'}${isDragging ? ' wizard-catalog-tile--dragging' : ''}`}
      style={style}
    >
      <button
        type="button"
        className="wizard-catalog-handle"
        aria-label={`Reorder ${label}`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDragStart(event);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <GripVertical size={16} strokeWidth={2.25} />
      </button>

      <button type="button" className="wizard-catalog-toggle" onClick={onToggle}>
        <span className="wizard-catalog-toggle__label">{label}</span>
        {meta ? <span className="wizard-catalog-toggle__meta">{meta}</span> : null}
      </button>
    </div>
  );
}

function ReorderableCatalogBlock({
  block,
  tileStyle,
  enabledCategories,
  onToggleCategory,
}: {
  block: CategoryBlock;
  tileStyle: (selected: boolean) => CSSProperties;
  enabledCategories: Set<string>;
  onToggleCategory: (key: string) => void;
}) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      as="div"
      value={block.id}
      dragListener={false}
      dragControls={dragControls}
      className="wizard-catalog-block"
      whileDrag={{ scale: 1.01, zIndex: 10 }}
    >
      {block.items.map((category) => {
        const isSelected = enabledCategories.has(category.key);
        return (
          <CatalogTile
            key={category.key}
            label={category.label}
            meta={`${category.count} catalogs ${isSelected ? '✓' : ''}`}
            selected={isSelected}
            isDragging={false}
            style={tileStyle(isSelected)}
            onToggle={() => onToggleCategory(category.key)}
            onDragStart={(event) => dragControls.start(event)}
          />
        );
      })}
    </Reorder.Item>
  );
}

function ReorderableDiscoverTile({
  folder,
  tileStyle,
  enabledDiscoverFolderIds,
  onToggleDiscover,
}: {
  folder: DiscoverFolder;
  tileStyle: (selected: boolean) => CSSProperties;
  enabledDiscoverFolderIds: Set<string>;
  onToggleDiscover: (id: string) => void;
}) {
  const dragControls = useDragControls();
  const isSelected = enabledDiscoverFolderIds.has(folder.id);

  return (
    <Reorder.Item
      as="div"
      value={folder.id}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.01, zIndex: 10 }}
    >
      <CatalogTile
        label={folder.label}
        selected={isSelected}
        isDragging={false}
        style={tileStyle(isSelected)}
        onToggle={() => onToggleDiscover(folder.id)}
        onDragStart={(event) => dragControls.start(event)}
      />
    </Reorder.Item>
  );
}

export function CatalogStep() {
  const { target, templates, catalogSelection, setCatalogSelection, nextStep, wizardConfig } = useWizard();
  const template = templates?.aiometadata as { config?: { catalogs?: object[] } } | null;
  const collectionsRaw = (templates?.collections ?? []) as object[];
  const categoryExceptions = wizardConfig?.catalogSelectionExceptions ?? [];
  const stremioMaxCatalogs = wizardConfig?.limits.stremioMaxCatalogs ?? null;

  if (!template?.config?.catalogs) {
    return <WizardShell><p className="text-gray-400 text-sm">Loading catalogs…</p></WizardShell>;
  }

  const catalogs = template.config.catalogs;
  const categories: Category[] = deriveCategories(catalogs, collectionsRaw ?? [], categoryExceptions);
  const discoverFolders: DiscoverFolder[] = deriveDiscoverFolders(catalogs, collectionsRaw ?? [], categoryExceptions);
  const { enabledCategories, enabledDiscoverFolderIds, categoryOrder, discoverFolderOrder } = catalogSelection;
  const orderTarget = target ?? 'stremio';
  const availableCategoryKeys = categories.map((category) => category.key);
  const availableDiscoverKeys = discoverFolders.map((folder) => folder.id);
  const orderedCategoryKeys = normalizeCategoryOrder(categoryOrder, availableCategoryKeys, orderTarget);
  const orderedDiscoverKeys = normalizeDiscoverFolderOrder(discoverFolderOrder, availableDiscoverKeys);
  const categoryBlocks = buildCategoryBlocks(categories, orderedCategoryKeys, target);
  const categoryBlockIds = categoryBlocks.map((block) => block.id);
  const discoverById = new Map(discoverFolders.map((folder) => [folder.id, folder]));
  const orderedDiscoverFolders = orderedDiscoverKeys
    .map((id) => discoverById.get(id))
    .filter((folder): folder is DiscoverFolder => Boolean(folder));

  useEffect(() => {
    const nextSelection: Record<string, unknown> = {};
    let shouldUpdate = false;

    if (enabledCategories.size === 0 && enabledDiscoverFolderIds.size === 0) {
      const defaults = defaultEnabledCategories(catalogs, orderTarget, collectionsRaw ?? [], categoryExceptions);
      nextSelection.enabledCategories = defaults.categories;
      nextSelection.enabledDiscoverFolderIds = defaults.discoverFolderIds;
      shouldUpdate = true;
    }

    if (!arraysEqual(categoryOrder, orderedCategoryKeys)) {
      nextSelection.categoryOrder = orderedCategoryKeys;
      shouldUpdate = true;
    }

    if (!arraysEqual(discoverFolderOrder, orderedDiscoverKeys)) {
      nextSelection.discoverFolderOrder = orderedDiscoverKeys;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      setCatalogSelection(nextSelection);
    }
  }, [
    catalogs,
    categoryExceptions,
    categoryOrder,
    collectionsRaw,
    discoverFolderOrder,
    enabledCategories.size,
    enabledDiscoverFolderIds.size,
    orderTarget,
    orderedCategoryKeys,
    orderedDiscoverKeys,
    setCatalogSelection,
  ]);

  const enabledCount: number = countEnabledCatalogs(
    catalogs,
    enabledCategories,
    enabledDiscoverFolderIds,
    collectionsRaw ?? [],
    categoryExceptions,
  );
  const overLimit = target === 'stremio' && stremioMaxCatalogs !== null && enabledCount > stremioMaxCatalogs;

  function tileStyle(selected: boolean): CSSProperties {
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

  function reorderCategoryBlocks(nextBlockIds: string[]) {
    const keysByBlockId = new Map(categoryBlocks.map((block) => [block.id, block.keys]));
    const nextKeys = nextBlockIds.flatMap((id) => keysByBlockId.get(id) ?? []);
    setCatalogSelection({
      categoryOrder: normalizeCategoryOrder(nextKeys, availableCategoryKeys, orderTarget),
    });
  }

  function reorderDiscoverFolders(nextDiscoverIds: string[]) {
    setCatalogSelection({
      discoverFolderOrder: normalizeDiscoverFolderOrder(nextDiscoverIds, availableDiscoverKeys),
    });
  }

  return (
    <WizardShell onSubmit={overLimit ? undefined : nextStep}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.4rem', textAlign: 'center' }}>🔎 Catalogs</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.6, textAlign: 'center', maxWidth: '44rem', margin: '0 auto 1rem' }}>
        Choose which catalog categories you want to appear in your app from this list of curated options.
        Drag the handle on the left to change order, and click anywhere else on a row to enable or disable it.
        {target === 'stremio' && stremioMaxCatalogs !== null && ` Stremio supports up to ${stremioMaxCatalogs} catalogs total.`}
      </p>
      {target === 'nuvio' && (
        <p className="page-description" style={{ marginBottom: '1rem' }}>
          Genres and Anime move together in Nuvio because they share the same collections group. It's recommended to keep Genres enabled if you want to use Anime.
        </p>
      )}

      {overLimit && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          ⚠️ <strong>Too many catalogs!</strong> Stremio supports up to ~{stremioMaxCatalogs}.
          You have {enabledCount} enabled. Please disable some categories below.
        </div>
      )}

      {/* Discover section, folder-granular */}
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">🔭 Discover</p>
      <Reorder.Group axis="y" values={orderedDiscoverKeys} onReorder={reorderDiscoverFolders} className="wizard-catalog-list mb-5">
        {orderedDiscoverFolders.map((folder) => (
          <ReorderableDiscoverTile
            key={folder.id}
            folder={folder}
            tileStyle={(selected) => ({
              ...tileStyle(selected),
              '--wizard-hover-selected-bg': 'color-mix(in srgb, var(--panel-2) 78%, var(--accent) 22%)',
              '--wizard-hover-selected-border': 'var(--accent)',
              '--wizard-hover-selected-color': 'var(--text)',
            } as CSSProperties)}
            enabledDiscoverFolderIds={enabledDiscoverFolderIds}
            onToggleDiscover={toggleDiscover}
          />
        ))}
      </Reorder.Group>

      {/* Regular categories */}
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">☰ Categories</p>
      <Reorder.Group axis="y" values={categoryBlockIds} onReorder={reorderCategoryBlocks} className="wizard-catalog-list">
        {categoryBlocks.map((block) => (
          <ReorderableCatalogBlock
            key={block.id}
            block={block}
            tileStyle={(selected) => ({
              ...tileStyle(selected),
              '--wizard-hover-selected-bg': 'color-mix(in srgb, var(--panel-2) 78%, var(--accent) 22%)',
              '--wizard-hover-selected-border': 'var(--accent)',
              '--wizard-hover-selected-color': 'var(--text)',
            } as CSSProperties)}
            enabledCategories={enabledCategories}
            onToggleCategory={toggleCategory}
          />
        ))}
      </Reorder.Group>

      <p className="text-xs text-gray-400 mt-3 text-right">{enabledCount} catalogs enabled</p>

      <NextButton onClick={nextStep} disabled={overLimit} label="Continue" />
    </WizardShell>
  );
}

const SIDEBAR_STATS_META = Object.freeze({
  ariaLabel: 'Guide and wizard activity',
  toggleLabel: 'Toggle Setup Statistics',
  title: 'Wizard Setup Statistics',
  subtitle: 'Popular Choices',
  totalLabel: 'Total (Delayed)',
  primaryStats: Object.freeze([
    Object.freeze({
      id: 'guide',
      label: 'Guide completed',
      suffix: 'readers',
      countAttribute: 'data-guide-completion-count',
    }),
    Object.freeze({
      id: 'wizard',
      label: 'Wizard created',
      suffix: 'accounts',
      countAttribute: 'data-wizard-account-count',
    }),
  ]),
  platformModes: Object.freeze([
    Object.freeze({ id: 'signin', title: 'Existing' }),
    Object.freeze({ id: 'create', title: 'New' }),
  ]),
});

let sidebarStatsPanelsInitialized = false;
let sidebarStatsCountObserver = null;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(asNonNegativeInteger(value));
}

function clearNode(node) {
  while (node && node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function hasSidebarStatsSummary(summary) {
  return Boolean(summary && Number(summary.rowCount) > 0);
}

function toEmojiRowItem(item, index) {
  const title = item?.title || item?.emoji || '';
  return {
    key: `${title || 'item'}-${index}`,
    title,
    count: item?.count ?? 0,
    emoji: item?.emoji,
  };
}

function getSidebarStatsRows(summary) {
  const rows = [];
  if (!summary) return rows;

  const debrid = asArray(summary.debrid);
  if (debrid.length > 0) {
    rows.push({
      label: 'Debrid',
      variant: 'logos',
      items: debrid.map((item) => ({
        key: item.id,
        title: item.label,
        count: item.count,
        logoPath: item.logoPath,
      })),
    });
  }

  const audio = asArray(summary.audio);
  if (audio.length > 0) {
    rows.push({ label: 'Audio', variant: 'emoji', items: audio.map(toEmojiRowItem) });
  }

  const subtitles = asArray(summary.subtitles);
  if (subtitles.length > 0) {
    rows.push({ label: 'Subtitles', variant: 'emoji', items: subtitles.map(toEmojiRowItem) });
  }

  const discover = asArray(summary.catalogs?.discover);
  if (discover.length > 0) {
    rows.push({ label: 'Discover', variant: 'discover', items: discover.map(toEmojiRowItem) });
  }

  const categories = asArray(summary.catalogs?.categories);
  if (categories.length > 0) {
    rows.push({ label: 'Categories', variant: 'categories', items: categories.map(toEmojiRowItem) });
  }

  const formatter = asArray(summary.formatter);
  if (formatter.length > 0) {
    rows.push({
      label: 'Formatter',
      variant: 'formatter',
      items: formatter.map((item) => ({
        key: item.id,
        title: item.title ?? item.label,
        count: item.count,
        emoji: item.emoji,
      })),
    });
  }

  rows.push({
    label: 'Addons',
    variant: 'addons',
    items: [
      { key: 'anime', title: 'Anime', count: summary.addons?.anime ?? 0, emoji: '🍥' },
      {
        key: 'http',
        title: 'HTTP',
        countText: `➕ ${formatNumber(summary.addons?.httpInstall ?? 0)} / 🔒 ${formatNumber(summary.addons?.httpOnly ?? 0)}`,
        emoji: '🌐',
      },
      { key: 'debridio', title: 'Debridio', count: summary.addons?.debridio ?? 0, emoji: '🧊' },
    ],
  });

  return rows;
}

function getSidebarStatsAccounts(summary) {
  const accounts = summary?.accounts;
  if (!accounts) return null;

  return {
    totalLabel: SIDEBAR_STATS_META.totalLabel,
    total: accounts.total ?? 0,
    platforms: asArray(accounts.platforms).map((platform) => ({
      id: platform.id,
      label: platform.label,
      logoPath: platform.logoPath,
      total: platform.total,
      modes: SIDEBAR_STATS_META.platformModes.map((mode) => ({
        id: mode.id,
        title: mode.title,
        value: platform[mode.id],
      })),
    })),
  };
}

function getSidebarStatsPrimaryItems(counts) {
  return SIDEBAR_STATS_META.primaryStats.map((item) => ({
    ...item,
    count: counts?.[item.id] ?? 0,
  }));
}

function getSidebarStatsCardModel(options = {}) {
  const summary = options.summary ?? null;

  return {
    meta: SIDEBAR_STATS_META,
    hasSummary: hasSidebarStatsSummary(summary),
    primaryItems: getSidebarStatsPrimaryItems(options.counts),
    accounts: getSidebarStatsAccounts(summary),
    rows: getSidebarStatsRows(summary),
  };
}

function createStatsModeIcon(type) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('sidebar-stats-mode-icon');

  function path(d) {
    const el = document.createElementNS(svgNs, 'path');
    el.setAttribute('d', d);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(el);
  }

  if (type === 'create') {
    path('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2');
    path('M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z');
    path('M19 8v6');
    path('M22 11h-6');
    return svg;
  }

  path('M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4');
  path('m10 17 5-5-5-5');
  path('M15 12H3');
  return svg;
}

function resolveStatsAssetPath(path, assetUrlResolver) {
  if (!path) return '';
  if (typeof assetUrlResolver === 'function') {
    return assetUrlResolver(path);
  }
  return String(path);
}

function createStatsImage(path, alt, className, assetUrlResolver) {
  const img = document.createElement('img');
  img.className = className;
  img.src = resolveStatsAssetPath(path, assetUrlResolver);
  img.alt = alt || '';
  img.loading = 'lazy';
  return img;
}

function renderSidebarStatsRow(rowModel, assetUrlResolver) {
  const row = document.createElement('section');
  row.className = 'sidebar-stats-row';

  const label = document.createElement('div');
  label.className = 'sidebar-stats-row__label';
  label.textContent = rowModel.label;
  row.appendChild(label);

  const grid = document.createElement('div');
  grid.className = `sidebar-stats-icon-row sidebar-stats-icon-row--${rowModel.variant}`;

  asArray(rowModel.items).forEach((item) => {
    const box = document.createElement('div');
    box.className = 'sidebar-stats-icon-item';
    if (item && item.title) {
      box.setAttribute('title', item.title);
    }

    const iconWrap = document.createElement('div');
    iconWrap.className = 'sidebar-stats-icon-item__icon';

    if (item.logoPath) {
      iconWrap.appendChild(createStatsImage(item.logoPath, item.label || item.title || '', 'sidebar-stats-icon-item__logo', assetUrlResolver));
    } else if (item.emoji) {
      const emoji = document.createElement('span');
      emoji.className = 'sidebar-stats-icon-item__emoji';
      emoji.textContent = item.emoji;
      iconWrap.appendChild(emoji);
    }

    box.appendChild(iconWrap);

    const count = document.createElement('strong');
    count.className = 'sidebar-stats-icon-item__count';
    count.textContent = item.countText || formatNumber(item.count);
    box.appendChild(count);
    grid.appendChild(box);
  });

  row.appendChild(grid);
  return row;
}

function renderSidebarStatsAccounts(accountsModel, assetUrlResolver) {
  const section = document.createElement('section');
  section.className = 'sidebar-stats-accounts';

  const totalCard = document.createElement('div');
  totalCard.className = 'sidebar-stats-total-card';

  const totalLabel = document.createElement('span');
  totalLabel.className = 'sidebar-stats-total-card__label';
  totalLabel.textContent = accountsModel.totalLabel;
  totalCard.appendChild(totalLabel);

  const totalValue = document.createElement('strong');
  totalValue.className = 'sidebar-stats-total-card__value';
  totalValue.textContent = formatNumber(accountsModel.total);
  totalCard.appendChild(totalValue);

  section.appendChild(totalCard);

  const platformGrid = document.createElement('div');
  platformGrid.className = 'sidebar-stats-platform-grid';

  asArray(accountsModel.platforms).forEach((platform) => {
    const card = document.createElement('div');
    card.className = 'sidebar-stats-platform-card';

    const head = document.createElement('div');
    head.className = 'sidebar-stats-platform-card__head';
    if (platform.logoPath) {
      head.appendChild(createStatsImage(platform.logoPath, platform.label || '', 'sidebar-stats-platform-card__logo', assetUrlResolver));
    }
    card.appendChild(head);

    const total = document.createElement('strong');
    total.className = 'sidebar-stats-platform-card__value';
    total.textContent = formatNumber(platform.total);
    card.appendChild(total);

    const modes = document.createElement('div');
    modes.className = 'sidebar-stats-platform-card__modes';

    asArray(platform.modes).forEach((mode) => {
      const modeBox = document.createElement('div');
      modeBox.className = 'sidebar-stats-platform-card__mode';
      modeBox.setAttribute('title', mode.title);
      modeBox.appendChild(createStatsModeIcon(mode.id));

      const modeValue = document.createElement('strong');
      modeValue.textContent = formatNumber(mode.value);
      modeBox.appendChild(modeValue);
      modes.appendChild(modeBox);
    });

    card.appendChild(modes);
    platformGrid.appendChild(card);
  });

  section.appendChild(platformGrid);
  return section;
}

function setSidebarStatsOpen(card, open) {
  if (!card) return;
  const toggle = card.querySelector('[data-sidebar-stats-toggle]');
  const panel = card.querySelector('[data-sidebar-stats-panel]');
  card.setAttribute('data-sidebar-stats-open', open ? 'true' : 'false');
  if (toggle) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (panel) {
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  if (open) {
    updateSidebarStatsPanelLayout(card);
  }
}

function closeSidebarStatsPanels(exceptCard) {
  const cards = document.querySelectorAll('[data-sidebar-stats-card]');
  Array.prototype.forEach.call(cards, (card) => {
    if (exceptCard && card === exceptCard) return;
    setSidebarStatsOpen(card, false);
  });
}

function setupSidebarStatsPanels() {
  if (sidebarStatsPanelsInitialized || typeof document === 'undefined') return;
  sidebarStatsPanelsInitialized = true;

  document.addEventListener('click', (event) => {
    const cards = document.querySelectorAll('[data-sidebar-stats-card]');
    Array.prototype.forEach.call(cards, (card) => {
      if (card.contains(event.target)) return;
      setSidebarStatsOpen(card, false);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeSidebarStatsPanels();
  });

  window.addEventListener('resize', () => {
    const cards = document.querySelectorAll('[data-sidebar-stats-card]');
    Array.prototype.forEach.call(cards, (card) => {
      updateSidebarStatsPanelLayout(card);
    });
  });
}

function updateSidebarStatsPanelLayout(card) {
  if (!card || typeof window === 'undefined') return;
  const rootStyle = window.getComputedStyle(document.documentElement);
  const headerHeight = parseFloat(rootStyle.getPropertyValue('--header-height')) || 74;
  const rect = card.getBoundingClientRect();
  const availableHeight = Math.max(250, Math.floor(rect.top - headerHeight - 8));
  card.style.setProperty('--sidebar-stats-max-height', `${availableHeight}px`);
}

function animateSidebarStatsCount(node, target, duration = 1400) {
  if (!node || typeof window === 'undefined') return;

  const prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const normalizedTarget = asNonNegativeInteger(target);
  const normalizedDuration = asNonNegativeInteger(duration) || 1400;

  if (prefersReducedMotion) {
    node.textContent = formatNumber(normalizedTarget);
    return;
  }

  const startTime = window.performance && window.performance.now
    ? window.performance.now()
    : Date.now();

  function frame(now) {
    const currentTime = typeof now === 'number' ? now : Date.now();
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / normalizedDuration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(normalizedTarget * eased);

    node.textContent = formatNumber(current);

    if (progress < 1) {
      window.requestAnimationFrame(frame);
    } else {
      node.textContent = formatNumber(normalizedTarget);
    }
  }

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(frame);
  } else {
    node.textContent = formatNumber(normalizedTarget);
  }
}

function setupSidebarStatsCountObserver() {
  if (sidebarStatsCountObserver || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
    return;
  }

  sidebarStatsCountObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const node = entry.target;

      if (entry.isIntersecting) {
        if (node.getAttribute('data-sidebar-count-visible') === 'true') return;

        node.setAttribute('data-sidebar-count-visible', 'true');

        const target = asNonNegativeInteger(
          node.getAttribute('data-sidebar-count-target')
        );

        animateSidebarStatsCount(node, target, 1400);
      } else {
        node.setAttribute('data-sidebar-count-visible', 'false');
      }
    });
  }, {
    threshold: 0.5,
  });
}

function isSidebarStatsCountVisible(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function' || typeof window === 'undefined') return false;

  const rect = node.getBoundingClientRect();

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.left <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

function applySidebarStatsCount(node, total, updatedAt, animate) {
  if (!node) return;

  const value = asNonNegativeInteger(total);
  const previousTarget = asNonNegativeInteger(
    node.getAttribute('data-sidebar-count-target')
  );

  node.setAttribute('data-sidebar-count-target', String(value));

  if (updatedAt) {
    node.setAttribute('title', `Updated ${updatedAt}`);
  }

  if (!animate) {
    node.textContent = formatNumber(value);
    return;
  }

  setupSidebarStatsCountObserver();

  if (sidebarStatsCountObserver) {
    sidebarStatsCountObserver.observe(node);
  }

  const isVisible = isSidebarStatsCountVisible(node);
  const targetChanged = previousTarget !== value;

  if (isVisible && targetChanged) {
    animateSidebarStatsCount(node, value, 1400);
    node.setAttribute('data-sidebar-count-visible', 'true');
  } else if (!sidebarStatsCountObserver) {
    animateSidebarStatsCount(node, value, 1400);
  }
}

function applySidebarStatsCounts(root, counts, updatedAt, animate) {
  SIDEBAR_STATS_META.primaryStats.forEach((item) => {
    const node = root.querySelector(`[${item.countAttribute}]`);
    applySidebarStatsCount(node, counts?.[item.id] ?? 0, updatedAt, animate);
  });
}

function normalizeSidebarStatsPayload(stats, baselineGuideCount, baselineWizardCount) {
  return {
    counts: {
      guide: stats?.totalCompletions ?? baselineGuideCount,
      wizard: stats?.wizard?.totalAccountsCreated ?? baselineWizardCount,
    },
    summary: hasSidebarStatsSummary(stats?.wizard?.analytics?.summary)
      ? stats.wizard.analytics.summary
      : null,
    updatedAt: stats?.updatedAt ?? null,
  };
}

function renderSidebarStatsCard(root, options = {}) {
  if (!root || typeof document === 'undefined') return null;

  setupSidebarStatsPanels();

  const model = getSidebarStatsCardModel(options);
  const section = document.createElement('section');
  section.className = 'sidebar-stat-card';
  section.setAttribute('aria-label', model.meta.ariaLabel);
  section.setAttribute('data-sidebar-stats-card', '');
  section.setAttribute('data-sidebar-stats-open', options.open ? 'true' : 'false');

  const toggle = document.createElement('button');
  toggle.className = 'sidebar-stat-toggle';
  toggle.type = 'button';
  toggle.setAttribute('data-sidebar-stats-toggle', '');
  toggle.setAttribute('aria-expanded', options.open ? 'true' : 'false');
  toggle.hidden = !model.hasSummary;

  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'sidebar-stat-toggle__label';
  toggleLabel.textContent = model.meta.toggleLabel;
  toggle.appendChild(toggleLabel);

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'sidebar-stat-toggle__icon';
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggleIcon.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 15 12 8l8 7" /></svg>';
  toggle.appendChild(toggleIcon);
  section.appendChild(toggle);

  const panel = document.createElement('div');
  panel.className = 'sidebar-stats-panel';
  panel.setAttribute('data-sidebar-stats-panel', '');
  panel.setAttribute('aria-hidden', options.open ? 'false' : 'true');

  const panelHeader = document.createElement('div');
  panelHeader.className = 'sidebar-stats-panel__header';
  panelHeader.innerHTML = `<strong>${model.meta.title}</strong><span>${model.meta.subtitle}</span>`;
  panel.appendChild(panelHeader);

  const content = document.createElement('div');
  content.className = 'sidebar-stats-panel__content';
  content.setAttribute('data-sidebar-stats-panel-content', '');

  if (model.hasSummary && model.accounts) {
    content.appendChild(renderSidebarStatsAccounts(model.accounts, options.assetUrlResolver));
    model.rows.forEach((row) => {
      content.appendChild(renderSidebarStatsRow(row, options.assetUrlResolver));
    });
  }

  panel.appendChild(content);
  section.appendChild(panel);

  const grid = document.createElement('div');
  grid.className = 'sidebar-stat-grid';

  model.primaryItems.forEach((item, index) => {
    if (index > 0) {
      const divider = document.createElement('div');
      divider.className = 'sidebar-stat-divider';
      divider.setAttribute('aria-hidden', 'true');
      grid.appendChild(divider);
    }

    const statItem = document.createElement('div');
    statItem.className = 'sidebar-stat-item';

    const label = document.createElement('span');
    label.className = 'sidebar-stat-item__label';
    label.textContent = item.label;
    statItem.appendChild(label);

    const value = document.createElement('strong');
    value.className = 'sidebar-stat-item__value';

    const count = document.createElement('span');
    count.textContent = formatNumber(item.count);
    count.setAttribute(item.countAttribute, '');
    value.appendChild(count);
    statItem.appendChild(value);

    const suffix = document.createElement('span');
    suffix.className = 'sidebar-stat-item__suffix';
    suffix.textContent = item.suffix;
    statItem.appendChild(suffix);

    grid.appendChild(statItem);
  });

  section.appendChild(grid);

  toggle.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!model.hasSummary) return;
    const isOpen = section.getAttribute('data-sidebar-stats-open') === 'true';
    closeSidebarStatsPanels(section);
    setSidebarStatsOpen(section, !isOpen);
  };

  clearNode(root);
  root.appendChild(section);

  if (model.hasSummary) {
    updateSidebarStatsPanelLayout(section);
  }

  return section;
}

function updateSidebarStatsCard(root, options = {}) {
  const card = renderSidebarStatsCard(root, options);
  if (!card) return null;
  applySidebarStatsCounts(card, options.counts, options.updatedAt, options.animate === true);
  return card;
}

function mountSidebarStatsCard(root, options = {}) {
  if (!root) return () => {};

  const baselineGuideCount = asNonNegativeInteger(options.baselineGuideCount);
  const baselineWizardCount = asNonNegativeInteger(options.baselineWizardCount);
  const fetchImpl = typeof options.fetchImpl === 'function'
    ? options.fetchImpl
    : (typeof window !== 'undefined' && typeof window.fetch === 'function'
      ? window.fetch.bind(window)
      : null);

  updateSidebarStatsCard(root, {
    counts: {
      guide: baselineGuideCount,
      wizard: baselineWizardCount,
    },
    summary: null,
    assetUrlResolver: options.assetUrlResolver,
    animate: options.animateInitial === true,
  });

  if (!options.statsUrl || !fetchImpl) {
    return () => {};
  }

  let cancelled = false;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;

  fetchImpl(options.statsUrl, {
    cache: options.cache ?? 'no-store',
    signal: controller ? controller.signal : undefined,
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load sidebar stats (HTTP ${response.status})`);
    }
    return response.json();
  }).then((stats) => {
    if (cancelled) return;
    const payload = normalizeSidebarStatsPayload(stats, baselineGuideCount, baselineWizardCount);
    updateSidebarStatsCard(root, {
      counts: payload.counts,
      summary: payload.summary,
      updatedAt: payload.updatedAt,
      assetUrlResolver: options.assetUrlResolver,
      animate: options.animateLoaded !== false,
    });
  }).catch((error) => {
    if (cancelled) return;
    if (error && error.name === 'AbortError') return;
  });

  return () => {
    cancelled = true;
    if (controller) {
      controller.abort();
    }
  };
}

const sidebarStatsShared = {
  SIDEBAR_STATS_META,
  getSidebarStatsRows,
  getSidebarStatsAccounts,
  getSidebarStatsPrimaryItems,
  getSidebarStatsCardModel,
  hasSidebarStatsSummary,
  renderSidebarStatsCard,
  updateSidebarStatsCard,
  mountSidebarStatsCard,
  updateSidebarStatsPanelLayout,
};

if (typeof window !== 'undefined') {
  window.SidebarStatsShared = sidebarStatsShared;
}

export {
  SIDEBAR_STATS_META,
  getSidebarStatsRows,
  getSidebarStatsAccounts,
  getSidebarStatsPrimaryItems,
  getSidebarStatsCardModel,
  hasSidebarStatsSummary,
  renderSidebarStatsCard,
  updateSidebarStatsCard,
  mountSidebarStatsCard,
  updateSidebarStatsPanelLayout,
};

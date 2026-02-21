# Stremio Docs Visual Overhaul Plan

## 1. Goals and Constraints
- Keep GitHub Pages deployment working from `docs/` with Jekyll.
- Preserve Markdown content as the source of truth for guide pages.
- Replace current Leap Day customization with a modern, responsive custom theme.
- Implement automatic sidebar navigation, automatic per-page previous/next links, and automatic in-page "Quick Navigation" (TOC).
- Keep repository browsing on GitHub usable (Markdown files readable directly in repo).
- Minimize future maintenance: no manual nav list updates, no manual TOC blocks, no manual previous/next links.

## 2. Current-State Findings
- Site currently uses `remote_theme: pages-themes/leap-day@v0.2.0` in `docs/_config.yml`.
- Navigation is manual in `docs/_data/nav.yml` + `docs/_includes/sidebar.html`.
- `docs/guide/*.md` pages currently include hardcoded:
  - "Quick Navigation" sections.
  - Bottom previous/next links.
- `README.md` and `docs/index.md` are duplicated variants of the same homepage content with different relative links.
- Content is already separated from styling/layout (`_layouts`, `_includes`, `_data`).

## 3. Architecture Decision (Recommended)
### 3.1 Keep existing top-level structure
- Keep:
  - `README.md` in repo root (for GitHub repo browsing).
  - `docs/index.md` as GitHub Pages homepage.
  - `docs/guide/` for content pages.
  - `docs/images/` for page assets.
- Rationale:
  - With default GitHub Pages source set to `docs/`, `README.md` cannot directly replace `docs/index.md` as the site homepage in the default setup.
  - Maintaining both files is the lowest-risk Pages-compatible approach.

### 3.2 Put visual/style assets under `docs/site/`
- Add:
  - `docs/site/css/main.css`
  - `docs/site/js/main.js`
  - `docs/site/js/theme.js`
- Keep Jekyll layouts/includes in standard dirs (`docs/_layouts`, `docs/_includes`) because Jekyll expects them there.
- Use `site/` only for static frontend assets to satisfy the clean structure requirement.

## 4. New Jekyll Structure
- `docs/_config.yml`
  - Remove remote Leap Day theme usage.
  - Set markdown/highlighter options and defaults for guide collection behavior.
  - Keep `title`, `description`, GA setting.
- `docs/_layouts/default.html`
  - New shell layout with:
    - fixed left sidebar (desktop), off-canvas drawer (mobile).
    - top utility bar with theme toggle.
    - main content area.
- `docs/_includes/`
  - `sidebar.html`: auto-generated menu from guide files.
  - `breadcrumbs_or_meta.html` (optional).
  - `quick-nav.html`: auto TOC generation for headings `h2+`.
  - `pager.html`: auto previous/next links based on computed page order.
  - `head-extra.html` for metadata/social tags (optional).
- `docs/_data/`
  - Option A (preferred): no manual nav data file required.
  - Option B (fallback): generated nav data for advanced ordering if needed.

## 5. Dynamic Navigation Implementation
### 5.1 Ordering and title source
- Build ordered list from `site.pages` filtered to:
  - path starts with `guide/`
  - extension `.md`
- Sort by filename/path (alphabetical) to match requirement.
- Display label priority:
  1. front matter `nav_title` (if present),
  2. front matter `title`,
  3. first Markdown `# Heading` fallback.
- During migration, add front matter `title` to each guide page for deterministic nav labels.

### 5.2 Submenu behavior
- Detect nested content by folder depth in `guide/`.
- If `guide/<chapter>/...` exists, render expandable accordion under the parent chapter.
- Active page branch auto-expands.

### 5.3 Previous/next
- Compute the same ordered page array.
- For current page, find index and render previous/next links automatically.
- Remove manual hardcoded bottom nav lines from all guide pages.

## 6. Automatic "Quick Navigation" (TOC)
- Insert TOC block below page title in layout/include.
- Build TOC from rendered HTML headings (`h2` to `h4`) using JS at runtime for reliability on GitHub Pages (no unsupported plugins required).
- Show TOC section only when at least one `h2+` exists.
- Heading IDs:
  - ensure headings have anchors (GitHub-style IDs from Kramdown output).

## 7. Visual Design System
- Define a strong visual system in CSS variables (light/dark):
  - neutral + accent palette (no default purple look).
  - spacing/radius/shadow scale.
  - typography with intentional font pairing.
- Planned UI behavior:
  - smooth page-load reveal.
  - hover/focus transitions on nav and cards.
  - sticky sidebar and sticky top utility strip.
  - code/image/table styles for documentation readability.
- Responsiveness:
  - Desktop: persistent sidebar.
  - Tablet/mobile: hamburger to open/close sidebar drawer + backdrop.

## 8. Theme Switcher
- Add toggle in header.
- Persist mode in `localStorage`.
- Respect system preference on first load.
- Avoid flash of wrong theme using early inline script.

## 9. Content Cleanup Plan (Markdown only)
- Keep instructional meaning intact.
- Perform safe normalization only:
  - remove decorative horizontal-rule overuse where redundant.
  - normalize inconsistent emphasis (`*`, `**`, `***`) where readability suffers.
  - fix obvious grammar/spelling issues without altering procedural intent.
  - remove manual Quick Navigation sections from content files.
  - remove manual previous/next lines from content files.
- Preserve all existing images and links, updating paths only if structure changes.

## 10. Backup Strategy
- Create `backup/` snapshot before overhaul:
  - move current Jekyll/layout/nav files and existing markdown there, or
  - safer: copy full current `docs/` and `README.md` into `backup/YYYY-MM-DD-initial-overhaul/`.
- Recommended approach: **copy** rather than move first, then refactor live files. This keeps rollback simple and avoids broken interim state.

## 11. GitHub Pages Compatibility Notes
- Keep plugin usage GitHub Pages-safe (no custom Ruby plugins).
- Use Liquid templates + client-side JS for dynamic pieces requiring parsing.
- Keep build source as current `docs/` unless you explicitly want a Pages source migration.
- About single homepage file:
  - In default `docs/` source setup, Pages serves `docs/index.md`; root `README.md` is for repository view, not site homepage.
  - So the robust default remains dual files (`README.md` + `docs/index.md`), with synchronization strategy.

## 12. Synchronization Strategy for `README.md` and `docs/index.md`
- Option A (simple): maintain both manually with a short checklist.
- Option B (recommended): keep canonical homepage content in one partial file and include it from both contexts where possible.
  - If include constraints block cross-directory include for `README.md`, fallback to Option A.
- We will implement whichever option is feasible without breaking GitHub rendering.

## 13. Execution Phases
1. Baseline and backup
- Create timestamped backup snapshot.
- Confirm no breaking path assumptions.

2. Foundation setup
- Replace theme config and layout shell.
- Add `site/` asset pipeline (CSS/JS).

3. Dynamic navigation system
- Implement auto sidebar generation.
- Implement auto prev/next pager.

4. Dynamic Quick Navigation
- Implement runtime TOC component and conditional display.

5. Content migration/cleanup
- Add front matter titles where needed.
- Remove hardcoded TOC and pager fragments.
- Apply formatting/grammar normalization pass.

6. Homepage and link consistency
- Resolve `README.md` vs `docs/index.md` strategy.
- Validate relative links for both GitHub and Pages contexts.

7. QA and polish
- Test desktop/mobile layout behavior.
- Test light/dark switching persistence.
- Test nav correctness for ordering and nested folders.
- Validate every guide page renders and links/images work.

## 14. Validation Checklist
- Sidebar is always visible on desktop, drawer on mobile.
- Sidebar items auto-generated from actual `docs/guide/` files.
- Submenus auto-expand for nested chapter folders.
- Previous/next is automatic on all guide pages.
- Quick Navigation auto-appears only when page has `h2+`.
- No hardcoded TOC/pager remains in content markdown.
- Docs readable in both GitHub repo and GitHub Pages.
- Theme switch works and persists.
- No GitHub Pages unsupported plugin usage.

## 15. Clarifications Needed Before Implementation
1. Backup behavior:
- Do you want a full copy backup (`backup/<date>/...`) while keeping current files in place initially (recommended), or a hard move of all current files into `backup/` before creating the new site?

2. Visual direction:
- Which style direction do you prefer?
  - A) Editorial clean (high contrast, understated)
  - B) Tech neon (strong accent, glass panels)
  - C) Minimal enterprise (muted, professional)

3. Typography constraints:
- Is it acceptable to use Google Fonts via CDN, or do you want only system/local fonts (no external font requests)?

4. Markdown grammar cleanup scope:
- Should I fix only obvious grammar/typos, or also rewrite awkward phrasing when meaning is unchanged?

5. `README.md`/`docs/index.md` consistency:
- Do you want me to enforce one canonical source and generate/sync the other via script, or keep both hand-maintained but aligned?

6. Navigation ordering edge case:
- Confirm that alphabetical path order is the authoritative order everywhere (sidebar and previous/next), including if `Updates.md` sorts between numbered chapters.

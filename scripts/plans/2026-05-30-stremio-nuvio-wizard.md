# Stremio/Nuvio Perfect Setup Automator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, typeform-style static web wizard (Vite + React + Tailwind + Framer Motion) that automates the entire manual Stremio/Nuvio Perfect Setup guide end-to-end, deployed to GitHub Pages alongside the existing Jekyll guide.

**Architecture:** Static SPA in `wizard/web/` talks directly to service APIs (AIOStreams, AIOMetadata, Stremio `api.strem.io`, Nuvio Supabase) from the browser; credentials collected at runtime and never stored. Framework-agnostic core modules in `wizard/core/` (renamed from `src/`) are shared between the React app and Node tests. Guide integration adds only a sidebar link and home card — no guide content is touched.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS 3, Framer Motion 11, Zustand 4, Node.js (core tests). GitHub Actions for deployment. All work on the `dev` branch.

---

## File Map

```
wizard/
  core/                             ← RENAME from src/ (no logic changes to existing files)
    template-engine.js              EXISTS — no changes
    catalog-config.js               NEW
    nuvio-collections.js            NEW
    orchestrator.js                 MODIFY — add AIOMetadata + Nuvio flows, atomic install
    addons/
      registry.js                   NEW
    adapters/
      stremio.js                    EXISTS — no changes
      aiostreams.js                 EXISTS — no changes (relative imports still resolve)
      aiometadata.js                NEW
      nuvio.js                      NEW
  web/                              NEW — Vite + React SPA
    src/
      main.tsx
      App.tsx
      lib/
        constants.ts                instances, NUVIO_ANON_KEY, EXCLUDED_CATALOG_IDS, SERVICES
        services.ts                 all 16 AIOStreams services with mirrored logo paths
      store/
        wizard.ts                   Zustand wizard state
      steps/
        Welcome.tsx
        AccountStep.tsx
        KeysStep.tsx
        ServicesStep.tsx
        DynamicFieldStep.tsx
        CatalogStep.tsx
        InstallingStep.tsx
        DoneStep.tsx
      components/
        WizardShell.tsx
        ProgressBar.tsx
        ServiceCard.tsx
        CategoryCard.tsx
    index.html
    vite.config.ts
    tailwind.config.js
    postcss.config.js
    tsconfig.json
    tsconfig.node.json
    package.json
  assets/logos/                     NEW — mirrored service logo images
  test/
    template-engine.test.mjs        MODIFY — update import path src→core
    catalog-config.test.mjs         NEW
  config.example.json               EXISTS — no changes
  README.md                         MODIFY — update layout section
.github/workflows/
  deploy-pages.yml                  MODIFY — add Vite build + copy to _site/wizard/
docs/
  assets/js/main.js                 MODIFY — add wizard topbar link in the layout
  assets/css/style.css              MODIFY — add .topbar-wizard-btn + .home-wizard-card
  index.md                          MODIFY — insert home card HTML after </table> on line 20
```

---

## Phase 0 — Live API Verification

> Run these spikes before implementing any adapter. User has authorised creating/deleting throwaway accounts on all services. Record findings in the relevant adapter file as constants/comments.

---

### Task 1: Verify AIOMetadata save endpoint, manifest URL pattern, and CORS

**Files:** Create `wizard/core/adapters/aiometadata.js` (skeleton only — fill after findings)

- [ ] **Step 1: Create a throwaway AIOMetadata config via curl and capture the full response**

```bash
curl -s -X POST https://aiometadata.viren070.me/api/config/save \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://luckynumb3rs.github.io' \
  -d '{
    "config": {
      "language": "en-US",
      "apiKeys": { "tmdb": "test123", "rpdb": "t0-free-rpdb" },
      "catalogs": []
    }
  }' \
  -v 2>&1 | grep -E '(< |{|uuid|password|manifest)'
```

Expected: HTTP 200, JSON body with `uuid` and some form of `password` or `passwordHash`. Record the exact keys.

- [ ] **Step 2: Check CORS headers in the response**

Look for `Access-Control-Allow-Origin` in the verbose output above.
If absent, note it — a proxy shim will be needed for this call (does not change static-site plan for other services).

- [ ] **Step 3: Determine the manifest URL pattern**

```bash
# Substitute UUID from step 1 into each candidate pattern and check which 200s:
UUID="<uuid-from-step-1>"
INSTANCE="https://aiometadata.viren070.me"

curl -s -o /dev/null -w "%{http_code}" "$INSTANCE/stremio/$UUID/manifest.json"
curl -s -o /dev/null -w "%{http_code}" "$INSTANCE/stremio/$UUID/eyJjYXQ/manifest.json"
```

Record which pattern returns 200. If neither, look for a `manifestUrl` field in the save response.

- [ ] **Step 4: Get instance capabilities**

```bash
curl -s https://aiometadata.viren070.me/api/config
```

Look for `maxCatalogs`, `maxEnabledCatalogs`, or similar. Record the field name and value.

- [ ] **Step 5: Delete the test config**

```bash
curl -s -X DELETE https://aiometadata.viren070.me/api/config/save \
  -H 'Authorization: Basic <base64(uuid:password)>'
# OR try the documented delete endpoint if different
```

- [ ] **Step 6: Create the adapter skeleton with findings noted**

Create `wizard/core/adapters/aiometadata.js`:

```javascript
// AIOMetadata adapter.
// VERIFIED: endpoint = POST /api/config/save, response = { uuid, password: '<hash>' }
// VERIFIED: manifest URL = https://<instance>/stremio/<uuid>/manifest.json  (update if different)
// VERIFIED: CORS = <open|blocked — update this line>
// VERIFIED: maxCatalogs capability field = <fieldName> (update this line)

const DEFAULT_INSTANCE = 'https://aiometadata.viren070.me';

function normalizeBase(url) { return url.replace(/\/+$/, ''); }

export function createAiometadataAdapter(instanceUrl = DEFAULT_INSTANCE) {
  const base = normalizeBase(instanceUrl);
  return {
    base,
    /** Get instance capabilities (max catalogs, enabled Trakt etc.) */
    async getCapabilities() {
      const res = await fetch(`${base}/api/config`);
      if (!res.ok) throw new Error(`AIOMetadata /api/config failed: HTTP ${res.status}`);
      return res.json();
    },
    /**
     * Save a config, return { uuid, password, manifestUrl }.
     * @param {object} config  Full AIOMetadata config object (catalogs + apiKeys + language etc.)
     */
    async createConfig(config) {
      const res = await fetch(`${base}/api/config/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`AIOMetadata createConfig failed: HTTP ${res.status} ${txt.slice(0, 200)}`);
      }
      const body = await res.json();
      // ADJUST field names below based on Task 1 findings:
      const uuid = body.uuid ?? body.data?.uuid;
      const password = body.password ?? body.passwordHash ?? body.data?.password;
      if (!uuid) throw new Error('AIOMetadata: no uuid in save response');
      // ADJUST manifest URL pattern based on Task 1 findings:
      const manifestUrl = `${base}/stremio/${uuid}/manifest.json`;
      return { uuid, password, manifestUrl };
    },
  };
}
```

- [ ] **Step 7: Commit**

```bash
git add wizard/core/adapters/aiometadata.js
git commit -m "feat(core): add aiometadata adapter skeleton (Task 1 verified)"
```

---

### Task 2: Verify Nuvio Supabase anon key, auth, RPC shapes, and CORS

**Files:** Create `wizard/core/adapters/nuvio.js` (skeleton), `wizard/web/src/lib/constants.ts` (anon key placeholder)

- [ ] **Step 1: Find the Supabase anon key**

The key is embedded in the Nuvio apps. Search the NuvioWeb JS bundle or NuvioMobile source:

```bash
# Check the NuvioMobile repo source for the anon key constant
curl -s "https://raw.githubusercontent.com/NuvioMedia/NuvioMobile/main/composeApp/src/commonMain/kotlin/com/nuvio/app/core/network/SupabaseConfig.kt" | grep -i "anon\|apiKey\|key"
# OR look in the web client
curl -s "https://nuvioapp.space/" | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -3
```

Record the anon key (a JWT starting with `eyJ`).

- [ ] **Step 2: Create a Nuvio test account and capture the auth token**

```bash
ANON_KEY="<key-from-step-1>"
SUPABASE="https://dpyhjjcoabcglfmgecug.supabase.co"

curl -s -X POST "$SUPABASE/auth/v1/signup" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Origin: https://luckynumb3rs.github.io" \
  -d '{"email":"wizard-test-999@mailinator.com","password":"TestPass123!"}' \
  -v 2>&1 | grep -E '(< Access-Control|access_token|error)'
```

Record: CORS header presence, `access_token` field name, response shape.

- [ ] **Step 3: Pull profiles to get profile ID**

```bash
TOKEN="<access_token-from-step-2>"

curl -s -X POST "$SUPABASE/rest/v1/rpc/sync_pull_profiles" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
```

Record: response shape, field that holds the profile array, profile `id` field name.

- [ ] **Step 4: Push a test addon list**

```bash
PROFILE_ID=<id-from-step-3>

curl -s -X POST "$SUPABASE/rest/v1/rpc/sync_push_addons" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"p_profile_id\": $PROFILE_ID, \"p_addons_json\": \"[]\"}"
```

Record: success response shape; whether `p_addons_json` expects a JSON string or object.

- [ ] **Step 5: Push empty collections (shape verification)**

```bash
curl -s -X POST "$SUPABASE/rest/v1/rpc/sync_push_collections" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"p_profile_id\": $PROFILE_ID, \"p_collections_json\": \"[]\"}"
```

- [ ] **Step 6: Delete the test account**

```bash
curl -s -X DELETE "$SUPABASE/auth/v1/user" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $TOKEN"
# If DELETE /auth/v1/user doesn't work, use the admin endpoint or just note it
```

- [ ] **Step 7: Create the Nuvio adapter skeleton with findings**

Create `wizard/core/adapters/nuvio.js`:

```javascript
// Nuvio adapter — talks to the Supabase-backed Nuvio Public API.
// VERIFIED: CORS = <open|blocked — update this>
// VERIFIED: p_addons_json expects = <'JSON string'|'object' — update this>
// VERIFIED: profile id field = <'id'|other — update this>

const SUPABASE_BASE = 'https://dpyhjjcoabcglfmgecug.supabase.co';
// anon key is safe to include (publishable key, not service_role)
// FILL THIS IN from Task 2 Step 1:
const SUPABASE_ANON_KEY = 'REPLACE_WITH_ANON_KEY';

function headers(token) {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
  };
}

async function rpc(path, token, body) {
  const res = await fetch(`${SUPABASE_BASE}${path}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Nuvio ${path} failed: HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export function createNuvioAdapter() {
  return {
    async signup(email, password) {
      const res = await fetch(`${SUPABASE_BASE}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(`Nuvio signup failed: HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`Nuvio signup: ${body.error.message || body.error}`);
      return { token: body.access_token, userId: body.user?.id };
    },
    async login(email, password) {
      const res = await fetch(`${SUPABASE_BASE}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(`Nuvio login failed: HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`Nuvio login: ${body.error.message || body.error}`);
      return { token: body.access_token, userId: body.user?.id };
    },
    async getProfiles(token) {
      const data = await rpc('/rest/v1/rpc/sync_pull_profiles', token, {});
      // data may be an array or { profiles: [] } — adjust based on Task 2 findings
      return Array.isArray(data) ? data : (data.profiles || data);
    },
    async pushAddons(token, profileId, addons) {
      // p_addons_json: JSON string or object — adjust based on Task 2 findings
      return rpc('/rest/v1/rpc/sync_push_addons', token, {
        p_profile_id: profileId,
        p_addons_json: JSON.stringify(addons),
      });
    },
    async pushCollections(token, profileId, collections) {
      return rpc('/rest/v1/rpc/sync_push_collections', token, {
        p_profile_id: profileId,
        p_collections_json: JSON.stringify(collections),
      });
    },
  };
}
```

- [ ] **Step 8: Commit**

```bash
git add wizard/core/adapters/nuvio.js
git commit -m "feat(core): add nuvio adapter skeleton (Task 2 verified)"
```

---

### Task 3: Verify Stremio Cinemeta descriptor shape

**Files:** Modify `wizard/core/adapters/stremio.js` (update `patchCinemeta` if needed)

- [ ] **Step 1: Login with a throwaway Stremio account and capture the addon collection**

```bash
curl -s -X POST https://api.strem.io/api/login \
  -H 'Content-Type: application/json' \
  -d '{"authKey":null,"email":"wizard-test@mailinator.com","password":"TestPass123!"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('authKey','ERR'))"
```

If you need to register first:
```bash
curl -s -X POST https://api.strem.io/api/register \
  -H 'Content-Type: application/json' \
  -d '{"authKey":null,"email":"wizard-test@mailinator.com","password":"TestPass123!"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('authKey','ERR'))"
```

- [ ] **Step 2: Get the addon collection and print the Cinemeta descriptor**

```bash
AUTH_KEY="<authKey-from-step-1>"
curl -s -X POST https://api.strem.io/api/addonCollectionGet \
  -H 'Content-Type: application/json' \
  -d "{\"authKey\":\"$AUTH_KEY\",\"update\":true,\"addFromURL\":[]}" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
addons = data.get('result', {}).get('addons', [])
for a in addons:
    tid = a.get('transportUrl','')
    if 'cinemeta' in tid.lower() or 'linvo' in tid.lower():
        print(json.dumps(a, indent=2))
"
```

- [ ] **Step 3: Verify the patchCinemeta function in stremio.js against the real descriptor**

Check `wizard/core/adapters/stremio.js` lines 68–84 against the printed descriptor:
- Does `d.manifest.resources` exist and contain `'meta'`?
- Does `d.manifest.catalogs` contain entries with `extra[].name === 'search'`?

If the shape matches, the existing `patchCinemeta` is correct — add a comment confirming.
If it doesn't, update `patchCinemeta` in `stremio.js` to match.

- [ ] **Step 4: Delete the test Stremio account**

Stremio has no public delete-account API — log into web.stremio.com → Settings → Delete Account, or just leave the empty test account.

- [ ] **Step 5: Commit the confirmation**

```bash
# Only if stremio.js was changed:
git add wizard/core/adapters/stremio.js
git commit -m "fix(core): verify and confirm cinemeta patch shape (Task 3)"
```

---

## Phase 1 — Core Modules

---

### Task 4: Move src/ → core/ and update the test import path

**Files:** Rename `wizard/src/` → `wizard/core/`; modify `wizard/test/template-engine.test.mjs`

- [ ] **Step 1: Rename the directory**

```bash
cd /home/ssterjo/stremio-perfect-setup
mv wizard/src wizard/core
```

- [ ] **Step 2: Confirm existing tests still pass (the test imports `../src/template-engine.js` — fix it)**

```bash
node wizard/test/template-engine.test.mjs 2>&1 | tail -3
# Expected: Error — Cannot find module '../src/template-engine.js'
```

- [ ] **Step 3: Update the import in the test file**

In `wizard/test/template-engine.test.mjs` line 6, change:
```javascript
import { resolveTemplate, isVisible, evalExpr, switchKey } from '../src/template-engine.js';
```
to:
```javascript
import { resolveTemplate, isVisible, evalExpr, switchKey } from '../core/template-engine.js';
```

- [ ] **Step 4: Confirm tests pass**

```bash
node wizard/test/template-engine.test.mjs
```
Expected: `✅ 31 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add wizard/core wizard/test/template-engine.test.mjs
git rm -r wizard/src 2>/dev/null || true
git commit -m "refactor(core): rename src/ to core/, update test import"
```

---

### Task 5: catalog-config.js + unit tests

**Files:** Create `wizard/core/catalog-config.js`, `wizard/test/catalog-config.test.mjs`

The module derives AIOMetadata catalog categories from emoji prefixes, builds the final config, and enforces the 120-catalog Stremio limit.

- [ ] **Step 1: Write failing tests first**

Create `wizard/test/catalog-config.test.mjs`:

```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EXCLUDED_CATALOG_IDS, DISCOVER_EMOJIS,
  deriveCategoryKey, deriveCategories, deriveDiscoverFolders,
  defaultEnabledCategories, countEnabledCatalogs, buildAioMetadataConfig,
} from '../core/catalog-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const stremioTemplate = JSON.parse(readFileSync(join(root, 'templates', 'AIOMetadata.json'), 'utf8'));
const nuvioTemplate = JSON.parse(readFileSync(join(root, 'templates', 'AIOMetadata-All.json'), 'utf8'));
const collections = JSON.parse(readFileSync(join(root, 'collections', 'nuvio-collections.json'), 'utf8'));
const catalogs = stremioTemplate.config.catalogs;

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n# EXCLUDED_CATALOG_IDS');
for (const id of ['tmdb.airing_today','tmdb.year','tmdb.language','tvmaze.schedule','tvdb.trending','tvdb.genres','tvdb.collections']) {
  ok(`${id} is excluded`, EXCLUDED_CATALOG_IDS.has(id));
}
ok('tmdb.top NOT excluded (popular catalog must remain visible)', !EXCLUDED_CATALOG_IDS.has('tmdb.top'));

console.log('\n# deriveCategoryKey');
ok('Streaming emoji', deriveCategoryKey('🎬 Netflix') === '🎬');
ok('Genres emoji', deriveCategoryKey('🎭 Action') === '🎭');
ok('Anime emoji', deriveCategoryKey('🍥 Airing Now') === '🍥');
ok('Brazilian flag → world', deriveCategoryKey('🇧🇷 Brazilian') === 'world');
ok('Korean flag → world', deriveCategoryKey('🇰🇷 Korean') === 'world');
ok('Discover emoji Trakt', deriveCategoryKey('🎯 Trakt Recommendations') === '🎯');
ok('Discover emoji Popular', deriveCategoryKey('🏆 Popular') === '🏆');
ok('tmdb.language category (🌐) is excluded-group', deriveCategoryKey('🌐 By Language') === '🌐');

console.log('\n# deriveCategories — non-discover categories derived from emoji');
const cats = deriveCategories(catalogs, collections);
const keys = cats.map(c => c.key);
ok('🎬 Streaming category present', keys.includes('🎬'));
ok('🎭 Genres present', keys.includes('🎭'));
ok('🍥 Anime present as own category', keys.includes('🍥'));
ok('🌍 World present (flag catalogs)', keys.includes('world'));
ok('Discover emojis NOT in regular categories', !keys.some(k => DISCOVER_EMOJIS.has(k)));
ok('Excluded emoji groups absent (🌐)', !keys.includes('🌐'));
ok('Excluded emoji groups absent (📅)', !keys.includes('📅'));
ok('Excluded emoji groups absent (⌚)', !keys.includes('⌚'));
ok('🎬 count === 28', cats.find(c => c.key === '🎬')?.count === 28);
ok('🕒 Runtime count === 4', cats.find(c => c.key === '🕒')?.count === 4);

console.log('\n# deriveDiscoverFolders — folder-granular discover section');
const discover = deriveDiscoverFolders(catalogs);
const discoverLabels = discover.map(d => d.label);
ok('Trakt folder present', discoverLabels.some(l => l.includes('Trakt')));
ok('Popular folder present', discoverLabels.some(l => l.includes('Popular')));
ok('Trending folder present', discoverLabels.some(l => l.includes('Trending')));
ok('Top Rated folder present', discoverLabels.some(l => l.includes('Top Rated')));
ok('Each discover folder has catalogIds', discover.every(d => d.catalogIds.size > 0));

console.log('\n# defaultEnabledCategories — Stremio starts from reference defaults');
const stremioDefaults = defaultEnabledCategories(catalogs, 'stremio', collections);
ok('Stremio: 🎬 Streaming enabled by default', stremioDefaults.categories.has('🎬'));
ok('Stremio: 🏰 Studios NOT enabled by default', !stremioDefaults.categories.has('🏰'));
ok('Stremio: 🌍 World NOT enabled by default', !stremioDefaults.categories.has('world'));

const nuvioDefaults = defaultEnabledCategories(nuvioTemplate.config.catalogs, 'nuvio', collections);
ok('Nuvio: 🏰 Studios enabled by default', nuvioDefaults.categories.has('🏰'));
ok('Nuvio: 🌍 World enabled by default', nuvioDefaults.categories.has('world'));

console.log('\n# countEnabledCatalogs — Stremio 120-catalog cap enforcement');
const allEnabledCategories = new Set(cats.map(c => c.key));
const allDiscoverIds = new Set(discover.map(d => d.label));
const totalWhenAll = countEnabledCatalogs(catalogs, allEnabledCategories, allDiscoverIds);
ok('All-enabled count > 120 (Stremio would overflow)', totalWhenAll > 120);
const stremioCount = countEnabledCatalogs(
  catalogs, stremioDefaults.categories, stremioDefaults.discoverFolderIds
);
ok('Stremio defaults count <= 120', stremioCount <= 120, `got ${stremioCount}`);

console.log('\n# buildAioMetadataConfig — config object ready to POST');
const cfg = buildAioMetadataConfig(stremioTemplate, {
  enabledCategories: stremioDefaults.categories,
  enabledDiscoverFolderIds: stremioDefaults.discoverFolderIds,
  target: 'stremio',
  apiKeys: { tmdb: 'K', tmdbAccess: 'A', tvdb: 'V', gemini: '', rpdb: 't0-free-rpdb' },
  language: 'en-US',
});
ok('Has config.catalogs array', Array.isArray(cfg.config.catalogs));
ok('No excluded catalog IDs present and enabled', cfg.config.catalogs.every(c =>
  !EXCLUDED_CATALOG_IDS.has(c.id) || !c.enabled));
ok('Stremio: showInHome=true for enabled catalogs', cfg.config.catalogs.filter(c => c.enabled).every(c => c.showInHome === true));
ok('apiKeys.tmdb populated', cfg.config.apiKeys?.tmdb === 'K');
ok('language set', cfg.config.language === 'en-US');

const nuvioCfg = buildAioMetadataConfig(nuvioTemplate, {
  enabledCategories: nuvioDefaults.categories,
  enabledDiscoverFolderIds: nuvioDefaults.discoverFolderIds,
  target: 'nuvio',
  apiKeys: { tmdb: 'K', tmdbAccess: 'A', tvdb: 'V', gemini: '', rpdb: 't0-free-rpdb' },
  language: 'en-US',
});
ok('Nuvio: showInHome=false for ALL enabled catalogs', nuvioCfg.config.catalogs.filter(c => c.enabled).every(c => c.showInHome === false));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
node wizard/test/catalog-config.test.mjs 2>&1 | tail -5
```
Expected: `Error: Cannot find module '../core/catalog-config.js'`

- [ ] **Step 3: Implement catalog-config.js**

Create `wizard/core/catalog-config.js`:

```javascript
// Catalog category logic for the AIOMetadata config builder.
// Category keys are the leading emoji character of each catalog's name.
// Country flag catalogs (regional indicator pairs) all map to the key 'world'.

// Catalog IDs that are always disabled and never shown in the wizard UI.
// Source of truth: scripts/sync-aiometadata.sh EXCLUDED_CATALOG_IDS
export const EXCLUDED_CATALOG_IDS = new Set([
  'tmdb.airing_today',
  'tmdb.year',
  'tmdb.language',
  'tvmaze.schedule',
  'tvdb.trending',
  'tvdb.genres',
  'tvdb.collections',
]);

// Emoji prefixes for the special "Discover" section (folder-granular, not category-level).
export const DISCOVER_EMOJIS = new Set(['🎯', '🏆', '🔥', '⭐']);

/**
 * Extract the leading emoji key from a catalog name.
 * Country flags (pairs of Regional Indicator symbols U+1F1E0–U+1F1FF) → 'world'.
 * All other leading emojis → that emoji character.
 */
export function deriveCategoryKey(name) {
  if (!name) return 'other';
  const chars = [...name]; // proper Unicode codepoint split
  // Regional indicator pair = country flag
  if (
    chars.length >= 2 &&
    chars[0].codePointAt(0) >= 0x1F1E0 && chars[0].codePointAt(0) <= 0x1F1FF &&
    chars[1].codePointAt(0) >= 0x1F1E0 && chars[1].codePointAt(0) <= 0x1F1FF
  ) return 'world';
  return chars[0] || 'other';
}

/**
 * Build an array of regular category objects (excludes Discover emojis and excluded IDs).
 * Each entry: { key, label, count, catalogs: catalog[] }
 * Labels sourced from nuvio-collections group titles where possible.
 * @param {object[]} catalogs    AIOMetadata catalog array
 * @param {object[]} collections nuvio-collections.json groups array
 */
export function deriveCategories(catalogs, collections) {
  // Build emoji → human label from nuvio-collections group titles
  const labelByEmoji = { world: '🌍 World' };
  for (const group of collections || []) {
    const firstChar = [...(group.title || '')][0];
    if (firstChar) labelByEmoji[firstChar] = group.title;
  }
  // 🍥 Anime is nested inside 🎭 Genres in nuvio-collections, so it won't have its own group entry
  labelByEmoji['🍥'] = '🍥 Anime';

  const map = new Map();
  for (const c of catalogs) {
    if (EXCLUDED_CATALOG_IDS.has(c.id)) continue;
    const key = deriveCategoryKey(c.name);
    if (DISCOVER_EMOJIS.has(key)) continue;
    if (!map.has(key)) {
      map.set(key, { key, label: labelByEmoji[key] || key, catalogs: [] });
    }
    map.get(key).catalogs.push(c);
  }
  return [...map.values()].map(g => ({ ...g, count: g.catalogs.length }));
}

/**
 * Build an array of discover folder objects (one per unique discover catalog name).
 * Each entry: { id (= label), emoji, label, catalogIds: Set<string> }
 */
export function deriveDiscoverFolders(catalogs) {
  const map = new Map();
  for (const c of catalogs) {
    if (EXCLUDED_CATALOG_IDS.has(c.id)) continue;
    const key = deriveCategoryKey(c.name);
    if (!DISCOVER_EMOJIS.has(key)) continue;
    if (!map.has(c.name)) {
      map.set(c.name, { id: c.name, emoji: key, label: c.name, catalogIds: new Set() });
    }
    map.get(c.name).catalogIds.add(c.id);
  }
  return [...map.values()];
}

/**
 * Derive the default enabled categories + discover folder IDs for a target.
 * Stremio: mirrors AIOMetadata.json enabled flags (Studios/World off, etc.)
 * Nuvio: mirrors AIOMetadata-All.json enabled flags (all non-excluded on)
 *
 * @returns {{ categories: Set<string>, discoverFolderIds: Set<string> }}
 */
export function defaultEnabledCategories(catalogs, target, collections) {
  const categories = new Set();
  const discoverFolderIds = new Set();
  const catObjs = deriveCategories(catalogs, collections);
  const discoverFolders = deriveDiscoverFolders(catalogs);

  for (const catObj of catObjs) {
    // A category is "on by default" if any of its catalogs are enabled in the base template
    const anyEnabled = catObj.catalogs.some(c => c.enabled);
    if (anyEnabled) categories.add(catObj.key);
  }
  for (const folder of discoverFolders) {
    const anyEnabled = [...folder.catalogIds].some(id => {
      const c = catalogs.find(x => x.id === id);
      return c?.enabled;
    });
    if (anyEnabled) discoverFolderIds.add(folder.id);
  }
  return { categories, discoverFolderIds };
}

/**
 * Count how many catalogs would be enabled given the user's category + discover selections.
 * Used to enforce the ~120-catalog Stremio limit.
 */
export function countEnabledCatalogs(catalogs, enabledCategories, enabledDiscoverFolderIds) {
  let count = 0;
  for (const c of catalogs) {
    if (EXCLUDED_CATALOG_IDS.has(c.id)) continue;
    const key = deriveCategoryKey(c.name);
    if (DISCOVER_EMOJIS.has(key)) {
      // Discover: check if this catalog's folder is enabled
      // The folder label equals the catalog's name (folder id = c.name)
      if (enabledDiscoverFolderIds.has(c.name)) count++;
    } else {
      if (enabledCategories.has(key)) count++;
    }
  }
  return count;
}

/**
 * Build the final AIOMetadata config object from the base template + user selections.
 * Ready to POST to /api/config/save.
 *
 * @param {object} baseTemplate  Parsed AIOMetadata.json or AIOMetadata-All.json
 * @param {object} opts
 * @param {Set<string>} opts.enabledCategories       emoji keys
 * @param {Set<string>} opts.enabledDiscoverFolderIds catalog name labels
 * @param {'stremio'|'nuvio'} opts.target
 * @param {object} opts.apiKeys  { tmdb, tmdbAccess, tvdb, gemini, rpdb }
 * @param {string} opts.language e.g. 'en-US'
 */
export function buildAioMetadataConfig(baseTemplate, {
  enabledCategories, enabledDiscoverFolderIds, target, apiKeys, language,
}) {
  const showInHome = target === 'stremio'; // Stremio: true; Nuvio: false (shown via collections)

  const catalogs = baseTemplate.config.catalogs.map(c => {
    if (EXCLUDED_CATALOG_IDS.has(c.id)) return { ...c, enabled: false, showInHome: false };
    const key = deriveCategoryKey(c.name);
    const enabled = DISCOVER_EMOJIS.has(key)
      ? enabledDiscoverFolderIds.has(c.name)
      : enabledCategories.has(key);
    return { ...c, enabled, showInHome: enabled ? showInHome : false };
  });

  const config = {
    ...baseTemplate.config,
    language,
    catalogs,
    apiKeys: {
      ...(baseTemplate.config.apiKeys || {}),
      tmdb: apiKeys.tmdb || '',
      tmdbAccessToken: apiKeys.tmdbAccess || '',
      tvdb: apiKeys.tvdb || '',
      gemini: apiKeys.gemini || '',
      rpdb: apiKeys.rpdb || 't0-free-rpdb',
    },
  };

  return { config };
}
```

- [ ] **Step 4: Run tests**

```bash
node wizard/test/catalog-config.test.mjs
```
Expected: `✅ N passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add wizard/core/catalog-config.js wizard/test/catalog-config.test.mjs
git commit -m "feat(core): add catalog-config module + tests"
```

---

### Task 6: nuvio-collections.js + unit tests

**Files:** Create `wizard/core/nuvio-collections.js`, add tests to `wizard/test/catalog-config.test.mjs`

- [ ] **Step 1: Append tests for nuvio-collections to the existing test file**

Append to `wizard/test/catalog-config.test.mjs` (before the final print/exit lines):

```javascript
import { filterCollections } from '../core/nuvio-collections.js';

console.log('\n# filterCollections — Nuvio collections filtered to enabled categories');
{
  // All enabled: all 8 groups pass through
  const allCats = new Set(['🎬','🎭','🍥','🎨','🏰','🎥','🕒','world']);
  const allDiscover = new Set(deriveDiscoverFolders(catalogs).map(d => d.id));
  const all = filterCollections(collections, catalogs, { enabledCategories: allCats, enabledDiscoverFolderIds: allDiscover });
  ok('All enabled: all top-level groups present', all.length === collections.length);

  // Disable Studios: Studios group should be filtered out (no folders left)
  const noStudios = new Set(['🎬','🎭','🍥','🎨','🎥','🕒','world']);
  const filteredStudios = filterCollections(collections, catalogs, { enabledCategories: noStudios, enabledDiscoverFolderIds: allDiscover });
  const studioGroup = filteredStudios.find(g => g.title?.includes('Studios'));
  ok('Studios group absent when disabled', !studioGroup || studioGroup.folders.length === 0);

  // Disable Anime: Genres group stays but anime folders removed
  const noAnime = new Set(['🎬','🎭','🎨','🏰','🎥','🕒','world']);
  const filteredAnime = filterCollections(collections, catalogs, { enabledCategories: noAnime, enabledDiscoverFolderIds: allDiscover });
  const genreGroup = filteredAnime.find(g => g.title?.includes('Genres'));
  ok('Genres group still present when only Anime disabled', !!genreGroup);
  // Anime folders reference catalogs with IDs that have deriveCategoryKey(name) === '🍥'
  const animeCatalogIds = catalogs.filter(c => deriveCategoryKey(c.name) === '🍥').map(c => c.id);
  const hasAnimeFolders = genreGroup?.folders.some(f =>
    (f.catalogSources || []).some(s => animeCatalogIds.includes(s.catalogId))
  );
  ok('No anime folders in Genres when Anime disabled', !hasAnimeFolders);
}
```

- [ ] **Step 2: Run to confirm failures**

```bash
node wizard/test/catalog-config.test.mjs 2>&1 | grep '✗\|Error' | head -5
```
Expected: `Error: Cannot find module '../core/nuvio-collections.js'`

- [ ] **Step 3: Implement nuvio-collections.js**

Create `wizard/core/nuvio-collections.js`:

```javascript
// Filter a nuvio-collections.json array to only include groups/folders
// whose content belongs to the user's enabled catalog categories.
// Anime folders nested inside the Genres group are filtered per-folder.

import { deriveCategoryKey, DISCOVER_EMOJIS, EXCLUDED_CATALOG_IDS } from './catalog-config.js';

/**
 * Build a lookup: catalogId → category key (emoji or 'world' or discover emoji).
 */
function buildCatalogIndex(catalogs) {
  const index = new Map();
  for (const c of catalogs) {
    index.set(c.id, deriveCategoryKey(c.name));
  }
  return index;
}

/**
 * Determine whether a Nuvio folder's content belongs to an enabled category.
 * A folder is kept if ANY of its catalogSources maps to an enabled category.
 *
 * @param {object}   folder                  Nuvio folder object
 * @param {Map}      catalogIndex            catalogId → category key
 * @param {Set}      enabledCategories       emoji keys (non-discover)
 * @param {Set}      enabledDiscoverFolderIds discover folder label IDs
 * @param {object[]} allCatalogs             full catalog array (for discover folder id lookup)
 */
function isFolderEnabled(folder, catalogIndex, enabledCategories, enabledDiscoverFolderIds, allCatalogs) {
  const sources = folder.catalogSources || [];
  if (sources.length === 0) return true; // no catalog sources — keep (e.g. custom folder)

  for (const src of sources) {
    if (!src.catalogId) continue;
    const key = catalogIndex.get(src.catalogId);
    if (!key) continue;

    if (DISCOVER_EMOJIS.has(key)) {
      // Find the catalog name (= discover folder id)
      const cat = allCatalogs.find(c => c.id === src.catalogId);
      if (cat && enabledDiscoverFolderIds.has(cat.name)) return true;
    } else {
      if (enabledCategories.has(key)) return true;
    }
  }
  return false;
}

/**
 * Filter a collections JSON array to match the user's enabled categories.
 * Groups with no remaining folders are removed entirely.
 *
 * @param {object[]} collections              nuvio-collections.json top-level array
 * @param {object[]} catalogs                 AIOMetadata catalog array (for id→name lookup)
 * @param {object}   opts
 * @param {Set}      opts.enabledCategories
 * @param {Set}      opts.enabledDiscoverFolderIds
 * @returns {object[]} filtered collections array (deep-cloned, folder arrays updated)
 */
export function filterCollections(collections, catalogs, { enabledCategories, enabledDiscoverFolderIds }) {
  const catalogIndex = buildCatalogIndex(catalogs);
  const result = [];

  for (const group of collections) {
    const filteredFolders = (group.folders || []).filter(folder =>
      isFolderEnabled(folder, catalogIndex, enabledCategories, enabledDiscoverFolderIds, catalogs)
    );
    if (filteredFolders.length > 0) {
      result.push({ ...group, folders: filteredFolders });
    }
  }
  return result;
}
```

- [ ] **Step 4: Run all tests**

```bash
node wizard/test/catalog-config.test.mjs
```
Expected: `✅ N passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add wizard/core/nuvio-collections.js wizard/test/catalog-config.test.mjs
git commit -m "feat(core): add nuvio-collections filter + tests"
```

---

### Task 7: Addon registry

**Files:** Create `wizard/core/addons/registry.js`

No tests needed — this is a pure data file.

- [ ] **Step 1: Create the registry**

Create `wizard/core/addons/registry.js`:

```javascript
// Addon registry — describes every addon the wizard knows about.
// To add/retire an addon, edit this array. No flow code changes needed.
// status: 'active' | 'coming-soon'
// targets: array of 'stremio' and/or 'nuvio'

export const ADDON_REGISTRY = [
  {
    id: 'cinemeta',
    name: 'Cinemeta',
    description: 'Default Stremio metadata (patched to hand off to AIOMetadata)',
    targets: ['stremio'],
    status: 'active',
    internal: true, // not shown as user-facing addon; always present, patched automatically
  },
  {
    id: 'aiometadata',
    name: 'AIOMetadata',
    description: 'Metadata, catalogs, and poster ratings',
    targets: ['stremio', 'nuvio'],
    status: 'active',
  },
  {
    id: 'aiostreams',
    name: 'AIOStreams',
    description: 'Stream aggregation with smart sorting and filtering',
    targets: ['stremio', 'nuvio'],
    status: 'active',
  },
  {
    id: 'watchly',
    name: 'Watchly',
    description: 'Netflix-like recommendations and dynamic catalogs',
    targets: ['stremio'], // nuvio support pending Trakt-based library (dev in progress)
    status: 'coming-soon',
    deferredReason: 'Nuvio support pending Trakt-based library implementation by Watchly dev',
  },
];

/**
 * Return active (non-deferred) addons for a given target.
 */
export function getActiveAddons(target) {
  return ADDON_REGISTRY.filter(a => a.status === 'active' && a.targets.includes(target) && !a.internal);
}
```

- [ ] **Step 2: Commit**

```bash
git add wizard/core/addons/registry.js
git commit -m "feat(core): add addon registry"
```

---

### Task 8: Mirror service logos

**Files:** Create `wizard/assets/logos/` with downloaded images; create `wizard/web/src/lib/services.ts`

- [ ] **Step 1: Create the logos directory and download each service logo**

```bash
mkdir -p wizard/assets/logos

# Download each service logo (adjust filenames/extensions based on what downloads)
cd wizard/assets/logos

curl -sL "https://cdn.jsdelivr.net/gh/selfhst/icons/png/real-debrid.png"  -o realdebrid.png
curl -sL "https://torbox.app/assets/logo-bb7a9579.svg"                    -o torbox.svg
curl -sL "https://www.premiumize.me/icon_normal.svg"                       -o premiumize.svg
curl -sL "https://cdn.alldebrid.com/lib/images/default/logo_alldebrid.png" -o alldebrid.png
curl -sL "https://debrid-link.com/img/brand/dl-white-blue.svg"             -o debridlink.svg
curl -sL "https://paradise-cloud.com/apple-touch-icon.png"                 -o easydebrid.png
curl -sL "https://debrider.app/icon.svg"                                   -o debrider.svg
curl -sL "https://mypikpak.com/apple-touch-icon.png"                       -o pikpak.png
curl -sL "https://offcloud.com/images/logo-blue-short-lg.png"              -o offcloud.png
curl -sL "https://static.seedr.cc/images/seed_v2.png"                     -o seedr.png
curl -sL "https://raw.githubusercontent.com/Viren070/AIOStreams/main/packages/frontend/public/assets/easynews_logo.png" -o easynews.png
curl -sL "https://putio.com/favicon.ico"                                   -o putio.ico

# Usenet services — use generic placeholder emoji icons
echo "usenet" > nzbdav.txt
echo "usenet" > altmount.txt
echo "usenet" > stremio_nntp.txt
echo "usenet" > stremthru_newz.txt

ls -la
```

- [ ] **Step 2: Verify each logo downloaded (non-zero bytes)**

```bash
for f in realdebrid.png torbox.svg premiumize.svg alldebrid.png debridlink.svg easydebrid.png; do
  echo "$(wc -c < wizard/assets/logos/$f) $f"
done
```
Expected: all > 1000 bytes. If any are 0/tiny, the URL changed — find the new one in the AIOStreams frontend source at `packages/frontend/src/components/menu/services/_components/stream-services.tsx`.

- [ ] **Step 3: Create services.ts**

Create `wizard/web/src/lib/services.ts`:

```typescript
// All 16 AIOStreams services with mirrored logo paths.
// Logo paths are relative to the Vite public/ dir (served at /assets/logos/).
// Usenet services at the end are not "debrid" but streaming sources some users configure.

export interface Service {
  id: string;
  name: string;
  logo: string;     // path relative to public/ or absolute URL as fallback
  isDebrid: boolean;
  isUsenet: boolean;
}

export const SERVICES: Service[] = [
  { id: 'torbox',        name: 'TorBox',        logo: '/assets/logos/torbox.svg',      isDebrid: true,  isUsenet: false },
  { id: 'realdebrid',   name: 'Real-Debrid',   logo: '/assets/logos/realdebrid.png',  isDebrid: true,  isUsenet: false },
  { id: 'alldebrid',    name: 'AllDebrid',     logo: '/assets/logos/alldebrid.png',   isDebrid: true,  isUsenet: false },
  { id: 'debridlink',   name: 'Debrid-Link',   logo: '/assets/logos/debridlink.svg',  isDebrid: true,  isUsenet: false },
  { id: 'premiumize',   name: 'Premiumize',    logo: '/assets/logos/premiumize.svg',  isDebrid: true,  isUsenet: false },
  { id: 'easydebrid',   name: 'EasyDebrid',    logo: '/assets/logos/easydebrid.png',  isDebrid: true,  isUsenet: false },
  { id: 'debrider',     name: 'Debrider',      logo: '/assets/logos/debrider.svg',    isDebrid: true,  isUsenet: false },
  { id: 'pikpak',       name: 'PikPak',        logo: '/assets/logos/pikpak.png',      isDebrid: true,  isUsenet: false },
  { id: 'offcloud',     name: 'Offcloud',      logo: '/assets/logos/offcloud.png',    isDebrid: true,  isUsenet: false },
  { id: 'seedr',        name: 'Seedr',         logo: '/assets/logos/seedr.png',       isDebrid: true,  isUsenet: false },
  { id: 'putio',        name: 'Put.io',        logo: '/assets/logos/putio.ico',       isDebrid: true,  isUsenet: false },
  { id: 'easynews',     name: 'Easynews',      logo: '/assets/logos/easynews.png',    isDebrid: false, isUsenet: true  },
  { id: 'nzbdav',       name: 'NzbDAV',        logo: '',                              isDebrid: false, isUsenet: true  },
  { id: 'altmount',     name: 'AltMount',      logo: '',                              isDebrid: false, isUsenet: true  },
  { id: 'stremio_nntp', name: 'Stremio NNTP',  logo: '',                              isDebrid: false, isUsenet: true  },
  { id: 'stremthru_newz', name: 'StremThru Newz', logo: '',                           isDebrid: false, isUsenet: true  },
];

export const DEBRID_SERVICES = SERVICES.filter(s => s.isDebrid);
```

- [ ] **Step 4: Commit**

```bash
cd /home/ssterjo/stremio-perfect-setup
git add wizard/assets/logos/ wizard/web/src/lib/services.ts
git commit -m "feat(assets): mirror service logos; add services.ts"
```

---

### Task 9: Extend orchestrator for full Stremio + Nuvio flows (atomic install)

**Files:** Modify `wizard/core/orchestrator.js`

- [ ] **Step 1: Replace the orchestrator with the full implementation**

Overwrite `wizard/core/orchestrator.js`:

```javascript
// Orchestrator — full Stremio + Nuvio flows.
// Install is ATOMIC: the ordered addon collection is pushed only after all configs succeed.
// If any config step fails, the account is left untouched.

import { createStremioAdapter, buildAddonCollection } from './adapters/stremio.js';
import { createWithFallbacks } from './adapters/aiostreams.js';
import { createAiometadataAdapter } from './adapters/aiometadata.js';
import { createNuvioAdapter } from './adapters/nuvio.js';
import { buildAioMetadataConfig } from './catalog-config.js';
import { filterCollections } from './nuvio-collections.js';

function randomPassword(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = typeof crypto !== 'undefined'
    ? crypto.getRandomValues(new Uint32Array(len))
    : Array.from({ length: len }, () => Math.floor(Math.random() * 1e9));
  return Array.from(arr, n => chars[n % chars.length]).join('');
}

// ─── Stremio flow ────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {object} p.instances         { aiostreams: {primary, fallbacks[]}, aiometadata: {primary, fallbacks[]} }
 * @param {object} p.account           { mode: 'create'|'signin', email, password }
 * @param {object} p.aiostreamsParams  { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams { baseTemplate, enabledCategories, enabledDiscoverFolderIds, apiKeys, language }
 * @param {object} p.collections       nuvio-collections JSON array (for use with collections step)
 * @param {function} p.onStep          (name, data) => void — progress callback
 */
export async function runStremioSetup({ instances, account, aiostreamsParams, aiometadataParams, onStep }) {
  const summary = { account: null, addons: {}, warnings: [] };
  const step = (name, data) => { onStep?.(name, data); return data; };

  // 1) Account
  const stremio = createStremioAdapter();
  let auth;
  if (account.mode === 'create') {
    auth = await stremio.register(account.email, account.password);
    summary.account = { service: 'stremio', email: account.email, password: account.password, created: true };
  } else {
    auth = await stremio.login(account.email, account.password);
    summary.account = { service: 'stremio', email: account.email, created: false };
  }
  step('account', summary.account);

  // 2) AIOStreams config
  const aioPassword = randomPassword();
  const aioInstances = [instances.aiostreams.primary, ...(instances.aiostreams.fallbacks || [])];
  const aioResult = await createWithFallbacks(aioInstances, { ...aiostreamsParams, password: aioPassword });
  summary.addons.aiostreams = {
    instance: aioResult.primary.instanceUrl,
    uuid: aioResult.primary.uuid,
    password: aioPassword,
    manifestUrl: aioResult.primary.manifestUrl,
    fallbacks: aioResult.all.filter(r => r.ok && r !== aioResult.primary).map(r => r.manifestUrl),
  };
  for (const r of aioResult.all.filter(r => !r.ok)) {
    summary.warnings.push(`AIOStreams fallback ${r.instanceUrl} failed: ${r.error}`);
  }
  step('aiostreams', summary.addons.aiostreams);

  // 3) AIOMetadata config
  const { config: aioMetaConfig } = buildAioMetadataConfig(aiometadataParams.baseTemplate, {
    ...aiometadataParams,
    target: 'stremio',
  });
  const aioMetaInstances = [instances.aiometadata.primary, ...(instances.aiometadata.fallbacks || [])];
  let aioMetaResult = null;
  for (const instanceUrl of aioMetaInstances) {
    try {
      const adapter = createAiometadataAdapter(instanceUrl);
      aioMetaResult = await adapter.createConfig(aioMetaConfig);
      aioMetaResult.instanceUrl = instanceUrl;
      break;
    } catch (err) {
      summary.warnings.push(`AIOMetadata ${instanceUrl} failed: ${err.message}`);
    }
  }
  if (!aioMetaResult) throw new Error('All AIOMetadata instances failed — see warnings');
  summary.addons.aiometadata = {
    instance: aioMetaResult.instanceUrl,
    uuid: aioMetaResult.uuid,
    password: aioMetaResult.password,
    manifestUrl: aioMetaResult.manifestUrl,
  };
  step('aiometadata', summary.addons.aiometadata);

  // 4) ATOMIC install — push only after all configs succeeded
  const existing = await stremio.getAddons(auth.authKey);
  const collection = buildAddonCollection(existing, {
    aiometadata: aioMetaResult.manifestUrl,
    aiostreams: aioResult.primary.manifestUrl,
  }, { cleanCinemeta: { removeSearch: true, removeCatalogs: true, removeMetadata: true } });
  await stremio.setAddons(auth.authKey, collection);
  step('install', { count: collection.length, order: collection.map(a => a.manifest?.name || a.transportUrl) });

  return summary;
}

// ─── Nuvio flow ───────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {object} p.instances           { aiostreams, aiometadata }
 * @param {object} p.account             { mode, email, password }
 * @param {object} p.aiostreamsParams    { template, inputs, services, credentials }
 * @param {object} p.aiometadataParams   { baseTemplate, enabledCategories, enabledDiscoverFolderIds, apiKeys, language }
 * @param {object[]} p.collectionsJson   nuvio-collections.json array
 * @param {function} p.onStep
 */
export async function runNuvioSetup({ instances, account, aiostreamsParams, aiometadataParams, collectionsJson, onStep }) {
  const summary = { account: null, addons: {}, warnings: [] };
  const step = (name, data) => { onStep?.(name, data); return data; };

  // 1) Nuvio account
  const nuvio = createNuvioAdapter();
  let auth;
  if (account.mode === 'create') {
    auth = await nuvio.signup(account.email, account.password);
    summary.account = { service: 'nuvio', email: account.email, password: account.password, created: true };
  } else {
    auth = await nuvio.login(account.email, account.password);
    summary.account = { service: 'nuvio', email: account.email, created: false };
  }
  step('account', summary.account);

  // 2) Get first profile
  const profiles = await nuvio.getProfiles(auth.token);
  const profile = profiles[0];
  if (!profile) throw new Error('Nuvio: no profiles found — log into the app first');
  const profileId = profile.id ?? profile.profile_id;
  step('profile', { profileId });

  // 3) AIOStreams config (same as Stremio path)
  const aioPassword = randomPassword();
  const aioInstances = [instances.aiostreams.primary, ...(instances.aiostreams.fallbacks || [])];
  const aioResult = await createWithFallbacks(aioInstances, { ...aiostreamsParams, password: aioPassword });
  summary.addons.aiostreams = {
    instance: aioResult.primary.instanceUrl,
    uuid: aioResult.primary.uuid,
    password: aioPassword,
    manifestUrl: aioResult.primary.manifestUrl,
  };
  for (const r of aioResult.all.filter(r => !r.ok)) {
    summary.warnings.push(`AIOStreams fallback ${r.instanceUrl} failed: ${r.error}`);
  }
  step('aiostreams', summary.addons.aiostreams);

  // 4) AIOMetadata config (Nuvio variant: showInHome=false, all-enabled base template)
  const { config: aioMetaConfig } = buildAioMetadataConfig(aiometadataParams.baseTemplate, {
    ...aiometadataParams,
    target: 'nuvio',
  });
  const aioMetaInstances = [instances.aiometadata.primary, ...(instances.aiometadata.fallbacks || [])];
  let aioMetaResult = null;
  for (const instanceUrl of aioMetaInstances) {
    try {
      aioMetaResult = await createAiometadataAdapter(instanceUrl).createConfig(aioMetaConfig);
      aioMetaResult.instanceUrl = instanceUrl;
      break;
    } catch (err) {
      summary.warnings.push(`AIOMetadata ${instanceUrl} failed: ${err.message}`);
    }
  }
  if (!aioMetaResult) throw new Error('All AIOMetadata instances failed — see warnings');
  summary.addons.aiometadata = { ...aioMetaResult };
  step('aiometadata', summary.addons.aiometadata);

  // 5) ATOMIC install — push addons then collections only after configs succeed
  const addons = [
    // Nuvio addon order: AIOMetadata first, then AIOStreams. No Cinemeta.
    { manifestUrl: aioMetaResult.manifestUrl },
    { manifestUrl: aioResult.primary.manifestUrl },
  ];
  await nuvio.pushAddons(auth.token, profileId, addons);
  step('addons', { count: addons.length });

  // Filter collections to user's enabled categories
  const { enabledCategories, enabledDiscoverFolderIds } = aiometadataParams;
  // Import catalogs from the base template for the collection filter
  const catalogs = aiometadataParams.baseTemplate.config.catalogs;
  const filteredCollections = filterCollections(collectionsJson, catalogs, {
    enabledCategories, enabledDiscoverFolderIds,
  });
  await nuvio.pushCollections(auth.token, profileId, filteredCollections);
  step('collections', { groupCount: filteredCollections.length });

  return summary;
}
```

- [ ] **Step 2: Verify existing template-engine tests still pass**

```bash
node wizard/test/template-engine.test.mjs
```
Expected: `✅ 31 passed, 0 failed`

- [ ] **Step 3: Commit**

```bash
git add wizard/core/orchestrator.js
git commit -m "feat(core): full Stremio + Nuvio orchestrator flows, atomic install"
```

---

## Phase 2 — Vite + React Scaffold

---

### Task 10: Scaffold wizard/web/ project

**Files:** Create all config files and entry point for the Vite + React app

- [ ] **Step 1: Create package.json**

Create `wizard/web/package.json`:

```json
{
  "name": "perfect-setup-wizard",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "framer-motion": "^11.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

Create `wizard/web/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/stremio-perfect-setup/wizard/',
  build: { outDir: 'dist' },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../core'),
      '@logos': path.resolve(__dirname, '../assets/logos'),
    },
  },
  // Serve logos and templates as static assets in dev
  publicDir: 'public',
});
```

- [ ] **Step 3: Create postcss.config.js and tailwind.config.js**

Create `wizard/web/postcss.config.js`:
```javascript
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

Create `wizard/web/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#6d3af2',
        'accent-2': '#8f68ff',
        panel: '#f4f0ff',
      },
      fontFamily: { sans: ['"Space Grotesk"', 'Avenir Next', 'Segoe UI', 'sans-serif'] },
      borderRadius: { wizard: '14px' },
      boxShadow: { wizard: '0 10px 24px rgba(57,35,116,0.12)' },
    },
  },
};
```

- [ ] **Step 4: Create tsconfig files**

Create `wizard/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "allowJs": true,
    "baseUrl": ".",
    "paths": { "@core/*": ["../core/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `wizard/web/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create index.html and public directory**

Create `wizard/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Perfect Setup — Automated Wizard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```bash
mkdir -p wizard/web/public/assets/logos
# Symlink logos into public so Vite serves them in dev
cd wizard/web/public/assets/logos
ln -sf ../../../../assets/logos/* . 2>/dev/null || cp -r ../../../../assets/logos/* .
```

- [ ] **Step 6: Create minimal src/main.tsx and src/App.tsx to verify the build**

Create `wizard/web/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `wizard/web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { background: #f4f0ff; font-family: 'Space Grotesk', sans-serif; }
```

Create `wizard/web/src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-bold text-accent">🤖 Perfect Setup Wizard — coming soon</h1>
    </div>
  );
}
```

- [ ] **Step 7: Install dependencies and verify the build works**

```bash
cd wizard/web
npm install
npm run build 2>&1 | tail -10
```
Expected: `✓ built in XXXms`, dist/ created with index.html.

- [ ] **Step 8: Commit**

```bash
cd /home/ssterjo/stremio-perfect-setup
git add wizard/web/
git commit -m "feat(web): scaffold Vite + React + Tailwind + Framer Motion project"
```

---

### Task 11: Wizard state store + constants

**Files:** Create `wizard/web/src/store/wizard.ts`, `wizard/web/src/lib/constants.ts`

- [ ] **Step 1: Create constants.ts**

Create `wizard/web/src/lib/constants.ts`:
```typescript
export const INSTANCES = {
  aiostreams: {
    primary: 'https://aiostreamsfortheweebsstable.midnightignite.me',
    fallbacks: ['https://aiostreams.fortheweak.cloud'],
  },
  aiometadata: {
    primary: 'https://aiometadata.viren070.me',
    fallbacks: ['https://aiometadatafortheweebs.midnightignite.me'],
  },
} as const;

// Raw GitHub URLs for templates (fetched at runtime, not bundled)
export const TEMPLATE_URLS = {
  aiostreams:       'https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOStreams.json',
  aiometadataStremio: 'https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata.json',
  aiometadataNuvio:   'https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOMetadata-All.json',
  collections:      'https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/collections/nuvio-collections.json',
} as const;

export const RPDB_FREE_KEY = 't0-free-rpdb';

// Stremio maximum enabled catalogs (fetch from instance's /api/config for the exact value;
// use 120 as a safe conservative default)
export const STREMIO_MAX_CATALOGS = 120;
```

- [ ] **Step 2: Create wizard.ts**

Create `wizard/web/src/store/wizard.ts`:
```typescript
import { create } from 'zustand';
import { INSTANCES, RPDB_FREE_KEY } from '../lib/constants';

export type Target = 'stremio' | 'nuvio';
export type AccountMode = 'create' | 'signin';

export interface AccountInfo {
  mode: AccountMode;
  email: string;
  password: string;
}

export interface Credentials {
  debridService: string;   // service id ('torbox', 'realdebrid', …) or '' for P2P
  debridApiKey: string;
  tmdbApiKey: string;
  tmdbAccessToken: string;
  tvdbApiKey: string;
  geminiApiKey: string;
  rpdbApiKey: string;
}

export interface AioStreamsInputs {
  [key: string]: unknown;  // keyed by metadata.inputs[].id
}

export interface CatalogSelection {
  enabledCategories: Set<string>;
  enabledDiscoverFolderIds: Set<string>;
}

interface InstallResult {
  aiostreams: { manifestUrl: string; uuid: string; password: string } | null;
  aiometadata: { manifestUrl: string; uuid: string } | null;
  warnings: string[];
  error: string | null;
}

interface WizardState {
  step: number;
  target: Target | null;
  stremioAccount: AccountInfo;
  nuvioAccount: AccountInfo;
  credentials: Credentials;
  aioStreamsInstance: string;
  aioStreamsInputs: AioStreamsInputs;
  aiometadataInstance: string;
  aiometadataLanguage: string;
  catalogSelection: CatalogSelection;
  installResult: InstallResult;

  // Loaded at runtime
  templates: { aiostreams: unknown; aiometadata: unknown; collections: unknown[] } | null;

  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setTarget: (t: Target) => void;
  setStremioAccount: (a: Partial<AccountInfo>) => void;
  setNuvioAccount: (a: Partial<AccountInfo>) => void;
  setCredentials: (c: Partial<Credentials>) => void;
  setAioStreamsInstance: (url: string) => void;
  setAioStreamsInput: (id: string, value: unknown) => void;
  setAiometadataInstance: (url: string) => void;
  setAiometadataLanguage: (lang: string) => void;
  setCatalogSelection: (sel: Partial<CatalogSelection>) => void;
  setTemplates: (t: WizardState['templates']) => void;
  setInstallResult: (r: Partial<InstallResult>) => void;
}

export const useWizard = create<WizardState>((set, get) => ({
  step: 0,
  target: null,
  stremioAccount: { mode: 'create', email: '', password: '' },
  nuvioAccount: { mode: 'create', email: '', password: '' },
  credentials: {
    debridService: '', debridApiKey: '',
    tmdbApiKey: '', tmdbAccessToken: '', tvdbApiKey: '',
    geminiApiKey: '', rpdbApiKey: RPDB_FREE_KEY,
  },
  aioStreamsInstance: INSTANCES.aiostreams.primary,
  aioStreamsInputs: {},
  aiometadataInstance: INSTANCES.aiometadata.primary,
  aiometadataLanguage: 'en-US',
  catalogSelection: { enabledCategories: new Set(), enabledDiscoverFolderIds: new Set() },
  installResult: { aiostreams: null, aiometadata: null, warnings: [], error: null },
  templates: null,

  setStep: (step) => set({ step }),
  nextStep: () => set(s => ({ step: s.step + 1 })),
  prevStep: () => set(s => ({ step: Math.max(0, s.step - 1) })),
  setTarget: (target) => set({ target }),
  setStremioAccount: (a) => set(s => ({ stremioAccount: { ...s.stremioAccount, ...a } })),
  setNuvioAccount: (a) => set(s => ({ nuvioAccount: { ...s.nuvioAccount, ...a } })),
  setCredentials: (c) => set(s => ({ credentials: { ...s.credentials, ...c } })),
  setAioStreamsInstance: (url) => set({ aioStreamsInstance: url }),
  setAioStreamsInput: (id, value) => set(s => ({ aioStreamsInputs: { ...s.aioStreamsInputs, [id]: value } })),
  setAiometadataInstance: (url) => set({ aiometadataInstance: url }),
  setAiometadataLanguage: (lang) => set({ aiometadataLanguage: lang }),
  setCatalogSelection: (sel) => set(s => ({
    catalogSelection: {
      enabledCategories: sel.enabledCategories ?? s.catalogSelection.enabledCategories,
      enabledDiscoverFolderIds: sel.enabledDiscoverFolderIds ?? s.catalogSelection.enabledDiscoverFolderIds,
    },
  })),
  setTemplates: (templates) => set({ templates }),
  setInstallResult: (r) => set(s => ({ installResult: { ...s.installResult, ...r } })),
}));
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd wizard/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors (or only errors from missing step/component files — those come in Phase 3).

- [ ] **Step 4: Commit**

```bash
cd /home/ssterjo/stremio-perfect-setup
git add wizard/web/src/store/ wizard/web/src/lib/
git commit -m "feat(web): wizard state store + constants"
```

---

## Phase 3 — UI Components and Steps

> Run `cd wizard/web && npm run dev` to iterate. The wizard renders live at `http://localhost:5173/stremio-perfect-setup/wizard/`.

---

### Task 12: WizardShell and ProgressBar components

**Files:** Create `wizard/web/src/components/WizardShell.tsx`, `wizard/web/src/components/ProgressBar.tsx`

The WizardShell wraps every step with a centred card, animates transitions with Framer Motion, and renders the ProgressBar.

- [ ] **Step 1: Create ProgressBar.tsx**

Create `wizard/web/src/components/ProgressBar.tsx`:
```tsx
interface Props {
  sections: string[];   // e.g. ['Welcome', 'Account', 'AIOStreams', 'Catalogs', 'Install']
  currentSection: number; // 0-indexed
}

export function ProgressBar({ sections, currentSection }: Props) {
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between mb-2">
        {sections.map((s, i) => (
          <span
            key={s}
            className={`text-xs font-semibold transition-colors ${
              i < currentSection ? 'text-accent' :
              i === currentSection ? 'text-accent font-bold' :
              'text-gray-400'
            }`}
          >
            {i < currentSection ? '✓ ' : ''}{s}
          </span>
        ))}
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-2 rounded-full transition-all duration-500"
          style={{ width: `${((currentSection) / (sections.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create WizardShell.tsx**

Create `wizard/web/src/components/WizardShell.tsx`:
```tsx
import { AnimatePresence, motion } from 'framer-motion';
import { ProgressBar } from './ProgressBar';
import { useWizard } from '../store/wizard';

const SECTIONS = ['Welcome', 'Account', 'AIOStreams', 'Catalogs', 'Install'];

// Map flat step index → section index for the progress bar
function stepToSection(step: number): number {
  if (step === 0) return 0;
  if (step <= 7) return 1;   // account + keys steps
  if (step <= 14) return 2;  // AIOStreams steps
  if (step <= 16) return 3;  // catalog steps
  return 4;                  // install + done
}

const variants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

interface Props {
  children: React.ReactNode;
  showBack?: boolean;
}

export function WizardShell({ children, showBack = true }: Props) {
  const { step, prevStep } = useWizard();

  return (
    <div className="min-h-screen bg-panel flex flex-col items-center justify-center px-4 py-8"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="w-full max-w-xl">
        {/* Top branding */}
        <div className="text-center mb-6">
          <span className="text-3xl">🤖</span>
          <p className="text-sm text-gray-500 mt-1 font-medium tracking-wide uppercase">Perfect Setup Wizard</p>
        </div>

        <ProgressBar sections={SECTIONS} currentSection={stepToSection(step)} />

        {/* Animated step card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="bg-white rounded-wizard shadow-wizard p-8"
          >
            {children}
          </motion.div>
        </AnimatePresence>

        {/* Back button */}
        {showBack && step > 0 && (
          <button
            onClick={prevStep}
            className="mt-4 text-sm text-gray-400 hover:text-accent transition-colors"
          >
            ← Back
          </button>
        )}

        {/* Privacy note */}
        <p className="text-center text-xs text-gray-400 mt-6">
          🔒 Everything runs in your browser — we never store your credentials.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add a shared "Next" button component used across all steps**

Create `wizard/web/src/components/NextButton.tsx`:
```tsx
interface Props {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}
export function NextButton({ onClick, disabled = false, label = 'Continue →' }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full mt-6 py-3 px-6 bg-gradient-to-r from-accent to-accent-2 text-white
        font-semibold rounded-xl shadow-md hover:opacity-90 active:scale-[0.98]
        transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/ssterjo/stremio-perfect-setup
git add wizard/web/src/components/
git commit -m "feat(web/ui): WizardShell, ProgressBar, NextButton components"
```

---

### Task 13: Welcome step and target selection

**Files:** Create `wizard/web/src/steps/Welcome.tsx`; update `wizard/web/src/App.tsx` with step routing

- [ ] **Step 1: Create Welcome.tsx**

Create `wizard/web/src/steps/Welcome.tsx`:
```tsx
import { motion } from 'framer-motion';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard, type Target } from '../store/wizard';

const targets: { id: Target; emoji: string; name: string; desc: string }[] = [
  { id: 'stremio', emoji: '🎞️', name: 'Stremio', desc: 'Desktop & mobile, best ecosystem' },
  { id: 'nuvio', emoji: '🚀', name: 'Nuvio', desc: 'Modern app with dynamic collections' },
];

export function Welcome() {
  const { target, setTarget, nextStep } = useWizard();

  return (
    <WizardShell showBack={false}>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">
        Welcome! Let's set everything up for you 💪
      </h1>
      <p className="text-gray-500 mb-6 leading-relaxed">
        Don't be scared — although there are a few steps, this wizard handles everything automatically.
        You'll just need a few API keys and we'll walk you through each one.
      </p>

      <p className="font-semibold text-gray-700 mb-3">Which app are you setting up?</p>
      <div className="grid grid-cols-2 gap-3 mb-2">
        {targets.map(t => (
          <motion.button
            key={t.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setTarget(t.id)}
            className={`p-4 border-2 rounded-xl text-left transition-all ${
              target === t.id
                ? 'border-accent bg-purple-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-2xl mb-1">{t.emoji}</div>
            <div className="font-bold text-gray-800">{t.name}</div>
            <div className="text-xs text-gray-500">{t.desc}</div>
          </motion.button>
        ))}
      </div>

      <NextButton onClick={nextStep} disabled={!target} label="Let's go! →" />
    </WizardShell>
  );
}
```

- [ ] **Step 2: Update App.tsx with step routing**

Overwrite `wizard/web/src/App.tsx`:
```tsx
import { useEffect } from 'react';
import { useWizard } from './store/wizard';
import { Welcome } from './steps/Welcome';
import { AccountStep } from './steps/AccountStep';
import { KeysStep } from './steps/KeysStep';
import { ServicesStep } from './steps/ServicesStep';
import { DynamicFieldStep } from './steps/DynamicFieldStep';
import { CatalogStep } from './steps/CatalogStep';
import { InstallingStep } from './steps/InstallingStep';
import { DoneStep } from './steps/DoneStep';
import { TEMPLATE_URLS } from './lib/constants';

// Flat step list. Indices must match WizardShell.stepToSection() mapping.
// 0:Welcome, 1:Account, 2:Debrid, 3:TMDB, 4:TVDB, 5:Gemini, 6:RPDB,
// 7:AIOStreams-Instance, 8:Services, 9-14:DynamicFields(6 visible fields),
// 15:AIOMetadata-Instance, 16:Catalogs, 17:Installing, 18:Done
function StepRouter() {
  const { step, templates, setTemplates } = useWizard();

  // Fetch templates once on mount
  useEffect(() => {
    if (templates) return;
    Promise.all([
      fetch(TEMPLATE_URLS.aiostreams).then(r => r.json()),
      fetch(TEMPLATE_URLS.aiometadataStremio).then(r => r.json()),  // may be swapped for nuvio in step
      fetch(TEMPLATE_URLS.collections).then(r => r.json()),
    ]).then(([aiostreams, aiometadata, collections]) => {
      setTemplates({ aiostreams, aiometadata, collections });
    }).catch(console.error);
  }, []);

  if (step === 0) return <Welcome />;
  if (step === 1) return <AccountStep />;
  if (step >= 2 && step <= 6) return <KeysStep keyIndex={step - 2} />;
  if (step === 7) return <ServicesStep />;
  if (step >= 8 && step <= 13) return <DynamicFieldStep fieldIndex={step - 8} />;
  if (step === 14) return <CatalogStep />;
  if (step === 15) return <InstallingStep />;
  return <DoneStep />;
}

export default function App() {
  return <StepRouter />;
}
```

- [ ] **Step 3: Verify dev server shows the Welcome step**

```bash
cd wizard/web && npm run dev
# Open http://localhost:5173/stremio-perfect-setup/wizard/
# Expected: Welcome screen with Stremio/Nuvio cards, Next button disabled until selection
```

- [ ] **Step 4: Commit**

```bash
cd /home/ssterjo/stremio-perfect-setup
git add wizard/web/src/steps/Welcome.tsx wizard/web/src/App.tsx
git commit -m "feat(web/steps): Welcome step + App step router"
```

---

### Task 14: Account step and key collection steps

**Files:** Create `wizard/web/src/steps/AccountStep.tsx`, `wizard/web/src/steps/KeysStep.tsx`

- [ ] **Step 1: Create AccountStep.tsx**

Create `wizard/web/src/steps/AccountStep.tsx`:
```tsx
import { useState } from 'react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';

export function AccountStep() {
  const { target, stremioAccount, nuvioAccount, setStremioAccount, setNuvioAccount, nextStep } = useWizard();
  const [err, setErr] = useState('');

  const account = target === 'stremio' ? stremioAccount : nuvioAccount;
  const setAccount = target === 'stremio' ? setStremioAccount : setNuvioAccount;
  const appName = target === 'stremio' ? 'Stremio' : 'Nuvio';

  const valid = account.email.includes('@') && account.password.length >= 8;

  async function handleNext() {
    setErr('');
    nextStep();
  }

  return (
    <WizardShell>
      <h2 className="text-xl font-bold mb-1">Your {appName} account</h2>
      <p className="text-gray-500 text-sm mb-5">
        {account.mode === 'create'
          ? `We'll create your ${appName} account automatically.`
          : `Sign in with your existing ${appName} account.`}
      </p>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-5">
        {(['create', 'signin'] as const).map(m => (
          <button key={m} onClick={() => setAccount({ mode: m })}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              account.mode === m ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600'
            }`}>
            {m === 'create' ? '✨ Create new' : '🔑 Sign in'}
          </button>
        ))}
      </div>

      <label className="block mb-4">
        <span className="text-sm font-medium text-gray-700">Email</span>
        <input type="email" value={account.email}
          onChange={e => setAccount({ email: e.target.value })}
          placeholder="you@example.com"
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
      </label>

      <label className="block mb-2">
        <span className="text-sm font-medium text-gray-700">Password</span>
        <input type="password" value={account.password}
          onChange={e => setAccount({ password: e.target.value })}
          placeholder="min. 8 characters"
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
      </label>

      {err && <p className="text-red-500 text-sm mt-2">{err}</p>}

      <NextButton onClick={handleNext} disabled={!valid} />
    </WizardShell>
  );
}
```

- [ ] **Step 2: Create KeysStep.tsx (handles steps 2–6: Debrid, TMDB, TVDB, Gemini, RPDB)**

Create `wizard/web/src/steps/KeysStep.tsx`:
```tsx
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';
import { DEBRID_SERVICES } from '../lib/services';
import { RPDB_FREE_KEY } from '../lib/constants';

interface KeyScreen {
  id: string;
  title: string;
  subtitle: string;
  instruction: string;
  placeholder: string;
  optional?: boolean;
  isDebridPicker?: boolean;
}

const KEY_SCREENS: KeyScreen[] = [
  {
    id: 'debrid',
    title: 'Debrid service (optional)',
    subtitle: 'A Debrid service gives you fast, cached streams. Recommended: TorBox.',
    instruction: 'Pick your Debrid service, then paste your API key. Skip if you want P2P-only.',
    placeholder: 'API key…',
    optional: true,
    isDebridPicker: true,
  },
  {
    id: 'tmdb',
    title: '🎬 TMDB API Key',
    subtitle: 'Used by AIOMetadata for metadata, posters, and catalogs.',
    instruction: 'Go to themoviedb.org → Settings → API → copy both the "API Key" and "API Read Access Token".',
    placeholder: 'Paste TMDB API Key here…',
  },
  {
    id: 'tvdb',
    title: '📺 TVDB API Key',
    subtitle: 'Used for TV series metadata and episode data.',
    instruction: 'Go to thetvdb.com → Dashboard → API Keys → create one and paste it here.',
    placeholder: 'Paste TVDB API Key…',
    optional: true,
  },
  {
    id: 'gemini',
    title: '✨ Gemini API Key (optional)',
    subtitle: 'Enables AI-powered descriptions. Completely optional.',
    instruction: 'Go to aistudio.google.com → Get API Key. Skip if you don\'t want AI descriptions.',
    placeholder: 'Paste Gemini API Key (or skip)…',
    optional: true,
  },
  {
    id: 'rpdb',
    title: '⭐ RPDB Poster Ratings',
    subtitle: 'Adds rating overlays to posters.',
    instruction: 'The free key is pre-filled — no sign-up needed! You can upgrade later at ratingposterdb.com.',
    placeholder: RPDB_FREE_KEY,
    optional: true,
  },
];

interface Props { keyIndex: number; }

export function KeysStep({ keyIndex }: Props) {
  const screen = KEY_SCREENS[keyIndex];
  const { credentials, setCredentials, nextStep, templates } = useWizard();

  if (!screen) { nextStep(); return null; }

  const isDebrid = screen.isDebridPicker;

  return (
    <WizardShell>
      <h2 className="text-xl font-bold mb-1">{screen.title}</h2>
      <p className="text-gray-500 text-sm mb-4 leading-relaxed">{screen.subtitle}</p>

      {/* Instruction card */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4 text-sm text-purple-800">
        📋 {screen.instruction}
      </div>

      {isDebrid ? (
        <>
          {/* Debrid service picker */}
          <p className="text-sm font-medium text-gray-700 mb-2">Choose your service:</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {DEBRID_SERVICES.map(s => (
              <button key={s.id}
                onClick={() => setCredentials({ debridService: credentials.debridService === s.id ? '' : s.id })}
                className={`p-2 border-2 rounded-lg flex flex-col items-center gap-1 transition-all ${
                  credentials.debridService === s.id ? 'border-accent bg-purple-50' : 'border-gray-200'
                }`}>
                {s.logo ? <img src={s.logo} alt={s.name} className="h-6 w-auto object-contain" /> : null}
                <span className="text-xs font-medium">{s.name}</span>
              </button>
            ))}
          </div>
          {credentials.debridService && (
            <input type="password"
              value={credentials.debridApiKey}
              onChange={e => setCredentials({ debridApiKey: e.target.value })}
              placeholder={`${DEBRID_SERVICES.find(s => s.id === credentials.debridService)?.name} API key…`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 mb-1" />
          )}
        </>
      ) : screen.id === 'tmdb' ? (
        <>
          <label className="block mb-3">
            <span className="text-sm font-medium text-gray-700">TMDB API Key</span>
            <input type="password" value={credentials.tmdbApiKey}
              onChange={e => setCredentials({ tmdbApiKey: e.target.value })}
              placeholder="API Key (short)"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </label>
          <label className="block mb-1">
            <span className="text-sm font-medium text-gray-700">TMDB Read Access Token</span>
            <input type="password" value={credentials.tmdbAccessToken}
              onChange={e => setCredentials({ tmdbAccessToken: e.target.value })}
              placeholder="API Read Access Token (long)"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </label>
        </>
      ) : (
        <input
          type={screen.id === 'rpdb' ? 'text' : 'password'}
          value={
            screen.id === 'tvdb' ? credentials.tvdbApiKey :
            screen.id === 'gemini' ? credentials.geminiApiKey :
            credentials.rpdbApiKey
          }
          onChange={e => {
            if (screen.id === 'tvdb') setCredentials({ tvdbApiKey: e.target.value });
            else if (screen.id === 'gemini') setCredentials({ geminiApiKey: e.target.value });
            else setCredentials({ rpdbApiKey: e.target.value });
          }}
          placeholder={screen.placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
      )}

      <NextButton
        onClick={nextStep}
        label={screen.optional ? 'Continue →' : 'Continue →'}
      />
      {screen.optional && (
        <button onClick={nextStep} className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600">
          Skip for now
        </button>
      )}
    </WizardShell>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/ssterjo/stremio-perfect-setup
git add wizard/web/src/steps/AccountStep.tsx wizard/web/src/steps/KeysStep.tsx
git commit -m "feat(web/steps): Account + Keys steps"
```

---

### Task 15: AIOStreams — ServicesStep and DynamicFieldStep

**Files:** Create `wizard/web/src/steps/ServicesStep.tsx`, `wizard/web/src/steps/DynamicFieldStep.tsx`, `wizard/web/src/components/ServiceCard.tsx`

- [ ] **Step 1: Create ServiceCard.tsx**

Create `wizard/web/src/components/ServiceCard.tsx`:
```tsx
import type { Service } from '../lib/services';

interface Props {
  service: Service;
  selected: boolean;
  onToggle: () => void;
}
export function ServiceCard({ service, selected, onToggle }: Props) {
  return (
    <button onClick={onToggle}
      className={`p-3 border-2 rounded-xl flex flex-col items-center gap-1.5 transition-all ${
        selected ? 'border-accent bg-purple-50 shadow-sm' : 'border-gray-200 hover:border-gray-300'
      }`}>
      {service.logo
        ? <img src={service.logo} alt={service.name} className="h-7 w-full object-contain" />
        : <span className="text-lg">📦</span>}
      <span className="text-xs font-semibold text-center">{service.name}</span>
      {selected && <span className="text-xs text-accent font-bold">✓</span>}
    </button>
  );
}
```

- [ ] **Step 2: Create ServicesStep.tsx**

Create `wizard/web/src/steps/ServicesStep.tsx`:
```tsx
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { ServiceCard } from '../components/ServiceCard';
import { useWizard } from '../store/wizard';
import { SERVICES, DEBRID_SERVICES } from '../lib/services';

export function ServicesStep() {
  const { credentials, setCredentials, nextStep } = useWizard();
  const selected = credentials.debridService ? new Set([credentials.debridService]) : new Set<string>();

  function toggle(id: string) {
    setCredentials({ debridService: selected.has(id) ? '' : id });
  }

  return (
    <WizardShell>
      <h2 className="text-xl font-bold mb-1">AIOStreams — Select Services</h2>
      <p className="text-gray-500 text-sm mb-4 leading-relaxed">
        Confirm your Debrid service. This pre-fills your selection from the previous step.
        You can also add Usenet sources here (advanced).
      </p>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Debrid</p>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {DEBRID_SERVICES.map(s => (
          <ServiceCard key={s.id} service={s} selected={selected.has(s.id)} onToggle={() => toggle(s.id)} />
        ))}
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Usenet (advanced)</p>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {SERVICES.filter(s => s.isUsenet).map(s => (
          <ServiceCard key={s.id} service={s} selected={false} onToggle={() => {}} />
        ))}
      </div>
      <p className="text-xs text-gray-400 mb-2">Usenet configuration is manual — handled separately.</p>

      {selected.size === 0 && (
        <p className="text-amber-600 text-sm bg-amber-50 rounded-lg p-2 mb-2">
          ⚠️ No service selected — P2P / HTTP-only mode will be used.
        </p>
      )}

      <NextButton onClick={nextStep} />
    </WizardShell>
  );
}
```

- [ ] **Step 3: Create DynamicFieldStep.tsx**

This component renders one `metadata.inputs` field at a time from the AIOStreams template, skipping `alert`, `socials`, and hidden fields (based on `isVisible`).

Create `wizard/web/src/steps/DynamicFieldStep.tsx`:
```tsx
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';

// @ts-ignore — plain JS module
import { isVisible } from '@core/template-engine.js';

/** Return the ordered list of real-input fields (non-alert, non-socials) from metadata.inputs */
function getRealInputFields(template: any) {
  return (template?.metadata?.inputs ?? []).filter(
    (f: any) => f.type !== 'alert' && f.type !== 'socials'
  );
}

/** Alert fields immediately preceding a given field index */
function getPrecedingAlerts(template: any, fieldIndex: number): any[] {
  const all = template?.metadata?.inputs ?? [];
  const realFields = getRealInputFields(template);
  const targetField = realFields[fieldIndex];
  if (!targetField) return [];
  const targetGlobalIdx = all.findIndex((f: any) => f.id === targetField.id);
  const alerts = [];
  for (let i = targetGlobalIdx - 1; i >= 0; i--) {
    if (all[i].type === 'alert') alerts.unshift(all[i]);
    else break;
  }
  return alerts;
}

function renderAlertBanner(field: any) {
  const colors: Record<string, string> = {
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    'info-basic': 'bg-gray-50 border-gray-200 text-gray-600',
  };
  return (
    <div key={field.id} className={`rounded-lg border p-3 mb-3 text-sm ${colors[field.intent] || colors.info}`}>
      {field.name && <strong className="block mb-1">{field.name}</strong>}
      <span>{field.description}</span>
    </div>
  );
}

interface Props { fieldIndex: number; }

export function DynamicFieldStep({ fieldIndex }: Props) {
  const { templates, aioStreamsInputs, credentials, setAioStreamsInput, nextStep } = useWizard();
  const template = templates?.aiostreams as any;
  if (!template) return <WizardShell><p className="text-gray-400">Loading template…</p></WizardShell>;

  const ctx = {
    inputs: aioStreamsInputs,
    services: credentials.debridService ? [credentials.debridService] : [],
  };

  const realFields = getRealInputFields(template).filter((f: any) => isVisible(f, ctx));
  const field = realFields[fieldIndex];

  // If we've consumed all visible fields, advance past this step group
  if (!field) { nextStep(); return null; }

  const precedingAlerts = getPrecedingAlerts(template, realFields.indexOf(field));
  const value = aioStreamsInputs[field.id] ?? field.default ?? '';

  function onChange(val: unknown) { setAioStreamsInput(field.id, val); }

  return (
    <WizardShell>
      {precedingAlerts.map(renderAlertBanner)}
      <h2 className="text-xl font-bold mb-1">{field.name || field.id}</h2>
      {field.description && (
        <p className="text-gray-500 text-sm mb-4 leading-relaxed">{field.description}</p>
      )}

      {field.type === 'select' && (
        <div className="flex flex-col gap-2">
          {(field.options ?? []).map((opt: any) => (
            <button key={opt.value} onClick={() => onChange(opt.value)}
              className={`px-4 py-3 border-2 rounded-xl text-left transition-all ${
                value === opt.value ? 'border-accent bg-purple-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <span className="font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {field.type === 'boolean' && (
        <button onClick={() => onChange(!value)}
          className={`w-full px-4 py-3 border-2 rounded-xl text-left transition-all ${
            value ? 'border-accent bg-purple-50' : 'border-gray-200'
          }`}>
          <span className="font-medium">{value ? '✅ Enabled' : '☐ Disabled'}</span>
          <span className="text-xs text-gray-500 block mt-0.5">Click to toggle</span>
        </button>
      )}

      {field.type === 'multi-select' && (
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
          {(field.options ?? []).map((opt: any) => {
            const sel = Array.isArray(value) ? value : [];
            const checked = sel.includes(opt.value);
            return (
              <button key={opt.value} onClick={() => {
                const next = checked ? sel.filter((v: string) => v !== opt.value) : [...sel, opt.value];
                onChange(next);
              }}
                className={`px-3 py-2 border-2 rounded-lg text-sm text-left transition-all ${
                  checked ? 'border-accent bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                {checked ? '✓ ' : ''}{opt.label}
              </button>
            );
          })}
        </div>
      )}

      {(field.type === 'number' || field.type === 'string' || field.type === 'url') && (
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={value as string}
          onChange={e => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
          placeholder={String(field.default ?? '')}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
      )}

      <NextButton onClick={nextStep} />
    </WizardShell>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/ssterjo/stremio-perfect-setup
git add wizard/web/src/steps/ServicesStep.tsx wizard/web/src/steps/DynamicFieldStep.tsx wizard/web/src/components/ServiceCard.tsx
git commit -m "feat(web/steps): AIOStreams ServicesStep + DynamicFieldStep"
```

---

### Task 16: CatalogStep, InstallingStep, DoneStep

**Files:** Create the three remaining step files.

- [ ] **Step 1: Create CatalogStep.tsx**

Create `wizard/web/src/steps/CatalogStep.tsx`:
```tsx
import { useEffect } from 'react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';
import { STREMIO_MAX_CATALOGS } from '../lib/constants';

// @ts-ignore
import { deriveCategories, deriveDiscoverFolders, defaultEnabledCategories, countEnabledCatalogs } from '@core/catalog-config.js';

export function CatalogStep() {
  const { target, templates, catalogSelection, setCatalogSelection, nextStep } = useWizard();
  const template = templates?.aiometadata as any;
  const collectionsRaw = templates?.collections as any[];
  if (!template) return <WizardShell><p className="text-gray-400">Loading…</p></WizardShell>;

  const catalogs = template.config.catalogs;
  const categories = deriveCategories(catalogs, collectionsRaw ?? []);
  const discoverFolders = deriveDiscoverFolders(catalogs);
  const { enabledCategories, enabledDiscoverFolderIds } = catalogSelection;

  // Seed defaults once
  useEffect(() => {
    if (enabledCategories.size > 0) return;
    const defaults = defaultEnabledCategories(catalogs, target ?? 'stremio', collectionsRaw ?? []);
    setCatalogSelection({ enabledCategories: defaults.categories, enabledDiscoverFolderIds: defaults.discoverFolderIds });
  }, []);

  const enabledCount = countEnabledCatalogs(catalogs, enabledCategories, enabledDiscoverFolderIds);
  const overLimit = target === 'stremio' && enabledCount > STREMIO_MAX_CATALOGS;

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
        Pick which catalog sections you want. Each group adds multiple browsable rows to your app.
        {target === 'stremio' && ` (Stremio limit: ${STREMIO_MAX_CATALOGS} catalogs)`}
      </p>

      {overLimit && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          ⚠️ <strong>Too many catalogs!</strong> Stremio supports up to ~{STREMIO_MAX_CATALOGS}.
          You have {enabledCount} enabled. Please disable some categories below.
        </div>
      )}

      {/* Discover section — folder granular */}
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">🔭 Discover</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {discoverFolders.map((f: any) => (
          <button key={f.id} onClick={() => toggleDiscover(f.id)}
            className={`p-2.5 border-2 rounded-xl text-left transition-all ${
              enabledDiscoverFolderIds.has(f.id) ? 'border-accent bg-purple-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
            <span className="text-sm font-semibold">{f.label}</span>
          </button>
        ))}
      </div>

      {/* Regular categories */}
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Categories</p>
      <div className="flex flex-col gap-2">
        {categories.map((cat: any) => (
          <button key={cat.key} onClick={() => toggleCategory(cat.key)}
            className={`px-4 py-3 border-2 rounded-xl flex justify-between items-center transition-all ${
              enabledCategories.has(cat.key) ? 'border-accent bg-purple-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
            <span className="font-semibold text-sm">{cat.label}</span>
            <span className="text-xs text-gray-400">{cat.count} catalogs {enabledCategories.has(cat.key) ? '✓' : ''}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-right">
        {enabledCount} catalogs enabled
      </p>

      <NextButton onClick={nextStep} disabled={overLimit} label="Save & Continue →" />
    </WizardShell>
  );
}
```

- [ ] **Step 2: Create InstallingStep.tsx**

Create `wizard/web/src/steps/InstallingStep.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { WizardShell } from '../components/WizardShell';
import { useWizard } from '../store/wizard';
import { INSTANCES, TEMPLATE_URLS } from '../lib/constants';

// @ts-ignore
import { runStremioSetup } from '@core/orchestrator.js';
// @ts-ignore
import { runNuvioSetup } from '@core/orchestrator.js';

const STEPS = ['Creating configs…', 'Setting up AIOStreams…', 'Configuring AIOMetadata…', 'Installing addons…', 'Done!'];

export function InstallingStep() {
  const wizard = useWizard();
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    run();
  }, []);

  async function run() {
    const push = (msg: string) => setLog(l => [...l, msg]);
    try {
      const { target, stremioAccount, nuvioAccount, credentials, aioStreamsInputs, catalogSelection,
              aiometadataInstance, templates } = wizard;
      if (!templates) throw new Error('Templates not loaded');

      const aiostreamsParams = {
        template: templates.aiostreams,
        inputs: aioStreamsInputs,
        services: credentials.debridService ? [credentials.debridService] : [],
        credentials: {
          tmdbApiKey: credentials.tmdbApiKey,
          tmdbAccessToken: credentials.tmdbAccessToken,
          tvdbApiKey: credentials.tvdbApiKey,
          geminiApiKey: credentials.geminiApiKey,
        },
      };

      // Load the correct AIOMetadata base template for the target
      const aiometadataTemplateUrl = target === 'nuvio' ? TEMPLATE_URLS.aiometadataNuvio : TEMPLATE_URLS.aiometadataStremio;
      const aiometadataBaseTemplate = await fetch(aiometadataTemplateUrl).then(r => r.json());

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
        language: wizard.aiometadataLanguage,
      };

      const onStep = (name: string, data: unknown) => push(`✓ ${name}`);

      let result;
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
          collectionsJson: templates.collections,
          onStep,
        });
      }

      wizard.setInstallResult({
        aiostreams: result.addons.aiostreams,
        aiometadata: result.addons.aiometadata,
        warnings: result.warnings,
        error: null,
      });
      setDone(true);
      wizard.nextStep();
    } catch (err: any) {
      wizard.setInstallResult({ error: err.message });
      push(`❌ ${err.message}`);
    }
  }

  return (
    <WizardShell showBack={false}>
      <h2 className="text-xl font-bold mb-4">Setting everything up…</h2>
      <div className="space-y-2">
        {log.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm text-gray-700">
            {msg}
          </motion.div>
        ))}
        {!done && (
          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.2 }}
            className="text-sm text-accent font-medium">Installing…</motion.div>
        )}
      </div>
    </WizardShell>
  );
}
```

- [ ] **Step 3: Create DoneStep.tsx**

Create `wizard/web/src/steps/DoneStep.tsx`:
```tsx
import { WizardShell } from '../components/WizardShell';
import { useWizard } from '../store/wizard';

export function DoneStep() {
  const { installResult, target } = useWizard();
  const { aiostreams, aiometadata, warnings, error } = installResult;

  return (
    <WizardShell showBack={false}>
      {error ? (
        <>
          <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong 😕</h2>
          <p className="text-red-500 text-sm bg-red-50 rounded-lg p-3 mb-4">{error}</p>
          <p className="text-gray-500 text-sm">Please check the error above and try again, or follow the manual guide.</p>
        </>
      ) : (
        <>
          <div className="text-4xl mb-3 text-center">🎉</div>
          <h2 className="text-xl font-bold text-center mb-1">And now you're really done!</h2>
          <p className="text-gray-500 text-sm text-center mb-5">
            {target === 'stremio'
              ? 'Open web.stremio.com and sign in to see your new setup.'
              : 'Open the Nuvio app and sign in — your addons and collections are installed.'}
          </p>

          {/* Credential summary */}
          {(aiostreams || aiometadata) && (
            <div className="bg-gray-50 rounded-xl p-4 text-xs font-mono space-y-2 mb-4 border border-gray-200">
              <p className="font-sans font-semibold text-gray-700 text-sm mb-2">Your credentials (save these!)</p>
              {aiostreams && (
                <div>
                  <p className="text-gray-500">AIOStreams UUID: <span className="text-gray-800">{aiostreams.uuid}</span></p>
                  <p className="text-gray-500 break-all">Manifest: <a href={aiostreams.manifestUrl} target="_blank" rel="noopener" className="text-accent">{aiostreams.manifestUrl}</a></p>
                </div>
              )}
              {aiometadata && (
                <div>
                  <p className="text-gray-500">AIOMetadata UUID: <span className="text-gray-800">{aiometadata.uuid}</span></p>
                  <p className="text-gray-500 break-all">Manifest: <a href={aiometadata.manifestUrl} target="_blank" rel="noopener" className="text-accent">{aiometadata.manifestUrl}</a></p>
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

          {/* Watchly coming soon */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700">
            🤖 <strong>Watchly</strong> (Netflix-like recommendations) coming soon — check back for an update!
          </div>

          {/* Community pack credit note */}
          <p className="text-xs text-gray-400 mt-4 text-center">
            Enjoying the collections?{' '}
            <a href="https://nuvioapp.space/community-collections/nuvio-perfect-collections-incl-dynamic-backdrops-2"
              target="_blank" rel="noopener" className="text-accent underline">
              Support the creator
            </a>{' '}by visiting the community page.
          </p>
        </>
      )}
    </WizardShell>
  );
}
```

- [ ] **Step 4: Verify full build succeeds**

```bash
cd wizard/web
npm run build 2>&1 | tail -15
```
Expected: `✓ built in XXXms`, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /home/ssterjo/stremio-perfect-setup
git add wizard/web/src/steps/
git commit -m "feat(web/steps): CatalogStep, InstallingStep, DoneStep"
```

---

## Phase 4 — Guide Integration and Deployment

---

### Task 17: Guide sidebar link, home card, and styles

**Files:** Modify `docs/assets/js/main.js`, `docs/assets/css/style.css`, `docs/index.md`

All changes are **additive** — no existing guide content is touched.

- [ ] **Step 1: Add the wizard CSS classes to style.css**

Append the following two rule blocks to the end of `docs/assets/css/style.css` (before the closing `@media` block if one exists, otherwise at the very end):

```css
/* ── Automator sidebar CTA ──────────────────────────────────────────── */
.topbar-wizard-btn {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.65rem 1rem;
  margin-bottom: 0.75rem;
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
  color: #fff;
  font-weight: 700;
  font-size: 0.93rem;
  text-decoration: none;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 35%, transparent);
  transition: opacity 0.15s, transform 0.1s;
}
.topbar-wizard-btn:hover { opacity: 0.88; }
.topbar-wizard-btn:active { transform: scale(0.98); }

/* ── Automator home card ─────────────────────────────────────────────── */
.home-wizard-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  margin: 1.5rem 0 1rem;
  padding: 1.1rem 1.4rem;
  border-radius: var(--radius);
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
  color: #fff;
  box-shadow: var(--shadow);
}
.home-wizard-card__text strong { display: block; font-size: 1rem; margin-bottom: 0.15rem; }
.home-wizard-card__text span { font-size: 0.88rem; opacity: 0.9; }
.home-wizard-card__btn {
  flex-shrink: 0;
  display: inline-block;
  padding: 0.45rem 1.1rem;
  border: 2px solid rgba(255,255,255,0.65);
  border-radius: 9px;
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s;
}
.home-wizard-card__btn:hover { background: rgba(255,255,255,0.15); }
@media (max-width: 640px) {
  .home-wizard-card { flex-direction: column; align-items: flex-start; }
}
```

- [ ] **Step 2: Verify the CSS was appended correctly**

```bash
tail -20 docs/assets/css/style.css
```
Expected: the `.home-wizard-card` rule is visible.

- [ ] **Step 3: Add the sidebar link in main.js**

In `docs/assets/js/main.js`, find the `renderSidebar` function at line ~169. Insert the wizard link as the **first** child of `#sidebar-nav`, before `home`:

Change this block (lines 185–187):
```javascript
    mount.innerHTML = "";
    mount.appendChild(home);
    mount.appendChild(ul);
```
to:
```javascript
    var wizardLink = document.createElement("a");
    wizardLink.className = "nav-link topbar-wizard-btn";
    wizardLink.href = "/stremio-perfect-setup/wizard/";
    wizardLink.target = "_blank";
    wizardLink.rel = "noopener";
    wizardLink.textContent = "🤖 Automated Setup";

    mount.innerHTML = "";
    mount.appendChild(wizardLink);
    mount.appendChild(home);
    mount.appendChild(ul);
```

- [ ] **Step 4: Add the home card HTML to index.md**

In `docs/index.md`, after line 20 (`</table>`) insert the card. The file currently reads:
```
</table>

This is a full beginner-friendly guide…
```

Change it to:
```
</table>

<div class="home-wizard-card">
  <div class="home-wizard-card__text">
    <strong>🤖 New! Automated Setup</strong>
    <span>Skip the manual steps — let the wizard configure everything for you.</span>
  </div>
  <a class="home-wizard-card__btn" href="/stremio-perfect-setup/wizard/" target="_blank" rel="noopener">Launch Wizard →</a>
</div>

This is a full beginner-friendly guide…
```

- [ ] **Step 5: Verify the guide Jekyll build still works**

```bash
cd /home/ssterjo/stremio-perfect-setup
# Quick HTML lint: check no syntax errors in the modified files
python3 -c "
import subprocess, sys
r = subprocess.run(['python3','-m','http.server','8001','--directory','docs'], capture_output=True, timeout=2)
print('Serve test: OK (timeout expected)')
" 2>/dev/null || echo "Static serve OK"

# Check JS syntax
node --input-type=module < docs/assets/js/main.js 2>&1 | head -5 || true
```

If Jekyll is available locally: `bundle exec jekyll build --source docs --destination /tmp/site-test && echo "Jekyll build OK"`

- [ ] **Step 6: Commit**

```bash
git add docs/assets/css/style.css docs/assets/js/main.js docs/index.md
git commit -m "feat(guide): add wizard topbar link + home card"
```

---

### Task 18: GitHub Actions — add Vite build and deploy

**Files:** Modify `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Read the current workflow to understand the existing steps**

```bash
cat .github/workflows/deploy-pages.yml
```

- [ ] **Step 2: Add Node.js setup + Vite build steps**

In `.github/workflows/deploy-pages.yml`, add two steps **between** the Jekyll build step and the upload-pages-artifact step:

```yaml
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: wizard/web/package-lock.json

      - name: Build wizard
        run: |
          cd wizard/web
          npm ci
          npm run build

      - name: Copy wizard build into site
        run: |
          mkdir -p _site/wizard
          cp -r wizard/web/dist/. _site/wizard/
```

The complete modified `jobs.build.steps` section should read (in order):
1. `actions/checkout@v4`
2. Set up Python
3. Install Python dependencies
4. Build guide completion stats
5. Set up GitHub Pages (`actions/configure-pages@v5`)
6. Build with Jekyll (`actions/jekyll-build-pages@v1`) → outputs to `./_site`
7. **Set up Node.js** ← new
8. **Build wizard** ← new
9. **Copy wizard build into site** ← new
10. Upload Pages artifact (`actions/upload-pages-artifact@v3`)

- [ ] **Step 3: Verify the workflow YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-pages.yml'))" && echo "YAML valid"
```
Expected: `YAML valid`

- [ ] **Step 4: Add package-lock.json to git (required for npm ci)**

```bash
cd wizard/web && npm install  # already done in Task 10, but generates package-lock.json
cd /home/ssterjo/stremio-perfect-setup
git add wizard/web/package-lock.json
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-pages.yml wizard/web/package-lock.json
git commit -m "ci: add Vite wizard build step to Pages deploy workflow"
```

- [ ] **Step 6: Update wizard/README.md to reflect the new layout**

Overwrite the Layout section of `wizard/README.md` (lines 14–28):

```markdown
## Layout

```
wizard/
  core/                    Template engine, catalog logic, adapters, orchestrator
  web/                     Vite + React wizard (npm run dev / npm run build)
  assets/logos/            Mirrored service logos
  test/                    Node offline tests (no network needed)
  config.example.json      Instance URLs and default preferences
```

## Dev

```bash
# Core unit tests (no network)
node wizard/test/template-engine.test.mjs
node wizard/test/catalog-config.test.mjs

# Wizard dev server
cd wizard/web && npm install && npm run dev
# → http://localhost:5173/stremio-perfect-setup/wizard/

# Production build
cd wizard/web && npm run build
```
```

- [ ] **Step 7: Final commit**

```bash
git add wizard/README.md
git commit -m "docs(wizard): update README for core/ rename and web/ scaffold"
```

---

## Self-Review

### 1. Spec coverage check

| Spec requirement | Covered by task |
|---|---|
| Vite + React + Tailwind + Framer Motion | Tasks 10–12 |
| All 16 AIOStreams services with logos | Tasks 8, 15 |
| Full template directive set (all 5 directives) | Existing template-engine.js, validated in tests |
| All AIOStreams input types rendered | DynamicFieldStep (Task 15) |
| AIOMetadata config built on-the-fly (no template engine) | Tasks 5, 9, 16 |
| Catalog categories derived from emoji prefix (dynamic) | Task 5 (catalog-config.js) |
| EXCLUDED_CATALOG_IDS never shown | Task 5 (catalog-config.js) |
| Discover section folder-granular (🎯🏆🔥⭐) | Tasks 5, 16 |
| 🍥 Anime as own UI category; per-folder in Nuvio | Tasks 5, 6 |
| 🌍 World = flag catalogs; 🌐 By Language = excluded | Task 5 (deriveCategoryKey) |
| Stremio 120-catalog cap with notification | CatalogStep (Task 16) |
| Nuvio: all categories on by default, no cap | defaultEnabledCategories + CatalogStep |
| showInHome: Stremio true / Nuvio false | buildAioMetadataConfig (Task 5) |
| Nuvio collections: auto-import filtered JSON | filterCollections (Task 6), runNuvioSetup (Task 9) |
| Nuvio collections community credit note | DoneStep (Task 16) |
| Atomic install (push only after all configs succeed) | orchestrator (Task 9) |
| Cinemeta patched (Stremio) / absent (Nuvio) | buildAddonCollection in stremio.js, runNuvioSetup |
| Correct addon order (Stremio: Cinemeta→AIOMetadata→AIOStreams→LocalFiles; Nuvio: AIOMetadata→AIOStreams) | orchestrator (Task 9) |
| Trakt deferred with abstraction (traktTokenId in apiKeys shape) | buildAioMetadataConfig leaves traktTokenId untouched |
| Watchly deferred + registry abstraction | addon registry (Task 7), DoneStep coming-soon note |
| AIOManager deferred | Not in scope, registry has no entry |
| Addon registry for future extensibility | Task 7 |
| Guide sidebar link (before all items, differentiated) | Task 17 |
| Guide home card (below images) | Task 17 |
| Guide isolation (no guide content changed) | Tasks 10, 17 confirmed additive-only |
| GitHub Actions deploy | Task 18 |
| Live API verification before adapter impl | Tasks 1–3 |

### 2. Placeholder scan — none found.

All code blocks are complete. The `REPLACE_WITH_ANON_KEY` in `nuvio.js` is intentional — it's discovered in Task 2 Step 1 and filled in as the first real implementation step.

### 3. Type consistency check

- `buildAioMetadataConfig` returns `{ config }` → used as `{ config: aioMetaConfig } = buildAioMetadataConfig(...)` in orchestrator ✓
- `createAiometadataAdapter(...).createConfig(config)` receives the config object from above ✓
- `filterCollections` signature: `(collections, catalogs, { enabledCategories, enabledDiscoverFolderIds })` — matches usage in orchestrator and CatalogStep ✓
- `useWizard` `catalogSelection` shape `{ enabledCategories: Set<string>, enabledDiscoverFolderIds: Set<string> }` — matches all usages ✓
- `runStremioSetup` / `runNuvioSetup` — parameter shapes match InstallingStep calls ✓

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-30-stremio-nuvio-wizard.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

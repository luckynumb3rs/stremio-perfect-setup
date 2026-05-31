# 🤖 Automation Module — Comprehensive Plan

> Historical planning document retained for implementation tracking. For the current state and practical run instructions, use [`../../../wizard/README.md`](../../../wizard/README.md).

**"One-Click Perfect Setup"** — a guided web app that creates/uses a Stremio or Nuvio
account, programmatically builds the AIOStreams, AIOMetadata and Watchly configurations
from the templates in this repo, installs everything (and Nuvio collections), wires up
Trakt, and hands the user back all the credentials that were created.

This document is the **plan only** — no application code is included yet. It maps every
manual step in the guide to an automatable API call, recommends an architecture, defines
the config-file format and the dynamic-interface strategy, and lays out a phased roadmap.

---

## 1. Goal & scope

Turn the manual guide (`docs/guide/1`…`6`) into an automated flow that:

1. Lets the user pick **Stremio** or **Nuvio**, and **create a new account** or **use an existing one**.
2. Collects, through a **step-by-step interface**, only the inputs that genuinely require a
   human: the **API keys** (TMDB, TVDB, Gemini, Debrid, RPDB) and a handful of **preferences**
   (language, subtitles, P2P/Debrid/HTTP mode, formatter, etc.).
3. Builds **AIOStreams**, **AIOMetadata** and (optionally) **Watchly** configurations from the
   repo templates, saving each one on a chosen instance (with optional **fallback instances**).
4. **Installs** the resulting addons onto the Stremio/Nuvio account in the correct order,
   applies the **Cinemeta clean-up**, and for Nuvio also installs the **collections pack**.
5. Optionally runs the **Trakt device-OAuth flow** in-browser and injects the token into the
   relevant addons.
6. Returns a **single summary** of every credential created (account, addon UUIDs + passwords,
   manifest URLs, Trakt token) so the user has a ready-to-use setup.

### What stays manual (cannot be automated)
- Creating **TMDB / TVDB / Gemini / Debrid** accounts and obtaining their API keys (captcha,
  payment, ToS acceptance). The UI guides the user to each and accepts the pasted key.
- Installing the **Nuvio native app** + QR login on a device (the *account* and its config are
  automatable; the device install is not).
- **Usenet** (§7 of the guide) — out of scope, niche and self-hosting-heavy.

---

## 2. Architecture decision — GitHub Pages vs Cloudflare Workers

The user asked: ideally a **GitHub Pages** site that just calls APIs; otherwise a **Cloudflare
Workers** deployment. The deciding factor is **CORS** — a static page can only call APIs that
return permissive `Access-Control-Allow-Origin` headers for browser requests.

| Target API | Browser CORS situation | Verdict |
|---|---|---|
| Stremio `api.strem.io` (`login`, `addonCollectionGet/Set`) | Designed for the web client; browser tools like stremio-addon-manager call it directly | Usually **OK from browser** |
| AIOStreams instances (`POST /api/v1/user`) | Many community/self-hosted instances; CORS not guaranteed | **Often blocked** |
| AIOMetadata instances (save config) | Same as above | **Often blocked** |
| Watchly instance | Unknown / not guaranteed | **Risky** |
| Nuvio Public API (`nuvioapp.space/docs`) | Unknown; likely same-origin only | **Risky** |
| Trakt `api.trakt.tv` (device OAuth) | Trakt sends **no** CORS headers | **Blocked** |

**Recommendation: hybrid — static UI on GitHub Pages + a thin Cloudflare Worker as an API
gateway/proxy.**

- **GitHub Pages** hosts the entire front-end (the wizard). Zero hosting cost, lives in this repo.
- A single **Cloudflare Worker** (`api.<domain>` or a `workers.dev` subdomain) acts as a
  **same-origin CORS proxy + light orchestrator** for the calls that the browser can't make
  directly (AIOStreams/AIOMetadata save, Watchly, Nuvio, Trakt token polling). It is **stateless**:
  it forwards requests, never stores user secrets, and only exists to add CORS + hide a couple
  of public app-level tokens (e.g. the Trakt *client_id* used for device flow).

Why not pure Pages: you would hit a CORS wall on Trakt and on most addon instances. Why not
pure Workers: the UI is static and SEO/repo-friendly on Pages, and keeping the Worker tiny
(a proxy, not a backend) avoids holding any user data.

> **Privacy note to surface in the UI:** all API keys and account passwords flow *through* the
> Worker proxy in transit. Document this clearly. A power-user escape hatch (below) avoids it.

### Escape hatches / alternatives
- **"Direct mode"** toggle: if a chosen instance *does* send CORS headers, call it straight from
  the browser and skip the proxy for that call.
- **Local CLI mode** (Phase 4): the exact same orchestration packaged as a Node/Deno script the
  user runs locally, so nothing transits any third party. Good for the privacy-conscious.
- The Worker can be deployed by the user themselves (one `wrangler deploy`) so they control it.

---

## 3. The dynamic interface — driven by the templates themselves

This is the most important design insight and directly answers the "interface should change
when the template changes" requirement.

**`templates/AIOStreams.json` already contains a complete, self-describing form schema** in
`metadata.inputs`. AIOStreams' own import wizard renders exactly these fields. We reuse it.

`metadata.inputs` (19 entries today) uses a small, stable vocabulary:

- field `type`: `alert` (section header / info / warning), `select`, `multi-select`,
  `boolean`, `number`, `socials`.
- per-field: `id`, `name`, `description` (markdown), `required`, `default`, `options[]`,
  and an optional **`__if`** visibility expression (e.g. `services`, `!services`,
  `services and inputs.httpAddons != only`).

Current AIOStreams inputs we surface verbatim: `formatterChoice`, `formatterFilename`,
`languages` (multi), `languagesRequired`, `subtitles` (multi), `anime`, `debridio`,
`httpAddons` (none/add/only), `timeout`, language-priority and seeders-priority selects, plus
the Debrid **service selection** that precedes them.

### How the UI renders
A small **schema-driven renderer** reads `metadata.inputs` and emits the corresponding form
controls. Because the schema lives in the template, **editing the template automatically changes
the interface** — no UI code change needed. The renderer needs to support:

1. The field types above (trivial mapping to HTML controls).
2. The **`__if`** expression evaluator (a tiny safe interpreter over `inputs.*` and a synthetic
   `services` boolean — "did the user select ≥1 Debrid service").
3. A **services step** sourced from the AIOStreams instance's preset/service catalog (so the
   list of Debrid providers stays current).

### How the final config is produced
The template `config` block uses directives the wizard must resolve into a concrete config:
- **`{{inputs.X}}`** — value interpolation (e.g. `{{inputs.timeout}}`, `{{inputs.languages}}`).
- **`__if`** — include this object only if the expression is true.
- **`__switch` / `__value` / `__remove`** — choose/replace/drop a value by branch.
- **`<template_placeholder>`** — credential slots (`tmdbApiKey`, `tmdbAccessToken`, `tvdbApiKey`)
  filled from the user's pasted keys.

Two options for resolution, in order of preference:
1. **Let the instance resolve it.** If AIOStreams exposes a template-resolution endpoint (the UI
   import flow does this server-side), POST `{template, inputs, credentials}` and let it return
   the resolved config / create the user directly. Preferred — zero drift from upstream.
2. **Resolve client-side.** Re-implement the directive engine (it is small and fully enumerated
   above) in the wizard, then POST the finished `config` to `POST /api/v1/user`. Fallback if no
   resolution endpoint exists. Risk: must track upstream directive changes — pin the AIOStreams
   version (`metadata.version`, currently `2.0.6`) and guard with a compatibility check.

**AIOMetadata** uses a different shape (`config` with `apiKeys.{gemini,tmdb,tvdb,rpdb,mdblist}`,
`apiKeys.traktTokenId`, `config.language`, and the big `catalogs` array). It has **no
`metadata.inputs` form schema**, so its handful of user-facing options (display language, API
keys, anime-search toggles, Trakt) are surfaced as a **small hand-authored sub-form** layered on
top of the imported JSON. The catalogs themselves are imported as-is from
`AIOMetadata.json` (Stremio) / `AIOMetadata-All.json` (Nuvio).

> **Single source of truth for shared inputs.** "Language" appears in both AIOStreams (stream
> language) and AIOMetadata (metadata display language) and Watchly. The wizard collects each
> once and fans the value out to every config, mapping formats where needed (e.g. AIOStreams
> uses `"English"`, AIOMetadata uses `"en-US"`). A small mapping table handles this.

---

## 4. Step-by-step automation map (guide → API)

For each manual step, the automatable equivalent. "Proxy" = via the Cloudflare Worker.

### Step 1 — Accounts (`1-Accounts.md`)
- TMDB / TVDB / Gemini / Debrid / RPDB key acquisition → **manual**, UI links + paste fields.
- Trakt → optional **device OAuth** in-app (see Step 6).

### Step 2 — Initialization (`2-Initialization.md`)
- **Stremio:** create or log in to account → `POST api.strem.io/api/register` or `/api/login`
  → store `authKey`. (Replaces "create account" + "sign in to web.stremio.com".)
  - "Enable Trakt Scrobbling" → set via account settings API if exposed; otherwise flag as a
    one-line manual toggle (low priority, scrobbling ≠ AIOMetadata Trakt).
  - "Uninstall all addons" → `addonCollectionGet` then `addonCollectionSet` with a clean list
    (keep Cinemeta + Local Files). Fully automatable; this is the same mechanism Cinebye uses.
- **Nuvio:** create/log in via the **Nuvio Public API** (`nuvioapp.space/docs`) → obtain auth
  token + selected **profile id**. Device app install stays manual.

### Step 3 — AIOStreams (`3-AIOStreams.md`)
- Pick instance (from config file; default to a known-good one) → resolve template with collected
  inputs + credentials → `POST /api/v1/user {config, password}` (**proxy**) → receive
  `{uuid, encryptedPassword}` → manifest URL `https://<instance>/stremio/<uuid>/<encryptedPassword>/manifest.json`.
- Password is auto-generated (strong) and returned to the user in the final summary.
- Store UUID + password + manifest for install + summary.

### Step 4 — AIOMetadata (`4-AIOMetadata.md`)
- Import `AIOMetadata.json` / `AIOMetadata-All.json` (choose by target app) → inject
  `apiKeys.*` and `config.language` → attach Trakt (`apiKeys.traktTokenId`, obtained via the
  instance's Trakt flow, see Step 6) → save config (**proxy**) → receive UUID/manifest.
- Anime-search toggles, MDBList/Simkl (§7) exposed as optional advanced switches.

### Step 5 — Configuration / install & clean-up (`5-Configuration.md`)
- **Stremio (replaces Cinebye entirely):** build the final addon collection in order
  *Cinemeta → (Watchly) → AIOMetadata → AIOStreams → Local Files* and push via
  `addonCollectionSet` with `authKey`. The Cinemeta "remove search/catalogs/metadata" patches
  are applied by pushing a **patched Cinemeta manifest entry** (the same transform Cinebye does)
  — replicate Cinebye's patch logic, or call a Cinebye-compatible endpoint if available.
- **Nuvio:** for the selected profile, remove existing addons (esp. Cinemeta), then add each
  manifest URL in order via the Nuvio addons API. Then **install the collections pack**:
  POST `collections/nuvio-collections.json` (this repo) to the profile with the chosen install
  mode (merge / replace). Then apply app settings that are API-exposed (follow-addons-order,
  prefer-external-meta, TMDB integration toggles); anything device-only is listed as manual.

### Step 6 — Personalized lists / Trakt (`6-Personalized-Lists.md`)
- **Trakt device OAuth** (browser-friendly, **proxy** for the no-CORS Trakt API):
  1. `POST /oauth/device/code {client_id}` → show `user_code` + `verification_url`.
  2. Poll `POST /oauth/device/token` until `access_token` (respect `interval`/`expires_in`).
  3. Inject token where each consumer needs it (AIOMetadata via its Trakt-connect endpoint →
     `traktTokenId`; Watchly likewise; Stremio scrobbling if API allows).
- **Watchly** (Stremio now; Nuvio "coming soon"): create config via its API with the collected
  keys + preferences → install + place 2nd in order. Driven by config-file flag.
- Watch Next / CouchMoney → optional one-click installs (Watch Next is a fixed manifest URL).

### AIOManager / fallback (`AIOManager-Setup.md`)
- The **multi-instance fallback** requirement maps directly here: for AIOStreams/AIOMetadata,
  create the **same config on a second instance** (loop the Step 3/4 calls over the `fallbacks`
  array), then either (a) reproduce AIOManager's Autopilot pairing via its API, or (b) simply
  install both and document the pairing. Phase 3 feature.

---

## 5. Configuration file (the "as parameterized as possible" layer)

A single declarative file (committed templates + a user overlay) drives everything. Proposed
shape (`wizard/config.example.json`):

```jsonc
{
  "target": "stremio",                  // "stremio" | "nuvio"
  "account": { "mode": "create" },      // or { "mode": "existing", ... collected in UI }

  "instances": {
    "aiostreams":   { "primary": "https://...", "fallbacks": ["https://..."] },
    "aiometadata":  { "primary": "https://...", "fallbacks": ["https://..."] },
    "watchly":      { "primary": "https://...", "enabled": true }
  },

  "templates": {                        // point at this repo's raw files (pinnable to a tag)
    "aiostreams":   "templates/AIOStreams.json",
    "aiometadata":  "templates/AIOMetadata.json",        // -All.json auto-selected for nuvio
    "collections":  "collections/nuvio-collections.json"
  },

  "preferences": {                      // pre-fill the wizard; user can still edit
    "languages": ["English"],
    "subtitles": ["en"],
    "streamMode": "debrid",             // "debrid" | "p2p" | "http"
    "formatter": "flat",
    "trakt": { "enabled": true }
  },

  "integrations": { "couchmoney": false, "mdblist": false, "simkl": false, "watchNext": true },

  "ui": { "showAdvanced": false, "proxyBase": "https://<worker>.workers.dev" }
}
```

- **Instance selection + multi-instance fallback**, language/subtitle/stream-mode, formatter,
  Trakt, and every optional integration are all parameterized here.
- The wizard merges: `template defaults` ← `config.preferences` ← `user input in UI`.
- **API keys and passwords are NEVER stored in this file** — collected at runtime only.

---

## 6. Orchestration flow (the engine)

A small, framework-free TypeScript module shared by the Pages UI and the Worker:

```
loadConfig() → buildWizard(schema)              // §3 schema-driven renderer
  → collect(keys, prefs, account choice, Trakt)
  → ensureAccount(target)                        // create/login Stremio or Nuvio
  → [Trakt deviceFlow] (optional)                // §6
  → buildAioStreams() → saveTo(primary, ...fallbacks)
  → buildAioMetadata() → saveTo(primary, ...fallbacks)
  → [buildWatchly()] (optional)
  → installAddons(target, account, orderedManifests + Cinemeta patch)
  → [nuvio: installCollections(profile, pack, mode)]
  → applySettings(target)                        // best-effort, API-exposed only
  → render summary { account, per-addon {uuid,password,manifest}, traktToken }
```

Design principles:
- **Idempotent + resumable:** each step records its result; re-running skips completed steps.
  Critical because addon instances occasionally 502 (the guide itself notes this).
- **Graceful degradation:** any non-fatal step (a fallback instance down, a settings toggle not
  API-exposed) is reported as "do this manually" in the summary, never blocks the rest.
- **Adapters per service** (`stremio`, `nuvio`, `aiostreams`, `aiometadata`, `watchly`,
  `trakt`) behind a common interface, so adding a service later is localized.
- **No persistence of secrets** anywhere server-side; the summary is generated client-side and
  optionally downloadable as a `.txt`/`.json` the user keeps.

---

## 7. Security, privacy & abuse considerations

- **Secrets in transit:** keys/passwords pass through the Worker proxy. Mitigate: HTTPS only,
  no logging of bodies, short-lived, stateless; offer Direct mode + Local CLI mode (§2).
- **Trakt client_id:** a public app credential, fine to ship; keep `client_secret` (if device
  flow needs it) only in the Worker env, never in the static bundle.
- **Referral integrity:** the guide embeds TorBox/RD referral codes — keep these as
  non-secret defaults the user can see and change.
- **Rate limits / fair use:** debounce instance calls; respect Trakt poll `interval`; make the
  default instance configurable so we don't hammer one community host. Add a clear UA string.
- **Honesty in UI:** explicitly state what is created, where data flows, and that public
  instances are third-party.

---

## 8. Phased roadmap

**Phase 0 — Validation spikes (de-risk before building).**
Confirm by hand: (a) AIOStreams `POST /api/v1/user` shape + whether a template-resolution
endpoint exists; (b) AIOMetadata save endpoint + Trakt-token attachment; (c) Nuvio Public API
auth/addons/collections endpoints from `nuvioapp.space/docs`; (d) Stremio
`addonCollectionSet` + Cinemeta patch reproduction; (e) which of these need the proxy (CORS).
Output: a short `API-NOTES.md` of confirmed contracts.

**Phase 1 — Stremio MVP, Pages + Worker.**
Schema-driven wizard from `AIOStreams.json`; AIOStreams + AIOMetadata create & install; Cinemeta
clean-up + ordering; credential summary. Single instance, no fallback, no Trakt.

**Phase 2 — Trakt + Watchly + integrations.**
Device OAuth, token injection, Watchly config+install, Watch Next, optional MDBList/Simkl/CouchMoney.

**Phase 3 — Nuvio + collections + multi-instance fallback.**
Nuvio account/profile/addons/collections pack; AIOManager-style fallback over `fallbacks[]`.

**Phase 4 — Hardening & alt deploys.**
Resumability, error surfacing, Local CLI mode, template-version compatibility guard, i18n of the
wizard itself.

---

## 9. Open questions / risks (to resolve in Phase 0)

1. **Template resolution** — does AIOStreams expose an endpoint that resolves `metadata.inputs`
   server-side, or must we re-implement the `__if/__switch/{{}}` engine client-side? (Affects
   §3 + upstream-drift risk.)
2. **Nuvio Public API** completeness — does it cover account creation, addon add/remove,
   collection-pack install, and settings toggles? (`/docs` returned 403 to automated fetch;
   verify in a browser.)
3. **Cinemeta patches** — reproduce Cinebye's three patches via `addonCollectionSet`, or is there
   a callable Cinebye endpoint? Reproducing keeps us self-contained.
4. **AIOMetadata Trakt token** — `apiKeys.traktTokenId` is an *ID*, implying the instance stores
   the token and returns a reference; confirm the connect endpoint that mints it.
5. **CORS reality** per instance — finalize the proxy-vs-direct matrix (§2) with real probes.
6. **Stremio Trakt scrobbling** toggle — is it API-settable, or manual?

---

## 10. Repo layout proposal

```
wizard/
  config.example.json          # §5 parameterized config
  schema/                      # field renderer + __if evaluator + directive engine
  adapters/                    # stremio, nuvio, aiostreams, aiometadata, watchly, trakt
  orchestrator.ts              # §6 engine (shared by UI + worker)
  worker/                      # Cloudflare Worker (CORS proxy + trakt client_id)
  ui/                          # static wizard, deployable to GitHub Pages
API-NOTES.md                   # Phase 0 confirmed API contracts
```

The wizard reuses the existing templates in `templates/` and `collections/` **directly** (pinned
to a release tag), so the guide and the automation never drift apart.

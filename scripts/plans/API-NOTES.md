# 📋 API Notes — Phase 0 findings

> Historical research note retained for implementation tracking. For the condensed operator-facing summary, use [`../../../wizard/README.md`](../../../wizard/README.md).

Confirmed API contracts for the wizard module. Sources are the upstream open-source code
(fetched from `raw.githubusercontent.com`) and official docs. Items that could not be live-probed
from the build sandbox (outbound network is GitHub-only here) are marked **🔬 verify live**.

Legend: ✅ confirmed from source · 🟡 strong hypothesis from docs · 🔬 needs a live probe.

---

## CORS reality (drives the architecture)

| Service | CORS | Evidence |
|---|---|---|
| **AIOStreams** | ✅ `Access-Control-Allow-Origin: *` on **both** `/api/*` and `/stremio/*` | `packages/server/src/middlewares/cors.ts` applies `*`, methods `GET,POST,PUT,DELETE,HEAD`, headers `Content-Type`, credentials `true` |
| **Stremio `api.strem.io`** | 🟡 browser-callable (web client + community browser tools use it) | stremio-addon-manager.vercel.app calls it client-side |
| **AIOMetadata** | 🔬 verify (same author ecosystem; likely permissive) | — |
| **Nuvio Public API** | 🔬 verify (`nuvioapp.space/docs`) | — |
| **Trakt `api.trakt.tv`** | ✅ **no** CORS headers → browser-blocked | well documented; needs a proxy |
| **Watchly** | 🔬 verify | — |

**Conclusion:** AIOStreams (the biggest piece) is fully browser-callable → much of the flow can
run on **pure GitHub Pages**. A **thin Cloudflare Worker proxy** is still required for **Trakt**
(no CORS) and as a fallback for any instance that turns out CORS-restricted (AIOMetadata / Nuvio /
Watchly — verify in Phase 1). The hybrid recommendation in `AUTOMATION-PLAN.md` stands, but the
proxy's surface is **smaller than feared** — possibly Trakt-only.

---

## 1. Stremio — `api.strem.io` ✅ (source: `Stremio/stremio-api-client`)

JSON-RPC-ish: every call is `POST {endpoint}/api/{method}` with `Content-Type: application/json`
and body `{ authKey, ...params }`. Response is `{ result, error }` (throw on `error`, HTTP≠200).

| Method | Body (besides `authKey`) | Returns |
|---|---|---|
| `login` | `{ email, password, fbLoginToken? }` | `{ authKey, user }` |
| `register` | `{ email, password, ... }` | `{ authKey, user }` |
| `loginWithToken` | `{ token }` | `{ authKey, user }` |
| `addonCollectionGet` | `{ update: true, addFromURL: [] }` | `{ addons: [descriptor], lastModified }` |
| `addonCollectionSet` | `{ addons: [descriptor] }` | ok |
| `getUser` / `saveUser` | — / `user` | user |
| `logout` | — | ok |

- **`authKey`** comes from `login`/`register` `result.authKey`; pass it in every authed call.
- **addon descriptor** = `{ transportUrl, transportName, manifest, flags }` (`flags` carries
  `official`, `protected`). The collection is an **ordered array** — order in the array *is* the
  addon order. So **install + ordering + clean-up are one `addonCollectionSet` call**.
- This **fully replaces Cinebye**: build the ordered array (Cinemeta → [Watchly] → AIOMetadata →
  AIOStreams → Local Files) and push it. 🔬 The three "Remove Cinemeta Search/Catalogs/Metadata"
  patches modify the Cinemeta manifest entry's resource list — reproduce Cinebye's transform on
  the Cinemeta descriptor before pushing (verify exact patch shape against a real collection).

## 2. AIOStreams ✅ (source: `Viren070/AIOStreams`, `main`)

Base: `https://<instance>/api/v{API_VERSION}` (currently **v1**). Routes under `/user`
(`packages/server/src/routes/api/user.ts`), mounted at `app.use('/api/v1', apiRouter)`.

| Method | Path | Body / auth | Returns |
|---|---|---|---|
| Create config | `POST /api/v1/user` | `{ config, password }` | `201 { data: { uuid, encryptedPassword } }` |
| Read config | `GET /api/v1/user` | Basic auth `uuid:password` (or `?uuid=` + creds) | `{ data: { ... , encryptedPassword } }` |
| Update | `PUT /api/v1/user` | `{ config }` + creds | `{ data: { uuid, ... } }` |
| Delete | `DELETE /api/v1/user` | creds | ok |
| Exists | `GET /api/v1/user` (uuid form) | `?uuid=` | `{ data: { uuid, exists } }` |
| Change pw | `POST /api/v1/user/password` | Basic auth + new pw | ok |
| List templates | `GET /api/v1/templates` | — | `{ data: [Template] }` (instance's own templates) |

- **Manifest URL** ✅: `https://<instance>/stremio/{uuid}/{encryptedPassword}/manifest.json`
  (`app.use('/stremio/:uuid/:encryptedPassword', stremioAuthRouter)`).
- **Password**: server encrypts via PBKDF2(password + server SECRET_KEY) → AES-256-GCM. The
  returned `encryptedPassword` is a token usable in the URL and in place of the raw password.
- **Protected instances**: send `x-aiostreams-user-data` (base64 UserData) and/or `addonPassword`.
- **Template resolution is CLIENT-SIDE** ✅ (important): the server's `TemplateManager`
  (`packages/core/src/utils/templates.ts`) only *loads* templates; it does **not** resolve
  `__if`/`__switch`/`{{inputs}}`. The frontend import wizard resolves them and POSTs the finished
  `config`. → **We must port the directive engine** (small, fully enumerated — see §6). We then
  POST the resolved `config` to `POST /api/v1/user`. No drift risk beyond the directive grammar;
  pin to `metadata.version` (currently `2.0.6`) and guard.

## 3. AIOMetadata 🟡/🔬 (source: `cedya77/aiometadata`, Express + Redis + SQLite/Postgres)

- Config is stored **per-UUID** on the instance; you get a **UUID + password** to sign back in
  (matches the guide). The `/configure` UI saves it.
- Manifest pattern documented as `/stremio/:userUUID/:compressedConfig/manifest.json` 🔬 (confirm
  whether the URL is UUID-only after save, or carries a compressed config blob).
- Config shape (from our own `templates/AIOMetadata.json`): `config.apiKeys.{gemini,tmdb,tvdb,
  rpdb,mdblist}`, `config.apiKeys.traktTokenId` / `simklTokenId` / `anilistTokenId` (token **IDs**,
  not raw tokens → the instance stores the OAuth token and references it by id), `config.language`
  (e.g. `en-US`), and the big `config.catalogs[]` (imported verbatim from our template).
- 🔬 **verify**: exact **save endpoint** (method + path), request/response shape, CORS, and the
  **Trakt connect endpoint** that mints `traktTokenId` from a Trakt token (or the instance runs its
  own Trakt OAuth that we deep-link into).

## 4. Nuvio 🔬 (Public API at `nuvioapp.space/docs`)

- Has a documented Public API (account, profiles, addons, collections). 🔬 enumerate endpoints &
  auth (account create/login → token; list/select profile; add/remove addon by manifest URL;
  install community collection pack with mode merge/replace; settings toggles).
- Collections pack source lives in **this repo**: `collections/nuvio-collections.json` (a JSON
  array of 8 collection groups) — POST it to the selected profile.

## 5. Trakt ✅ (device OAuth — standard, needs proxy for CORS)

1. `POST https://api.trakt.tv/oauth/device/code` `{ client_id }` →
   `{ device_code, user_code, verification_url, expires_in, interval }`.
2. Show `user_code` + `verification_url` to the user.
3. Poll `POST https://api.trakt.tv/oauth/device/token` `{ code: device_code, client_id,
   client_secret }` every `interval`s until `200 { access_token, refresh_token, expires_in }`
   (also handle `400` pending, `409` already used, `410` expired, `418` denied, `429` slow down).
4. `access_token` valid ~3 months; store `refresh_token`. Inject the token into AIOMetadata
   (→ `traktTokenId`) / Watchly / Stremio scrobbling as each consumer requires.
- **Proxy required** (no CORS). `client_secret` stays in the Worker env, never in the static bundle.

## 6. Template directive engine (ported into the wizard) ✅ — grammar fully observed

From `templates/AIOStreams.json` (`metadata.inputs` + `config` directives):

- **`{{inputs.X}}`** — interpolation. Standalone string → the typed value (e.g. number `5000`,
  or the array for `languages`). Inside an array, an array value **flattens** in place
  (`["{{inputs.languages}}", "Original", ...]`).
- **`__if` (on an object in an array/value)** — keep the node only if the expression is truthy.
- **`{ "__if": expr, "__value": v }`** — if `expr` truthy, replace node with resolved `v`, else
  drop the key.
- **`{ "__switch": expr, "cases": { key: v, ... }, "default": v }`** — evaluate `expr` to a string
  key; pick the matching case else `default`. `formatterChoice`→`flat|color|retain`;
  `formatterFilename`→`"true"|"false"`; `services`→joined service-id string (`""` when none).
- **`{ "__remove": true }`** — drop this node.
- **`<template_placeholder>`** — credential slots (`tmdbApiKey`, `tmdbAccessToken`, `tvdbApiKey`),
  filled from collected keys.
- **Expression grammar** (`__if`/`__switch`): identifiers `services`, `inputs.<path>`; operators
  `and`, `or`, `!`/`not`, `==`, `!=`; parentheses; operands = bareword literals (`only`, `none`),
  quoted strings, numbers, `true`/`false`. `services` = truthy when ≥1 Debrid service selected;
  in switch/string context = `selectedServiceIds.join(',')` (`""` when none).

A reference implementation + offline tests live in `wizard/src/template-engine.js` and
`wizard/test/`.

---

## Net effect on the plan

- **Architecture confirmed, proxy shrunk:** GitHub Pages does the heavy lifting; the Cloudflare
  Worker is needed only for **Trakt** (and as a verified-later fallback for AIOMetadata/Nuvio/
  Watchly if any lack CORS). This makes the "ideal GitHub Pages site" the user wanted largely real.
- **Cinebye is replaceable** by a single `addonCollectionSet` (ordering is array order).
- **Template engine must be ported** (client-side); grammar is small and fully captured above.
- **Remaining live-probe checklist** for Phase 1 (run from an unrestricted env / the deployed
  Worker): AIOMetadata save endpoint + Trakt mint + CORS; Nuvio API enumeration; Stremio Cinemeta
  patch shape; Watchly config endpoint + CORS.

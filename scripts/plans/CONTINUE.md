# 🧭 CONTINUE HERE — Wizard project state

> Historical working note retained for implementation tracking. For active run/test guidance, use [`../../../wizard/README.md`](../../../wizard/README.md).

Single source of truth for resuming the **Perfect Setup wizard** work later. Read this first,
then dive into the linked docs/code. Last updated on the `dev` branch.

- Full design: [`AUTOMATION-PLAN.md`](AUTOMATION-PLAN.md)
- Confirmed API contracts: [`API-NOTES.md`](API-NOTES.md)
- Code + how-to-run: [`../../../wizard/README.md`](../../../wizard/README.md)

---

## 1. What this project is

A guided web app (GitHub Pages + a thin Cloudflare Worker for Trakt only) that automates the
manual guide: create/use a **Stremio or Nuvio** account, build **AIOStreams / AIOMetadata /
Watchly** configs from this repo's templates, install everything in order (and Nuvio collections),
optionally wire up **Trakt**, and return all created credentials. The interface is generated
**from the templates themselves**, so it stays in sync as templates change.

## 2. Status at a glance

| Area | State |
|---|---|
| Plan & architecture decision | ✅ done (`AUTOMATION-PLAN.md`) |
| Phase 0 API research | ✅ done (`API-NOTES.md`) — key contracts confirmed from upstream source |
| Template directive engine | ✅ implemented + **31 offline tests passing** against the real template |
| Dynamic form renderer (from `metadata.inputs`) | ✅ implemented |
| Stremio adapter (login/register, install+order, Cinemeta patch) | ✅ implemented (Cinemeta patch shape 🔬 to verify) |
| AIOStreams adapter (create config + fallbacks) | ✅ implemented |
| Phase 1 orchestrator (Stremio MVP) + static wizard UI | ✅ scaffolded |
| AIOMetadata / Watchly / Nuvio / Trakt | ⏳ Phase 2–3 (stubbed/flagged) |
| Cloudflare Worker proxy (Trakt) | ⏳ not started |
| Live end-to-end test against real instances | ❌ blocked in build sandbox (GitHub-only network) |

## 3. Key findings to remember (don't re-research)

- **AIOStreams CORS is fully open** (`Access-Control-Allow-Origin: *`) → callable straight from
  GitHub Pages. `POST /api/v1/user {config,password}` → `201 {data:{uuid,encryptedPassword}}`;
  manifest = `https://<instance>/stremio/{uuid}/{encryptedPassword}/manifest.json`.
- **AIOStreams template resolution is CLIENT-SIDE** — we port the engine (done). Directives:
  `{{inputs.X}}`, `{__if,__value}`, `{__switch,cases,default}`, `{__remove:true}`,
  `<template_placeholder>`. Grammar fully captured in `API-NOTES.md` §6 and implemented.
- **Stremio `api.strem.io`**: `POST /api/{method}` body `{authKey,...}`. `addonCollectionSet`
  takes an **ordered descriptor array** → install + ordering + Cinemeta clean-up in **one call**,
  fully replacing Cinebye.
- **Trakt has no CORS** → the only piece that truly needs the Worker proxy. Most of the flow runs
  on pure GitHub Pages — close to the user's "ideal" ask.
- **AIOMetadata** config shape (from our template): `config.apiKeys.{gemini,tmdb,tvdb,rpdb,mdblist}`,
  `config.apiKeys.traktTokenId` (token **ID**, instance stores the OAuth token), `config.language`.

## 4. Live-verification checklist (run from an unrestricted env / deployed Worker)

The build sandbox can only reach GitHub, so these couldn't be probed and are the **first tasks**:

1. **AIOMetadata** save endpoint (method + path), request/response, CORS, and the **Trakt connect**
   endpoint that mints `traktTokenId`.
2. **Nuvio Public API** (`nuvioapp.space/docs`) — enumerate: account create/login, profiles, add/
   remove addon by manifest URL, install community collection pack (merge/replace), settings toggles.
3. **Stremio Cinemeta patch** — confirm the exact resource/catalog trim that reproduces Cinebye's
   three patches (current `patchCinemeta` in `adapters/stremio.js` is a best-effort guess).
4. **Watchly** config-create endpoint + CORS.
5. **Stremio Trakt scrobbling** toggle — API-settable or manual?

## 5. Next steps (roadmap)

- **Phase 2:** AIOMetadata adapter (save + install) reusing the same template-injection pattern;
  Trakt device-OAuth via a new `wizard/worker/` Cloudflare Worker (holds `client_id`/`secret`);
  inject token into AIOMetadata/Watchly; Watchly adapter; Watch Next one-click.
- **Phase 3:** Nuvio adapter (account/profiles/addons/collections pack from
  `collections/nuvio-collections.json`); multi-instance Autopilot-style fallback.
- **Phase 4:** resumable/idempotent step persistence, error surfacing in UI, local CLI mode
  (no proxy), template-version compatibility guard (pin to `metadata.version`, currently `2.0.6`).

## 6. How to resume

```bash
git checkout dev
node wizard/test/template-engine.test.mjs        # expect: 31 passed, 0 failed
node wizard/test/catalog-config.test.mjs         # expect: passing catalog helper tests
scripts/local-serve.sh                           # guide at /, wizard at /wizard/
```

Start from the **live-verification checklist (§4)** — those answers unblock Phase 2/3. The code is
split between framework-free core ES modules and a Vite-built React app; add new services as
adapters under `wizard/core/adapters/` and wire them into `wizard/core/orchestrator.js`.

## 7. Branch / commit notes

- All work lives on **`dev`** (do not push to `main`). The Pages site builds from `docs/` on `main`
  only, so nothing here is published until intentionally wired into the Pages workflow.
- Secrets rule: API keys and account passwords are collected at runtime in the wizard and are
  **never** written to the repo or any config file.

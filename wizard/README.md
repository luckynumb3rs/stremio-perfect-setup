# 🔮 Perfect Setup Wizard

Guided web app for automating the manual steps in the Stremio/Nuvio setup guide. The wizard is
designed to collect the values a person actually has to provide, generate addon configs from the
templates in this repo, and guide installation in the intended order.

## What It Covers

- Stremio account login or creation
- AIOStreams configuration from `templates/AIOStreams.json`
- API key collection for services that cannot be automated end to end
- Catalog and addon setup steps inside a guided flow
- A final installation-oriented flow instead of manual guide hopping

## What It Does Not Solve Automatically

- Creating third-party accounts such as TMDB, TVDB, Gemini, Debrid, or RPDB
- Service-specific captchas, billing, or terms acceptance
- All Nuvio flows yet
- Trakt device OAuth yet
- Every addon family mentioned in the guide

## Layout

```text
wizard/
  core/                    Template engine, catalog config, nuvio-collections, adapters, orchestrator
  web/                     Vite + React wizard (npm run dev / npm run build)
  web/public/assets/logos/ Canonical service logos served directly by the web app
  test/                    Node offline tests (no network needed)
  config.json              Target-scoped runtime configuration blocks
```

## Local Use

```bash
# Wizard-only dev server
cd wizard/web
npm install
npm run dev
# → http://localhost:5173/

# Full guide + wizard site
cd /path/to/stremio-perfect-setup
scripts/local-serve.sh
# → guide at http://127.0.0.1:8000/
# → wizard at http://127.0.0.1:8000/wizard/
```

If you want the guide and the wizard together exactly like the built site, use
`scripts/local-serve.sh`. It builds the guide, builds the wizard, copies the wizard into the site
output, and serves both from one local static server.

## Privacy and Behavior

- User-entered API keys and passwords are intended to be provided at runtime, not committed to the repo.
- Shared fallback keys in `wizard/config.json` must be stored only as base64-encoded AES-GCM payload strings under `configurations[].keys`. Use `scripts/encode-wizard-key.sh <passphrase> <secret>` to generate one.
- Shared fallback keys are never shown in the UI. If the user leaves a supported field empty, the wizard can pick a random configured fallback key in the background for that install run.
- The wizard is built around the templates in this repo, so template changes can affect the wizard
  flow.
- Some integrations still depend on live third-party API behavior and are not fully implemented.

## For Maintainers

Implementation status, architecture notes, API research, and historical planning docs live in the
internal maintainer notes.

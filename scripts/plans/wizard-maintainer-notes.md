# Wizard Maintainer Notes

Internal reference for implementation status, architecture decisions, and follow-up work that
should not live in the user-facing wizard README.

## Current Snapshot

| Area | State |
|---|---|
| Template directive engine | ✅ Implemented and covered by offline tests |
| Dynamic form generation from `templates/AIOStreams.json` | ✅ Implemented |
| Stremio account + addon ordering/install flow | ✅ Implemented |
| AIOStreams config creation + fallback loop | ✅ Implemented |
| AIOMetadata install flow | ⏳ Planned, API contract partly researched |
| Watchly integration | ⏳ Planned |
| Nuvio account/profile/addon flow | ⏳ Planned |
| Trakt device OAuth / Worker proxy | ⏳ Planned |

## Architecture Notes

- Guide and wizard are intentionally separate deploy units.
  Jekyll builds the guide pages under `docs/`, while Vite builds the React wizard under
  `wizard/web`. The Pages workflow then copies the built wizard into `_site/wizard/`.
- The wizard UI is schema-driven from the AIOStreams template.
  `templates/AIOStreams.json` carries a self-describing form schema in `metadata.inputs`.
  `wizard/core/template-engine.js` and `wizard/core/schema-renderer.js` resolve and render that
  shape, so template changes can alter the wizard without manual UI rewrites.
- The current architecture is mostly browser-first.
  AIOStreams is callable directly from the browser. Stremio `api.strem.io` is browser-callable as
  well. Trakt still needs a proxy for device OAuth because it has no usable CORS policy.

## Confirmed API Findings

- **Stremio**
  `POST /api/{method}` on `https://api.strem.io` with `{ authKey, ...params }`. `addonCollectionSet`
  is the key install/reorder primitive and can replace the old Cinebye cleanup flow.
- **AIOStreams**
  `POST /api/v1/user { config, password }` returns `uuid` and `encryptedPassword`. The manifest URL
  is `https://<instance>/stremio/{uuid}/{encryptedPassword}/manifest.json`.
- **Template resolution**
  AIOStreams template directives such as `{{inputs.X}}`, `__if`, `__switch`, `__remove`, and
  `<template_placeholder>` were observed and ported into the local directive engine.
- **AIOMetadata**
  The config shape and token references are understood well enough to plan against, but the save
  endpoint and final installation flow still need live verification.
- **Trakt**
  Device OAuth is the right flow, but it will need a Worker or another proxy because Trakt does not
  expose the required browser CORS headers.

## Next Verification Gaps

- Verify AIOMetadata save endpoint, response shape, manifest pattern, and CORS behavior.
- Verify the exact Cinemeta patch shape needed for Stremio cleanup parity.
- Enumerate Nuvio public API endpoints needed for account, profile, addon, and collections flows.
- Add Trakt device OAuth via a Worker-backed flow.
- Add Watchly and Nuvio orchestration to `wizard/core/orchestrator.js`.

## Historical References

- [Implementation Plan](./plans/AUTOMATION-PLAN.md)
- [API Research Notes](./plans/API-NOTES.md)
- [Continue / Handoff Notes](./plans/CONTINUE.md)
- [Original Task Plan](./plans/2026-05-30-stremio-nuvio-wizard.md)

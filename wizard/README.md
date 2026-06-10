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
scripts/run-local.sh
# → guide at http://127.0.0.1:8000/
# → wizard at http://127.0.0.1:8000/wizard/
```

If you want the guide and the wizard together exactly like the built site, use
`scripts/run-local.sh`. It builds the guide, builds the wizard, copies the wizard into the site
output, and serves both from one local static server.

## Privacy and Behavior

- User-entered API keys and passwords are intended to be provided at runtime, not committed to the repo.
- Shared fallback keys in `wizard/config.json` must be stored only as base64-encoded AES-GCM payload strings under `configurations[].keys`. Use `scripts/encode.sh <passphrase> <secret>` to generate one.
- Shared fallback keys are never shown in the UI. If the user leaves a supported field empty, the wizard can pick a random configured fallback key in the background for that install run.
- The wizard is built around the templates in this repo, so template changes can affect the wizard
  flow.
- Some integrations still depend on live third-party API behavior and are not fully implemented.

## Analytics Payload

The wizard sends `wizard_completed` and `wizard_account_created` to GA4 when setup succeeds. The
completion payload uses a mix of stable params and dynamic AIOStreams params derived from the
current `templates/AIOStreams.json`.

### Stable Params

- `account_mode`: `create` or `signin`
- `addon_count`: number of addons installed by the wizard
- `target`: `stremio` or `nuvio`
- `services_debrid`: comma-separated selected debrid service names, for example `TorBox,Real-Debrid`
- `services_keys`: comma-separated own-key ids from `tmdb,tvdb,gemini,rpdb`
  - A key id is present only when the user entered their own key for that service
  - Shared/default/fallback keys are omitted from this param
- `catalog_categories`: comma-separated enabled catalog category keys
- `catalog_discover`: comma-separated enabled discover keys

Current catalog keys:

- Categories: derived from `templates/Nuvio-Collections.json`, with optional emoji exceptions from
  `wizard/config.json`
  - Current default selection exceptions: `🍥`, which keeps Anime separate in the wizard
  - Current default category keys in the shipped config: `🎬`, `🎭`, `🍥`, `🎨`, `🏰`, `🎥`, `🕒`, `🌍`
- Discover: `🎯` Recommended, `🏆` Popular, `🔥` Trending, `⭐` Top Rated

Discover classification is derived from `templates/Nuvio-Collections.json` first, including for
Stremio runs. Regular category selection also comes from `templates/Nuvio-Collections.json`; the
only categories split out further are emojis listed in `catalogSelectionExceptions` in
`wizard/config.json`. That keeps Anime as a separate wizard selection even though its folders live
under Genres in the collections layout. If a catalog is missing from collections, the wizard falls
back to the catalog name emoji and built-in labels.

### Dynamic AIOStreams Params

Each visible non-alert field in `templates/AIOStreams.json` is sent as a dynamic GA4 param unless
denied in config, with password fields excluded. The param name is derived from the template field id with:

- camelCase -> snake_case
- non-alphanumeric chars -> `_`
- `aio_` prefix added

Examples:

- `formatterChoice` -> `aio_formatter_choice`
- `languagesRequired` -> `aio_languages_required`
- `httpAddons` -> `aio_http_addons`

Current AIOStreams field mapping:

- `formatterChoice` -> `aio_formatter_choice`
  - Values: `flat`, `color`, `retain`
- `formatterFilename` -> `aio_formatter_filename`
  - Values: `true`, `false`
- `languages` -> `aio_languages`
  - Value format: comma-separated selected template values, for example `English,German,Japanese`
  - Current option values: `Arabic`, `Bengali`, `Bulgarian`, `Chinese`, `Croatian`, `Czech`, `Danish`, `Dutch`, `English`, `Estonian`, `Finnish`, `French`, `German`, `Greek`, `Gujarati`, `Hebrew`, `Hindi`, `Hungarian`, `Indonesian`, `Italian`, `Japanese`, `Kannada`, `Korean`, `Latino`, `Latvian`, `Lithuanian`, `Malayalam`, `Malay`, `Marathi`, `Norwegian`, `Persian`, `Polish`, `Portuguese`, `Punjabi`, `Romanian`, `Russian`, `Serbian`, `Slovak`, `Slovenian`, `Spanish`, `Swedish`, `Tamil`, `Telugu`, `Thai`, `Turkish`, `Ukrainian`, `Vietnamese`
  - If the joined string would exceed the GA4 value limit, it is trimmed at the last full value that still fits
- `languagesRequired` -> `aio_languages_required`
  - Values: `true`, `false`
- `subtitles` -> `aio_subtitles`
  - Value format: comma-separated selected subtitle codes, for example `en,de,ja`
  - Current option values: `ab`, `af`, `sq`, `ar`, `an`, `hy`, `as`, `at`, `az`, `eu`, `be`, `bn`, `bs`, `br`, `bg`, `my`, `ca`, `ze`, `zh-cn`, `zh-tw`, `hr`, `cs`, `da`, `pr`, `nl`, `en`, `eo`, `et`, `ex`, `fa`, `fi`, `fr`, `gd`, `gl`, `ka`, `de`, `el`, `he`, `hi`, `hu`, `is`, `ig`, `id`, `ia`, `ga`, `it`, `ja`, `kk`, `km`, `kn`, `ko`, `ku`, `lv`, `lt`, `lb`, `mk`, `ms`, `ml`, `ma`, `mr`, `me`, `mn`, `nv`, `ne`, `se`, `no`, `oc`, `or`, `pl`, `pt-pt`, `pt-br`, `pm`, `ps`, `ro`, `ru`, `sx`, `sr`, `sd`, `si`, `sk`, `sl`, `so`, `es`, `sp`, `ea`, `sw`, `sv`, `sy`, `tl`, `ta`, `tt`, `te`, `th`, `tp`, `tr`, `tk`, `uk`, `ur`, `uz`, `vi`, `cy`
  - If the joined string would exceed the GA4 value limit, it is trimmed at the last full value that still fits
- `anime` -> `aio_anime`
  - Values: `true`, `false`
  - Visible only when at least one debrid service is selected
- `debridio` -> `aio_debridio`
  - Values: `true`, `false`
  - Visible only when at least one debrid service is selected
- `httpAddons` -> `aio_http_addons`
  - Values: `none`, `install`, `only`
- `timeout` -> `aio_timeout`
  - Values: number, currently default `5000`
- `language` -> `aio_language`
  - Values: `default`, `medium`, `high`
- `seeders` -> `aio_seeders`
  - Values: `default`, `medium`, `high`
  - Visible only when no debrid services are selected

## Catalog Selection Exceptions

`wizard/config.json` supports `catalogSelectionExceptions`, an array of emoji keys. Any catalog
whose own leading emoji matches one of these values is shown as a separate wizard category even if
its folders live under a broader top-level group in `templates/Nuvio-Collections.json`.

Current default:

- `🍥`

Effect of the current default:

- Collections output still keeps Anime folders under `🎭 Genres`
- Wizard category selection shows Anime separately as `🍥`
- Generated AIOMetadata output follows the wizard selection, so selecting `🎭` without `🍥` keeps
  regular genre catalogs enabled while leaving anime catalogs disabled

### Analytics Denylist

`wizard/config.json` can exclude GA4 params directly:

```json
"analytics": {
  "denylist": [
    "services_keys",
    "catalog_discover",
    "aio_seeders",
    "aio_timeout"
  ]
}
```

Denylist values:

- stable params can be listed exactly as documented above, for example `services_debrid`, `services_keys`, `catalog_categories`, `catalog_discover`
- dynamic AIOStreams params use the `aio_` naming rule above, for example `aio_formatter_choice`, `aio_http_addons`, `aio_seeders`
- use the final GA4 param name in the denylist, not the raw template field id

## Done-Step Notifications

`wizard/config.json` supports `doneStepNotifications`, an array of styled notification cards shown
above the credentials on the Done page. Each entry:

```json
{
  "markdown": "...",
  "targets": ["stremio", "nuvio"],
  "style": {
    "background": "...",
    "borderColor": "...",
    "textColor": "...",
    "boxShadow": "...",
    "textAlign": "center"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `markdown` | ✓ | Card body, rendered as Markdown |
| `targets` | — | `"stremio"` and/or `"nuvio"`. Omit to show on all targets. |
| `style` | — | Override panel card styling. Omit to use the default theme card. |

`style` sub-fields all accept any CSS value string:
- `background` — card background (supports `rgba`)
- `borderColor` — border color (rendered as `1px solid <value>`)
- `textColor` — text color
- `boxShadow` — CSS `box-shadow` value
- `textAlign` — card body text alignment, for example `left`, `center`, or `right`. Defaults to `center`

The array is filtered at render time: entries whose `targets` list does not include the active target
are hidden.

### Example (original Trakt notification — kept as reference)

```json
{
  "markdown": "🎯 **Trakt** is optional, but needs to be connected manually because it cannot be automated here.\n\n- **🔎 AIOMetadata**: click on **Customize More** above, open the **Catalogs** tab, press the **Trakt** logo, and follow the setup steps. After you connect it, go to the **Configuration tab and click** **Save Configuration**.\n- **🎞️ Stremio**: open **Settings** and enable **Trakt Scrobbling** there.\n- **🚀 Nuvio**: open **Settings** and connect **Trakt** there using the QR code.",
  "targets": ["stremio", "nuvio"],
  "style": {
    "background": "rgba(95, 24, 43, 0.68)",
    "borderColor": "rgba(255, 230, 236, 0.2)",
    "textColor": "rgba(255, 255, 255, 0.96)",
    "boxShadow": "0 10px 24px rgba(57, 7, 21, 0.22)"
  }
}
```

Note: as of the Watchly update this notification has been replaced by the interactive Trakt card in
the Done page. It is preserved here as a style reference.

## Per-Target Templates

`wizard/config.json` `templates.stremio` and `templates.nuvio` each map a key to a repository-relative
template path:

| Key | Both targets | Description |
|-----|-------------|-------------|
| `aiostreams` | ✓ | AIOStreams config template |
| `aiometadata` | ✓ | AIOMetadata config template |
| `watchly` | ✓ | Watchly default `TokenRequest` body fields |
| `collections` | Nuvio only | Nuvio collection groups |
| `settings` | Nuvio only | Nuvio platform settings |

## For Maintainers

Implementation status, architecture notes, API research, and historical planning docs live in the
internal maintainer notes.

# Module Architecture

This document describes how the hosting setup's module system works: how modules are discovered, how they declare their parameters, how main.sh routes CLI arguments to them, and how to add new modules.

## Overview

`main.sh` is the orchestrator. It discovers and invokes **module hook scripts** from `hosting/modules/`. Each module hook:
- Declares its metadata (scope, execution order, parameters) via `--metadata`
- Is invoked by main.sh with framework environment variables and any resolved module parameters
- Can run standalone (directly with env vars) or via main.sh (interactive or unattended)

## Module Hook Contract

Every file in `hosting/modules/` is a module hook script. It must:

1. **Respond to `--metadata`** — print key=value lines and exit 0.
2. **Be executable** — `chmod +x`.
3. **Source `lib/common.sh`** for access to `prompt_*`, `log`, `section`, `env_get`, `env_upsert`, etc.
4. **Read inputs from environment variables only** — no positional arguments for data.
5. **Check `hook_target_enabled` and `selected_module_enabled`** before doing any work — exit silently if not targeted.

## The `--metadata` Protocol

When called with `--metadata`, a module hook must print the following fields (one per line, `key=value` format) and exit 0 immediately:

| Field | Required | Description |
|---|---|---|
| `scope` | Yes | `module` (single module) or `all` (cross-module hook) |
| `module` | When `scope=module` | The module name (e.g. `authelia`) |
| `dependencies` | When `scope=all` | Comma-separated modules this hook applies to |
| `order` | No (default: 100) | Execution order — lower runs first |
| `param=...` | No | Parameter declaration (see below) |

### Parameter Declaration Format

```
param=<key>|<type>|<required>|<label>
```

| Field | Values | Description |
|---|---|---|
| `key` | identifier | Used in `--module-param module.KEY=VALUE` |
| `type` | `string`, `secret`, `bool` | Determines prompt type |
| `required` | `true`, `false` | Whether unattended mode fails without it |
| `label` | free text (no `\|`) | Used verbatim in whiptail inputbox and plain terminal prompt |

No `env_var` field — the env var name is derived automatically by the framework from the module name + key (see `module_param_env_var` in `lib/common.sh`). Module code never references env var names directly.

Example:
```bash
if [[ "${1:-}" == "--metadata" ]]; then
  printf 'scope=module\nmodule=%s\norder=85\n' "${MODULE_NAME}"
  printf 'param=username|string|true|Authelia username (letters, digits, hyphens, underscores only)\n'
  printf 'param=displayname|string|true|Authelia display name\n'
  printf 'param=email|string|true|Authelia user email address\n'
  printf 'param=password|secret|true|Authelia password (will be argon2-hashed via Docker)\n'
  exit 0
fi
```

## Environment Variables

### Framework Variables (passed to every module hook)

These are set by main.sh and always available to every module:

| Variable | Description |
|---|---|
| `HOSTING_TEMPLATE_DIR` | Path to the staging template directory |
| `HOSTING_CONFIG_DIR` | Path to the staged config output directory |
| `HOSTING_MANIFEST_FILE` | Path to the staging manifest TSV |
| `HOSTING_SELECTED_MODULES_FILE` | Path to the selected-modules list |
| `HOSTING_MODULE_HOOK_TARGETS_FILE` | Path to the hook-targets list for this run |
| `HOSTING_MODULE_SYNC_ONLY_FILE` | Path to the sync-only modules list |
| `HOSTING_ROOT_ENV` | Path to the staged root `.env` file |

### Module-Specific Parameters

These are declared in `--metadata` and resolved dynamically by main.sh. They are set only when the user passes `--module-param module.key=value`. Modules should always provide a sensible behavior when they are empty (prompt in interactive mode, skip or use default in unattended mode).

Current declared module params:

| Module | Key | Env Var | Type | Required |
|---|---|---|---|---|
| `authelia` | `username` | `AUTHELIA_USERNAME` | string | true |
| `authelia` | `displayname` | `AUTHELIA_DISPLAYNAME` | string | true |
| `authelia` | `email` | `AUTHELIA_EMAIL` | string | true |
| `authelia` | `password` | `AUTHELIA_PASSWORD` | secret | true |
| `cloudflare-ddns` | `api_token` | `CLOUDFLARE_DDNS_API_TOKEN` | secret | false |
| `cloudflare-ddns` | `proxied` | `CLOUDFLARE_DDNS_PROXIED` | bool | false |
| `supabase` | `connection_string` | `SUPABASE_CONNECTION_STRING` | string | false |
| `supabase` | `db_password` | `SUPABASE_DB_PASSWORD` | secret | false |
| `aiostreams` | `auth` | `AIOSTREAMS_AUTH` | string | false |
| `watchly` | `tmdb_api_key` | `WATCHLY_TMDB_API_KEY` | string | false |

## CLI Interface

### Passing Module Parameters

```bash
./main.sh --module-param MODULE.KEY=VALUE
```

The `MODULE` matches the `module=` metadata field (or the filename with `all.` stripped for cross-module hooks). The `KEY` matches the `key` field in the `param=` declaration. Run `./main.sh --list-module-params` to see all available params.

### Running Modules Standalone

Every module can be run directly without main.sh by setting the required environment variables. This is useful for testing or targeted re-runs. The module will still prompt interactively for any missing module-specific params if running on a TTY.

```bash
HOSTING_TEMPLATE_DIR=/path/to/docker \
HOSTING_CONFIG_DIR=/path/to/config \
HOSTING_MANIFEST_FILE=/path/to/.stage-map.tsv \
HOSTING_SELECTED_MODULES_FILE=/path/to/selected-modules.txt \
HOSTING_MODULE_HOOK_TARGETS_FILE=/path/to/hook-targets.txt \
HOSTING_ROOT_ENV=/path/to/.env \
AUTHELIA_USERNAME=admin \
AUTHELIA_PASSWORD=secret \
./hosting/modules/authelia.sh
```

## Using `module_get_param` in Modules

Use `module_get_param` (defined in `lib/common.sh`) inside module hooks to resolve a parameter. The function reads the env var internally — module code never references env var names:

```bash
# Signature: module_get_param KEY TYPE REQUIRED LABEL [STAGED_FALLBACK] [DEFAULT]
#
# The function derives the env var from MODULE_NAME + key automatically.
# STAGED_FALLBACK: value read from a staged .env file for re-run preservation.

# Simple case (no staged fallback needed):
authelia_username="$(module_get_param "username" "string" "true" \
  "Authelia username (letters, digits, hyphens, underscores only)")"

# With staged fallback (for values that may already exist in a staged .env):
staged_auth="$(env_get "${AIOSTREAMS_ENV}" AIOSTREAMS_AUTH || true)"
auth_value="$(module_get_param "auth" "string" "false" \
  "AIOStreams proxy users (comma-separated username:password pairs)" \
  "${staged_auth}")"
```

The `LABEL` is the single source of truth — used verbatim for both the whiptail inputbox and the plain terminal `prompt_value` path.

## Env Var Derivation Convention

The framework derives env var names from `MODULE_NAME` + `key`:

```
ENV_VAR = uppercase(MODULE_NAME with - replaced by _) + "_" + uppercase(key)
```

| Module | Key | Env var (auto-derived) |
|---|---|---|
| `authelia` | `username` | `AUTHELIA_USERNAME` |
| `cloudflare-ddns` | `api_token` | `CLOUDFLARE_DDNS_API_TOKEN` |
| `supabase` | `connection_string` | `SUPABASE_CONNECTION_STRING` |
| `aiostreams` | `auth` | `AIOSTREAMS_AUTH` |
| `watchly` | `tmdb_api_key` | `WATCHLY_TMDB_API_KEY` |

These env vars are set by `main.sh` when the user passes `--module-param`. The `module_get_param` function reads them via bash indirect expansion (`${!env_var}`). Module authors never need to know or reference these names.

## Adding a New Module

1. Create `hosting/modules/<name>.sh`
2. Implement the `--metadata` block (scope, module, order, any param declarations)
3. Source `lib/common.sh` and call `ensure_dialog_ui "<name> setup"` if the module has interactive prompts
4. Check `hook_target_enabled "${MODULE_NAME}"` and `selected_module_enabled "${MODULE_NAME}"` before doing any work
5. Use `module_get_param` for any user-configurable values
6. Make the script executable: `chmod +x hosting/modules/<name>.sh`
7. No changes to `main.sh` needed — metadata is auto-discovered at startup

## Unattended Mode Requirements

For a fully unattended fresh install, these flags are required:
- `--on-vps` or `--local`
- `--modules LIST` or `--preset ID`
- `--domain DOMAIN`
- `--letsencrypt-email EMAIL`
- `--assume-yes`
- Any `--module-param` values for modules that require them (see table above)

Optional but recommended for reproducible runs:
- `--timezone TZ` (defaults to existing `.env` value or `Europe/Berlin`)
- `--docker-dir DIR` (defaults to `/opt/docker`)
- `--skip-backup` (skips the post-deploy config ZIP)

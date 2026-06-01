# Hosting Automation

This folder contains the complete automation bundle for preparing a VPS-hosted
Docker Compose stack from
[Viren070/docker-compose-template](https://github.com/Viren070/docker-compose-template).

Everything lives under `hosting/` so this folder can later be moved into a
larger repository without path rewrites. There is intentionally no root README
for this automation.

## Directory Layout

- `main.sh`
  Main end-to-end entrypoint.
- `steps/`
  Reusable orchestration steps used by `main.sh`, including Docker and SSH setup.
- `modules/`
  Addon-specific hooks discovered automatically from selected compose modules.
- `db/`
  Standalone Supabase helper scripts and SQL files.
- `lib/`
  Shared Bash helpers for prompting, env edits, staging, and template discovery.
- `defaults.env`
  Central fallback values for paths, upstream source, backup names, SSH defaults,
  and Docker target directory.

## Main Command

Interactive:

```bash
./hosting/main.sh
```

Backup-only examples:

```bash
./hosting/main.sh --backup
./hosting/main.sh --backup-quick
./hosting/main.sh --backup-quick --docker-dir /srv/streaming --backup-dir /tmp/backups
```

Interactive mode guides you through missing values. Unattended mode requires
the values that cannot be safely guessed, especially `--modules`, `--domain`,
and `--letsencrypt-email`.

Unattended example:

```bash
./hosting/main.sh \
  --modules aiostreams,aiometadata,aiomanager,honey,cloudflare-ddns \
  --domain example.com \
  --timezone Europe/Berlin \
  --docker-dir /opt/docker \
  --letsencrypt-email admin@example.com \
  --cloudflare-api-token cf_token \
  --supabase-connection-string 'postgresql://postgres.project:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:5432/postgres' \
  --supabase-db-password 'database-password' \
  --backup-dir "$HOME" \
  --skip-review
```

Dry-run example:

```bash
./hosting/main.sh \
  --dry-run \
  --skip-ssh \
  --modules honey,altmount \
  --domain example.com \
  --timezone Europe/Berlin \
  --letsencrypt-email admin@example.com
```

Resume-from-backup example:

```bash
./hosting/main.sh \
  /path/to/streaming-20260531091321.zip \
  --domain example.com \
  --timezone Europe/Berlin \
  --letsencrypt-email admin@example.com
```

## Main Flow

`main.sh` performs the full preparation:

1. In interactive mode, offers to run `steps/prepare-ssh.sh` unless `--skip-ssh` is passed. Unattended mode runs it only when `--prepare-ssh` is passed.
2. Installs Docker with `steps/install-docker.sh` and adds the current user to the `docker` group.
3. Fetches the upstream template into `hosting/.work/docker`.
4. Scans `apps/*/compose.yaml|yml`, discovers available modules, and forces required modules on.
5. If a backup ZIP is passed, merges any `apps/<module>/` folders from the archive into the fetched template before selection. Then prompts for optional modules unless `--modules` was supplied. When `HOSTING_SELECTED_MODULES.txt` is present in the ZIP, its modules are pre-enabled in that prompt instead of being forced as the final selection. On interactive terminals, the prompt uses a `whiptail` checklist when available, with arrow-key navigation, `Space` toggles, and scrolling for long lists.
6. Stages root `.env` and selected module config files into `hosting/.work/config`, or reconstructs that staging area from a backup ZIP when one is passed.
7. Prompts for mandatory root `.env` values: timezone, `DOCKER_DIR`, `DOMAIN`, and `LETSENCRYPT_EMAIL`.
8. Writes `PUID`, `PGID`, and generated Authelia secrets.
9. Runs matching hooks from `modules/`.
10. Rebuilds the root `include:` list from the selected modules, removes unselected app directories, and writes final `COMPOSE_PROFILES` from the profiles declared by the remaining modules.
11. Pauses for manual review unless `--skip-review` is set.
12. Restores staged files into the fetched template and syncs the prepared tree into `DOCKER_DIR`.
13. Optionally creates a ZIP backup of staged config files and lets interactive users choose the output directory unless `--backup-dir` was supplied.
14. Starts Docker Compose with `--profile required`, then starts the full configured stack.
15. Prints the public IP and either Cloudflare-managed hostnames or DNS A records to create manually.

`./hosting/main.sh --backup` skips the deployment flow entirely. It prompts for
the Docker directory and backup output directory unless they were supplied with
`--docker-dir` and `--backup-dir`, then archives the currently enabled modules
from the deployed tree. `--backup-quick` does the same thing without prompts and
uses `DEFAULT_DOCKER_DIR` plus `BACKUP_OUTPUT_DIR` unless overridden.

## Dry Run

`./hosting/main.sh --dry-run` exercises the preparation flow without changing
system state. It still fetches or copies the template, stages configs, runs the
file-mutation hooks, prunes modules, deploys into `hosting/.work/dry-run/deploy`,
and creates a backup archive under `hosting/.work/dry-run/backup` unless
`--skip-backup` is set.

Dry run skips:

- SSH setup
- Docker installation
- Docker Compose start
- Supabase schema creation
- Public IP lookup

Dry run still cleans up `hosting/.work/` at the end. If you want to keep the
generated backup ZIP, pass an explicit `--backup-dir` outside `hosting/.work/`.

## Prerequisites

- Clone this repository on the Linux host that will run Docker.
- Use Debian or Ubuntu if you want automatic package installation.
- Have a domain ready if any Traefik-routed service should be public.
- If using Cloudflare DDNS, your domain must already use Cloudflare nameservers.
- If using Supabase, create a new Supabase project dedicated to these addons.

## Console Output

The scripts use color and icons to separate message types:

- `▶` marks a major phase.
- `ℹ` marks informational output.
- `✓` marks a completed step.
- `⚠` marks a warning or manual action.
- `✗` marks a fatal error.

Set `NO_COLOR=1` if you want plain output without ANSI color codes.

## Detailed Step Behavior

### 1. SSH Preparation

Interactive `main.sh` runs offer SSH preparation up front unless `--skip-ssh`
is passed. Unattended runs stay opt-in through `--prepare-ssh`. The helper can
use an explicit key, detect an existing default key, or generate a new ed25519
key. In interactive mode it also offers the default SSH alias from
`defaults.env` or lets the user enter a custom alias. It does not install the
public key on the VPS.

### 2. Docker Setup

`steps/install-docker.sh` installs Docker Engine from Docker's official apt
repository when Docker is missing. It adds the current user to the `docker`
group. If group membership changes, log out and back in before expecting Docker
to work without `sudo`.

### 3. Template Fetch

`steps/fetch-template.sh` clones the upstream template into `hosting/.work/docker` by
default. The repository does not keep a checked-in copy of the template.
`--template-source local` is useful when you want to prepare from a local
template checkout instead of cloning upstream, for example while testing local
template changes.

### 4. Module Discovery

`lib/template.sh` scans `apps/*/compose.yaml|yml` to discover modules and scans
each module compose file for the required profile. Required modules cannot be
disabled. The root `compose.yaml` or `compose.yml` is regenerated later from the
selected modules, so newly added app folders become selectable automatically.

### 5. Config Staging

`steps/stage-configs.sh` copies the root `.env` and each selected module's
non-compose config files into `hosting/.work/config`. All automated edits happen
there first. The upstream template remains untouched until deployment.

If `main.sh` is called with a backup ZIP path, `steps/inspect-backup.sh` first
merges any backup-provided `apps/<module>/` folders into the fetched template so
they participate in module discovery. Then `steps/import-backup.sh`
reconstructs the same staging layout from the selected modules instead of
copying files out of the fetched template directly.

### 6. Root Environment

`main.sh` prompts for `TZ`, `DOCKER_DIR`, `DOMAIN`, and `LETSENCRYPT_EMAIL`.
It fills `PUID` and `PGID` from `id`, and generates the Authelia secret values.

### 7. Module Hooks

Every `modules/*.sh` file exposes metadata through `--metadata`. `main.sh`
uses that metadata to decide whether the hook should run and in what order.
This keeps module automation removable and additive.

### 8. Manual Review

Unless `--skip-review` is set, the script pauses after automation and before
deployment. Review staged files in `hosting/.work/config`. Edit values if
needed, but do not rename files.

### 9. Deployment

`steps/deploy-template.sh` restores staged files into the fetched template with
their original names and paths, then rsyncs the prepared template into
`DOCKER_DIR`. Before deployment, `main.sh` prunes the root compose include list
and removes unselected `apps/*` directories so the deployed tree contains only
the selected modules. It creates or fixes permissions on `DOCKER_DIR` when
needed.

### 10. Backup

`steps/backup-configs.sh` can create a ZIP backup of the staged configuration
after deployment. `steps/backup-docker-config.sh` can create the same archive
shape directly from an already deployed Docker tree. Interactive runs can
choose the output directory at backup time. The backup contains the root `.env`,
the root compose file, `HOSTING_SELECTED_MODULES.txt`, and each enabled
module's full `apps/<module>/` directory, not the full upstream template.

### 11. Start

`steps/start-stack.sh` first starts the required profile, then starts the full
stack using the deployed root `.env` and its generated `COMPOSE_PROFILES` value.

## Supabase Behavior

Supabase is not forced. Per the prompt, it is offered only when at least one of
`aiomanager`, `aiometadata`, or `aiostreams` is selected.

If the user accepts, the script asks for the Supabase direct session pooler IPv4
connection string and database password, replaces `[YOUR-PASSWORD]`, creates
one schema and one role per selected addon, and writes generated Postgres
connection strings into the staged addon env files.

If the user declines, or if unattended mode does not supply a Supabase
connection string, the addons keep their upstream SQLite defaults.

The supported addons are configured at the top of `modules/all.supabase.sh`:

- `SUPPORTED_ADDONS`
- `DATABASE_URL_KEYS`
- `EXTRA_ENV_ASSIGNMENTS`

Change those arrays/maps if another addon later needs Supabase support.

## Module Hooks

Hooks use a simple metadata contract. `main.sh` calls each `modules/*.sh`
with `--metadata` first, then runs it only when its module or dependency set is
selected.

- `modules/aiostreams.sh`
  Enables `TORRENTIO_URL`, generates `SECRET_KEY`, sets `FEATURED_TEMPLATE_IDS`,
  appends the requested `TEMPLATE_URLS`, and points to local StremThru when `stremthru` is selected.
- `modules/aiomanager.sh`
  Generates `ENCRYPTION_KEY`.
- `modules/altmount.sh`
  Creates `ALTMOUNT.env` with `JWT_SECRET`, stages AltMount compose, and adds `env_file: .env`.
- `modules/honey.sh`
  Sets `HONEY_HOSTNAME=stream.${DOMAIN}`, rewrites trusted domains, and removes dashboard links for unselected services.
- `modules/cloudflare-ddns.sh`
  Asks for a Cloudflare token, disables itself if missing, writes `CLOUDFLARE_PROXIED=true` only when enabled, prunes DDNS domains to selected hostnames, and switches Traefik to Cloudflare DNS challenge.
- `modules/all.supabase.sh`
  Runs for selected AIO addons and offers Supabase setup.

## Staged Config Naming

Staged files are temporary and should not be renamed during manual review.

- Root `.env` stays `.env`.
- `apps/aiostreams/.env` becomes `AIOSTREAMS.env`.
- `apps/honey/config.json` becomes `HONEY.config.json`.
- `apps/authelia/config/` becomes `AUTHELIA.config/`.
- Special staged compose files are named like `TRAEFIK.compose.yaml` or `TRAEFIK.compose.yml`, matching the upstream extension.

## Standalone Commands

- `main.sh`
  Full end-to-end deployment flow.
- `steps/prepare-ssh.sh`
  Local SSH key selection/generation and SSH config alias setup.
- `steps/install-docker.sh`
  Docker Engine and docker group setup.
- `steps/fetch-template.sh`
  Fetches upstream or copies an explicit local template source.
- `steps/stage-configs.sh`
  Creates the staging config folder and stage manifest.
- `steps/import-backup.sh`
  Restores the staging config folder for the finally selected modules from a backup ZIP.
- `steps/deploy-template.sh`
  Restores staged files and syncs the prepared template into `DOCKER_DIR`.
- `steps/backup-configs.sh`
  Normalizes staged files into module folders and creates a ZIP archive.
- `steps/start-stack.sh`
  Starts the required profile and then the full Compose stack.
- `db/create-addon-schemas.sh`
  Creates Supabase schemas and roles for selected AIO addons.
- `db/delete-addon-schemas.sh`
  Drops schemas and roles created by the create helper.

## Backup Format

Backups are ZIP files named `streaming-YYYYmmddHHMMSS.zip` by default. The
archive contains the root `.env`, the root compose file, the selected-module
list, and each selected module's full app directory:

- `.env`
- `compose.yaml` or `compose.yml`
- `HOSTING_SELECTED_MODULES.txt`
- `apps/aiostreams/.env`
- `apps/honey/config.json`
- `apps/traefik/compose.yaml`

## Error Handling

- Missing required arguments fail with `✗` and a direct explanation.
- Missing upstream files fail early during template discovery or staging.
- Unknown module names fail before config staging.
- Cloudflare DDNS disables itself if selected without a token.
- Supabase setup exits without changes if the user declines it.
- If deployment fails before cleanup, inspect `hosting/.work/docker`, `hosting/.work/config`, and `hosting/.work/`.

## Notes

- `hosting/.work/docker`, `hosting/.work/config`, and `hosting/.work/` are temporary working paths.
- Automatic package installation assumes Debian or Ubuntu.
- If Docker group membership was just added, log out and back in before running Docker without `sudo`.

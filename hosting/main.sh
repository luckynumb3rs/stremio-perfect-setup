#!/usr/bin/env bash

# Hosting Perfect Setup - prepare and deploy the self-hosted streaming stack.
#
# This is the end-to-end entrypoint. It checks/installs Docker, fetches the
# upstream docker-compose template into a temporary work directory, lets you
# choose modules, stages editable config files, applies module hooks, deploys
# the prepared tree into DOCKER_DIR, optionally writes a backup ZIP, starts
# Docker Compose, and prints DNS guidance.
#
# It can run in two places (it asks at startup, or you can force it):
#   * On your local computer (--local): prepares SSH, copies the hosting folder
#     to the VPS, and runs the rest of the setup there over SSH.
#   * Directly on the VPS (--on-vps): runs the whole setup on this machine.
#
# Usage:
#   ./main.sh [options] [backup.zip]
#
# Common usage:
#   ./main.sh                                 Interactive guided setup.
#   ./main.sh /path/to/streaming-backup.zip   Restore from a previously made backup ZIP.
#
# Execution location:
#   --on-vps                      Treat this machine as the VPS and run the full setup here.
#   --local                       Run from your local computer: prepare SSH, copy to the VPS, run it there.
#   --prepare-ssh                 Run the SSH helper before Docker preparation.
#   --skip-ssh                    Skip SSH preparation and reuse the existing alias (local mode).
#   --ssh-host HOST               VPS IP/hostname for the SSH alias (enables unattended --local).
#   --ssh-user USER               SSH username for the VPS (enables unattended --local).
#   --ssh-alias NAME              SSH alias name to create/use (default: streaming).
#   --ssh-key-path PATH           Existing private key to use for the alias (skips key generation).
#
# Existing setup (when DOCKER_DIR already has a live stack):
#   --modify                      Reuse the existing setup and add/remove modules (with --modules).
#   --overwrite                   Replace the existing setup with a fresh template deployment.
#   -y, --assume-yes              Answer yes to confirmation prompts (unattended runs).
#
# Backup modes:
#   --backup                      Back up an existing deployed Docker tree with prompts.
#   --backup-quick                Back up an existing deployed Docker tree using defaults.
#   --backup-zip PATH             Resume from a previously generated config backup ZIP.
#   --backup-dir DIR              Folder where the config ZIP backup is written.
#
# Modules and target:
#   --preset ID                   Preselect a preset package's modules (see --list-presets).
#                                 Unioned with --modules when both are given. Fresh installs only.
#   --list-presets                List the preset packages from configs/presets.json and exit.
#   --modules LIST                Comma-separated module names.
#   --docker-dir DIR              Final Docker Compose directory (default: /opt/docker).
#   --template-source SOURCE      Template source: upstream or local.
#
# Core environment:
#   --timezone TZ                 TZ database identifier, for example Europe/Berlin.
#   --domain DOMAIN               Base public domain for Traefik hostnames.
#   --letsencrypt-email EMAIL     Email address passed to Let's Encrypt.
#
# Cloudflare DDNS:
#   --cloudflare-api-token TOKEN  Token used by cloudflare-ddns when selected.
#   --cloudflare-proxied VALUE    Cloudflare DDNS proxy mode when that module is enabled.
#
# Supabase (offered only for aiomanager, aiometadata, and aiostreams; if declined
# or no connection string is supplied, those addons keep their SQLite defaults):
#   --supabase-connection-string URL  Supabase direct session pooler IPv4 URL.
#   --supabase-db-password PASS       Password replacing [YOUR-PASSWORD].
#
# Authelia:
#   --authelia-username NAME      Initial username (letters, digits, hyphens, underscores).
#   --authelia-displayname NAME   Initial user display name.
#   --authelia-email EMAIL        Initial user email address.
#   --authelia-password PASS      Initial user password (argon2-hashed via Docker).
#
# Flow control:
#   --dry-run                     Exercise the flow without changing system state.
#   --skip-review                 Do not pause for manual staged-config review.
#   --skip-backup                 Do not create a config ZIP backup.
#   --skip-start                  Deploy files but do not start Docker Compose.
#   -h, --help                    Show this help and exit.
#
# Positional input:
#   backup.zip                    Optional path to a previously generated backup ZIP. When
#                                 supplied, main.sh imports it and skips fresh config staging.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/template.sh"

load_defaults

WORK_ROOT_ABS="${HOSTING_ROOT}/${WORK_ROOT:-.work}"
TEMPLATE_DIR_ABS="${HOSTING_ROOT}/${TEMPLATE_DIR:-.work/docker}"
CONFIG_DIR_ABS="${HOSTING_ROOT}/${CONFIG_DIR:-.work/config}"
MANIFEST_FILE="${CONFIG_DIR_ABS}/.stage-map.tsv"
SELECTED_MODULES_FILE="${WORK_ROOT_ABS}/selected-modules.txt"
BACKUP_AVAILABLE_MODULES_FILE="${WORK_ROOT_ABS}/backup-modules.txt"
BACKUP_METADATA_MODULES_FILE="${WORK_ROOT_ABS}/backup-selected-modules.txt"
LIVE_SETUP_MODULES_FILE="${WORK_ROOT_ABS}/live-selected-modules.txt"
LIVE_PRESENT_MODULES_FILE="${WORK_ROOT_ABS}/live-present-modules.txt"
MODULE_HOOK_TARGETS_FILE="${WORK_ROOT_ABS}/hook-target-modules.txt"
MODULE_HOOK_SYNC_ONLY_FILE="${WORK_ROOT_ABS}/hook-sync-only-modules.txt"
INSTALL_MODULES_FILE="${WORK_ROOT_ABS}/install-modules.txt"
REMOVED_MODULES_FILE="${WORK_ROOT_ABS}/removed-modules.txt"
UPDATE_MODULES_FILE="${WORK_ROOT_ABS}/update-modules.txt"
CLOUDFLARE_DDNS_MODULE=cloudflare-ddns
HOSTNAME_SYNC_MODULES=(authelia cloudflare-ddns honey)

MODULES_CSV=""
PRESET_REQUESTED=""
TIMEZONE_VALUE=""
DOCKER_DIR_VALUE=""
DOMAIN_VALUE=""
LETSENCRYPT_EMAIL_VALUE=""
CLOUDFLARE_API_TOKEN_VALUE=""
CLOUDFLARE_PROXIED_VALUE=""
SUPABASE_CONNECTION_STRING_VALUE=""
SUPABASE_DB_PASSWORD_VALUE=""
AUTHELIA_USERNAME_VALUE=""
AUTHELIA_DISPLAYNAME_VALUE=""
AUTHELIA_EMAIL_VALUE=""
AUTHELIA_PASSWORD_VALUE=""
BACKUP_DIR_VALUE="${BACKUP_OUTPUT_DIR:-$HOME}"
TEMPLATE_SOURCE_VALUE="${TEMPLATE_SOURCE:-upstream}"
BACKUP_ZIP_INPUT=""
DRY_RUN=0
SKIP_REVIEW=0
SKIP_BACKUP=0
SKIP_START=0
PREPARE_SSH=0
SKIP_SSH=0
ON_VPS=0
ON_VPS_SET=0
RUN_LOCAL=0
BACKUP_ZIP_RAW=""
BACKUP_MODE=0
BACKUP_QUICK_MODE=0
BACKUP_DIR_SET=0
DOCKER_DIR_SET=0
EXISTING_SETUP_MODE="fresh"
EXISTING_SETUP_MODE_REQUESTED=""
ASSUME_YES=0
SSH_HOST_VALUE=""
SSH_USER_VALUE=""
SSH_ALIAS_VALUE=""
SSH_KEY_PATH_VALUE=""

ORIGINAL_ARGS=("$@")

print_usage() {
  # Render this script's own intro comment block (the contiguous comment lines
  # right after the shebang) with the leading "# " stripped. Keeping --help
  # sourced from that block means editing the header at the top of this file is
  # all that is needed to update the help text.
  awk '
    NR == 1 && /^#!/ { next }
    !started && /^[[:space:]]*$/ { next }
    /^#/ { started = 1; line = $0; sub(/^#[ \t]?/, "", line); print line; next }
    started { exit }
  ' "${BASH_SOURCE[0]}"
}

while (( $# > 0 )); do
  case "$1" in
    -h|--help)
      print_usage
      exit 0
      ;;
    --backup)
      BACKUP_MODE=1
      shift
      ;;
    --backup-quick)
      BACKUP_QUICK_MODE=1
      shift
      ;;
    --modules)
      MODULES_CSV="$2"
      shift 2
      ;;
    --preset)
      PRESET_REQUESTED="$2"
      shift 2
      ;;
    --list-presets)
      print_preset_catalog
      exit 0
      ;;
    --timezone)
      TIMEZONE_VALUE="$2"
      shift 2
      ;;
    --docker-dir)
      DOCKER_DIR_VALUE="$2"
      DOCKER_DIR_SET=1
      shift 2
      ;;
    --domain)
      DOMAIN_VALUE="$2"
      shift 2
      ;;
    --letsencrypt-email)
      LETSENCRYPT_EMAIL_VALUE="$2"
      shift 2
      ;;
    --cloudflare-api-token)
      CLOUDFLARE_API_TOKEN_VALUE="$2"
      shift 2
      ;;
    --cloudflare-proxied)
      CLOUDFLARE_PROXIED_VALUE="$2"
      shift 2
      ;;
    --supabase-connection-string)
      SUPABASE_CONNECTION_STRING_VALUE="$2"
      shift 2
      ;;
    --supabase-db-password)
      SUPABASE_DB_PASSWORD_VALUE="$2"
      shift 2
      ;;
    --authelia-username)
      AUTHELIA_USERNAME_VALUE="$2"
      shift 2
      ;;
    --authelia-displayname)
      AUTHELIA_DISPLAYNAME_VALUE="$2"
      shift 2
      ;;
    --authelia-email)
      AUTHELIA_EMAIL_VALUE="$2"
      shift 2
      ;;
    --authelia-password)
      AUTHELIA_PASSWORD_VALUE="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR_VALUE="$2"
      BACKUP_DIR_SET=1
      shift 2
      ;;
    --backup-zip)
      BACKUP_ZIP_INPUT="$2"
      shift 2
      ;;
    --template-source)
      TEMPLATE_SOURCE_VALUE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-review)
      SKIP_REVIEW=1
      shift
      ;;
    --skip-backup)
      SKIP_BACKUP=1
      shift
      ;;
    --skip-start)
      SKIP_START=1
      shift
      ;;
    --prepare-ssh)
      PREPARE_SSH=1
      shift
      ;;
    --skip-ssh)
      SKIP_SSH=1
      shift
      ;;
    --ssh-host)
      SSH_HOST_VALUE="$2"
      shift 2
      ;;
    --ssh-user)
      SSH_USER_VALUE="$2"
      shift 2
      ;;
    --ssh-alias)
      SSH_ALIAS_VALUE="$2"
      shift 2
      ;;
    --ssh-key-path)
      SSH_KEY_PATH_VALUE="$2"
      shift 2
      ;;
    --modify)
      EXISTING_SETUP_MODE_REQUESTED="modify"
      shift
      ;;
    --overwrite)
      EXISTING_SETUP_MODE_REQUESTED="overwrite"
      shift
      ;;
    -y|--assume-yes|--yes)
      ASSUME_YES=1
      shift
      ;;
    --on-vps)
      ON_VPS=1
      ON_VPS_SET=1
      shift
      ;;
    --local)
      RUN_LOCAL=1
      ON_VPS_SET=1
      shift
      ;;
    -*)
      die "Unknown argument: $1"
      ;;
    *)
      [[ -z "${BACKUP_ZIP_INPUT}" ]] || die "Unexpected extra argument: $1"
      BACKUP_ZIP_INPUT="$1"
      BACKUP_ZIP_RAW="$1"
      shift
      ;;
  esac
done

if [[ -n "${BACKUP_ZIP_INPUT}" ]]; then
  BACKUP_ZIP_INPUT="$(absolute_path "${BACKUP_ZIP_INPUT}")"
fi

# Resolve --preset into the module list so unattended runs can name a package instead
# of spelling out every module. The preset's modules are unioned with any --modules
# list (preset first, duplicates dropped, order preserved), then the combined list
# flows through the normal --modules handling below.
if [[ -n "${PRESET_REQUESTED}" ]]; then
  preset_modules="$(preset_modules_for_id "${PRESET_REQUESTED}")" \
    || die "Unknown preset: ${PRESET_REQUESTED}. Available presets: $(preset_ids). Run with --list-presets for details."
  if [[ -z "${MODULES_CSV}" ]]; then
    MODULES_CSV="${preset_modules}"
  elif [[ -n "${preset_modules}" ]]; then
    MODULES_CSV="${preset_modules},${MODULES_CSV}"
  fi
  MODULES_CSV="$(printf '%s' "${MODULES_CSV}" | tr ',' '\n' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | awk 'NF && !seen[$0]++' | paste -sd, -)"
fi

# Let confirmation prompts auto-accept when --assume-yes/-y is set (unattended).
export HOSTING_ASSUME_YES="${ASSUME_YES}"

detect_existing_setup_modules() {
  local docker_dir="$1"
  local -n modules_ref="$2"
  local root_compose_path=""

  modules_ref=()

  [[ -d "${docker_dir}" ]] || return 1
  [[ -f "${docker_dir}/.env" ]] || return 1

  if [[ -f "${docker_dir}/compose.yaml" ]]; then
    root_compose_path="${docker_dir}/compose.yaml"
  elif [[ -f "${docker_dir}/compose.yml" ]]; then
    root_compose_path="${docker_dir}/compose.yml"
  else
    return 1
  fi

  mapfile -t modules_ref < <(list_included_modules "${root_compose_path}" | dedupe_lines)
  (( ${#modules_ref[@]} > 0 )) || return 1
}

write_optional_lines_file() {
  local file="$1"

  shift
  if (( $# > 0 )); then
    write_lines_file "${file}" "$@"
  else
    rm -f "${file}"
  fi
}

remove_root_host_vars_for_modules() {
  local root_env_file="$1"

  shift

  local module=""
  local env_var=""
  local sel=""
  local protected_vars=()

  # module_host_env_vars extracts every ${VAR} referenced in a module's
  # Host(`...`) rule, which can include shared vars like DOMAIN (when a rule is
  # written as `${DOMAIN}` directly) as well as hostname vars that a still
  # selected module also uses. Protect those: only remove *_HOSTNAME vars that no
  # currently-selected module depends on, so DOMAIN and in-use hostnames survive.
  for sel in "${selected_modules[@]+"${selected_modules[@]}"}"; do
    while IFS= read -r env_var; do
      [[ -n "${env_var}" ]] || continue
      protected_vars+=("${env_var}")
    done < <(module_host_env_vars "${TEMPLATE_DIR_ABS}" "${sel}")
  done

  for module in "$@"; do
    [[ -n "${module}" ]] || continue
    while IFS= read -r env_var; do
      [[ -n "${env_var}" ]] || continue
      [[ "${env_var}" == *_HOSTNAME ]] || continue
      array_contains "${env_var}" "${protected_vars[@]+"${protected_vars[@]}"}" && continue
      env_remove "${root_env_file}" "${env_var}"
    done < <(module_host_env_vars "${TEMPLATE_DIR_ABS}" "${module}")
  done
}

run_existing_docker_backup() {
  local docker_dir_default=""
  local backup_dir_default=""

  docker_dir_default="${DEFAULT_DOCKER_DIR:-/opt/docker}"
  backup_dir_default="${BACKUP_DIR_VALUE:-${BACKUP_OUTPUT_DIR:-$HOME}}"

  section "Docker configuration backup"
  require_commands python3

  if (( BACKUP_MODE )); then
    if (( ! DOCKER_DIR_SET )); then
      DOCKER_DIR_VALUE="$(prompt_value "Enter the deployed Docker Compose directory that should be backed up. This is the live stack folder that currently contains the root .env and compose files [DOCKER_DIR]" "${docker_dir_default}")"
    fi
    if (( ! BACKUP_DIR_SET )); then
      BACKUP_DIR_VALUE="$(prompt_value "Enter the directory where the backup ZIP should be written so you can restore this stack later [BACKUP_OUTPUT_DIR]" "${backup_dir_default}")"
    fi
  fi

  DOCKER_DIR_VALUE="${DOCKER_DIR_VALUE:-${docker_dir_default}}"
  BACKUP_DIR_VALUE="${BACKUP_DIR_VALUE:-${backup_dir_default}}"

  [[ -n "${DOCKER_DIR_VALUE}" ]] || die "Docker Compose directory is required for backup mode"
  [[ -n "${BACKUP_DIR_VALUE}" ]] || die "Backup output directory is required for backup mode"

  DOCKER_DIR_VALUE="$(absolute_path "${DOCKER_DIR_VALUE}")"
  BACKUP_DIR_VALUE="$(absolute_path "${BACKUP_DIR_VALUE}")"

  log "Source Docker directory: ${DOCKER_DIR_VALUE}"
  log "Backup output directory: ${BACKUP_DIR_VALUE}"

  if (( BACKUP_MODE )) && is_interactive; then
    prompt_yes_no "Create a new timestamped backup ZIP from ${DOCKER_DIR_VALUE} into ${BACKUP_DIR_VALUE} now? This only reads the live stack and writes a separate archive without changing the deployed files." yes || die "Backup cancelled."
  fi

  "${HOSTING_ROOT}/steps/backup-docker-config.sh" \
    --docker-dir "${DOCKER_DIR_VALUE}" \
    --output-dir "${BACKUP_DIR_VALUE}"
}

run_local_remote_deploy() {
  local ssh_target_file="${WORK_ROOT_ABS}/ssh-target.env"
  local remote_dir="hosting-setup"
  local ssh_alias=""
  local hosting_parent="" hosting_name=""
  local remote_args=() arg=""
  local remote_cmd=""
  local local_rc=0
  local prepare_ssh_args=()

  ensure_dialog_ui "the hosting setup"
  ensure_directory "${WORK_ROOT_ABS}"
  require_commands ssh scp tar

  if is_interactive; then
    show_message "🖥️  Local-to-VPS Setup" "You are running this on your local computer, so the script will take care of the connection for you. First we prepare an SSH key and a connection alias for your VPS. Then it copies the hosting files up to your server and runs the rest of the setup there over SSH."
  fi

  section "SSH setup"
  if (( SKIP_SSH )); then
    log "Skipping SSH preparation (--skip-ssh); using the existing '${SSH_ALIAS_VALUE:-${DEFAULT_SSH_ALIAS:-streaming}}' SSH alias."
  else
    # Forward any SSH details supplied as flags so prepare-ssh can run without
    # prompts (enables a fully unattended --local deploy).
    [[ -n "${SSH_ALIAS_VALUE}" ]] && prepare_ssh_args+=(--alias "${SSH_ALIAS_VALUE}")
    [[ -n "${SSH_HOST_VALUE}" ]] && prepare_ssh_args+=(--host "${SSH_HOST_VALUE}")
    [[ -n "${SSH_USER_VALUE}" ]] && prepare_ssh_args+=(--user "${SSH_USER_VALUE}")
    [[ -n "${SSH_KEY_PATH_VALUE}" ]] && prepare_ssh_args+=(--key-path "${SSH_KEY_PATH_VALUE}")
    # This runs inside a function the caller invokes as `run_local_remote_deploy
    # || ...`, which disables errexit here. Check the result explicitly so a
    # failed SSH prep aborts instead of silently continuing into the copy step.
    HOSTING_SSH_TARGET_FILE="${ssh_target_file}" "${HOSTING_ROOT}/steps/prepare-ssh.sh" \
      "${prepare_ssh_args[@]+"${prepare_ssh_args[@]}"}" \
      || die "SSH preparation failed; cannot continue with the local-to-VPS deploy."
  fi

  if [[ -f "${ssh_target_file}" ]]; then
    # shellcheck disable=SC1090
    source "${ssh_target_file}"
    ssh_alias="${SSH_ALIAS:-}"
  fi

  [[ -n "${ssh_alias}" ]] || ssh_alias="${SSH_ALIAS_VALUE:-${DEFAULT_SSH_ALIAS:-streaming}}"
  [[ -n "${ssh_alias}" ]] || die "Could not determine which SSH alias to use for the VPS connection."

  section "VPS connection check"
  log "Checking that ${ssh_alias} can be reached over SSH..."
  if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "${ssh_alias}" true 2>/dev/null; then
    if is_interactive; then
      warn "Could not log in to ${ssh_alias} without a password yet."
      show_message "One More SSH Step" "Before the files can be copied, your VPS needs to trust this computer's SSH key. If you have not done that yet, add the public key on the server now (paste it into your provider's SSH-key field, or run the ssh-copy-id command shown in the previous step). Once 'ssh ${ssh_alias}' logs you in without asking for a password, come back here and continue."
      prompt_yes_no "Is 'ssh ${ssh_alias}' now logging you in without a password? Choose yes to try the connection again." yes || die "The VPS connection is not ready yet. Re-run this setup once 'ssh ${ssh_alias}' works."
      ssh -o ConnectTimeout=15 "${ssh_alias}" true || die "Still could not connect to ${ssh_alias}. Please re-run once SSH is working."
    else
      die "Cannot reach ${ssh_alias} over SSH. Make sure the key is installed and the alias works, then retry."
    fi
  fi
  success "Connected to ${ssh_alias}."

  section "Copying hosting files to the VPS"
  hosting_parent="$(dirname "${SCRIPT_DIR}")"
  hosting_name="$(basename "${SCRIPT_DIR}")"
  log "Uploading the hosting folder to ~/${remote_dir} on ${ssh_alias}..."
  tar -C "${hosting_parent}" --exclude="${hosting_name}/.work" -czf - "${hosting_name}" \
    | ssh "${ssh_alias}" "rm -rf ~/${remote_dir} && mkdir -p ~/${remote_dir} && tar -C ~/${remote_dir} -xzf -" \
    || die "Failed to copy the hosting files to the VPS."
  success "Hosting files are now on the VPS at ~/${remote_dir}/${hosting_name}."

  local skip_next=0
  for arg in "${ORIGINAL_ARGS[@]+"${ORIGINAL_ARGS[@]}"}"; do
    if (( skip_next )); then
      skip_next=0
      continue
    fi
    case "${arg}" in
      --local|--on-vps|--prepare-ssh|--skip-ssh|--dry-run)
        ;;
      --ssh-host|--ssh-user|--ssh-alias|--ssh-key-path)
        # Local-only SSH details; drop the flag and its value from the remote run.
        skip_next=1
        ;;
      *)
        if [[ -n "${BACKUP_ZIP_RAW}" && "${arg}" == "${BACKUP_ZIP_RAW}" ]]; then
          continue
        fi
        remote_args+=("${arg}")
        ;;
    esac
  done

  if [[ -n "${BACKUP_ZIP_INPUT}" ]]; then
    log "Copying the backup ZIP to the VPS..."
    scp -q "${BACKUP_ZIP_INPUT}" "${ssh_alias}:${remote_dir}/$(basename "${BACKUP_ZIP_INPUT}")" \
      || die "Failed to copy the backup ZIP to the VPS."
    remote_args+=("../$(basename "${BACKUP_ZIP_INPUT}")")
  fi

  remote_args+=(--on-vps --skip-ssh)

  remote_cmd="cd ~/${remote_dir}/${hosting_name} && ./main.sh"
  for arg in "${remote_args[@]}"; do
    remote_cmd+=" $(printf '%q' "${arg}")"
  done

  section "Running the setup on the VPS"
  if is_interactive; then
    show_message "Continuing on Your VPS" "Everything is uploaded. From here the setup runs on your VPS, so the next questions and screens are coming from the server through your SSH connection. When it finishes you will land back on your local machine."
  fi
  log "Connecting to ${ssh_alias} to run the rest of the setup..."

  if is_interactive && tty_device_available; then
    ssh -t "${ssh_alias}" "${remote_cmd}" || local_rc=$?
  else
    ssh "${ssh_alias}" "${remote_cmd}" || local_rc=$?
  fi

  rm -rf "${WORK_ROOT_ABS}" 2>/dev/null || true
  return "${local_rc}"
}

if (( BACKUP_MODE && BACKUP_QUICK_MODE )); then
  die "Use either --backup or --backup-quick, not both"
fi

if (( BACKUP_MODE || BACKUP_QUICK_MODE )); then
  [[ -z "${BACKUP_ZIP_INPUT}" ]] || die "Backup ZIP import cannot be combined with --backup or --backup-quick"
  run_existing_docker_backup
  exit 0
fi

# ---------------------------------------------------------------------------
# Decide where this run actually executes.
#
# main.sh supports two starting points:
#   * On the VPS itself (for example right after init.sh placed the hosting
#     folder there). SSH is already done, so we just continue the setup here.
#   * On your local computer, where the script first prepares SSH, copies the
#     hosting folder to the VPS, and re-runs itself there automatically.
# A dry run always executes locally because it only exercises the prep logic.
# ---------------------------------------------------------------------------
if (( DRY_RUN )); then
  ON_VPS=1
  ON_VPS_SET=1
fi

if [[ "${HOSTING_ON_VPS:-0}" == "1" ]]; then
  ON_VPS=1
  ON_VPS_SET=1
fi

if (( ! ON_VPS_SET )); then
  if (( RUN_LOCAL )); then
    ON_VPS=0
  elif is_interactive; then
    ensure_dialog_ui "the hosting setup"
    location_choice="$(prompt_choice \
      "Where Are You Running This?" \
      "This setup can run in two places. If you are already logged in to your VPS (for example right after running init.sh on it), pick the first option and everything happens here on this server. If you are sitting at your own laptop or desktop, pick the second option and the script will set up SSH, copy the hosting files to your VPS, and continue the whole setup there for you." \
      "vps" \
      "vps" "I am on the VPS - run the setup here on this machine" \
      "local" "I am on my local computer - connect to my VPS and run it there")"
    case "${location_choice}" in
      vps) ON_VPS=1 ;;
      local) ON_VPS=0 ;;
      *) die "Unknown execution location choice: ${location_choice}" ;;
    esac
  else
    ON_VPS=1
  fi
fi

if (( ! ON_VPS )); then
  local_rc=0
  run_local_remote_deploy || local_rc=$?
  exit "${local_rc}"
fi

section "Hosting preparation"
prime_sudo_session "the hosting setup"
log "Work directory: ${WORK_ROOT_ABS}"
ensure_directory "${WORK_ROOT_ABS}"
ensure_apt_packages python3 openssl curl
setup_cleanup_trap
register_cleanup_path "${WORK_ROOT_ABS}"

if (( DRY_RUN )); then
  export HOSTING_DRY_RUN=1
  SKIP_REVIEW=1
  SKIP_START=1
  dry_run_log "SSH setup, Docker installation, Docker Compose start, external IP lookup, and Supabase changes are skipped."
  DOCKER_DIR_VALUE="${WORK_ROOT_ABS}/dry-run/deploy"
  if (( ! BACKUP_DIR_SET )); then
    BACKUP_DIR_VALUE="${WORK_ROOT_ABS}/dry-run/backup"
  fi
  ensure_directory "${DOCKER_DIR_VALUE}"
  ensure_directory "${BACKUP_DIR_VALUE}"
fi

ensure_dialog_ui "the hosting setup"

if is_interactive; then
  show_message "🖥️  Hosting Perfect Setup" "This guided setup runs on your VPS. It will verify Docker, download the upstream Docker template, let you choose which app modules to deploy, stage editable config files, and then deploy the final stack to this server. You will be asked to confirm each major step before the script makes any changes."
fi

if (( DRY_RUN )); then
  dry_run_log "Skipping SSH setup."
elif (( PREPARE_SSH )); then
  section "SSH setup"
  "${HOSTING_ROOT}/steps/prepare-ssh.sh"
else
  # We are running directly on the VPS now, so SSH access is already working
  # (you used it to get here). The local-computer path handles all SSH and key
  # preparation before this script is ever copied up and run here.
  log "Running directly on the VPS, so local SSH preparation is not needed here."
fi

if (( DRY_RUN )); then
  dry_run_log "Skipping Docker installation."
else
  section "Docker setup"
  if is_interactive; then
    show_message "Docker Setup" "The next step verifies Docker and Docker Compose on this machine, installs them if they are missing, and makes sure your user can access Docker. This is required because the entire hosting stack is deployed with Docker Compose."
    prompt_yes_no "Check Docker now and install or configure it if needed so the hosting stack can be deployed later?" yes || die "Docker setup cancelled."
  fi
  HOSTING_DOCKER_PROMPTED=1 "${HOSTING_ROOT}/steps/install-docker.sh"
fi

existing_live_modules=()
existing_live_present_modules=()

section "Deployment target"
if is_interactive; then
  show_message "Deployment Target" "Choose the final Docker Compose directory now, immediately after Docker setup. The script will inspect that folder before doing template work so it can warn you about an existing live setup and let you choose whether to overwrite it or continue from it."
fi

if (( DRY_RUN )); then
  dry_run_log "Using dry-run deployment directory ${DOCKER_DIR_VALUE}."
elif (( ! DOCKER_DIR_SET )); then
  DOCKER_DIR_VALUE="$(prompt_value "Enter the final Docker Compose directory where this stack should be deployed on this machine. You can use ~, an absolute path, or a relative path [DOCKER_DIR]" "${DEFAULT_DOCKER_DIR:-/opt/docker}")"
fi

DOCKER_DIR_VALUE="${DOCKER_DIR_VALUE:-${DEFAULT_DOCKER_DIR:-/opt/docker}}"
[[ -n "${DOCKER_DIR_VALUE}" ]] || die "DOCKER_DIR is required"
DOCKER_DIR_VALUE="$(absolute_path "${DOCKER_DIR_VALUE}")"

if detect_existing_setup_modules "${DOCKER_DIR_VALUE}" existing_live_modules; then
  if [[ -n "${BACKUP_ZIP_INPUT}" ]]; then
    EXISTING_SETUP_MODE="overwrite"
    if is_interactive; then
      show_message "Existing Setup Detected" "A live hosting setup already exists in ${DOCKER_DIR_VALUE}. Restoring from a backup into this folder will replace files in that existing stack when deployment runs."
      prompt_yes_no "Continue with the backup restore and overwrite the existing setup in ${DOCKER_DIR_VALUE} when you deploy?" no || die "Restore cancelled."
    else
      warn "Existing setup detected in ${DOCKER_DIR_VALUE}; continuing in overwrite mode because prompts are unavailable."
    fi
  elif [[ -n "${EXISTING_SETUP_MODE_REQUESTED}" ]]; then
    EXISTING_SETUP_MODE="${EXISTING_SETUP_MODE_REQUESTED}"
    case "${EXISTING_SETUP_MODE}" in
      modify)
        log "Continuing from existing setup in ${DOCKER_DIR_VALUE} (--modify)."
        ;;
      overwrite)
        warn "Overwriting the existing setup in ${DOCKER_DIR_VALUE} (--overwrite)."
        ;;
    esac
  elif is_interactive; then
    show_message "Existing Setup Detected" "A live hosting setup already exists in ${DOCKER_DIR_VALUE}. You can either overwrite that target with the prepared upstream files, or continue from the existing setup so the current modules start preselected and you can add or remove modules safely."
    EXISTING_SETUP_MODE="$(prompt_choice "Existing Setup Detected" "Choose how the installer should handle the existing live setup in ${DOCKER_DIR_VALUE}." "modify" "modify" "Reuse the existing setup, preload its values, and let me add or remove modules." "overwrite" "Overwrite the target directory with the prepared template deployment." "cancel" "Abort without touching this target directory.")"
    case "${EXISTING_SETUP_MODE}" in
      modify)
        log "Continuing from existing setup in ${DOCKER_DIR_VALUE}"
        ;;
      overwrite)
        prompt_yes_no "Proceed in overwrite mode for ${DOCKER_DIR_VALUE}? The final deploy step will replace the current live stack in that folder." no || die "Overwrite cancelled."
        ;;
      cancel)
        die "Setup cancelled."
        ;;
      *)
        die "Unknown existing setup choice: ${EXISTING_SETUP_MODE}"
        ;;
    esac
  else
    EXISTING_SETUP_MODE="overwrite"
    warn "Existing setup detected in ${DOCKER_DIR_VALUE}; continuing in overwrite mode because prompts are unavailable."
  fi
fi

section "Template fetch"
"${HOSTING_ROOT}/steps/fetch-template.sh" --source "${TEMPLATE_SOURCE_VALUE}" --template-dir "${TEMPLATE_DIR_ABS}"
"${HOSTING_ROOT}/steps/sync-bundled-apps.sh" --template-dir "${TEMPLATE_DIR_ABS}"

if is_interactive; then
  show_message "Custom Modules" "The upstream template has been downloaded into ${TEMPLATE_DIR_ABS}, and any apps bundled under ${HOSTING_ROOT}/apps have already been merged into ${TEMPLATE_DIR_ABS}/apps. If you want to add any further one-off app folders under ${TEMPLATE_DIR_ABS}/apps now, do that before module discovery continues. Each extra module must live in its own folder and contain a compose.yaml or compose.yml file so the script can detect it. For apps you want available on every run, add them under ${HOSTING_ROOT}/apps instead."
  prompt_yes_no "Have you finished adding any custom app folders under ${TEMPLATE_DIR_ABS}/apps so module discovery can continue?" yes || die "Module discovery cancelled."
fi

base_template_modules=()
base_required_modules=()
base_optional_modules=()
discover_modules "${TEMPLATE_DIR_ABS}" base_template_modules base_required_modules base_optional_modules

backup_available_modules=()
backup_metadata_modules=()
backup_default_modules_csv=""
if [[ -n "${BACKUP_ZIP_INPUT}" ]]; then
  section "Backup inspection"
  "${HOSTING_ROOT}/steps/inspect-backup.sh" \
    --zip-file "${BACKUP_ZIP_INPUT}" \
    --template-dir "${TEMPLATE_DIR_ABS}" \
    --available-modules-file "${BACKUP_AVAILABLE_MODULES_FILE}" \
    --metadata-modules-file "${BACKUP_METADATA_MODULES_FILE}"
  if [[ -f "${BACKUP_AVAILABLE_MODULES_FILE}" ]]; then
    mapfile -t backup_available_modules < <(read_lines_file "${BACKUP_AVAILABLE_MODULES_FILE}")
  fi
  if [[ -f "${BACKUP_METADATA_MODULES_FILE}" ]]; then
    mapfile -t backup_metadata_modules < <(read_lines_file "${BACKUP_METADATA_MODULES_FILE}")
  fi
  backup_default_modules_csv="$(join_by ',' "${backup_available_modules[@]}")"
fi

live_default_modules_csv=""
if [[ "${EXISTING_SETUP_MODE}" == "modify" ]]; then
  section "Existing setup inspection"
  "${HOSTING_ROOT}/steps/inspect-live-setup.sh" \
    --docker-dir "${DOCKER_DIR_VALUE}" \
    --template-dir "${TEMPLATE_DIR_ABS}" \
    --enabled-modules-file "${LIVE_SETUP_MODULES_FILE}" \
    --present-modules-file "${LIVE_PRESENT_MODULES_FILE}"
  if [[ -f "${LIVE_SETUP_MODULES_FILE}" ]]; then
    mapfile -t existing_live_modules < <(read_lines_file "${LIVE_SETUP_MODULES_FILE}")
  fi
  if [[ -f "${LIVE_PRESENT_MODULES_FILE}" ]]; then
    mapfile -t existing_live_present_modules < <(read_lines_file "${LIVE_PRESENT_MODULES_FILE}")
  fi
  live_default_modules_csv="$(join_by ',' "${existing_live_modules[@]}")"
fi

all_modules=()
required_modules=()
optional_modules=()
discover_modules "${TEMPLATE_DIR_ABS}" all_modules required_modules optional_modules
if (( ${#base_required_modules[@]} > 0 )); then
  normalized_optional_modules=()
  for module in "${base_required_modules[@]}"; do
    if array_contains "${module}" "${all_modules[@]}" && ! array_contains "${module}" "${required_modules[@]}"; then
      required_modules+=("${module}")
    fi
  done
  for module in "${optional_modules[@]}"; do
    array_contains "${module}" "${required_modules[@]}" || normalized_optional_modules+=("${module}")
  done
  optional_modules=("${normalized_optional_modules[@]}")
fi
success "Discovered ${#all_modules[@]} modules (${#required_modules[@]} required, ${#optional_modules[@]} optional)."

if [[ -n "${BACKUP_ZIP_INPUT}" ]]; then
  section "Module selection"
  selected_modules=()
  backup_default_modules_csv="$(join_by ',' "${backup_metadata_modules[@]}")"
  if [[ -z "${backup_default_modules_csv}" ]]; then
    backup_default_modules_csv="$(join_by ',' "${backup_available_modules[@]}")"
  fi
  if (( ${#backup_metadata_modules[@]} > 0 )); then
    selected_modules=("${backup_metadata_modules[@]}")
  else
    split_csv_into_array "${backup_default_modules_csv}" selected_modules
  fi
  if [[ -n "${MODULES_CSV}" ]]; then
    extra_modules=()
    split_csv_into_array "${MODULES_CSV}" extra_modules
    for module in "${extra_modules[@]}"; do
      [[ -n "${module}" ]] || continue
      array_contains "${module}" "${selected_modules[@]}" || selected_modules+=("${module}")
    done
  elif is_interactive; then
    select_modules_interactively "${TEMPLATE_DIR_ABS}" "${SELECTED_MODULES_FILE}" "${backup_default_modules_csv}"
    mapfile -t selected_modules < <(read_lines_file "${SELECTED_MODULES_FILE}")
  elif (( ${#backup_metadata_modules[@]} == 0 )); then
    die "Backup ZIP does not contain HOSTING_SELECTED_MODULES.txt. Run interactively or pass --modules."
  fi
  for module in "${required_modules[@]}"; do
    array_contains "${module}" "${selected_modules[@]}" || selected_modules+=("${module}")
  done
  for module in "${selected_modules[@]}"; do
    array_contains "${module}" "${all_modules[@]}" || die "Unknown module: ${module}"
  done
  write_lines_file "${SELECTED_MODULES_FILE}" "${selected_modules[@]}"
  success "Selected modules from backup: $(join_by ', ' "${selected_modules[@]}")"
elif [[ "${EXISTING_SETUP_MODE}" == "modify" ]]; then
  section "Module selection"
  selected_modules=("${existing_live_modules[@]}")
  if [[ -n "${MODULES_CSV}" ]]; then
    selected_modules=()
    split_csv_into_array "${MODULES_CSV}" selected_modules
  elif is_interactive; then
    select_modules_interactively "${TEMPLATE_DIR_ABS}" "${SELECTED_MODULES_FILE}" "${live_default_modules_csv}"
    mapfile -t selected_modules < <(read_lines_file "${SELECTED_MODULES_FILE}")
  fi
  for module in "${required_modules[@]}"; do
    array_contains "${module}" "${selected_modules[@]}" || selected_modules+=("${module}")
  done
  for module in "${selected_modules[@]}"; do
    array_contains "${module}" "${all_modules[@]}" || die "Unknown module: ${module}"
  done
  write_lines_file "${SELECTED_MODULES_FILE}" "${selected_modules[@]}"
  success "Selected modules from existing setup: $(join_by ', ' "${selected_modules[@]}")"
elif [[ -n "${MODULES_CSV}" ]]; then
  section "Module selection"
  selected_modules=()
  split_csv_into_array "${MODULES_CSV}" selected_modules
  for module in "${required_modules[@]}"; do
    array_contains "${module}" "${selected_modules[@]}" || selected_modules+=("${module}")
  done
  for module in "${selected_modules[@]}"; do
    array_contains "${module}" "${all_modules[@]}" || die "Unknown module: ${module}"
  done
  write_lines_file "${SELECTED_MODULES_FILE}" "${selected_modules[@]}"
  success "Selected modules: $(join_by ', ' "${selected_modules[@]}")"
else
  preset_defaults_csv=""
  if is_interactive && [[ "${EXISTING_SETUP_MODE}" == "fresh" ]]; then
    select_preset_interactively
    preset_defaults_csv="${PRESET_MODULES_CSV}"
  fi
  select_modules_interactively "${TEMPLATE_DIR_ABS}" "${SELECTED_MODULES_FILE}" "${preset_defaults_csv}"
fi
mapfile -t selected_modules < <(read_lines_file "${SELECTED_MODULES_FILE}")

existing_selected_modules=()
install_modules=()
reactivated_modules=()
added_modules=()
removed_modules=()
if [[ "${EXISTING_SETUP_MODE}" == "modify" ]]; then
  mapfile -t existing_selected_modules < <(read_lines_file "${LIVE_SETUP_MODULES_FILE}")

  for module in "${selected_modules[@]}"; do
    array_contains "${module}" "${existing_selected_modules[@]}" || added_modules+=("${module}")
    if array_contains "${module}" "${existing_live_present_modules[@]}"; then
      array_contains "${module}" "${existing_selected_modules[@]}" || reactivated_modules+=("${module}")
    else
      install_modules+=("${module}")
    fi
  done
  for module in "${existing_selected_modules[@]}"; do
    array_contains "${module}" "${selected_modules[@]}" || removed_modules+=("${module}")
  done

  if (( ${#added_modules[@]} > 0 )); then
    log "Modules to add: $(join_by ', ' "${added_modules[@]}")"
  fi
  if (( ${#removed_modules[@]} > 0 )); then
    log "Modules to remove: $(join_by ', ' "${removed_modules[@]}")"
  fi
  if (( ${#reactivated_modules[@]} > 0 )); then
    log "Modules to reactivate without overwriting existing folders: $(join_by ', ' "${reactivated_modules[@]}")"
  fi
  if (( ${#install_modules[@]} > 0 )); then
    log "Modules to install from template: $(join_by ', ' "${install_modules[@]}")"
  fi
  if (( ${#added_modules[@]} == 0 && ${#removed_modules[@]} == 0 )); then
    log "Selected modules already match the existing setup."
  fi
fi

: > "${INSTALL_MODULES_FILE}"
: > "${REMOVED_MODULES_FILE}"
if (( ${#install_modules[@]} > 0 )); then
  write_lines_file "${INSTALL_MODULES_FILE}" "${install_modules[@]}"
fi
if (( ${#removed_modules[@]} > 0 )); then
  write_lines_file "${REMOVED_MODULES_FILE}" "${removed_modules[@]}"
fi

if [[ -n "${BACKUP_ZIP_INPUT}" ]]; then
  section "Backup import"
  "${HOSTING_ROOT}/steps/import-backup.sh" \
    --zip-file "${BACKUP_ZIP_INPUT}" \
    --template-dir "${TEMPLATE_DIR_ABS}" \
    --config-dir "${CONFIG_DIR_ABS}" \
    --manifest-file "${MANIFEST_FILE}" \
    --modules-file "${SELECTED_MODULES_FILE}"
elif [[ "${EXISTING_SETUP_MODE}" == "modify" ]]; then
  section "Existing setup import"
  "${HOSTING_ROOT}/steps/import-live-setup.sh" \
    --docker-dir "${DOCKER_DIR_VALUE}" \
    --template-dir "${TEMPLATE_DIR_ABS}" \
    --config-dir "${CONFIG_DIR_ABS}" \
    --manifest-file "${MANIFEST_FILE}" \
    --modules-file "${INSTALL_MODULES_FILE}"
else
  section "Config staging"
  "${HOSTING_ROOT}/steps/stage-configs.sh" --template-dir "${TEMPLATE_DIR_ABS}" --config-dir "${CONFIG_DIR_ABS}" --modules-file "${SELECTED_MODULES_FILE}" --manifest-file "${MANIFEST_FILE}"
fi

ROOT_ENV="${CONFIG_DIR_ABS}/.env"
root_tz_default="$(env_get "${ROOT_ENV}" TZ || true)"
root_domain_default="$(env_get "${ROOT_ENV}" DOMAIN || true)"
root_letsencrypt_default="$(env_get "${ROOT_ENV}" LETSENCRYPT_EMAIL || true)"
root_tz_default="${root_tz_default:-${DEFAULT_TIMEZONE:-Europe/Berlin}}"
env_value_is_placeholder "${root_domain_default}" && root_domain_default=""
env_value_is_placeholder "${root_letsencrypt_default}" && root_letsencrypt_default=""

if is_interactive; then
  show_message "Environment Details" "Next, enter the remaining core environment values for the stack: Timezone, Domain, and the Email address used for Let's Encrypt notifications. The deployment target is already set to ${DOCKER_DIR_VALUE}. These values are written into the staged root .env and used across multiple services."
fi

TIMEZONE_VALUE="${TIMEZONE_VALUE:-$(prompt_value "Enter the timezone using the TZ database identifier (https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) so containers log and schedule tasks correctly, for example ${root_tz_default} [TZ]" "${root_tz_default}")}"
if (( DRY_RUN )); then
  dry_run_log "Using DOCKER_DIR ${DOCKER_DIR_VALUE}"
fi
DOMAIN_VALUE="${DOMAIN_VALUE:-$(prompt_value "Enter the public base domain that Traefik-routed services should use for their hostnames, for example example.com [DOMAIN]" "${root_domain_default}")}"
LETSENCRYPT_EMAIL_VALUE="${LETSENCRYPT_EMAIL_VALUE:-$(prompt_value "Enter the email address that Let's Encrypt should use for expiry and certificate notifications [LETSENCRYPT_EMAIL]" "${root_letsencrypt_default}")}"

[[ -n "${TIMEZONE_VALUE}" ]] || die "Timezone is required"
[[ -n "${DOCKER_DIR_VALUE}" ]] || die "DOCKER_DIR is required"
[[ -n "${DOMAIN_VALUE}" ]] || die "DOMAIN is required"
[[ -n "${LETSENCRYPT_EMAIL_VALUE}" ]] || die "LETSENCRYPT_EMAIL is required"

DOCKER_DIR_VALUE="$(absolute_path "${DOCKER_DIR_VALUE}")"

env_upsert "${ROOT_ENV}" TZ "${TIMEZONE_VALUE}"
env_upsert "${ROOT_ENV}" DOCKER_DIR "${DOCKER_DIR_VALUE}"
env_upsert "${ROOT_ENV}" PUID "$(id -u)"
env_upsert "${ROOT_ENV}" PGID "$(id -g)"
env_upsert "${ROOT_ENV}" DOMAIN "${DOMAIN_VALUE}"
env_upsert "${ROOT_ENV}" LETSENCRYPT_EMAIL "${LETSENCRYPT_EMAIL_VALUE}"
success "Root .env values are staged."

if (( ${#removed_modules[@]} > 0 )); then
  remove_root_host_vars_for_modules "${ROOT_ENV}" "${removed_modules[@]}"
  success "Removed hostname env vars for deselected modules: $(join_by ', ' "${removed_modules[@]}")"
fi

hostname_vars_missing=()
hostname_vars_modules=()
for module in "${selected_modules[@]}"; do
  while IFS= read -r env_var; do
    [[ -n "${env_var}" ]] || continue
    array_contains "${env_var}" "${hostname_vars_missing[@]}" && continue
    existing_val="$(env_get "${ROOT_ENV}" "${env_var}" || true)"
    env_value_is_placeholder "${existing_val}" || continue
    hostname_vars_missing+=("${env_var}")
    hostname_vars_modules+=("${module}")
  done < <(module_host_env_vars "${TEMPLATE_DIR_ABS}" "${module}")
done

if (( ${#hostname_vars_missing[@]} > 0 )); then
  section "Hostname configuration"
  if is_interactive; then
    show_message "Hostname Configuration" "The following service hostnames are missing from the root .env. For each one, enter the subdomain prefix and the script will store the full hostname as prefix.${DOMAIN_VALUE} in the root .env. Press Enter to accept the suggested prefix."
  fi
  for i in "${!hostname_vars_missing[@]}"; do
    env_var="${hostname_vars_missing[i]}"
    module="${hostname_vars_modules[i]}"
    suggested_subdomain="$(printf '%s' "${env_var}" | sed 's/_HOSTNAME$//' | tr '[:upper:]_' '[:lower:]-')"
    subdomain_prefix="$(prompt_value "Enter the subdomain prefix for the ${module} service so its hostname can be set as prefix.\${DOMAIN} in the root .env [${env_var}]" "${suggested_subdomain}")"
    [[ -n "${subdomain_prefix}" ]] || subdomain_prefix="${suggested_subdomain}"
    env_upsert_near_hostnames "${ROOT_ENV}" "${env_var}" "${subdomain_prefix}."'${DOMAIN}'
    success "${env_var}=${subdomain_prefix}."'${DOMAIN}'
  done
fi

# Fresh/overwrite installs start from the upstream root .env, which defines a
# *_HOSTNAME entry for every upstream module. Drop the entries for modules that
# were not selected so the deployed root .env only lists hostnames in use. (In
# modify mode, removed modules are already cleaned above; backup restores keep
# the .env from the backup as-is.) Runs before template pruning so each module's
# hostname vars are still discoverable from its compose file.
if [[ -z "${BACKUP_ZIP_INPUT}" && "${EXISTING_SETUP_MODE}" != "modify" ]]; then
  unselected_modules=()
  for module in "${base_template_modules[@]}"; do
    array_contains "${module}" "${selected_modules[@]}" || unselected_modules+=("${module}")
  done
  if (( ${#unselected_modules[@]} > 0 )); then
    remove_root_host_vars_for_modules "${ROOT_ENV}" "${unselected_modules[@]}"
    success "Pruned root .env hostnames down to the selected modules."
  fi
fi

sync_staged_configs_to_modules() {
  # keep_modules_file:    modules whose staged config must be preserved in the
  #                       manifest (the full selected set). Entries for modules
  #                       not in this list are dropped from staging.
  # restage_modules_file: modules to (re)stage from the template tree. Defaults
  #                       to keep_modules_file. In modify mode this is only the
  #                       newly installed modules so already-present modules keep
  #                       their imported/hook-updated staged config untouched.
  local keep_modules_file="$1"
  local restage_modules_file="${2:-$1}"
  local keep_modules_now=()
  local manifest_tmp=""
  local module="" source_rel="" stage_rel="" item_type=""

  manifest_tmp="$(mktemp "${WORK_ROOT_ABS}/stage-map.XXXXXX")"
  mapfile -t keep_modules_now < <(read_lines_file "${keep_modules_file}")

  while IFS=$'\t' read -r module source_rel stage_rel item_type; do
    [[ -n "${source_rel}" ]] || continue
    if [[ "${module}" == "root" ]]; then
      printf '%s\t%s\t%s\t%s\n' "${module}" "${source_rel}" "${stage_rel}" "${item_type}" >> "${manifest_tmp}"
      continue
    fi

    if array_contains "${module}" "${keep_modules_now[@]}"; then
      [[ -e "${CONFIG_DIR_ABS}/${stage_rel}" ]] || die "Staged path missing for ${source_rel}: ${CONFIG_DIR_ABS}/${stage_rel}"
      printf '%s\t%s\t%s\t%s\n' "${module}" "${source_rel}" "${stage_rel}" "${item_type}" >> "${manifest_tmp}"
      continue
    fi

    rm -rf "${CONFIG_DIR_ABS}/${stage_rel}"
  done < "${MANIFEST_FILE}"

  mv "${manifest_tmp}" "${MANIFEST_FILE}"

  while IFS= read -r module; do
    [[ -n "${module}" ]] || continue
    while IFS= read -r entry; do
      [[ -n "${entry}" ]] || continue
      stage_item "${module}" "apps/${module}/${entry}" "${MANIFEST_FILE}" "${TEMPLATE_DIR_ABS}" "${CONFIG_DIR_ABS}"
    done < <(module_stageable_entries "${TEMPLATE_DIR_ABS}" "${module}")
  done < <(read_lines_file "${restage_modules_file}")
}

module_hook_title() {
  local script_path="$1"
  local module_name="$2"
  local hook_name=""

  hook_name="$(basename "${script_path}" .sh)"
  case "${hook_name}" in
    all.supabase)
      printf 'Supabase setup'
      ;;
    authelia)
      printf 'Authelia setup'
      ;;
    cloudflare-ddns)
      printf 'Cloudflare DDNS setup'
      ;;
    *)
      if [[ -n "${module_name}" ]]; then
        printf 'Module setup: %s' "${module_name}"
      else
        printf 'Module setup: %s' "${hook_name}"
      fi
      ;;
  esac
}

run_module_hooks() {
  local targets_file="${1:-}"
  local sync_only_file="${2:-}"
  local hook_delim=$'\x1f'
  local script_path="" metadata="" scope="" module="" dependencies="" order=""
  local hook_modules=()
  local requested_targets=()
  local hook_title="" hook_target=""
  local hooks_file=""
  local hooks_interactive=0
  local should_run=1
  local hook_module=""

  if [[ -n "${targets_file}" && -f "${targets_file}" ]]; then
    mapfile -t requested_targets < <(read_lines_file "${targets_file}")
  fi

  if is_interactive && tty_device_available; then
    hooks_interactive=1
  fi

  hooks_file="$(mktemp "${WORK_ROOT_ABS}/hook-order.XXXXXX")"

  while IFS= read -r script_path; do
    [[ -x "${script_path}" ]] || die "Module hook is not executable: ${script_path}"
    metadata="$("${script_path}" --metadata)"
    scope="$(printf '%s\n' "${metadata}" | awk -F= '$1 == "scope" { print $2 }')"
    module="$(printf '%s\n' "${metadata}" | awk -F= '$1 == "module" { print $2 }')"
    dependencies="$(printf '%s\n' "${metadata}" | awk -F= '$1 == "dependencies" { print $2 }')"
    order="$(printf '%s\n' "${metadata}" | awk -F= '$1 == "order" { print $2 }')"
    [[ -n "${scope}" ]] || die "Module hook did not report scope metadata: ${script_path}"
    printf '%s%s%s%s%s%s%s%s%s\n' \
      "${order:-100}" "${hook_delim}" \
      "${script_path}" "${hook_delim}" \
      "${scope}" "${hook_delim}" \
      "${module}" "${hook_delim}" \
      "${dependencies}" >> "${hooks_file}"
  done < <(find "${HOSTING_ROOT}/modules" -maxdepth 1 -type f -name '*.sh' | sort)

  while IFS="${hook_delim}" read -r order script_path scope module dependencies; do
    case "${scope}" in
      module)
        [[ -n "${module}" ]] || die "Module hook did not report module metadata: ${script_path}"
        hook_modules=("${module}")
        ;;
      all)
        [[ -n "${dependencies}" ]] || die "All-scope hook did not report dependencies metadata: ${script_path}"
        split_csv_into_array "${dependencies}" hook_modules
        ;;
      *)
        die "Unknown module scope '${scope}' in ${script_path}"
        ;;
    esac

    if [[ -n "${targets_file}" ]]; then
      should_run=1
      for hook_module in "${hook_modules[@]}"; do
        if array_contains "${hook_module}" "${requested_targets[@]}"; then
          should_run=0
          break
        fi
      done
      (( should_run == 0 )) || continue
    fi

    hook_title="$(module_hook_title "${script_path}" "${module}")"
    hook_target="$(join_by ', ' "${hook_modules[@]}")"
    section "${hook_title}"
    log "Running $(basename "${script_path}") for ${hook_target}"

    run_module_hook_script "${script_path}" "${hooks_interactive}" env \
      HOSTING_TEMPLATE_DIR="${TEMPLATE_DIR_ABS}" \
      HOSTING_CONFIG_DIR="${CONFIG_DIR_ABS}" \
      HOSTING_MANIFEST_FILE="${MANIFEST_FILE}" \
      HOSTING_SELECTED_MODULES_FILE="${SELECTED_MODULES_FILE}" \
      HOSTING_MODULE_HOOK_TARGETS_FILE="${targets_file}" \
      HOSTING_MODULE_SYNC_ONLY_FILE="${sync_only_file}" \
      HOSTING_ROOT_ENV="${ROOT_ENV}" \
      HOSTING_CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN_VALUE}" \
      HOSTING_CLOUDFLARE_PROXIED="${CLOUDFLARE_PROXIED_VALUE}" \
      HOSTING_SUPABASE_CONNECTION_STRING="${SUPABASE_CONNECTION_STRING_VALUE}" \
      HOSTING_SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD_VALUE}" \
      HOSTING_AUTHELIA_USERNAME="${AUTHELIA_USERNAME_VALUE}" \
      HOSTING_AUTHELIA_DISPLAYNAME="${AUTHELIA_DISPLAYNAME_VALUE}" \
      HOSTING_AUTHELIA_EMAIL="${AUTHELIA_EMAIL_VALUE}" \
      HOSTING_AUTHELIA_PASSWORD="${AUTHELIA_PASSWORD_VALUE}"
  done < <(sort -t "${hook_delim}" -k1,1n -k2,2 "${hooks_file}")

  rm -f "${hooks_file}"
}

run_module_hook_script() {
  local script_path="$1"
  local interactive_mode="${2:-0}"

  shift 2

  if [[ "${interactive_mode}" == "1" ]] && tty_device_available; then
    "$@" "${script_path}" </dev/tty
  else
    "$@" "${script_path}"
  fi
}

hook_target_modules=()
hook_sync_only_modules=()
if [[ -z "${BACKUP_ZIP_INPUT}" ]]; then
  if [[ "${EXISTING_SETUP_MODE}" == "modify" ]]; then
    hook_target_modules=("${install_modules[@]}")
    if (( ${#added_modules[@]} > 0 || ${#removed_modules[@]} > 0 )); then
      # These hooks derive config from the selected module set and must be
      # rerun when modules are added, removed, or reactivated.
      for module in "${HOSTNAME_SYNC_MODULES[@]}"; do
        if array_contains "${module}" "${selected_modules[@]}" && \
          ! array_contains "${module}" "${hook_target_modules[@]}"; then
          hook_target_modules+=("${module}")
        fi
      done

      if array_contains authelia "${selected_modules[@]}" && \
        array_contains authelia "${existing_selected_modules[@]}" && \
        ! array_contains authelia "${install_modules[@]}"; then
        hook_sync_only_modules+=(authelia)
      fi
    fi
  else
    hook_target_modules=("${selected_modules[@]}")
  fi
fi

write_optional_lines_file "${MODULE_HOOK_TARGETS_FILE}" "${hook_target_modules[@]}"
write_optional_lines_file "${MODULE_HOOK_SYNC_ONLY_FILE}" "${hook_sync_only_modules[@]}"

# In modify mode, hooks can rewrite the staged config of already-present modules
# that are not in install_modules: hostname-sync hooks edit authelia/honey, and
# cloudflare-ddns also rewrites the traefik compose as a side effect. Deploy
# would otherwise skip every already-present module, so those refreshed configs
# would never reach DOCKER_DIR. Re-sync all kept (selected, already-present)
# modules: their staged config is the imported live copy plus any hook edits, and
# their app directories hold config only (runtime data lives in DOCKER_DATA_DIR),
# so the data-preserving app-directory sync is safe and a no-op for unchanged
# modules.
update_modules=()
if [[ "${EXISTING_SETUP_MODE}" == "modify" ]]; then
  for module in "${selected_modules[@]}"; do
    array_contains "${module}" "${install_modules[@]}" || update_modules+=("${module}")
  done
fi
write_optional_lines_file "${UPDATE_MODULES_FILE}" "${update_modules[@]+"${update_modules[@]}"}"

section "Module automation"
if [[ -n "${BACKUP_ZIP_INPUT}" ]]; then
  log "Skipping module hooks because the staged config was imported from a backup ZIP."
elif [[ "${EXISTING_SETUP_MODE}" == "modify" && ! -f "${MODULE_HOOK_TARGETS_FILE}" ]]; then
  log "Skipping module hooks because the selected modules already match the existing setup."
else
  run_module_hooks "${MODULE_HOOK_TARGETS_FILE}" "${MODULE_HOOK_SYNC_ONLY_FILE}"
fi
if [[ "${EXISTING_SETUP_MODE}" == "modify" ]]; then
  sync_staged_configs_to_modules "${SELECTED_MODULES_FILE}" "${INSTALL_MODULES_FILE}"
else
  sync_staged_configs_to_modules "${SELECTED_MODULES_FILE}"
fi
success "Staged config directory synced to the final selected modules."

mapfile -t final_modules < <(read_lines_file "${SELECTED_MODULES_FILE}")
prune_template_to_modules "${TEMPLATE_DIR_ABS}" "${final_modules[@]}"
success "Template pruned to selected modules: $(join_by ', ' "${final_modules[@]}")"

pruned_modules=()
pruned_required_modules=()
pruned_optional_modules=()
discover_modules "${TEMPLATE_DIR_ABS}" pruned_modules pruned_required_modules pruned_optional_modules
(( ${#pruned_modules[@]} == ${#final_modules[@]} )) || die "Template pruning mismatch: expected ${#final_modules[@]} modules, found ${#pruned_modules[@]}"
for module in "${final_modules[@]}"; do
  array_contains "${module}" "${pruned_modules[@]}" || die "Template pruning mismatch: missing selected module ${module}"
done
for module in "${pruned_modules[@]}"; do
  array_contains "${module}" "${final_modules[@]}" || die "Template pruning mismatch: unexpected module remained after pruning: ${module}"
done

required_profile="${REQUIRED_PROFILE:-required}"

compose_profile_exclude=("all")
for module in "${pruned_required_modules[@]}"; do
  while IFS= read -r profile; do
    [[ -n "${profile}" && "${profile}" != "${required_profile}" ]] || continue
    array_contains "${profile}" "${compose_profile_exclude[@]}" || compose_profile_exclude+=("${profile}")
  done < <(module_profile_names "${TEMPLATE_DIR_ABS}" "${module}")
done

compose_profiles=("${required_profile}")
while IFS= read -r profile; do
  [[ -n "${profile}" ]] || continue
  array_contains "${profile}" "${compose_profile_exclude[@]}" && continue
  array_contains "${profile}" "${compose_profiles[@]}" && continue
  compose_profiles+=("${profile}")
done < <(template_profile_names "${TEMPLATE_DIR_ABS}" "${final_modules[@]}")

env_upsert "${ROOT_ENV}" COMPOSE_PROFILES "\"$(join_by ',' "${compose_profiles[@]}")\""
success "COMPOSE_PROFILES=$(join_by ',' "${compose_profiles[@]}")"

if (( ! SKIP_REVIEW )) && is_interactive; then
  section "Manual review"
  log "Review staged files in ${CONFIG_DIR_ABS}"
  warn "Do not rename staged files. Prefixes such as AIOSTREAMS., HONEY., and TRAEFIK. map files back to modules."
  show_message "Manual Review" "Review the staged files in ${CONFIG_DIR_ABS} before deployment. You can edit values there if needed, but do not rename the files because their names map back to source files in specific modules. Continue when you are satisfied with the staged configuration."
fi

if is_interactive; then
  deploy_prompt="Deploy the prepared stack into ${DOCKER_DIR_VALUE} now? This will sync the generated files into that directory and make it the live Docker Compose tree for this setup."
  if [[ "${EXISTING_SETUP_MODE}" == "modify" ]]; then
    deploy_prompt="Update the existing stack in ${DOCKER_DIR_VALUE} now? This will sync the selected add/remove changes into that live Docker Compose tree."
  elif (( ${#existing_live_modules[@]} > 0 )); then
    deploy_prompt="Deploy the prepared stack into ${DOCKER_DIR_VALUE} now? This will replace the existing live Docker Compose tree in that directory."
  fi
  prompt_yes_no "${deploy_prompt}" yes || die "Deployment cancelled."
fi

section "Deploy"
deploy_args=(
  --template-dir "${TEMPLATE_DIR_ABS}"
  --config-dir "${CONFIG_DIR_ABS}"
  --manifest-file "${MANIFEST_FILE}"
  --target-dir "${DOCKER_DIR_VALUE}"
)
if [[ "${EXISTING_SETUP_MODE}" == "modify" ]]; then
  deploy_args+=(--modify-mode --install-modules-file "${INSTALL_MODULES_FILE}" --removed-modules-file "${REMOVED_MODULES_FILE}" --update-modules-file "${UPDATE_MODULES_FILE}")
fi
if [[ "${HOSTING_DRY_RUN:-0}" == "1" ]]; then
  deploy_args+=(--no-fix-permissions)
fi
"${HOSTING_ROOT}/steps/deploy-template.sh" "${deploy_args[@]}"

if (( ! SKIP_BACKUP )); then
  if ! is_interactive || prompt_yes_no "Create a backup ZIP of the prepared configuration now? This is recommended because it makes later restores and migrations much easier." yes; then
    if is_interactive && (( ! BACKUP_DIR_SET )); then
      BACKUP_DIR_VALUE="$(prompt_value "Enter the directory where the generated backup ZIP should be saved after deployment [BACKUP_OUTPUT_DIR]" "${BACKUP_DIR_VALUE}")"
    fi
    BACKUP_DIR_VALUE="$(absolute_path "${BACKUP_DIR_VALUE}")"
    section "Backup"
    "${HOSTING_ROOT}/steps/backup-configs.sh" --config-dir "${CONFIG_DIR_ABS}" --template-dir "${TEMPLATE_DIR_ABS}" --manifest-file "${MANIFEST_FILE}" --modules-file "${SELECTED_MODULES_FILE}" --output-dir "${BACKUP_DIR_VALUE}"
  fi
fi

if (( ! SKIP_START )); then
  if is_interactive; then
    prompt_yes_no "Start the Docker Compose stack now so Docker can launch the selected services immediately?" yes || {
      warn "Skipping Docker Compose start at your request."
      SKIP_START=1
    }
  fi
fi

if (( ! SKIP_START )); then
  section "Docker Compose start"
  "${HOSTING_ROOT}/steps/start-stack.sh" --target-dir "${DOCKER_DIR_VALUE}"
fi

public_ip="$(default_public_ip)"
hostnames=()
for module in "${final_modules[@]}"; do
  while IFS= read -r env_var; do
    value="$(env_get_resolved "${ROOT_ENV}" "${env_var}")"
    [[ -n "${value}" ]] && hostnames+=("${value}")
  done < <(module_host_env_vars "${TEMPLATE_DIR_ABS}" "${module}")
done

section "Final summary"
if (( DRY_RUN )); then
  success "Dry run prepared stack in ${DOCKER_DIR_VALUE}"
else
  success "Prepared stack deployed to ${DOCKER_DIR_VALUE}"
fi
if [[ -n "${public_ip}" ]]; then
  log "Public IP: ${public_ip}"
fi
if (( ${#hostnames[@]} > 0 )); then
  if (( DRY_RUN )); then
    log "Dry run generated these hostnames from the prepared config:"
  elif array_contains "${CLOUDFLARE_DDNS_MODULE}" "${final_modules[@]}"; then
    log "Cloudflare DDNS is configured for these hostnames:"
  else
    warn "Create DNS A records pointing these hostnames to the public IP above:"
  fi
  printf '  %s\n' $(printf '%s\n' "${hostnames[@]}" | dedupe_lines | sort)
fi

rm -rf "${TEMPLATE_DIR_ABS}" "${CONFIG_DIR_ABS}"
rm -f "${SELECTED_MODULES_FILE}"
rm -f "${BACKUP_AVAILABLE_MODULES_FILE}" "${BACKUP_METADATA_MODULES_FILE}" "${LIVE_SETUP_MODULES_FILE}" "${LIVE_PRESENT_MODULES_FILE}" "${MODULE_HOOK_TARGETS_FILE}" "${MODULE_HOOK_SYNC_ONLY_FILE}" "${INSTALL_MODULES_FILE}" "${REMOVED_MODULES_FILE}" "${UPDATE_MODULES_FILE}"
rmdir "${WORK_ROOT_ABS}" 2>/dev/null || true
success "Temporary work directories cleaned up."

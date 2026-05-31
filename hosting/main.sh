#!/usr/bin/env bash

# Main end-to-end entrypoint for preparing and deploying the hosting stack.
#
# Purpose:
#   This script implements the full prompt.md flow. It installs Docker, fetches
#   the upstream docker-compose-template into a temporary work directory, lets
#   the user choose modules, stages editable config files, applies module hooks,
#   restores staged files into the fetched template, deploys the prepared tree
#   into DOCKER_DIR, optionally backs up the staged config, starts Compose, and
#   prints DNS guidance.
#
# Interactive usage:
#   ./hosting/main.sh
#   ./hosting/main.sh /path/to/streaming-backup.zip
#
# Unattended usage:
#   ./hosting/main.sh \
#     --modules aiostreams,aiometadata,honey,cloudflare-ddns \
#     --domain example.com \
#     --letsencrypt-email admin@example.com \
#     --skip-review
#
# Key options:
#   --modules                     Comma-separated optional modules.
#   --timezone                    TZ database identifier, for example Europe/Berlin.
#   --docker-dir                  Final Docker Compose directory, default /opt/docker.
#   --domain                      Base public domain for Traefik hostnames.
#   --letsencrypt-email           Email address passed to Let's Encrypt.
#   --cloudflare-api-token        Token used by cloudflare-ddns when selected.
#   --cloudflare-proxied          Cloudflare DDNS proxy mode when that module is enabled.
#   --supabase-connection-string  Supabase direct session pooler IPv4 URL.
#   --supabase-db-password        Password replacing [YOUR-PASSWORD].
#   --backup-zip                  Resume from a previously generated config backup ZIP.
#   --backup-dir                  Folder where the config ZIP backup is written.
#   --template-source             upstream or local.
#   --dry-run                     Exercise file-preparation flow without changing system state.
#   --prepare-ssh                 Run the SSH helper before Docker preparation.
#   --skip-ssh                    Skip the interactive SSH preparation prompt.
#   --skip-review                 Do not pause for manual staged-config review.
#   --skip-backup                 Do not create a config ZIP backup.
#   --skip-start                  Deploy files but do not start Docker Compose.
#
# Positional input:
#   backup.zip                    Optional path to a previously generated backup ZIP.
#                                 When supplied, main.sh imports it into staging and
#                                 skips fresh config staging plus module hooks.
#
# Supabase behavior:
#   Supabase is intentionally offered only for aiomanager, aiometadata, and
#   aiostreams. If the user declines or no connection string is supplied in
#   unattended mode, those addons keep their upstream SQLite defaults.

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
CLOUDFLARE_DDNS_MODULE=cloudflare-ddns

MODULES_CSV=""
TIMEZONE_VALUE=""
DOCKER_DIR_VALUE=""
DOMAIN_VALUE=""
LETSENCRYPT_EMAIL_VALUE=""
CLOUDFLARE_API_TOKEN_VALUE=""
CLOUDFLARE_PROXIED_VALUE=""
SUPABASE_CONNECTION_STRING_VALUE=""
SUPABASE_DB_PASSWORD_VALUE=""
BACKUP_DIR_VALUE="${BACKUP_OUTPUT_DIR:-$HOME}"
TEMPLATE_SOURCE_VALUE="${TEMPLATE_SOURCE:-upstream}"
BACKUP_ZIP_INPUT=""
DRY_RUN=0
SKIP_REVIEW=0
SKIP_BACKUP=0
SKIP_START=0
PREPARE_SSH=0
SKIP_SSH=0
BACKUP_DIR_SET=0

while (( $# > 0 )); do
  case "$1" in
    --modules)
      MODULES_CSV="$2"
      shift 2
      ;;
    --timezone)
      TIMEZONE_VALUE="$2"
      shift 2
      ;;
    --docker-dir)
      DOCKER_DIR_VALUE="$2"
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
    -*)
      die "Unknown argument: $1"
      ;;
    *)
      [[ -z "${BACKUP_ZIP_INPUT}" ]] || die "Unexpected extra argument: $1"
      BACKUP_ZIP_INPUT="$1"
      shift
      ;;
  esac
done

section "Hosting preparation"
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

if (( DRY_RUN )); then
  dry_run_log "Skipping SSH setup."
elif (( PREPARE_SSH )); then
  section "SSH setup"
  "${HOSTING_ROOT}/steps/prepare-ssh.sh"
elif (( ! SKIP_SSH )) && is_interactive && prompt_yes_no "Prepare SSH key/config for VPS access?" yes; then
  section "SSH setup"
  "${HOSTING_ROOT}/steps/prepare-ssh.sh"
fi

if (( DRY_RUN )); then
  dry_run_log "Skipping Docker installation."
else
  section "Docker setup"
  "${HOSTING_ROOT}/steps/install-docker.sh"
fi

section "Template fetch"
"${HOSTING_ROOT}/steps/fetch-template.sh" --source "${TEMPLATE_SOURCE_VALUE}" --template-dir "${TEMPLATE_DIR_ABS}"

all_modules=()
required_modules=()
optional_modules=()
discover_modules "${TEMPLATE_DIR_ABS}" all_modules required_modules optional_modules
success "Discovered ${#all_modules[@]} modules (${#required_modules[@]} required, ${#optional_modules[@]} optional)."

if [[ -n "${BACKUP_ZIP_INPUT}" ]]; then
  section "Backup import"
  "${HOSTING_ROOT}/steps/import-backup.sh" \
    --zip-file "${BACKUP_ZIP_INPUT}" \
    --template-dir "${TEMPLATE_DIR_ABS}" \
    --config-dir "${CONFIG_DIR_ABS}" \
    --manifest-file "${MANIFEST_FILE}" \
    --modules-file "${SELECTED_MODULES_FILE}"

  mapfile -t selected_modules < <(read_lines_file "${SELECTED_MODULES_FILE}")
  if [[ -n "${MODULES_CSV}" ]]; then
    extra_modules=()
    split_csv_into_array "${MODULES_CSV}" extra_modules
    for module in "${extra_modules[@]}"; do
      [[ -n "${module}" ]] || continue
      array_contains "${module}" "${selected_modules[@]}" || selected_modules+=("${module}")
    done
  fi
  for module in "${required_modules[@]}"; do
    array_contains "${module}" "${selected_modules[@]}" || selected_modules+=("${module}")
  done
  for module in "${selected_modules[@]}"; do
    array_contains "${module}" "${all_modules[@]}" || die "Unknown module: ${module}"
  done
  write_lines_file "${SELECTED_MODULES_FILE}" "${selected_modules[@]}"
  success "Selected modules from backup: $(join_by ', ' "${selected_modules[@]}")"
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
  select_modules_interactively "${TEMPLATE_DIR_ABS}" "${SELECTED_MODULES_FILE}"
fi

if [[ -z "${BACKUP_ZIP_INPUT}" ]]; then
  section "Config staging"
  "${HOSTING_ROOT}/steps/stage-configs.sh" --template-dir "${TEMPLATE_DIR_ABS}" --config-dir "${CONFIG_DIR_ABS}" --modules-file "${SELECTED_MODULES_FILE}" --manifest-file "${MANIFEST_FILE}"
fi

ROOT_ENV="${CONFIG_DIR_ABS}/.env"
root_tz_default="$(env_get "${ROOT_ENV}" TZ || true)"
root_docker_dir_default="$(env_get "${ROOT_ENV}" DOCKER_DIR || true)"
root_domain_default="$(env_get "${ROOT_ENV}" DOMAIN || true)"
root_letsencrypt_default="$(env_get "${ROOT_ENV}" LETSENCRYPT_EMAIL || true)"
root_authelia_session_default="$(env_get "${ROOT_ENV}" AUTHELIA_SESSION_SECRET || true)"
root_authelia_storage_default="$(env_get "${ROOT_ENV}" AUTHELIA_STORAGE_ENCRYPTION_KEY || true)"
root_authelia_jwt_default="$(env_get "${ROOT_ENV}" AUTHELIA_JWT_SECRET || true)"

root_tz_default="${DEFAULT_TIMEZONE:-${root_tz_default:-Europe/Berlin}}"
root_docker_dir_default="${DOCKER_TARGET_DIR:-${root_docker_dir_default:-/opt/docker}}"
env_value_is_placeholder "${root_domain_default}" && root_domain_default=""
env_value_is_placeholder "${root_letsencrypt_default}" && root_letsencrypt_default=""

TIMEZONE_VALUE="${TIMEZONE_VALUE:-$(prompt_value "Timezone (see https://en.wikipedia.org/wiki/List_of_tz_database_time_zones and use the TZ identifier value)" "${root_tz_default}")}"
if (( DRY_RUN )); then
  dry_run_log "Overriding DOCKER_DIR with ${DOCKER_DIR_VALUE}"
else
  DOCKER_DIR_VALUE="${DOCKER_DIR_VALUE:-$(prompt_value "DOCKER_DIR" "${root_docker_dir_default}")}"
fi
DOMAIN_VALUE="${DOMAIN_VALUE:-$(prompt_value "Public domain for Traefik-routed services" "${root_domain_default}")}"
LETSENCRYPT_EMAIL_VALUE="${LETSENCRYPT_EMAIL_VALUE:-$(prompt_value "Email for Let's Encrypt notifications" "${root_letsencrypt_default}")}"

[[ -n "${TIMEZONE_VALUE}" ]] || die "Timezone is required"
[[ -n "${DOCKER_DIR_VALUE}" ]] || die "DOCKER_DIR is required"
[[ -n "${DOMAIN_VALUE}" ]] || die "DOMAIN is required"
[[ -n "${LETSENCRYPT_EMAIL_VALUE}" ]] || die "LETSENCRYPT_EMAIL is required"

env_upsert "${ROOT_ENV}" TZ "${TIMEZONE_VALUE}"
env_upsert "${ROOT_ENV}" DOCKER_DIR "${DOCKER_DIR_VALUE}"
env_upsert "${ROOT_ENV}" PUID "$(id -u)"
env_upsert "${ROOT_ENV}" PGID "$(id -g)"
env_upsert "${ROOT_ENV}" DOMAIN "${DOMAIN_VALUE}"
env_upsert "${ROOT_ENV}" LETSENCRYPT_EMAIL "${LETSENCRYPT_EMAIL_VALUE}"
env_upsert "${ROOT_ENV}" AUTHELIA_SESSION_SECRET "${HOSTING_AUTHELIA_SESSION_SECRET:-${root_authelia_session_default:-$(generate_secret_base64)}}"
env_upsert "${ROOT_ENV}" AUTHELIA_STORAGE_ENCRYPTION_KEY "${HOSTING_AUTHELIA_STORAGE_ENCRYPTION_KEY:-${root_authelia_storage_default:-$(generate_secret_base64)}}"
env_upsert "${ROOT_ENV}" AUTHELIA_JWT_SECRET "${HOSTING_AUTHELIA_JWT_SECRET:-${root_authelia_jwt_default:-$(generate_secret_base64)}}"
success "Root .env values and generated secrets are staged."

run_module_hooks() {
  local hook_delim=$'\x1f'
  local script_path="" metadata="" scope="" module="" dependencies="" order=""
  local dependencies_array=() selected_modules_now=() enabled=0 dependency=""
  local hooks_file=""

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
    mapfile -t selected_modules_now < <(read_lines_file "${SELECTED_MODULES_FILE}")

    case "${scope}" in
      module)
        [[ -n "${module}" ]] || die "Module hook did not report module metadata: ${script_path}"
        array_contains "${module}" "${selected_modules_now[@]}" || continue
        ;;
      all)
        [[ -n "${dependencies}" ]] || die "All-scope hook did not report dependencies metadata: ${script_path}"
        enabled=0
        split_csv_into_array "${dependencies}" dependencies_array
        for dependency in "${dependencies_array[@]}"; do
          if array_contains "${dependency}" "${selected_modules_now[@]}"; then
            enabled=1
            break
          fi
        done
        (( enabled )) || continue
        ;;
      *)
        die "Unknown module scope '${scope}' in ${script_path}"
        ;;
    esac

    HOSTING_TEMPLATE_DIR="${TEMPLATE_DIR_ABS}" \
    HOSTING_CONFIG_DIR="${CONFIG_DIR_ABS}" \
    HOSTING_MANIFEST_FILE="${MANIFEST_FILE}" \
    HOSTING_SELECTED_MODULES_FILE="${SELECTED_MODULES_FILE}" \
    HOSTING_ROOT_ENV="${ROOT_ENV}" \
    HOSTING_CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN_VALUE}" \
    HOSTING_CLOUDFLARE_PROXIED="${CLOUDFLARE_PROXIED_VALUE}" \
    HOSTING_SUPABASE_CONNECTION_STRING="${SUPABASE_CONNECTION_STRING_VALUE}" \
    HOSTING_SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD_VALUE}" \
    "${script_path}"
  done < <(sort -t "${hook_delim}" -k1,1n -k2,2 "${hooks_file}")

  rm -f "${hooks_file}"
}

section "Module automation"
if [[ -n "${BACKUP_ZIP_INPUT}" ]]; then
  log "Skipping module hooks because the staged config was imported from a backup ZIP."
else
  run_module_hooks
fi

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

compose_profiles=()
while IFS= read -r profile; do
  [[ -n "${profile}" ]] || continue
  compose_profiles+=("${profile}")
done < <(template_profile_names "${TEMPLATE_DIR_ABS}" "${final_modules[@]}")
(( ${#compose_profiles[@]} > 0 )) || die "No compose profiles found in the pruned template"
required_profile="${REQUIRED_PROFILE:-required}"
array_contains "${required_profile}" "${compose_profiles[@]}" || compose_profiles=("${required_profile}" "${compose_profiles[@]}")

env_upsert "${ROOT_ENV}" COMPOSE_PROFILES "\"$(join_by ',' "${compose_profiles[@]}")\""
success "COMPOSE_PROFILES=$(join_by ',' "${compose_profiles[@]}")"

if (( ! SKIP_REVIEW )) && is_interactive; then
  section "Manual review"
  log "Review staged files in ${CONFIG_DIR_ABS}"
  warn "Do not rename staged files. Prefixes such as AIOSTREAMS., HONEY., and TRAEFIK. map files back to modules."
  read -r -p "$(style '35' '?') Press Enter when you are ready to deploy the staged configuration." _
fi

section "Deploy"
"${HOSTING_ROOT}/steps/deploy-template.sh" \
  --template-dir "${TEMPLATE_DIR_ABS}" \
  --config-dir "${CONFIG_DIR_ABS}" \
  --manifest-file "${MANIFEST_FILE}" \
  --target-dir "${DOCKER_DIR_VALUE}" \
  $([[ "${HOSTING_DRY_RUN:-0}" == "1" ]] && printf '%s' '--no-fix-permissions')

if (( ! SKIP_BACKUP )); then
  if ! is_interactive || prompt_yes_no "Create a backup archive of the staged configuration?" yes; then
    if is_interactive && (( ! BACKUP_DIR_SET )); then
      BACKUP_DIR_VALUE="$(prompt_value "Backup output directory" "${BACKUP_DIR_VALUE}")"
    fi
    section "Backup"
    "${HOSTING_ROOT}/steps/backup-configs.sh" --config-dir "${CONFIG_DIR_ABS}" --manifest-file "${MANIFEST_FILE}" --modules-file "${SELECTED_MODULES_FILE}" --output-dir "${BACKUP_DIR_VALUE}"
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
rmdir "${WORK_ROOT_ABS}" 2>/dev/null || true
success "Temporary work directories cleaned up."

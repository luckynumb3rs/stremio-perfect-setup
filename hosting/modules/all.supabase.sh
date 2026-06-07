#!/usr/bin/env bash

# Supabase provisioning hook for the AIO addon family.
#
# Purpose:
#   This hook runs when any selected module is aiomanager, aiometadata, or
#   aiostreams. Supabase is offered to the user as an alternative to each addon's
#   upstream local SQLite default. If the user says yes, the
#   hook creates per-addon schemas and roles, then writes generated Postgres
#   URLs into the staged addon .env files.
#
# Manual hook contract:
#
#   HOSTING_CONFIG_DIR=./hosting/.work/config \
#   HOSTING_SELECTED_MODULES_FILE=./hosting/.work/selected-modules.txt \
#   HOSTING_SUPABASE_CONNECTION_STRING='postgresql://...' \
#   HOSTING_SUPABASE_DB_PASSWORD='secret' \
#   ./hosting/modules/all.supabase.sh
#
# Skip behavior:
#   If no connection string is supplied in unattended mode, or the interactive
#   user declines Supabase, the hook exits without modifying database variables.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
ensure_dialog_ui "Supabase setup"

MODULE_NAME="supabase"
SUPPORTED_ADDONS=(aiomanager aiometadata aiostreams)
declare -A DATABASE_URL_KEYS=(
  [aiomanager]=DATABASE_URL
  [aiometadata]=DATABASE_URI
  [aiostreams]=DATABASE_URI
)
declare -A EXTRA_ENV_ASSIGNMENTS=(
  [aiomanager]="DB_TYPE=postgres"
)

if [[ "${1:-}" == "--metadata" ]]; then
  printf 'scope=all\ndependencies=aiomanager,aiometadata,aiostreams\norder=110\n'
  printf 'param=connection_string|string|false|Supabase direct session pooler IPv4 connection string\n'
  printf 'param=db_password|secret|false|Supabase database password\n'
  exit 0
fi

[[ -n "${HOSTING_CONFIG_DIR:-}" ]] || die "HOSTING_CONFIG_DIR is not set"
[[ -n "${HOSTING_SELECTED_MODULES_FILE:-}" ]] || die "HOSTING_SELECTED_MODULES_FILE is not set"

simulate_schema_rows() {
  local base_connection_string="$1"
  shift
  HOSTING_SIMULATED_BASE_CONNECTION="${base_connection_string}" \
  HOSTING_SIMULATED_ADDONS="$(printf '%s\n' "$@")" \
  python3 - <<'PY'
import os
import re

base = os.environ["HOSTING_SIMULATED_BASE_CONNECTION"]
addons = [line.strip() for line in os.environ.get("HOSTING_SIMULATED_ADDONS", "").splitlines() if line.strip()]

match = re.match(r'^([^:]+://)([^:]+)(:.*)$', base)
if not match:
    raise SystemExit("Could not extract the database user from the connection string")

prefix, parsed_user, suffix = match.groups()
for addon in addons:
    clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', addon).lower()
    if re.match(r'^[0-9]', clean_name):
        clean_name = f'addon_{clean_name}'
    schema_name = clean_name
    role_name = f'{clean_name}_user'
    if '.' in parsed_user:
        replacement_user = role_name + parsed_user[parsed_user.index('.'):]
    else:
        replacement_user = role_name
    addon_connection = f'{prefix}{replacement_user}{suffix}'
    print('\t'.join([addon, schema_name, role_name, addon_connection]))
PY
}

selected_addons=()
if [[ -n "${HOSTING_MODULE_HOOK_TARGETS_FILE:-}" && -f "${HOSTING_MODULE_HOOK_TARGETS_FILE}" ]]; then
  while IFS= read -r module; do
    if array_contains "${module}" "${SUPPORTED_ADDONS[@]}" && selected_module_enabled "${module}"; then
      selected_addons+=("${module}")
    fi
  done < <(read_lines_file "${HOSTING_MODULE_HOOK_TARGETS_FILE}")
else
  while IFS= read -r module; do
    if array_contains "${module}" "${SUPPORTED_ADDONS[@]}"; then
      selected_addons+=("${module}")
    fi
  done < <(read_lines_file "${HOSTING_SELECTED_MODULES_FILE}")
fi

(( ${#selected_addons[@]} > 0 )) || exit 0

connection_string="${HOSTING_SUPABASE_CONNECTION_STRING:-}"
database_password="${HOSTING_SUPABASE_DB_PASSWORD:-}"
connection_string_uses_placeholder=0

if [[ -z "${connection_string}" ]]; then
  if is_interactive; then
    section "Supabase option"
    log "The selected AIO addons can use Supabase/Postgres instead of local SQLite: $(join_by ', ' "${selected_addons[@]}")"
    show_message "Supabase Option" "The selected AIO addons can use Supabase/Postgres instead of their default local SQLite databases: $(join_by ', ' "${selected_addons[@]}").

Before you continue:
1. Create or open a Supabase account.
2. Create a fresh project dedicated to these addons.
3. Save the database password for that project.
4. Open Project Settings > Database > Connection string.
5. Copy the direct session pooler IPv4 connection string exactly as shown.

If you enable this, the script will create one schema and one login role per selected addon, then write the generated connection strings into each staged addon .env file automatically."
    warn "Use a new database, not one already used for unrelated data."
    if ! prompt_yes_no "Use Supabase/Postgres instead of local SQLite for $(join_by ', ' "${selected_addons[@]}") so the script can provision per-addon schemas and credentials?" yes; then
      log "Keeping local SQLite for $(join_by ', ' "${selected_addons[@]}")"
      exit 0
    fi
    connection_string="$(prompt_value "Paste the Supabase direct session pooler IPv4 connection string that has enough access to create addon schemas and roles [SUPABASE_CONNECTION_STRING]")"
  else
    log "No Supabase connection string supplied; keeping local SQLite for $(join_by ', ' "${selected_addons[@]}")"
    exit 0
  fi
fi

if [[ "${connection_string}" == *"[YOUR-PASSWORD]"* ]]; then
  connection_string_uses_placeholder=1
fi

if [[ -z "${database_password}" ]]; then
  if (( connection_string_uses_placeholder )); then
    if is_interactive; then
      database_password="$(prompt_secret "Enter the database password referenced by that connection string so schema creation can authenticate successfully [SUPABASE_DB_PASSWORD]")"
    fi
  else
    database_password="$(extract_connection_string_password "${connection_string}")"
    if [[ -z "${database_password}" ]] && is_interactive; then
      database_password="$(prompt_secret "The connection string did not include a readable password. Enter the database password so schema creation can authenticate successfully [SUPABASE_DB_PASSWORD]")"
    fi
  fi
fi

[[ -n "${connection_string}" ]] || die "Supabase connection string is required for ${selected_addons[*]}"
[[ -n "${database_password}" ]] || die "Supabase database password is required for ${selected_addons[*]}"

addons_csv="$(join_by ',' "${selected_addons[@]}")"
if is_interactive && ! prompt_yes_no "Create or update the Supabase schemas and login roles now for ${addons_csv}, then write the generated connection strings into the staged addon .env files?" yes; then
  log "Skipping Supabase schema deployment and keeping local SQLite for ${addons_csv}"
  exit 0
fi

log "Creating Supabase schemas for: ${addons_csv}"
connection_string="${connection_string//\[YOUR-PASSWORD\]/${database_password}}"
if hosting_is_dry_run; then
  dry_run_log "Simulating Supabase schema deletion for ${addons_csv}."
  dry_run_log "Simulating Supabase schema creation for ${addons_csv}."
  mapfile -t schema_rows < <(simulate_schema_rows "${connection_string}" "${selected_addons[@]}")
else
  "${SCRIPT_DIR}/db/delete-addon-schemas.sh" --connection-string "${connection_string}" --addons "${addons_csv}"
  schema_output="$("${SCRIPT_DIR}/db/create-addon-schemas.sh" --connection-string "${connection_string}" --addons "${addons_csv}" --password "${database_password}")" \
    || die "Supabase schema creation failed for ${addons_csv}"
  mapfile -t schema_rows <<< "${schema_output}"
fi

(( ${#schema_rows[@]} > 0 )) || die "Supabase schema creation returned no rows for ${addons_csv}"

for row in "${schema_rows[@]}"; do
  IFS=$'\t' read -r addon_name schema_name role_name addon_connection <<< "${row}"
  [[ -n "${addon_connection:-}" ]] || continue

  env_file="${HOSTING_CONFIG_DIR}/$(module_prefix "${addon_name}").env"
  database_key="${DATABASE_URL_KEYS[${addon_name}]:-}"
  [[ -n "${database_key}" ]] || die "No database env key configured for addon: ${addon_name}"
  [[ -f "${env_file}" ]] || die "Missing staged env file for addon: ${env_file}"

  if [[ -n "${EXTRA_ENV_ASSIGNMENTS[${addon_name}]:-}" ]]; then
    IFS='=' read -r extra_key extra_value <<< "${EXTRA_ENV_ASSIGNMENTS[${addon_name}]}"
    env_upsert "${env_file}" "${extra_key}" "${extra_value}"
  fi

  env_upsert "${env_file}" "${database_key}" "${addon_connection}"
  log "Supabase connection prepared for ${addon_name}: ${role_name}"
done

success "Configured Supabase connection strings for $(join_by ', ' "${selected_addons[@]}")"

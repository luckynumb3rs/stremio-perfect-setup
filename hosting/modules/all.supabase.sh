#!/usr/bin/env bash

# Supabase provisioning hook for the AIO addon family.
#
# Purpose:
#   This hook runs when any selected module is aiomanager, aiometadata, or
#   aiostreams. Per prompt.md, Supabase is offered to the user as an alternative
#   to each addon's upstream local SQLite default. If the user says yes, the
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
  printf 'scope=all\ndependencies=%s\n' "$(join_by ',' "${SUPPORTED_ADDONS[@]}")"
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
while IFS= read -r module; do
  if array_contains "${module}" "${SUPPORTED_ADDONS[@]}"; then
    selected_addons+=("${module}")
  fi
done < <(read_lines_file "${HOSTING_SELECTED_MODULES_FILE}")

(( ${#selected_addons[@]} > 0 )) || exit 0

connection_string="${HOSTING_SUPABASE_CONNECTION_STRING:-}"
database_password="${HOSTING_SUPABASE_DB_PASSWORD:-}"

if [[ -z "${connection_string}" ]]; then
  if is_interactive; then
    section "Supabase option"
    log "The selected AIO addons can use Supabase instead of local SQLite: $(join_by ', ' "${selected_addons[@]}")"
    printf '  1. Create a Supabase account or open an existing account.\n'
    printf '  2. Create a new project/database dedicated to these addons.\n'
    printf '  3. Save the database password you set for the project.\n'
    printf '  4. Open Project Settings → Database → Connection string.\n'
    printf '  5. Copy the direct session pooler IPv4 connection string exactly as Supabase shows it.\n'
    warn "Use a new database, not one already used for unrelated data."
    if ! prompt_yes_no "Use Supabase for $(join_by ', ' "${selected_addons[@]}")?" no; then
      log "Keeping local SQLite for $(join_by ', ' "${selected_addons[@]}")"
      exit 0
    fi
    connection_string="$(prompt_value "Paste the Supabase direct session pooler IPv4 connection string")"
  else
    log "No Supabase connection string supplied; keeping local SQLite for $(join_by ', ' "${selected_addons[@]}")"
    exit 0
  fi
fi

if [[ -z "${database_password}" ]] && is_interactive; then
  database_password="$(prompt_secret "Enter the database password used in that connection string")"
fi

[[ -n "${connection_string}" ]] || die "Supabase connection string is required for ${selected_addons[*]}"
[[ -n "${database_password}" ]] || die "Supabase database password is required for ${selected_addons[*]}"

addons_csv="$(join_by ',' "${selected_addons[@]}")"
log "Creating Supabase schemas for: ${addons_csv}"
connection_string="${connection_string//\[YOUR-PASSWORD\]/${database_password}}"
if hosting_is_dry_run; then
  dry_run_log "Simulating Supabase schema creation for ${addons_csv}."
  mapfile -t schema_rows < <(simulate_schema_rows "${connection_string}" "${selected_addons[@]}")
else
  mapfile -t schema_rows < <("${SCRIPT_DIR}/db/create-addon-schemas.sh" --connection-string "${connection_string}" --addons "${addons_csv}" --password "${database_password}")
fi

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

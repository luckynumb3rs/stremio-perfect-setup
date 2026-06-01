#!/usr/bin/env bash

# Creates Supabase schemas and per-addon roles for selected AIO addons.
#
# Purpose:
#   This standalone helper is used by modules/all.supabase.sh and can also be
#   called manually. It connects to Supabase with the admin/base connection
#   string, replaces [YOUR-PASSWORD] if present, executes db/create-addon-
#   schemas.sql, and prints tab-separated rows containing generated addon
#   connection strings.
#
# Usage:
#   ./hosting/db/create-addon-schemas.sh \
#     --connection-string 'postgresql://postgres.project:[YOUR-PASSWORD]@host:5432/postgres' \
#     --addons aiostreams,aiometadata,aiomanager \
#     --password 'database-password'
#
# Output columns:
#   addon_name, schema_name, role_name, connection_string

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"

CONNECTION_STRING=""
ADDONS=""
PASSWORD=""

while (( $# > 0 )); do
  case "$1" in
    --connection-string)
      CONNECTION_STRING="$2"
      shift 2
      ;;
    --addons)
      ADDONS="$2"
      shift 2
      ;;
    --password)
      PASSWORD="$2"
      shift 2
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "${CONNECTION_STRING}" ]] || die "--connection-string is required"
[[ -n "${ADDONS}" ]] || die "--addons is required"
[[ -n "${PASSWORD}" ]] || die "--password is required"

HOSTING_LOG_TO_STDERR=1 ensure_apt_packages postgresql-client
CONNECTION_STRING="${CONNECTION_STRING//\[YOUR-PASSWORD\]/${PASSWORD}}"

psql "${CONNECTION_STRING}" \
  -X \
  -q \
  -t \
  -A \
  -F $'\t' \
  -v base_connection_string="${CONNECTION_STRING}" \
  -v addon_names_csv="${ADDONS}" \
  -v shared_password="${PASSWORD}" \
  -f "${HOSTING_ROOT}/db/create-addon-schemas.sql"

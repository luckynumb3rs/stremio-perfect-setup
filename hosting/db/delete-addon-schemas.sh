#!/usr/bin/env bash

# Removes Supabase schemas and per-addon roles created by create-addon-schemas.
#
# Purpose:
#   This standalone rollback helper drops the per-addon schemas and login roles
#   created by db/create-addon-schemas.sh. It is intentionally separate from the
#   main deployment flow because schema deletion is destructive and should only
#   be run manually.
#
# Usage:
#   ./hosting/db/delete-addon-schemas.sh \
#     --connection-string 'postgresql://postgres.project:password@host:5432/postgres' \
#     --addons aiostreams,aiometadata,aiomanager

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"

CONNECTION_STRING=""
ADDONS=""

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
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "${CONNECTION_STRING}" ]] || die "--connection-string is required"
[[ -n "${ADDONS}" ]] || die "--addons is required"

HOSTING_LOG_TO_STDERR=1 ensure_apt_packages postgresql-client

psql "${CONNECTION_STRING}" \
  -X \
  -q \
  -v addon_names_csv="${ADDONS}" \
  -f "${HOSTING_ROOT}/db/delete-addon-schemas.sql"

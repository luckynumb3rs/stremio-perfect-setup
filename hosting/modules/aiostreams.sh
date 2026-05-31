#!/usr/bin/env bash

# Configures the staged AIOStreams .env file.
#
# Purpose:
#   This hook applies the prompt.md AIOStreams defaults in the staged
#   AIOSTREAMS.env file: enable Torrentio, generate SECRET_KEY, pin the Stremio
#   Perfect Setup featured template IDs, append the two requested template
#   sources to TEMPLATE_URLS, and point BUILTIN_STREMTHRU_URL at the local
#   stremthru container when stremthru was selected.
#
# Called automatically by main.sh when aiostreams is selected.
#
# Manual hook contract:
#
#   HOSTING_CONFIG_DIR=./hosting/.work/config \
#   HOSTING_SELECTED_MODULES_FILE=./hosting/.work/selected-modules.txt \
#   ./hosting/modules/aiostreams.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"

MODULE_NAME=aiostreams
STREMTHRU_MODULE=stremthru
TORRENTIO_URL_VALUE=https://torrentio.stremio.ru/
LOCAL_STREMTHRU_URL=http://stremthru:8080
FEATURED_TEMPLATE_IDS_VALUE=stremio.perfect.setup
REQUESTED_TEMPLATE_URLS=(
  "https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOStreams.json"
  "https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main/templates/AIOStreams-Formatter.json"
)

if [[ "${1:-}" == "--metadata" ]]; then
  printf 'scope=module\nmodule=%s\n' "${MODULE_NAME}"
  exit 0
fi

[[ -n "${HOSTING_CONFIG_DIR:-}" ]] || die "HOSTING_CONFIG_DIR is not set"
[[ -n "${HOSTING_SELECTED_MODULES_FILE:-}" ]] || die "HOSTING_SELECTED_MODULES_FILE is not set"

AIOSTREAMS_ENV="${HOSTING_CONFIG_DIR}/AIOSTREAMS.env"
[[ -f "${AIOSTREAMS_ENV}" ]] || die "Missing staged AIOStreams env file: ${AIOSTREAMS_ENV}"

env_upsert_uncomment "${AIOSTREAMS_ENV}" TORRENTIO_URL "${TORRENTIO_URL_VALUE}"
current_secret_key="$(env_get "${AIOSTREAMS_ENV}" SECRET_KEY || true)"
env_upsert "${AIOSTREAMS_ENV}" SECRET_KEY "${current_secret_key:-$(generate_secret_hex)}"
env_upsert "${AIOSTREAMS_ENV}" FEATURED_TEMPLATE_IDS "${FEATURED_TEMPLATE_IDS_VALUE}"

merged_template_urls="$(HOSTING_CURRENT_TEMPLATE_URLS="$(env_get "${AIOSTREAMS_ENV}" TEMPLATE_URLS || true)" HOSTING_REQUESTED_TEMPLATE_URLS="$(printf '%s\n' "${REQUESTED_TEMPLATE_URLS[@]}")" python3 - <<'PY'
import json
import os

current = os.environ.get("HOSTING_CURRENT_TEMPLATE_URLS", "").strip()
requested = [line for line in os.environ.get("HOSTING_REQUESTED_TEMPLATE_URLS", "").splitlines() if line]

try:
  merged = json.loads(current) if current else []
except json.JSONDecodeError:
  merged = []

if not isinstance(merged, list):
  merged = []

for url in requested:
  if url not in merged:
    merged.append(url)

print(json.dumps(merged), end="")
PY
)"

env_upsert "${AIOSTREAMS_ENV}" TEMPLATE_URLS "${merged_template_urls}"

if grep -qx "${STREMTHRU_MODULE}" "${HOSTING_SELECTED_MODULES_FILE}"; then
  env_upsert "${AIOSTREAMS_ENV}" BUILTIN_STREMTHRU_URL "${LOCAL_STREMTHRU_URL}"
fi

success "Configured AIOStreams defaults"

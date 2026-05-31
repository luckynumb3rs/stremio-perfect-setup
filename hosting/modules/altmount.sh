#!/usr/bin/env bash

# Creates the staged AltMount .env file and wires it into the staged compose.
#
# Purpose:
#   Upstream AltMount does not ship an .env file, but prompt.md requires a
#   generated JWT_SECRET and an env_file reference. This hook creates
#   ALTMOUNT.env in staging, adds a synthetic manifest entry so deploy restores
#   it to apps/altmount/.env, stages AltMount compose, and inserts env_file:
#   .env before the environment block.
#
# Called automatically by main.sh when altmount is selected.
#
# Manual hook contract:
#
#   HOSTING_TEMPLATE_DIR=./hosting/.work/docker \
#   HOSTING_CONFIG_DIR=./hosting/.work/config \
#   HOSTING_MANIFEST_FILE=./hosting/.work/config/.stage-map.tsv \
#   ./hosting/modules/altmount.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/template.sh"

MODULE_NAME=altmount

if [[ "${1:-}" == "--metadata" ]]; then
  printf 'scope=module\nmodule=%s\n' "${MODULE_NAME}"
  exit 0
fi

[[ -n "${HOSTING_TEMPLATE_DIR:-}" ]] || die "HOSTING_TEMPLATE_DIR is not set"
[[ -n "${HOSTING_CONFIG_DIR:-}" ]] || die "HOSTING_CONFIG_DIR is not set"
[[ -n "${HOSTING_MANIFEST_FILE:-}" ]] || die "HOSTING_MANIFEST_FILE is not set"

ALTMOUNT_ENV="${HOSTING_CONFIG_DIR}/ALTMOUNT.env"
current_jwt_secret=""
if [[ -f "${ALTMOUNT_ENV}" ]]; then
  current_jwt_secret="$(env_get "${ALTMOUNT_ENV}" JWT_SECRET || true)"
fi
printf 'JWT_SECRET=%s\n' "${current_jwt_secret:-$(generate_secret_hex)}" > "${ALTMOUNT_ENV}"

if ! awk -F'\t' -v source_rel="apps/${MODULE_NAME}/.env" '$2 == source_rel { found = 1 } END { exit !found }' "${HOSTING_MANIFEST_FILE}" 2>/dev/null; then
  printf '%s\tapps/%s/.env\tALTMOUNT.env\tfile\n' "${MODULE_NAME}" "${MODULE_NAME}" >> "${HOSTING_MANIFEST_FILE}"
fi

altmount_compose_rel="$(module_compose_relative_path "${HOSTING_TEMPLATE_DIR}" "${MODULE_NAME}")"
altmount_compose_name="$(basename "${altmount_compose_rel}")"
stage_item "${MODULE_NAME}" "${altmount_compose_rel}" "${HOSTING_MANIFEST_FILE}" "${HOSTING_TEMPLATE_DIR}" "${HOSTING_CONFIG_DIR}"

ALTMOUNT_COMPOSE="${HOSTING_CONFIG_DIR}/$(stage_name_for "${MODULE_NAME}" "${altmount_compose_name}")"

python3 - "${ALTMOUNT_COMPOSE}" <<'PY'
import sys

compose_path = sys.argv[1]
with open(compose_path, "r", encoding="utf-8") as handle:
    lines = handle.readlines()

if any(line.strip() == "env_file:" for line in lines):
    sys.exit(0)

for idx, line in enumerate(lines):
    if line.startswith("    environment:"):
        lines.insert(idx, "    env_file:\n")
        lines.insert(idx + 1, "      - .env\n")
        break
else:
    for idx, line in enumerate(lines):
        if line.startswith("    image:"):
            lines.insert(idx + 1, "    env_file:\n")
            lines.insert(idx + 2, "      - .env\n")
            break

with open(compose_path, "w", encoding="utf-8") as handle:
    handle.writelines(lines)
PY

success "Configured AltMount env file and compose reference"

#!/usr/bin/env bash

# Configures the staged AIOManager .env file.
#
# Purpose:
#   AIOManager supports an ENCRYPTION_KEY for server-side encryption. This hook
#   generates a random 64-character hex value and writes it into the staged
#   AIOMANAGER.env file before manual review and deployment.
#
# Called automatically by main.sh when aiomanager is selected.
#
# Manual hook contract:
#
#   HOSTING_CONFIG_DIR=./hosting/.work/config \
#   ./hosting/modules/aiomanager.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"

MODULE_NAME=aiomanager

if [[ "${1:-}" == "--metadata" ]]; then
  printf 'scope=module\nmodule=%s\n' "${MODULE_NAME}"
  exit 0
fi

[[ -n "${HOSTING_CONFIG_DIR:-}" ]] || die "HOSTING_CONFIG_DIR is not set"

AIOMANAGER_ENV="${HOSTING_CONFIG_DIR}/AIOMANAGER.env"
[[ -f "${AIOMANAGER_ENV}" ]] || die "Missing staged AIOManager env file: ${AIOMANAGER_ENV}"

current_encryption_key="$(env_get "${AIOMANAGER_ENV}" ENCRYPTION_KEY || true)"
env_upsert "${AIOMANAGER_ENV}" ENCRYPTION_KEY "${current_encryption_key:-$(generate_secret_hex)}"

success "Configured AIOManager encryption key"

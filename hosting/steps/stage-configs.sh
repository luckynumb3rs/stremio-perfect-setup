#!/usr/bin/env bash

# Stages editable root and module files into a temporary config directory.
#
# Purpose:
#   The upstream template expects users to edit files in-place under apps/.
#   This step copies only the root .env and selected module config files into a
#   separate staging folder so automation and manual review happen away from the
#   upstream originals. A tab-separated manifest records how each staged item
#   maps back to the template.
#
# Usage:
#   ./hosting/steps/stage-configs.sh \
#     --template-dir ./hosting/.work/docker \
#     --config-dir ./hosting/.work/config \
#     --modules-file ./hosting/.work/selected-modules.txt
#
# Staging naming:
#   apps/aiostreams/.env      -> AIOSTREAMS.env
#   apps/honey/config.json    -> HONEY.config.json
#   apps/authelia/config/     -> AUTHELIA.config/
#   root .env                 -> .env

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/template.sh"

TEMPLATE_DIR_ARG=""
CONFIG_DIR_ARG=""
MODULES_FILE=""
MANIFEST_FILE=""

while (( $# > 0 )); do
  case "$1" in
    --template-dir)
      TEMPLATE_DIR_ARG="$2"
      shift 2
      ;;
    --config-dir)
      CONFIG_DIR_ARG="$2"
      shift 2
      ;;
    --modules-file)
      MODULES_FILE="$2"
      shift 2
      ;;
    --manifest-file)
      MANIFEST_FILE="$2"
      shift 2
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "${TEMPLATE_DIR_ARG}" ]] || die "--template-dir is required"
[[ -n "${CONFIG_DIR_ARG}" ]] || die "--config-dir is required"
[[ -n "${MODULES_FILE}" ]] || die "--modules-file is required"
[[ -f "${TEMPLATE_DIR_ARG}/.env" ]] || die "Template root .env not found: ${TEMPLATE_DIR_ARG}/.env"
[[ -f "${MODULES_FILE}" ]] || die "Modules file not found: ${MODULES_FILE}"

MANIFEST_FILE="${MANIFEST_FILE:-${CONFIG_DIR_ARG}/.stage-map.tsv}"

rm -rf "${CONFIG_DIR_ARG}"
ensure_directory "${CONFIG_DIR_ARG}"
: > "${MANIFEST_FILE}"

cp -a "${TEMPLATE_DIR_ARG}/.env" "${CONFIG_DIR_ARG}/.env"
printf 'root\t.env\t.env\tfile\n' >> "${MANIFEST_FILE}"

while IFS= read -r module; do
  [[ -n "${module}" ]] || continue
  while IFS= read -r entry; do
    [[ -n "${entry}" ]] || continue
    stage_item "${module}" "apps/${module}/${entry}" "${MANIFEST_FILE}" "${TEMPLATE_DIR_ARG}" "${CONFIG_DIR_ARG}"
  done < <(module_stageable_entries "${TEMPLATE_DIR_ARG}" "${module}")
done < <(read_lines_file "${MODULES_FILE}")

success "Staged config files in ${CONFIG_DIR_ARG}"

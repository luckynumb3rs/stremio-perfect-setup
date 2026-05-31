#!/usr/bin/env bash

# Restores staged files and syncs the prepared template into DOCKER_DIR.
#
# Purpose:
#   This is the transition from staging back to a runnable Compose tree. It
#   reads the stage manifest, copies each staged file or directory back to its
#   original template path, creates/fixes permissions on the target directory,
#   and rsyncs the entire prepared template into DOCKER_DIR.
#
# Usage:
#   ./hosting/steps/deploy-template.sh \
#     --template-dir ./hosting/.work/docker \
#     --config-dir ./hosting/.work/config \
#     --manifest-file ./hosting/.work/config/.stage-map.tsv
#
# Safety:
#   The target is synced with rsync --delete so it matches the prepared
#   template. The script chowns DOCKER_DIR to the current user when needed so
#   normal file operations do not require sudo afterward.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"

TEMPLATE_DIR_ARG=""
CONFIG_DIR_ARG=""
MANIFEST_FILE=""
TARGET_DIR_ARG=""
FIX_PERMISSIONS=1

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
    --manifest-file)
      MANIFEST_FILE="$2"
      shift 2
      ;;
    --target-dir)
      TARGET_DIR_ARG="$2"
      shift 2
      ;;
    --no-fix-permissions)
      FIX_PERMISSIONS=0
      shift
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "${TEMPLATE_DIR_ARG}" ]] || die "--template-dir is required"
[[ -n "${CONFIG_DIR_ARG}" ]] || die "--config-dir is required"
[[ -n "${MANIFEST_FILE}" ]] || die "--manifest-file is required"
[[ -d "${TEMPLATE_DIR_ARG}" ]] || die "Template directory does not exist: ${TEMPLATE_DIR_ARG}"
[[ -d "${CONFIG_DIR_ARG}" ]] || die "Config directory does not exist: ${CONFIG_DIR_ARG}"
[[ -f "${MANIFEST_FILE}" ]] || die "Manifest file does not exist: ${MANIFEST_FILE}"

TARGET_DIR_ARG="${TARGET_DIR_ARG:-$(env_get "${CONFIG_DIR_ARG}/.env" DOCKER_DIR)}"
[[ -n "${TARGET_DIR_ARG}" ]] || die "DOCKER_DIR is not set in ${CONFIG_DIR_ARG}/.env"

while IFS=$'\t' read -r module source_rel stage_rel item_type; do
  [[ -n "${source_rel}" ]] || continue
  local_source="${TEMPLATE_DIR_ARG}/${source_rel}"
  local_stage="${CONFIG_DIR_ARG}/${stage_rel}"

  [[ -e "${local_stage}" ]] || die "Staged path missing for ${source_rel}: ${local_stage}"
  rm -rf "${local_source}"
  ensure_directory "$(dirname "${local_source}")"
  cp -a "${local_stage}" "${local_source}"
done < "${MANIFEST_FILE}"

ensure_apt_packages rsync
require_commands rsync

if mkdir -p "${TARGET_DIR_ARG}" 2>/dev/null; then
  :
else
  run_privileged mkdir -p "${TARGET_DIR_ARG}"
fi

if (( FIX_PERMISSIONS )); then
  if [[ ! -w "${TARGET_DIR_ARG}" ]]; then
    run_privileged chown -R "$(id -u):$(id -g)" "${TARGET_DIR_ARG}"
  fi
fi

if [[ -w "${TARGET_DIR_ARG}" ]]; then
  rsync -a --delete "${TEMPLATE_DIR_ARG}/" "${TARGET_DIR_ARG}/"
else
  run_privileged rsync -a --delete "${TEMPLATE_DIR_ARG}/" "${TARGET_DIR_ARG}/"
fi

success "Deployed prepared template to ${TARGET_DIR_ARG}"

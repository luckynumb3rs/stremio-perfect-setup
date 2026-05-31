#!/usr/bin/env bash

# Builds a ZIP backup from the staged configuration files.
#
# Purpose:
#   After deployment, this step reshapes the staging directory into the same
#   logical module layout users would expect in the template and archives its
#   contents. The archive stores config files only, not the full upstream
#   template.
#
# Usage:
#   ./hosting/steps/backup-configs.sh \
#     --config-dir ./hosting/.work/config \
#     --manifest-file ./hosting/.work/config/.stage-map.tsv
#
# Backup layout:
#   .env
#   aiostreams/.env
#   honey/config.json
#   traefik/compose.yaml
#
# Note:
#   This script moves files inside the staging directory while normalizing them.
#   Run it only after deploy-template.sh has already restored staged files.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"

load_defaults

CONFIG_DIR_ARG=""
MANIFEST_FILE=""
OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-$HOME}"
BASENAME_VALUE="${BACKUP_BASENAME:-streaming}"
MODULES_FILE=""

while (( $# > 0 )); do
  case "$1" in
    --config-dir)
      CONFIG_DIR_ARG="$2"
      shift 2
      ;;
    --manifest-file)
      MANIFEST_FILE="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --basename)
      BASENAME_VALUE="$2"
      shift 2
      ;;
    --modules-file)
      MODULES_FILE="$2"
      shift 2
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "${CONFIG_DIR_ARG}" ]] || die "--config-dir is required"
[[ -n "${MANIFEST_FILE}" ]] || die "--manifest-file is required"
[[ -d "${CONFIG_DIR_ARG}" ]] || die "Config directory does not exist: ${CONFIG_DIR_ARG}"
[[ -f "${MANIFEST_FILE}" ]] || die "Manifest file does not exist: ${MANIFEST_FILE}"
[[ -n "${MODULES_FILE}" ]] || die "--modules-file is required"
[[ -f "${MODULES_FILE}" ]] || die "Modules file does not exist: ${MODULES_FILE}"

ensure_directory "${OUTPUT_DIR}"

while IFS=$'\t' read -r module source_rel stage_rel item_type; do
  local_stage="${CONFIG_DIR_ARG}/${stage_rel}"
  [[ "${module}" == "root" ]] && continue
  [[ -e "${local_stage}" ]] || continue

  target_dir="${CONFIG_DIR_ARG}/${module}"
  target_path="${target_dir}/$(basename "${source_rel}")"
  ensure_directory "${target_dir}"
  rm -rf "${target_path}"
  mv "${local_stage}" "${target_path}"
done < "${MANIFEST_FILE}"

rm -f "${MANIFEST_FILE}"

cp -a "${MODULES_FILE}" "${CONFIG_DIR_ARG}/HOSTING_SELECTED_MODULES.txt"

timestamp="$(date +%Y%m%d%H%M%S)"
archive_path="${OUTPUT_DIR}/${BASENAME_VALUE}-${timestamp}.zip"

python3 - "${CONFIG_DIR_ARG}" "${archive_path}" <<'PY'
import os
import sys
import zipfile

root = sys.argv[1]
archive = sys.argv[2]

with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for entry in sorted(os.listdir(root)):
        if entry.startswith(".") and entry != ".env":
            continue
        path = os.path.join(root, entry)
        if os.path.isdir(path):
            for dirpath, _, filenames in os.walk(path):
                for filename in sorted(filenames):
                    file_path = os.path.join(dirpath, filename)
                    archive_name = os.path.relpath(file_path, root)
                    zf.write(file_path, archive_name)
        else:
            zf.write(path, entry)
PY

success "Backup archive created at ${archive_path}"

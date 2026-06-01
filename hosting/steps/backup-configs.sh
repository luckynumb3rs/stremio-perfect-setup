#!/usr/bin/env bash

# Builds a ZIP backup from the staged configuration files.
#
# Purpose:
#   After deployment, this step writes a self-contained backup archive that
#   preserves the staged root .env plus each selected module's full app
#   directory under apps/<module>/. That keeps custom modules and compose files
#   round-trippable even when they do not exist in the upstream template.
#
# Usage:
#   ./hosting/steps/backup-configs.sh \
#     --config-dir ./hosting/.work/config \
#     --manifest-file ./hosting/.work/config/.stage-map.tsv
#
# Backup layout:
#   .env
#   HOSTING_SELECTED_MODULES.txt
#   apps/aiostreams/.env
#   apps/honey/config.json
#   apps/traefik/compose.yaml

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/template.sh"

load_defaults

CONFIG_DIR_ARG=""
TEMPLATE_DIR_ARG=""
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
    --template-dir)
      TEMPLATE_DIR_ARG="$2"
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
[[ -n "${TEMPLATE_DIR_ARG}" ]] || die "--template-dir is required"
[[ -d "${TEMPLATE_DIR_ARG}" ]] || die "Template directory does not exist: ${TEMPLATE_DIR_ARG}"
[[ -n "${MANIFEST_FILE}" ]] || die "--manifest-file is required"
[[ -d "${CONFIG_DIR_ARG}" ]] || die "Config directory does not exist: ${CONFIG_DIR_ARG}"
[[ -f "${MANIFEST_FILE}" ]] || die "Manifest file does not exist: ${MANIFEST_FILE}"
[[ -n "${MODULES_FILE}" ]] || die "--modules-file is required"
[[ -f "${MODULES_FILE}" ]] || die "Modules file does not exist: ${MODULES_FILE}"

ensure_directory "${OUTPUT_DIR}"

export_dir="$(mktemp -d "$(dirname "${CONFIG_DIR_ARG}")/backup-export.XXXXXX")"
trap 'rm -rf "${export_dir}"' EXIT

cp -a "${CONFIG_DIR_ARG}/.env" "${export_dir}/.env"
root_compose_path="$(template_root_compose_path "${TEMPLATE_DIR_ARG}")"
cp -a "${root_compose_path}" "${export_dir}/$(basename "${root_compose_path}")"
cp -a "${MODULES_FILE}" "${export_dir}/HOSTING_SELECTED_MODULES.txt"
ensure_directory "${export_dir}/apps"

while IFS= read -r module; do
  [[ -n "${module}" ]] || continue
  [[ -d "${TEMPLATE_DIR_ARG}/apps/${module}" ]] || die "Selected module directory missing from template: ${TEMPLATE_DIR_ARG}/apps/${module}"
  cp -a "${TEMPLATE_DIR_ARG}/apps/${module}" "${export_dir}/apps/${module}"
done < <(read_lines_file "${MODULES_FILE}")

timestamp="$(date +%Y%m%d%H%M%S)"
archive_path="${OUTPUT_DIR}/${BASENAME_VALUE}-${timestamp}.zip"

python3 - "${export_dir}" "${archive_path}" <<'PY'
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

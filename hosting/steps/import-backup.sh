#!/usr/bin/env bash

# Imports a normalized hosting backup ZIP back into the staging layout.
#
# Purpose:
#   This step lets main.sh resume from a backup archive previously produced by
#   backup-configs.sh. It extracts the archive, restores root .env into staging,
#   then stages the selected modules' editable files from the prepared template
#   tree. Any backup-provided custom app directories must already have been
#   merged into the template by inspect-backup.sh before this step runs.
#
# Usage:
#   ./hosting/steps/import-backup.sh \
#     --zip-file /path/to/backup.zip \
#     --template-dir ./hosting/.work/docker \
#     --config-dir ./hosting/.work/config \
#     --manifest-file ./hosting/.work/config/.stage-map.tsv \
#     --modules-file ./hosting/.work/selected-modules.txt

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/template.sh"

ZIP_FILE_ARG=""
TEMPLATE_DIR_ARG=""
CONFIG_DIR_ARG=""
MANIFEST_FILE=""
MODULES_FILE=""

while (( $# > 0 )); do
  case "$1" in
    --zip-file)
      ZIP_FILE_ARG="$2"
      shift 2
      ;;
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
    --modules-file)
      MODULES_FILE="$2"
      shift 2
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "${ZIP_FILE_ARG}" ]] || die "--zip-file is required"
[[ -f "${ZIP_FILE_ARG}" ]] || die "Backup ZIP does not exist: ${ZIP_FILE_ARG}"
[[ -n "${TEMPLATE_DIR_ARG}" ]] || die "--template-dir is required"
[[ -d "${TEMPLATE_DIR_ARG}" ]] || die "Template directory does not exist: ${TEMPLATE_DIR_ARG}"
[[ -n "${CONFIG_DIR_ARG}" ]] || die "--config-dir is required"
[[ -n "${MANIFEST_FILE}" ]] || die "--manifest-file is required"
[[ -n "${MODULES_FILE}" ]] || die "--modules-file is required"
[[ -f "${MODULES_FILE}" ]] || die "Modules file does not exist: ${MODULES_FILE}"

extract_dir="$(mktemp -d "$(dirname "${CONFIG_DIR_ARG}")/backup-import.XXXXXX")"
trap 'rm -rf "${extract_dir}"' EXIT

python3 - "${ZIP_FILE_ARG}" "${extract_dir}" <<'PY'
import sys
import zipfile

archive_path = sys.argv[1]
extract_dir = sys.argv[2]

with zipfile.ZipFile(archive_path, "r") as zf:
    zf.extractall(extract_dir)
PY

rm -rf "${CONFIG_DIR_ARG}"
ensure_directory "${CONFIG_DIR_ARG}"
: > "${MANIFEST_FILE}"

[[ -f "${extract_dir}/.env" ]] || die "Backup ZIP does not contain root .env"
cp -a "${extract_dir}/.env" "${CONFIG_DIR_ARG}/.env"
printf 'root\t.env\t.env\tfile\n' >> "${MANIFEST_FILE}"

[[ -s "${MODULES_FILE}" ]] || die "Selected modules file is empty: ${MODULES_FILE}"

while IFS= read -r module; do
  [[ -n "${module}" ]] || continue

  while IFS= read -r entry; do
    [[ -n "${entry}" ]] || continue
    stage_item "${module}" "apps/${module}/${entry}" "${MANIFEST_FILE}" "${TEMPLATE_DIR_ARG}" "${CONFIG_DIR_ARG}"
  done < <(module_stageable_entries "${TEMPLATE_DIR_ARG}" "${module}")
done < <(read_lines_file "${MODULES_FILE}")

success "Imported backup ZIP into staging: ${ZIP_FILE_ARG}"

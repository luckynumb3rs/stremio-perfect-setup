#!/usr/bin/env bash

# Imports a normalized hosting backup ZIP back into the staging layout.
#
# Purpose:
#   This step lets main.sh resume from a backup archive previously produced by
#   backup-configs.sh. It extracts the archive, restores root .env plus selected
#   module files into the staging naming scheme, reconstructs the stage manifest,
#   and writes the selected module list.
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

metadata_modules_file="${extract_dir}/HOSTING_SELECTED_MODULES.txt"
if [[ -f "${metadata_modules_file}" ]]; then
  cp -a "${metadata_modules_file}" "${MODULES_FILE}"
else
  find "${extract_dir}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort > "${MODULES_FILE}"
fi

[[ -s "${MODULES_FILE}" ]] || die "Could not determine selected modules from backup ZIP"

while IFS= read -r module; do
  [[ -n "${module}" ]] || continue

  while IFS= read -r entry; do
    [[ -n "${entry}" ]] || continue
    source_rel="apps/${module}/${entry}"
    imported_path="${extract_dir}/${module}/${entry}"
    [[ -e "${imported_path}" ]] || die "Backup ZIP is missing ${module}/${entry}"

    stage_name="$(stage_name_for "${module}" "$(basename "${entry}")")"
    cp -a "${imported_path}" "${CONFIG_DIR_ARG}/${stage_name}"
    if [[ -d "${imported_path}" ]]; then
      item_type="dir"
    else
      item_type="file"
    fi
    printf '%s\t%s\t%s\t%s\n' "${module}" "${source_rel}" "${stage_name}" "${item_type}" >> "${MANIFEST_FILE}"
  done < <(module_stageable_entries "${TEMPLATE_DIR_ARG}" "${module}")

  compose_rel="$(module_compose_relative_path "${TEMPLATE_DIR_ARG}" "${module}")"
  compose_name="$(basename "${compose_rel}")"
  imported_compose="${extract_dir}/${module}/${compose_name}"
  if [[ -e "${imported_compose}" ]]; then
    stage_name="$(stage_name_for "${module}" "${compose_name}")"
    cp -a "${imported_compose}" "${CONFIG_DIR_ARG}/${stage_name}"
    printf '%s\t%s\t%s\tfile\n' "${module}" "${compose_rel}" "${stage_name}" >> "${MANIFEST_FILE}"
  fi
done < <(read_lines_file "${MODULES_FILE}")

success "Imported backup ZIP into staging: ${ZIP_FILE_ARG}"

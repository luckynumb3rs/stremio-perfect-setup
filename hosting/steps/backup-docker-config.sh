#!/usr/bin/env bash

# Builds a ZIP backup directly from an existing deployed Docker tree.
#
# Purpose:
#   This step inspects the deployed root compose file, derives the enabled
#   modules from its include list, copies the root .env plus root compose file,
#   and exports only the enabled apps/<module>/ directories into a backup ZIP.
#
# Usage:
#   ./hosting/steps/backup-docker-config.sh \
#     --docker-dir /opt/docker \
#     --output-dir "$HOME"

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/template.sh"

load_defaults

DOCKER_DIR_ARG=""
OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-$HOME}"
BASENAME_VALUE="${BACKUP_BASENAME:-streaming}"

while (( $# > 0 )); do
  case "$1" in
    --docker-dir)
      DOCKER_DIR_ARG="$2"
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
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "${DOCKER_DIR_ARG}" ]] || die "--docker-dir is required"
[[ -d "${DOCKER_DIR_ARG}" ]] || die "Docker directory does not exist: ${DOCKER_DIR_ARG}"
[[ -f "${DOCKER_DIR_ARG}/.env" ]] || die "Docker directory does not contain a root .env: ${DOCKER_DIR_ARG}/.env"

root_compose_path="$(template_root_compose_path "${DOCKER_DIR_ARG}")"
mapfile -t enabled_modules < <(list_included_modules "${root_compose_path}" | dedupe_lines)
(( ${#enabled_modules[@]} > 0 )) || die "No enabled modules found in root compose include list: ${root_compose_path}"

ensure_directory "${OUTPUT_DIR}"

export_dir="$(mktemp -d "$(dirname "${DOCKER_DIR_ARG}")/backup-live-export.XXXXXX")"
trap 'rm -rf "${export_dir}"' EXIT

cp -a "${DOCKER_DIR_ARG}/.env" "${export_dir}/.env"
cp -a "${root_compose_path}" "${export_dir}/$(basename "${root_compose_path}")"
write_lines_file "${export_dir}/HOSTING_SELECTED_MODULES.txt" "${enabled_modules[@]}"
ensure_directory "${export_dir}/apps"

for module in "${enabled_modules[@]}"; do
  [[ -d "${DOCKER_DIR_ARG}/apps/${module}" ]] || die "Enabled module directory missing from Docker tree: ${DOCKER_DIR_ARG}/apps/${module}"
  cp -a "${DOCKER_DIR_ARG}/apps/${module}" "${export_dir}/apps/${module}"
done

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

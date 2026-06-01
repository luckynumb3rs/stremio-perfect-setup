#!/usr/bin/env bash

# Inspects a backup ZIP before module selection and merges backup app folders.
#
# Purpose:
#   This step makes backup-provided modules visible to discovery before the user
#   chooses which modules to enable. It understands the current backup layout
#   (`apps/<module>/...`) and the legacy layout (`<module>/...` at archive root).
#   Current-format app directories replace the fetched template module tree,
#   while legacy module directories are overlaid onto the fetched template.
#
# Usage:
#   ./hosting/steps/inspect-backup.sh \
#     --zip-file /path/to/backup.zip \
#     --template-dir ./hosting/.work/docker \
#     --available-modules-file ./hosting/.work/backup-modules.txt \
#     --metadata-modules-file ./hosting/.work/backup-selected-modules.txt

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"

ZIP_FILE_ARG=""
TEMPLATE_DIR_ARG=""
AVAILABLE_MODULES_FILE=""
METADATA_MODULES_FILE=""

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
    --available-modules-file)
      AVAILABLE_MODULES_FILE="$2"
      shift 2
      ;;
    --metadata-modules-file)
      METADATA_MODULES_FILE="$2"
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
[[ -n "${AVAILABLE_MODULES_FILE}" ]] || die "--available-modules-file is required"
[[ -n "${METADATA_MODULES_FILE}" ]] || die "--metadata-modules-file is required"

extract_dir="$(mktemp -d "$(dirname "${AVAILABLE_MODULES_FILE}")/backup-inspect.XXXXXX")"
trap 'rm -rf "${extract_dir}"' EXIT

python3 - "${ZIP_FILE_ARG}" "${extract_dir}" "${TEMPLATE_DIR_ARG}" "${AVAILABLE_MODULES_FILE}" "${METADATA_MODULES_FILE}" <<'PY'
import os
import shutil
import sys
import zipfile
from pathlib import Path

archive_path = Path(sys.argv[1])
extract_dir = Path(sys.argv[2])
template_dir = Path(sys.argv[3])
available_modules_path = Path(sys.argv[4])
metadata_modules_path = Path(sys.argv[5])

with zipfile.ZipFile(archive_path, "r") as zf:
    zf.extractall(extract_dir)

apps_root = extract_dir / "apps"
template_apps_root = template_dir / "apps"
template_apps_root.mkdir(parents=True, exist_ok=True)

available_modules = set()

def has_compose(module_dir: Path) -> bool:
    return (module_dir / "compose.yaml").exists() or (module_dir / "compose.yml").exists()

if apps_root.is_dir():
    for module_dir in sorted(path for path in apps_root.iterdir() if path.is_dir()):
        if not has_compose(module_dir):
            continue
        destination = template_apps_root / module_dir.name
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(module_dir, destination)
        available_modules.add(module_dir.name)
else:
    for module_dir in sorted(path for path in extract_dir.iterdir() if path.is_dir()):
        if module_dir.name in {"apps", "__MACOSX"} or module_dir.name.startswith("."):
            continue
        destination = template_apps_root / module_dir.name
        if not destination.exists() and not has_compose(module_dir):
            raise SystemExit(
                f"Legacy backup module '{module_dir.name}' does not exist in the fetched template "
                "and does not contain compose.yaml or compose.yml."
            )
        destination.mkdir(parents=True, exist_ok=True)
        for item in sorted(module_dir.iterdir()):
            target = destination / item.name
            if item.is_dir():
                shutil.copytree(item, target, dirs_exist_ok=True)
            else:
                shutil.copy2(item, target)
        available_modules.add(module_dir.name)

available_modules_path.parent.mkdir(parents=True, exist_ok=True)
available_modules_path.write_text(
    "".join(f"{module}\n" for module in sorted(available_modules)),
    encoding="utf-8",
)

metadata_source = extract_dir / "HOSTING_SELECTED_MODULES.txt"
metadata_modules_path.parent.mkdir(parents=True, exist_ok=True)
if metadata_source.exists():
    shutil.copy2(metadata_source, metadata_modules_path)
else:
    metadata_modules_path.write_text("", encoding="utf-8")
PY

success "Backup modules merged into fetched template: ${ZIP_FILE_ARG}"

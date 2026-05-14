#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/templates/AIOMetadata.json"
CATALOGS_FILE="$ROOT_DIR/templates/AIOMetadata-Catalogs.json"
ALL_FILE="$ROOT_DIR/templates/AIOMetadata-All.json"
CATALOGS_ALL_FILE="$ROOT_DIR/templates/AIOMetadata-All-Catalogs.json"
EXCLUDED_CATALOG_IDS=(
  "tmdb.airing_today"
  "tmdb.year"
  "tmdb.language"
  "tvmaze.schedule"
  "tvdb.trending"
  "tvdb.genres"
  "tvdb.collections"
)

python3 - "$SOURCE_FILE" "$CATALOGS_FILE" "$ALL_FILE" "$CATALOGS_ALL_FILE" "${EXCLUDED_CATALOG_IDS[@]}" <<'PY'
import copy
import json
import sys
from pathlib import Path


def write_if_changed(path_str, data):
    path = Path(path_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    current = path.read_text(encoding="utf-8") if path.exists() else None
    if current != rendered:
        path.write_text(rendered, encoding="utf-8")
        print(f"Updated {path}")
    else:
        print(f"Already up to date: {path}")


source_file, catalogs_file, all_file, catalogs_all_file, *excluded_ids = sys.argv[1:]
excluded_ids = set(excluded_ids)

source_data = json.loads(Path(source_file).read_text(encoding="utf-8"))

try:
    source_catalogs = source_data["config"]["catalogs"]
except KeyError as exc:
    raise SystemExit(f"Missing expected key in source file: {exc}") from exc


def catalogs_payload(catalogs):
    return {
        "version": 1,
        "catalogs": catalogs,
    }


def build_all_catalogs(catalogs):
    all_catalogs = copy.deepcopy(catalogs)
    for catalog in all_catalogs:
        enabled = catalog.get("id") not in excluded_ids
        catalog["enabled"] = enabled
        catalog["showInHome"] = enabled
    return all_catalogs


all_catalogs = build_all_catalogs(source_catalogs)
all_config = copy.deepcopy(source_data)
all_config["config"]["catalogs"] = all_catalogs

if "metadata" in all_config and isinstance(all_config["metadata"], dict):
    all_config["metadata"]["totalCatalogs"] = len(all_catalogs)
    all_config["metadata"]["enabledCatalogs"] = sum(
        1 for catalog in all_catalogs if catalog.get("enabled")
    )

write_if_changed(catalogs_file, catalogs_payload(source_catalogs))
write_if_changed(all_file, all_config)
write_if_changed(catalogs_all_file, catalogs_payload(all_catalogs))
PY

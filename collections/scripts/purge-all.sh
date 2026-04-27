#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COLLECTIONS_FILE="$REPO_ROOT/collections/nuvio-collections.json"

python3 -B - "$COLLECTIONS_FILE" <<'PY' | while IFS= read -r url; do
import json
import sys

collections_file = sys.argv[1]
CDN_PREFIX = "https://cdn.jsdelivr.net/gh/"
PURGE_PREFIX = "https://purge.jsdelivr.net/gh/"


def walk_urls(value):
    if isinstance(value, dict):
        for nested in value.values():
            yield from walk_urls(nested)
        return

    if isinstance(value, list):
        for nested in value:
            yield from walk_urls(nested)
        return

    if isinstance(value, str) and value.startswith(CDN_PREFIX):
        yield value

with open(collections_file, "r", encoding="utf-8") as handle:
    data = json.load(handle)

urls = {
    url.replace(CDN_PREFIX, PURGE_PREFIX, 1)
    for url in walk_urls(data)
}

for url in sorted(urls):
    print(url)
PY
  curl -fsS "$url"
done

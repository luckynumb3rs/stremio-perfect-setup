#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT_DIR/CHANGELOG.md"
TARGET="$ROOT_DIR/docs/guide/Changelog.md"

if [[ ! -f "$SOURCE" ]]; then
  echo "Missing source changelog: $SOURCE" >&2
  exit 1
fi

if [[ ! -f "$TARGET" ]]; then
  echo "Missing target changelog page: $TARGET" >&2
  exit 1
fi

tmp="$(mktemp)"

awk '
  NR == 1 && $0 == "---" { print; in_fm = 1; next }
  in_fm {
    print
    if ($0 == "---") exit
    next
  }
' "$TARGET" > "$tmp"

{
  printf '\n'
  cat "$SOURCE"
} >> "$tmp"

if ! cmp -s "$tmp" "$TARGET"; then
  mv "$tmp" "$TARGET"
  echo "Updated $TARGET"
else
  rm -f "$tmp"
  echo "Guide changelog is already up to date"
fi

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT_DIR/CHANGELOG.md"
TARGET="$ROOT_DIR/templates/AIOStreams-Changelog.md"

if [[ ! -f "$SOURCE" ]]; then
  echo "Missing source changelog: $SOURCE" >&2
  exit 1
fi

tmp="$(mktemp)"

awk '
  NR == 1 && $0 == "---" { in_fm = 1; next }
  in_fm {
    if ($0 == "---") in_fm = 0
    next
  }
  !in_section {
    if ($0 ~ /^##[[:space:]]+/) {
      heading = $0
      sub(/^##[[:space:]]+/, "", heading)
      gsub(/^[^[:alnum:]]+[[:space:]]*/, "", heading)
    }
    if (heading ~ /^AIOStreams([[:space:]]*$|[[:space:][:punct:]].*$)/) {
      in_section = 1
      print "# Changelog"
      print ""
    }
    next
  }
  $0 ~ /^##[[:space:]]+/ {
    exit
  }
  !started_content && $0 == "" {
    next
  }
  $0 ~ /^###[[:space:]]+/ {
    started_content = 1
    emitted_version = 1
    sub(/^###[[:space:]]+/, "## ")
    print
    next
  }
  {
    started_content = 1
    print
  }
  END {
    if (!in_section) {
      print "Missing ## AIOStreams section in " FILENAME > "/dev/stderr"
      exit 2
    }
    if (!emitted_version) {
      print "Missing version entries under ## AIOStreams in " FILENAME > "/dev/stderr"
      exit 3
    }
  }
' "$SOURCE" > "$tmp"

if ! cmp -s "$tmp" "$TARGET"; then
  mv "$tmp" "$TARGET"
  echo "Updated $TARGET"
else
  rm -f "$tmp"
  echo "AIOStreams changelog output is already up to date"
fi

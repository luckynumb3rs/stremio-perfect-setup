#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
README_PATH="$ROOT_DIR/README.md"
GUIDE_DIR="$ROOT_DIR/guide"
CHAPTERS_SEPARATOR="---"
DEST_DIR="${1:-}"
DEST_ABS=""
COPY_EXCLUDES=(
  --exclude=.git
  --exclude=_site
  --exclude=.jekyll-cache
  --exclude=collections
  --exclude=wizard/web/node_modules
)

usage() {
  cat <<'EOF'
Usage:
  scripts/prepare-site-source.sh <destination-dir>
  scripts/prepare-site-source.sh --sync-readme
EOF
}

resolve_path() {
  local path="$1"

  if [[ -d "$path" ]]; then
    (
      cd "$path"
      pwd
    )
    return
  fi

  (
    cd "$(dirname "$path")"
    printf '%s/%s\n' "$(pwd)" "$(basename "$path")"
  )
}

has_leading_icon() {
  local text="$1"
  local trimmed="${text#"${text%%[![:space:]]*}"}"
  printf '%s' "$trimmed" | LC_ALL=C grep -q '^[^ -~]'
}

extract_title() {
  local file="$1"
  local title

  title="$(awk '
    BEGIN { in_fm = 0 }
    NR == 1 && $0 == "---" { in_fm = 1; next }
    in_fm && $0 == "---" { in_fm = 0; next }
    in_fm && $0 ~ /^title:[[:space:]]*/ {
      sub(/^title:[[:space:]]*/, "", $0)
      gsub(/^"/, "", $0)
      gsub(/"$/, "", $0)
      gsub(/^'\''/, "", $0)
      gsub(/'\''$/, "", $0)
      print $0
      exit
    }
    !in_fm && $0 ~ /^#[[:space:]]+/ {
      sub(/^#[[:space:]]+/, "", $0)
      print $0
      exit
    }
  ' "$file")"

  if [[ -z "$title" ]]; then
    title="$(basename "$file" .md | tr '-' ' ')"
  fi

  if ! has_leading_icon "$title"; then
    title="📄 $title"
  fi

  printf '%s\n' "$title"
}

build_chapters_list() {
  local file
  local title
  local rel
  local changelog="$ROOT_DIR/CHANGELOG.md"
  local ordered=()
  local updates=()

  while IFS= read -r file; do
    if [[ "$(basename "$file")" == "Updates.md" ]]; then
      updates+=("$file")
    else
      ordered+=("$file")
    fi
  done < <(find "$GUIDE_DIR" -maxdepth 1 -type f -name '*.md' | sort -V)

  ordered+=("${updates[@]}")

  for file in "${ordered[@]}"; do
    title="$(extract_title "$file")"
    rel="$(basename "$file")"
    printf -- '- [%s](guide/%s)\n' "$title" "$rel"
  done

  if [[ -f "$changelog" ]]; then
    title="$(extract_title "$changelog")"
    printf -- '- [%s](CHANGELOG.md)\n' "$title"
  fi
}

render_readme_with_chapters() {
  local source="$1"
  render_base_content "$source"
  printf '\n\n'
  build_chapters_list
}

render_base_content() {
  local source="$1"

  awk -v separator="$CHAPTERS_SEPARATOR" '
    { lines[NR] = $0 }
    $0 == separator {
      last_separator = NR
    }
    END {
      if (!last_separator) {
        exit 2
      }

      last = last_separator
      while (last > 0 && lines[last] == "") {
        last--
      }

      for (i = 1; i <= last; i++) {
        print lines[i]
      }
    }
  ' "$source"
}

sync_readme() {
  local tmp
  tmp="$(mktemp)"

  render_readme_with_chapters "$README_PATH" > "$tmp"

  if ! cmp -s "$tmp" "$README_PATH"; then
    mv "$tmp" "$README_PATH"
    echo "Updated $README_PATH"
  else
    rm -f "$tmp"
    echo "README chapter list is already up to date"
  fi
}

if [[ "$DEST_DIR" == "--help" || "$DEST_DIR" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$DEST_DIR" == "--sync-readme" ]]; then
  if [[ ! -f "$README_PATH" ]]; then
    echo "Missing README source: $README_PATH" >&2
    exit 1
  fi

  if [[ ! -d "$GUIDE_DIR" ]]; then
    echo "Missing guide directory: $GUIDE_DIR" >&2
    exit 1
  fi

  sync_readme
  exit 0
fi

if [[ -z "$DEST_DIR" ]]; then
  usage >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
DEST_ABS="$(resolve_path "$DEST_DIR")"

if [[ "$DEST_ABS" == "$ROOT_DIR"/* ]]; then
  COPY_EXCLUDES+=("--exclude=.${DEST_ABS#"$ROOT_DIR"}")
fi

if [[ ! -f "$ROOT_DIR/README.md" ]]; then
  echo "Missing README source: $ROOT_DIR/README.md" >&2
  exit 1
fi

if [[ ! -d "$GUIDE_DIR" ]]; then
  echo "Missing guide directory: $GUIDE_DIR" >&2
  exit 1
fi

if ! render_base_content "$README_PATH" >/dev/null; then
  echo "README must contain at least one line with exactly '$CHAPTERS_SEPARATOR'" >&2
  exit 1
fi

tar \
  "${COPY_EXCLUDES[@]}" \
  -C "$ROOT_DIR" \
  -cf - \
  . | tar -C "$DEST_DIR" -xf -

rm -f "$DEST_DIR/index.md"

{
  cat <<'FM'
---
layout: default
title: Home
---

FM
  render_base_content "$README_PATH"
} > "$DEST_DIR/index.md"

echo "Prepared site source in $DEST_DIR"

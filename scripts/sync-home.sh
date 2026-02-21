#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT_DIR/content/home.template.md"
README_OUT="$ROOT_DIR/README.md"
INDEX_OUT="$ROOT_DIR/docs/index.md"
updated=0

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Missing template: $TEMPLATE" >&2
  exit 1
fi

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
  local guide_prefix="$1"
  local file
  local title
  local rel
  local lines=()
  local ordered=()
  local updates=()

  while IFS= read -r file; do
    if [[ "$(basename "$file")" == "Updates.md" ]]; then
      updates+=("$file")
    else
      ordered+=("$file")
    fi
  done < <(find "$ROOT_DIR/docs/guide" -maxdepth 1 -type f -name '*.md' | sort -V)

  ordered+=("${updates[@]}")

  for file in "${ordered[@]}"; do
    title="$(extract_title "$file")"
    rel="$(basename "$file")"
    lines+=("- [$title]($guide_prefix/$rel)")
  done

  printf '%s\n' "${lines[@]}"
}

render() {
  local image_path="$1"
  local guide_path="$2"
  local chapters
  local line

  chapters="$(build_chapters_list "$guide_path")"

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//\{\{IMAGE_PATH\}\}/$image_path}"
    line="${line//\{\{GUIDE_PATH\}\}/$guide_path}"
    if [[ "$line" == *"{{CHAPTERS_LIST}}"* ]]; then
      printf '%s\n' "$chapters"
    else
      printf '%s\n' "$line"
    fi
  done < "$TEMPLATE"
}

write_if_changed() {
  local destination="$1"
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp"

  if [[ ! -f "$destination" ]] || ! cmp -s "$tmp" "$destination"; then
    mv "$tmp" "$destination"
    updated=1
    echo "Updated $destination"
  else
    rm -f "$tmp"
  fi
}

tmp_readme="$(mktemp)"
tmp_index="$(mktemp)"

render "docs/images" "docs/guide" > "$tmp_readme"
write_if_changed "$README_OUT" < "$tmp_readme"

{
  cat <<'FM'
---
layout: default
title: Home
---

FM
  render "images" "guide"
} > "$tmp_index"
write_if_changed "$INDEX_OUT" < "$tmp_index"

rm -f "$tmp_readme" "$tmp_index"

if [[ "$updated" -eq 1 ]]; then
  echo "Synced README.md and docs/index.md from content/home.template.md"
else
  echo "Homepage files are already up to date"
fi

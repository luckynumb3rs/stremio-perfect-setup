#!/usr/bin/env bash

# Template discovery helpers.
#
# Purpose:
#   Functions in this file inspect the fetched upstream compose template. They
#   discover modules from root compose.yaml/compose.yml include entries, detect
#   required modules by scanning module profiles, provide the interactive module
#   picker, list stageable module files, and extract Traefik hostname env vars.
#
# This file is source-only and expects lib/common.sh to be available.

set -Eeuo pipefail

SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_LIB_DIR}/common.sh"

list_included_modules() {
  local compose_file="$1"

  [[ -f "${compose_file}" ]] || die "Template root compose file not found: ${compose_file}"

  awk '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*-[[:space:]]+apps\/[^[:space:]]+\/compose\.ya?ml/ {
      gsub(/^[[:space:]]*-[[:space:]]+apps\//, "", $0)
      gsub(/\/compose\.ya?ml[[:space:]]*$/, "", $0)
      print $0
    }
  ' "${compose_file}"
}

template_root_compose_path() {
  local template_dir="$1"

  if [[ -f "${template_dir}/compose.yaml" ]]; then
    printf '%s/compose.yaml' "${template_dir}"
  elif [[ -f "${template_dir}/compose.yml" ]]; then
    printf '%s/compose.yml' "${template_dir}"
  else
    die "Template root compose file not found under ${template_dir}"
  fi
}

module_compose_path() {
  local template_dir="$1"
  local module="$2"
  if [[ -f "${template_dir}/apps/${module}/compose.yaml" ]]; then
    printf '%s/apps/%s/compose.yaml' "${template_dir}" "${module}"
  elif [[ -f "${template_dir}/apps/${module}/compose.yml" ]]; then
    printf '%s/apps/%s/compose.yml' "${template_dir}" "${module}"
  else
    die "Module compose file not found for '${module}' under ${template_dir}/apps/${module}"
  fi
}

module_compose_relative_path() {
  local template_dir="$1"
  local module="$2"

  if [[ -f "${template_dir}/apps/${module}/compose.yaml" ]]; then
    printf 'apps/%s/compose.yaml' "${module}"
  elif [[ -f "${template_dir}/apps/${module}/compose.yml" ]]; then
    printf 'apps/%s/compose.yml' "${module}"
  else
    die "Module compose file not found for '${module}' under ${template_dir}/apps/${module}"
  fi
}

module_profile_names() {
  local template_dir="$1"
  local module="$2"
  local compose_path=""

  compose_path="$(module_compose_path "${template_dir}" "${module}")"
  awk '
    /^[[:space:]]+profiles:[[:space:]]*$/ {
      profile_indent = match($0, /[^ ]/) - 1
      in_profiles = 1
      next
    }
    in_profiles {
      current_indent = match($0, /[^ ]/) - 1
      if ($0 ~ /^[[:space:]]*$/) {
        next
      }
      if (current_indent <= profile_indent) {
        in_profiles = 0
      }
    }
    in_profiles {
      value = $0
      gsub(/^[[:space:]]*-[[:space:]]+/, "", value)
      sub(/[[:space:]]+#.*$/, "", value)
      gsub(/[[:space:]]*$/, "", value)
      if (value != "") {
        print value
      }
    }
  ' "${compose_path}" | dedupe_lines
}

template_profile_names() {
  local template_dir="$1"
  shift
  local module=""

  for module in "$@"; do
    module_profile_names "${template_dir}" "${module}"
  done | dedupe_lines
}

module_is_required() {
  local template_dir="$1"
  local module="$2"
  local compose_path
  local required_profile="${REQUIRED_PROFILE:-required}"

  compose_path="$(module_compose_path "${template_dir}" "${module}")"
  awk -v required_profile="${required_profile}" '
    /^[[:space:]]+profiles:[[:space:]]*$/ {
      profile_indent = match($0, /[^ ]/) - 1
      in_profiles = 1
      next
    }
    in_profiles {
      current_indent = match($0, /[^ ]/) - 1
      if ($0 ~ /^[[:space:]]*$/) {
        next
      }
      if (current_indent <= profile_indent) {
        in_profiles = 0
      }
    }
    in_profiles {
      value = $0
      gsub(/^[[:space:]]*-[[:space:]]+/, "", value)
      gsub(/[[:space:]]*$/, "", value)
      if (value == required_profile) {
        found = 1
      }
    }
    END { exit !found }
  ' "${compose_path}"
}

discover_modules() {
  local template_dir="$1"
  local module=""
  local compose_root=""
  local -n all_ref="$2"
  local -n required_ref="$3"
  local -n optional_ref="$4"

  all_ref=()
  required_ref=()
  optional_ref=()
  compose_root="$(template_root_compose_path "${template_dir}")"

  while IFS= read -r module; do
    [[ -n "${module}" ]] || continue
    all_ref+=("${module}")
    if module_is_required "${template_dir}" "${module}"; then
      required_ref+=("${module}")
    else
      optional_ref+=("${module}")
    fi
  done < <(list_included_modules "${compose_root}")

  (( ${#all_ref[@]} > 0 )) || die "No included modules found in ${compose_root}"
}

prune_template_to_modules() {
  local template_dir="$1"
  shift
  local selected_modules=("$@")
  local compose_root=""
  local all_modules=()
  local required_modules=()
  local optional_modules=()
  local module=""

  (( ${#selected_modules[@]} > 0 )) || die "At least one selected module is required"

  compose_root="$(template_root_compose_path "${template_dir}")"
  discover_modules "${template_dir}" all_modules required_modules optional_modules

  HOSTING_PRUNED_MODULES="$(join_by ',' "${selected_modules[@]}")" python3 - "${compose_root}" <<'PY'
import os
import re
import sys

compose_path = sys.argv[1]
selected = {
    item.strip()
    for item in os.environ.get("HOSTING_PRUNED_MODULES", "").split(",")
    if item.strip()
}
include_pattern = re.compile(r'^(\s*-\s+apps/([^/\s]+)/compose\.ya?ml\s*)$')

with open(compose_path, "r", encoding="utf-8") as handle:
    lines = handle.readlines()

filtered = []
for line in lines:
    match = include_pattern.match(line.rstrip("\n"))
    if match:
        module_name = match.group(2)
        if module_name in selected:
            filtered.append(line)
        continue
    filtered.append(line)

with open(compose_path, "w", encoding="utf-8") as handle:
    handle.writelines(filtered)
PY

  for module in "${all_modules[@]}"; do
    array_contains "${module}" "${selected_modules[@]}" && continue
    rm -rf "${template_dir}/apps/${module}"
  done
}

select_modules_interactively() {
  local template_dir="$1"
  local output_file="$2"
  local all_modules=()
  local required_modules=()
  local optional_modules=()
  local selected=()
  local raw_input="" token="" index=0

  discover_modules "${template_dir}" all_modules required_modules optional_modules

  section "Module selection"
  log "Required modules (always enabled): $(join_by ', ' "${required_modules[@]}")"
  printf '%s\n' "Optional modules:"
  for token in "${optional_modules[@]}"; do
    index=$((index + 1))
    printf '  %2d. %s\n' "${index}" "${token^^}"
  done

  if ! is_interactive; then
    die "Module selection is interactive unless --modules is provided."
  fi

  read -r -p "$(style '35' '?') Enter optional modules by name or number, separated by commas: " raw_input || true
  selected=("${required_modules[@]}")

  if [[ -n "${raw_input}" ]]; then
    local parsed=()
    split_csv_into_array "${raw_input}" parsed
    for token in "${parsed[@]}"; do
      [[ -n "${token}" ]] || continue
      if [[ "${token}" =~ ^[0-9]+$ ]]; then
        index=$((token - 1))
        (( index >= 0 && index < ${#optional_modules[@]} )) || die "Invalid module number: ${token}"
        token="${optional_modules[index]}"
      else
        token="${token,,}"
      fi

      array_contains "${token}" "${optional_modules[@]}" || die "Unknown optional module: ${token}"
      array_contains "${token}" "${selected[@]}" || selected+=("${token}")
    done
  fi

  write_lines_file "${output_file}" "${selected[@]}"
  success "Selected modules: $(join_by ', ' "${selected[@]}")"
}

module_stageable_entries() {
  local template_dir="$1"
  local module="$2"

  [[ -d "${template_dir}/apps/${module}" ]] || die "Module directory not found: ${template_dir}/apps/${module}"
  find "${template_dir}/apps/${module}" -mindepth 1 -maxdepth 1 ! -name 'compose.yaml' ! -name 'compose.yml' -printf '%f\n' | sort
}

module_host_env_vars() {
  local template_dir="$1"
  local module="$2"
  local compose_path

  compose_path="$(module_compose_path "${template_dir}" "${module}")"
  {
    grep 'traefik\.http\.routers\..*\.rule=Host(`' "${compose_path}" || true
  } | grep -oE '\$\{[A-Z0-9_]+[?:-]?' | sed -E 's/^\$\{//; s/[?:-]?$//' | dedupe_lines || true
}

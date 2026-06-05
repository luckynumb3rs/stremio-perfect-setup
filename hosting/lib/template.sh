#!/usr/bin/env bash

# Template discovery helpers.
#
# Purpose:
#   Functions in this file inspect the fetched upstream compose template. They
#   discover modules from apps/*/compose.yaml|yml, detect required modules by
#   scanning module profiles, provide the interactive module picker, rebuild the
#   root include list from the selected modules, list stageable module files,
#   and extract Traefik hostname env vars.
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

list_app_modules() {
  local template_dir="$1"

  [[ -d "${template_dir}/apps" ]] || die "Template apps directory not found: ${template_dir}/apps"

  find "${template_dir}/apps" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | while IFS= read -r module; do
    [[ -f "${template_dir}/apps/${module}/compose.yaml" || -f "${template_dir}/apps/${module}/compose.yml" ]] || continue
    printf '%s\n' "${module}"
  done | sort
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
  local -n all_ref="$2"
  local -n required_ref="$3"
  local -n optional_ref="$4"

  all_ref=()
  required_ref=()
  optional_ref=()

  while IFS= read -r module; do
    [[ -n "${module}" ]] || continue
    all_ref+=("${module}")
    if module_is_required "${template_dir}" "${module}"; then
      required_ref+=("${module}")
    else
      optional_ref+=("${module}")
    fi
  done < <(list_app_modules "${template_dir}")

  (( ${#all_ref[@]} > 0 )) || die "No app modules found under ${template_dir}/apps"
}

rewrite_root_compose_includes() {
  local template_dir="$1"
  shift
  local selected_modules=("$@")
  local compose_root=""
  local compose_entries=()
  local module=""

  (( ${#selected_modules[@]} > 0 )) || die "At least one selected module is required"
  compose_root="$(template_root_compose_path "${template_dir}")"
  for module in "${selected_modules[@]}"; do
    compose_entries+=("$(module_compose_relative_path "${template_dir}" "${module}")")
  done

  HOSTING_ROOT_COMPOSE_ENTRIES="$(printf '%s\n' "${compose_entries[@]}" | dedupe_lines)" python3 - "${compose_root}" <<'PY'
import os
import sys

compose_path = sys.argv[1]
entries = [line for line in os.environ.get("HOSTING_ROOT_COMPOSE_ENTRIES", "").splitlines() if line]

with open(compose_path, "r", encoding="utf-8") as handle:
    lines = handle.readlines()

include_block = ["include:\n"]
include_block.extend(f"  - {entry}\n" for entry in entries)

new_lines = []
index = 0
replaced = False
while index < len(lines):
    line = lines[index]
    if line.strip() == "include:" and line == line.lstrip():
      new_lines.extend(include_block)
      replaced = True
      index += 1
      while index < len(lines):
        current = lines[index]
        if current.strip() == "":
          index += 1
          continue
        if current[0].isspace():
          index += 1
          continue
        break
      if index < len(lines) and new_lines and new_lines[-1].strip():
        new_lines.append("\n")
      continue
    new_lines.append(line)
    index += 1

if not replaced:
    if new_lines and new_lines[0].strip():
        include_block.append("\n")
    new_lines = include_block + new_lines

with open(compose_path, "w", encoding="utf-8") as handle:
    handle.writelines(new_lines)
PY
}

prune_template_to_modules() {
  local template_dir="$1"
  shift
  local selected_modules=("$@")
  local all_modules=()
  local required_modules=()
  local optional_modules=()
  local module=""

  (( ${#selected_modules[@]} > 0 )) || die "At least one selected module is required"

  discover_modules "${template_dir}" all_modules required_modules optional_modules
  rewrite_root_compose_includes "${template_dir}" "${selected_modules[@]}"

  for module in "${all_modules[@]}"; do
    array_contains "${module}" "${selected_modules[@]}" && continue
    rm -rf "${template_dir}/apps/${module}"
  done
}

# Reads hosting/configs/presets.json and emits one tab-separated record per preset:
#   id<TAB>name<TAB>description<TAB>comma-separated-modules
# Emits nothing if the file is missing, unreadable, or defines no presets. JSON is
# parsed with python3 to match the rest of the repo (no jq dependency).
read_preset_catalog() {
  local presets_file="${HOSTING_ROOT}/configs/presets.json"
  [[ -f "${presets_file}" ]] || return 0
  python3 - "${presets_file}" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        data = json.load(handle)
except Exception:
    sys.exit(0)

for preset in data.get("presets", []):
    if not isinstance(preset, dict):
        continue
    preset_id = str(preset.get("id", "")).strip()
    if not preset_id:
        continue
    name = str(preset.get("name", "")).strip()
    desc = str(preset.get("description", "")).strip()
    modules = ",".join(
        str(module).strip()
        for module in preset.get("modules", [])
        if str(module).strip()
    )
    print("\t".join([preset_id, name, desc, modules]))
PY
}

# Echoes the comma-separated module list for the given preset id, or returns non-zero
# if no preset matches (so callers can report an error). Used by the --preset flag.
preset_modules_for_id() {
  local wanted="$1"
  local id="" name="" desc="" modcsv=""
  while IFS=$'\t' read -r id name desc modcsv; do
    if [[ "${id}" == "${wanted}" ]]; then
      printf '%s' "${modcsv}"
      return 0
    fi
  done < <(read_preset_catalog)
  return 1
}

# Echoes the available preset ids as a comma-separated list, for help and error text.
preset_ids() {
  local id="" name="" desc="" modcsv="" out=""
  while IFS=$'\t' read -r id name desc modcsv; do
    [[ -n "${id}" ]] || continue
    if [[ -z "${out}" ]]; then
      out="${id}"
    else
      out="${out}, ${id}"
    fi
  done < <(read_preset_catalog)
  printf '%s' "${out}"
}

# Prints the preset catalog in a human-readable form for `main.sh --list-presets`.
print_preset_catalog() {
  local id="" name="" desc="" modcsv="" any=0
  while IFS=$'\t' read -r id name desc modcsv; do
    [[ -n "${id}" ]] || continue
    any=1
    printf '%s (%s)\n    %s\n    modules: %s\n' "${id}" "${name}" "${desc}" "${modcsv:-<none>}"
  done < <(read_preset_catalog)
  if (( ! any )); then
    printf 'No presets are defined in %s\n' "${HOSTING_ROOT}/configs/presets.json"
  fi
}

# Offers preset "packages" (named bundles of modules) on a fresh install so the user
# can start the module checklist with a sensible selection already enabled. Reads the
# preset catalog from hosting/configs/presets.json and presents a single-select menu.
#
# Sets two globals consumed by the caller:
#   PRESET_MODULES_CSV   comma-separated optional modules for the chosen package
#                        (empty when no package is chosen)
#   PRESET_SELECTED_NAME display name of the chosen package (empty when none)
#
# If presets.json is missing, unreadable, or has no presets, both globals stay empty
# and the function returns silently so the installer continues with nothing preselected.
PRESET_MODULES_CSV=""
PRESET_SELECTED_NAME=""
select_preset_interactively() {
  PRESET_MODULES_CSV=""
  PRESET_SELECTED_NAME=""

  local ids=() names=() descs=() mods=()
  local id="" name="" desc="" modcsv=""
  while IFS=$'\t' read -r id name desc modcsv; do
    [[ -n "${id}" ]] || continue
    ids+=("${id}")
    names+=("${name}")
    descs+=("${desc}")
    mods+=("${modcsv}")
  done < <(read_preset_catalog)

  (( ${#ids[@]} > 0 )) || return 0

  ensure_dialog_ui "package selection"
  section "Module package"

  local options=()
  local index=0
  for (( index = 0; index < ${#ids[@]}; index++ )); do
    options+=("${ids[index]}" "${names[index]} — ${descs[index]}")
  done
  options+=("none" "No package — continue with nothing preselected")

  local choice=""
  choice="$(prompt_choice "Module Package" "Pick a preset package of modules to start from. The next screen lets you add or remove individual modules. Choose \"none\" to start from scratch." "none" "${options[@]}")"

  if [[ -z "${choice}" || "${choice}" == "none" ]]; then
    log "No package selected; continuing with no modules preselected."
    return 0
  fi

  for (( index = 0; index < ${#ids[@]}; index++ )); do
    if [[ "${ids[index]}" == "${choice}" ]]; then
      PRESET_MODULES_CSV="${mods[index]}"
      PRESET_SELECTED_NAME="${names[index]}"
      success "Selected package: ${names[index]}"
      return 0
    fi
  done

  warn "Unknown package selection: ${choice}; continuing with no modules preselected."
}

select_modules_interactively() {
  local template_dir="$1"
  local output_file="$2"
  local defaults_csv="${3:-}"
  local all_modules=()
  local required_modules=()
  local optional_modules=()
  local selected=()
  local default_selected=()
  local default_selected_optional=()
  local raw_input="" token="" index=0

  discover_modules "${template_dir}" all_modules required_modules optional_modules
  ensure_dialog_ui "module selection"

  if [[ -n "${defaults_csv}" ]]; then
    split_csv_into_array "${defaults_csv}" default_selected
  fi
  for token in "${default_selected[@]}"; do
    [[ -n "${token}" ]] || continue
    array_contains "${token}" "${optional_modules[@]}" || continue
    array_contains "${token}" "${default_selected_optional[@]}" || default_selected_optional+=("${token}")
  done

  if (( ${#optional_modules[@]} == 0 )); then
    section "Module selection"
    log "Required modules (always enabled): $(join_by ', ' "${required_modules[@]}")"
    write_lines_file "${output_file}" "${required_modules[@]}"
    success "Selected modules: $(join_by ', ' "${required_modules[@]}")"
    return 0
  fi

  if dialog_ui_available; then
    select_modules_with_whiptail "${output_file}" "${required_modules[@]}" -- "${optional_modules[@]}" -- "${default_selected_optional[@]}"
    return 0
  fi

  section "Module selection"
  log "Required modules are always enabled because the base stack depends on them: $(join_by ', ' "${required_modules[@]}")"
  printf '%s\n' "Optional modules:"
  for token in "${optional_modules[@]}"; do
    index=$((index + 1))
    if array_contains "${token}" "${default_selected_optional[@]}"; then
      printf '  %2d. %s [enabled]\n' "${index}" "${token^^}"
    else
      printf '  %2d. %s\n' "${index}" "${token^^}"
    fi
  done

  if ! is_interactive; then
    die "Module selection is interactive unless --modules is provided."
  fi

  raw_input="$(prompt_value "Enter the optional modules to enable by name or number, separated by commas, so the script knows which app folders to deploy [MODULES]" "$(join_by ',' "${default_selected_optional[@]}")")"
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

select_modules_with_whiptail() {
  local output_file="$1"
  shift
  local required_modules=()
  local optional_modules=()
  local default_selected_optional=()
  local token="" item_status="" item_note=""
  local args=()
  local selected_output=""
  local status=0
  local required_label=""
  local prompt_text=""
  local selected=()
  local selected_optional=()
  local term_lines=24
  local term_cols=80
  local checklist_height=10
  local dialog_height=20
  local dialog_width=90

  while (( $# > 0 )); do
    if [[ "$1" == "--" ]]; then
      shift
      break
    fi
    required_modules+=("$1")
    shift
  done

  while (( $# > 0 )); do
    if [[ "$1" == "--" ]]; then
      shift
      break
    fi
    optional_modules+=("$1")
    shift
  done

  while (( $# > 0 )); do
    default_selected_optional+=("$1")
    shift
  done

  for token in "${optional_modules[@]}"; do
    if array_contains "${token}" "${default_selected_optional[@]}"; then
      item_status="ON"
      item_note="enabled"
    else
      item_status="OFF"
      item_note="optional"
    fi
    args+=("${token}" "${item_note}" "${item_status}")
  done

  if command -v tput >/dev/null 2>&1; then
    term_lines="$(tput lines 2>/dev/null || printf '24')"
    term_cols="$(tput cols 2>/dev/null || printf '80')"
  fi

  checklist_height=$(( ${#optional_modules[@]} + 2 ))
  (( checklist_height > term_lines - 10 )) && checklist_height=$(( term_lines - 10 ))
  (( checklist_height < 8 )) && checklist_height=8

  dialog_height=$(( checklist_height + 10 ))
  (( dialog_height > term_lines - 2 )) && dialog_height=$(( term_lines - 2 ))
  (( dialog_height < 16 )) && dialog_height=16

  dialog_width=$(( term_cols - 6 ))
  (( dialog_width > 120 )) && dialog_width=120
  (( dialog_width < 72 )) && dialog_width=72

  required_label="$(join_by ', ' "${required_modules[@]}")"
  prompt_text="Choose which optional app modules to deploy [MODULES]. Use Up/Down to move, Space to toggle, and Enter to confirm. Required modules are always enabled because the base stack depends on them: ${required_label}"

  selected_output="$(
    whiptail_capture_on_tty \
      --title "Module Selection" \
      --ok-button "Confirm" \
      --cancel-button "Cancel" \
      --separate-output \
      --checklist "${prompt_text}" "${dialog_height}" "${dialog_width}" "${checklist_height}" \
      "${args[@]}"
  )" || status=$?

  if (( status != 0 )); then
    die "Module selection cancelled."
  fi

  mapfile -t selected_optional < <(printf '%s\n' "${selected_output}" | sed '/^$/d')
  selected=("${required_modules[@]}")
  for token in "${selected_optional[@]}"; do
    token="${token%\"}"
    token="${token#\"}"
    array_contains "${token}" "${optional_modules[@]}" || die "Unknown optional module returned by whiptail: ${token}"
    array_contains "${token}" "${selected[@]}" || selected+=("${token}")
  done

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

#!/usr/bin/env bash

# Shared helpers for the hosting automation bundle.
#
# This file is sourced by hosting/main.sh and executable scripts under
# hosting/steps, hosting/db, and hosting/modules. It centralizes path discovery,
# defaults loading, prompting, .env mutation, secret generation, package checks,
# Docker Compose invocation, and staging-manifest helpers.
#
# Important path conventions:
# - HOSTING_ROOT is the hosting/ directory, regardless of where the caller runs.
# - DEFAULTS_FILE is hosting/defaults.env.
# - All temporary work directories are derived from defaults and are relative to
#   HOSTING_ROOT unless the caller supplies absolute paths.
#
# This file is intentionally source-only. Do not execute it directly.

set -Eeuo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTING_ROOT="$(cd "${LIB_DIR}/.." && pwd)"
DEFAULTS_FILE="${HOSTING_ROOT}/defaults.env"

if [[ -n "${HOSTING_COMMON_LOADED:-}" ]]; then
  return 0
fi
HOSTING_COMMON_LOADED=1

declare -a HOSTING_CLEANUP_PATHS=()
HOSTING_COLOR_ENABLED=0
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  HOSTING_COLOR_ENABLED=1
fi

load_defaults() {
  if [[ -f "${DEFAULTS_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${DEFAULTS_FILE}"
  fi
}

supports_color() {
  [[ "${HOSTING_COLOR_ENABLED}" == "1" ]]
}

style() {
  local code="$1"
  shift

  if supports_color; then
    printf '\033[%sm%s\033[0m' "${code}" "$*"
  else
    printf '%s' "$*"
  fi
}

style_stderr() {
  local code="$1"
  shift

  if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
    printf '\033[%sm%s\033[0m' "${code}" "$*" >&2
  else
    printf '%s' "$*" >&2
  fi
}

section() {
  if [[ -n "${HOSTING_LOG_TO_STDERR:-}" ]]; then
    printf '\n%s %s\n' "$(style '1;36' '▶')" "$(style '1;36' "$*")" >&2
  else
    printf '\n%s %s\n' "$(style '1;36' '▶')" "$(style '1;36' "$*")"
  fi
}

log() {
  if [[ -n "${HOSTING_LOG_TO_STDERR:-}" ]]; then
    printf '%s %s\n' "$(style '36' 'ℹ')" "$*" >&2
  else
    printf '%s %s\n' "$(style '36' 'ℹ')" "$*"
  fi
}

success() {
  if [[ -n "${HOSTING_LOG_TO_STDERR:-}" ]]; then
    printf '%s %s\n' "$(style '32' '✓')" "$*" >&2
  else
    printf '%s %s\n' "$(style '32' '✓')" "$*"
  fi
}

warn() {
  printf '%s %s\n' "$(style '33' '⚠')" "$*" >&2
}

die() {
  printf '%s %s\n' "$(style '31' '✗')" "$*" >&2
  exit 1
}

cleanup_registered_paths() {
  local path=""
  for path in "${HOSTING_CLEANUP_PATHS[@]:-}"; do
    [[ -n "${path}" && -e "${path}" ]] && rm -rf "${path}"
  done
}

register_cleanup_path() {
  HOSTING_CLEANUP_PATHS+=("$1")
}

setup_cleanup_trap() {
  trap cleanup_registered_paths EXIT
}

hosting_is_dry_run() {
  [[ "${HOSTING_DRY_RUN:-0}" == "1" ]]
}

dry_run_log() {
  log "[dry-run] $*"
}

is_interactive() {
  [[ -t 0 && -t 1 ]]
}

prompt_value() {
  local prompt="$1"
  local default_value="${2:-}"
  local value=""

  if ! is_interactive; then
    printf '%s' "${default_value}"
    return 0
  fi

  if [[ -n "${default_value}" ]]; then
    read -r -p "$(style '35' '?') ${prompt} [${default_value}]: " value || true
    printf '%s' "${value:-${default_value}}"
  else
    read -r -p "$(style '35' '?') ${prompt}: " value || true
    printf '%s' "${value}"
  fi
}

prompt_secret() {
  local prompt="$1"
  local value=""

  if ! is_interactive; then
    return 0
  fi

  read -r -s -p "$(style '35' '?') ${prompt}: " value || true
  printf '\n' >&2
  printf '%s' "${value}"
}

prompt_yes_no() {
  local prompt="$1"
  local default_answer="${2:-yes}"
  local suffix="[Y/n]"
  local answer=""

  if [[ "${default_answer}" == "no" ]]; then
    suffix="[y/N]"
  fi

  if ! is_interactive; then
    [[ "${default_answer}" == "yes" ]]
    return
  fi

  read -r -p "$(style '35' '?') ${prompt} ${suffix} " answer || true
  answer="${answer,,}"

  if [[ -z "${answer}" ]]; then
    [[ "${default_answer}" == "yes" ]]
    return
  fi

  [[ "${answer}" == "y" || "${answer}" == "yes" ]]
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

split_csv_into_array() {
  local csv="$1"
  local -n target_ref="$2"
  local item=""

  target_ref=()
  IFS=',' read -r -a target_ref <<< "${csv}"
  for item in "${!target_ref[@]}"; do
    target_ref[item]="$(trim "${target_ref[item]}")"
  done
}

join_by() {
  local delimiter="$1"
  shift
  local first=1
  local item=""

  for item in "$@"; do
    if (( first )); then
      printf '%s' "${item}"
      first=0
    else
      printf '%s%s' "${delimiter}" "${item}"
    fi
  done
}

array_contains() {
  local needle="$1"
  shift
  local item=""
  for item in "$@"; do
    [[ "${item}" == "${needle}" ]] && return 0
  done
  return 1
}

dedupe_lines() {
  awk '!seen[$0]++'
}

normalize_identifier_upper() {
  printf '%s' "$1" | tr '[:lower:]-' '[:upper:]_'
}

normalize_identifier_lower() {
  printf '%s' "$1" | tr '[:upper:]-' '[:lower:]_'
}

module_prefix() {
  printf '%s' "${1^^}"
}

stage_name_for() {
  local module="$1"
  local base_name="$2"
  local prefix

  prefix="$(module_prefix "${module}")"
  if [[ "${base_name}" == .* ]]; then
    printf '%s%s' "${prefix}" "${base_name}"
  else
    printf '%s.%s' "${prefix}" "${base_name}"
  fi
}

env_get() {
  local file="$1"
  local key="$2"
  awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "${file}"
}

env_get_resolved() {
  local file="$1"
  local key="$2"
  local raw_value

  raw_value="$(env_get "${file}" "${key}")"
  env_resolve_value "${file}" "${raw_value}"
}

env_resolve_value() {
  local file="$1"
  local value="$2"

  python3 - "${file}" "${value}" <<'PY'
import re
import sys

env_file = sys.argv[1]
value = sys.argv[2]
values = {}

with open(env_file, "r", encoding="utf-8") as handle:
    for line in handle:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, raw = line.rstrip("\n").split("=", 1)
        values[key] = raw.strip().strip('"').strip("'")

pattern = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?])([^}]*))?\}")

def replace(match):
    key = match.group(1)
    operator = match.group(2)
    fallback = match.group(3) or ""
    current = values.get(key, "")
    if current:
        return current
    if operator == ":-":
        return fallback
    return ""

for _ in range(10):
    new_value = pattern.sub(replace, value)
    if new_value == value:
        break
    value = new_value

print(value, end="")
PY
}

env_upsert() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file

  tmp_file="$(temp_file_next_to "${file}")"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { done = 0 }
    $0 ~ ("^" key "=") {
      print key "=" value
      done = 1
      next
    }
    { print }
    END {
      if (!done) {
        print key "=" value
      }
    }
  ' "${file}" > "${tmp_file}"
  mv "${tmp_file}" "${file}"
}

env_upsert_uncomment() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file

  tmp_file="$(temp_file_next_to "${file}")"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { done = 0 }
    $0 ~ ("^[[:space:]]*#?[[:space:]]*" key "=") && !done {
      print key "=" value
      done = 1
      next
    }
    { print }
    END {
      if (!done) {
        print key "=" value
      }
    }
  ' "${file}" > "${tmp_file}"
  mv "${tmp_file}" "${file}"
}

env_value_is_placeholder() {
  local value="$1"
  case "${value}" in
    ""|example.com|yourdomain.com|"\"\""|"''")
      return 0
      ;;
  esac
  return 1
}

ensure_directory() {
  mkdir -p "$1"
}

temp_file_next_to() {
  local target_path="$1"
  local target_dir=""

  target_dir="$(dirname "${target_path}")"
  ensure_directory "${target_dir}"
  mktemp "${target_dir}/.tmp.XXXXXX"
}

absolute_path() {
  local input_path="$1"
  if [[ "${input_path}" == /* ]]; then
    printf '%s' "${input_path}"
  else
    printf '%s/%s' "$(pwd)" "${input_path#./}"
  fi
}

require_commands() {
  local command_name=""
  for command_name in "$@"; do
    command -v "${command_name}" >/dev/null 2>&1 || die "Missing required command: ${command_name}"
  done
}

ensure_apt_packages() {
  local packages=()
  local package=""

  command -v dpkg >/dev/null 2>&1 || die "Automatic package installation requires a Debian/Ubuntu host with dpkg."

  for package in "$@"; do
    dpkg -s "${package}" >/dev/null 2>&1 || packages+=("${package}")
  done

  if (( ${#packages[@]} == 0 )); then
    return 0
  fi

  if hosting_is_dry_run; then
    die "Dry run would install packages: $(join_by ', ' "${packages[@]}"). Install them first or run without --dry-run."
  fi

  command -v apt-get >/dev/null 2>&1 || die "Automatic package installation requires apt-get."
  log "Installing packages: $(join_by ', ' "${packages[@]}")"
  run_privileged apt-get update
  run_privileged apt-get install -y "${packages[@]}"
}

run_privileged() {
  if hosting_is_dry_run; then
    die "Dry run would require elevated command: $*"
  fi

  if (( EUID == 0 )); then
    "$@"
  else
    command -v sudo >/dev/null 2>&1 || die "This step needs elevated privileges, but sudo is not installed."
    sudo "$@"
  fi
}

generate_secret_base64() {
  openssl rand -base64 64 | tr -d '=/' | tr -d '\n'
}

generate_secret_hex() {
  openssl rand -hex 32
}

run_docker_compose() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
  else
    run_privileged docker compose "$@"
  fi
}

write_lines_file() {
  local file="$1"
  shift
  printf '%s\n' "$@" > "${file}"
}

read_lines_file() {
  local file="$1"
  [[ -f "${file}" ]] || return 0
  awk 'NF { print }' "${file}"
}

remove_line_from_file() {
  local file="$1"
  local needle="$2"
  local tmp_file

  tmp_file="$(temp_file_next_to "${file}")"
  awk -v needle="${needle}" '$0 != needle { print }' "${file}" > "${tmp_file}"
  mv "${tmp_file}" "${file}"
}

default_public_ip() {
  if hosting_is_dry_run; then
    return 0
  fi

  curl -fsSL https://api.ipify.org 2>/dev/null || true
}

stage_item() {
  local module="$1"
  local source_rel="$2"
  local manifest_file="$3"
  local template_dir="$4"
  local config_dir="$5"
  local source_abs="${template_dir}/${source_rel}"
  local base_name stage_name staged_abs item_type

  [[ -e "${source_abs}" ]] || die "Cannot stage missing path: ${source_abs}"

  if awk -F'\t' -v source_rel="${source_rel}" '$2 == source_rel { found = 1 } END { exit !found }' "${manifest_file}" 2>/dev/null; then
    return 0
  fi

  base_name="$(basename "${source_rel}")"
  stage_name="$(stage_name_for "${module}" "${base_name}")"
  staged_abs="${config_dir}/${stage_name}"

  if [[ -d "${source_abs}" ]]; then
    item_type="dir"
    cp -a "${source_abs}" "${staged_abs}"
  else
    item_type="file"
    cp -a "${source_abs}" "${staged_abs}"
  fi

  printf '%s\t%s\t%s\t%s\n' "${module}" "${source_rel}" "${stage_name}" "${item_type}" >> "${manifest_file}"
}

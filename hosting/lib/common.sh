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
declare -a HOSTING_WHIPTAIL_ARGS=()
# Populated by die() with a human-readable message and by the ERR trap with the
# failing command/line, so the EXIT trap can show a final error dialog.
HOSTING_ERROR_MESSAGE=""
HOSTING_ERROR_COMMAND=""
HOSTING_ERROR_LINE=""
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
  HOSTING_ERROR_MESSAGE="$*"
  printf '%s %s\n' "$(style '31' '✗')" "$*" >&2
  exit 1
}

cleanup_registered_paths() {
  local path=""
  for path in "${HOSTING_CLEANUP_PATHS[@]:-}"; do
    if [[ -n "${path}" && -e "${path}" ]]; then
      rm -rf "${path}"
    fi
  done
  # Always succeed: this runs from an EXIT trap, so a non-zero result from the
  # last test/rm above would otherwise become the script's exit status and make
  # a fully successful run report failure.
  return 0
}

register_cleanup_path() {
  HOSTING_CLEANUP_PATHS+=("$1")
}

# ERR-trap body: capture the command and line that failed for an unexpected
# crash (one that did not route through die()). set -E propagates this into
# functions; guarded commands (if/||/&&/!) do not trigger it, so the captured
# command is the genuinely fatal one.
record_error() {
  HOSTING_ERROR_COMMAND="${1:-}"
  HOSTING_ERROR_LINE="${2:-}"
}

# Final error dialog, shown from on_exit() on any non-zero exit when a whiptail
# UI is available. When unavailable the error is left to the stderr output that
# die() / set -e already produced.
show_error_dialog() {
  local exit_code="${1:-1}"
  local message=""

  dialog_ui_available || return 0

  if [[ -n "${HOSTING_ERROR_MESSAGE}" ]]; then
    message="${HOSTING_ERROR_MESSAGE}"
  else
    message="The hosting setup stopped unexpectedly."
    if [[ -n "${HOSTING_ERROR_COMMAND}" ]]; then
      message+=$'\n\n'"Failed command: ${HOSTING_ERROR_COMMAND}"
    fi
    if [[ -n "${HOSTING_ERROR_LINE}" ]]; then
      message+=$'\n'"Line: ${HOSTING_ERROR_LINE}"
    fi
  fi

  message+=$'\n\n'"Exit code: ${exit_code}"
  message+=$'\n'"Full output is in the terminal above, scroll up for details."

  # Tolerate a non-zero return (e.g. Esc dismiss): this runs from the EXIT trap,
  # so a failure here must not mask the real exit status.
  whiptail_on_tty \
    --title "Setup Failed" \
    --msgbox "${message}" \
    "$(dialog_msgbox_height "${message}")" 78 || true
  return 0
}

# EXIT-trap body: the single decision point for the final screens. Capture the
# real exit status first, surface a failure dialog when warranted, run the path
# cleanup, then exit with the original status so a successful run still reports 0.
on_exit() {
  local exit_code=$?

  if (( exit_code != 0 )) && [[ "${HOSTING_SUPPRESS_ERROR_DIALOG:-0}" != "1" ]]; then
    show_error_dialog "${exit_code}"
  fi

  cleanup_registered_paths
  exit "${exit_code}"
}

setup_cleanup_trap() {
  trap 'record_error "${BASH_COMMAND}" "${LINENO}"' ERR
  trap on_exit EXIT
}

hosting_is_dry_run() {
  [[ "${HOSTING_DRY_RUN:-0}" == "1" ]]
}

dry_run_log() {
  log "[dry-run] $*"
}

is_interactive() {
  [[ -t 0 ]]
}

tty_device_available() {
  [[ -r /dev/tty && -w /dev/tty ]]
}

dialog_ui_available() {
  is_interactive && tty_device_available && command -v whiptail >/dev/null 2>&1
}

dialog_text_has_prefix_icon() {
  local value="${1:-}"

  [[ -n "${value}" && "${value}" != [[:alnum:]]* ]]
}

dialog_title_icon() {
  local title="${1:-}"
  local lower_title="${title,,}"

  case "${lower_title}" in
    *validation*|*invalid*|*error*|*warning*)
      printf '⚠️'
      ;;
    *confirm*|*question*)
      printf '❓'
      ;;
    *secret*|*password*)
      printf '🔐'
      ;;
    *input*)
      printf '✍️'
      ;;
    *ssh*|*key*)
      printf '🔑'
      ;;
    *docker*)
      printf '🐳'
      ;;
    *module*)
      printf '🧩'
      ;;
    *authelia*|*auth*)
      printf '🛡️'
      ;;
    *cloudflare*)
      printf '☁️'
      ;;
    *supabase*|*database*)
      printf '🗄️'
      ;;
    *domain*|*hostname*|*dns*)
      printf '🌐'
      ;;
    *environment*|*config*)
      printf '⚙️'
      ;;
    *backup*)
      printf '💾'
      ;;
    *deploy*)
      printf '🚀'
      ;;
    *)
      printf '🖥️'
      ;;
  esac
}

dialog_decorate_title() {
  local title="${1:-}"

  [[ -n "${title}" ]] || {
    printf '🖥️  Hosting Perfect Setup'
    return 0
  }

  if dialog_text_has_prefix_icon "${title}"; then
    printf '%s' "${title}"
    return 0
  fi

  printf '%s  %s' "$(dialog_title_icon "${title}")" "${title}"
}

dialog_default_title() {
  local dialog_type="${1:-}"

  case "${dialog_type}" in
    --yesno)
      printf 'Confirmation'
      ;;
    --inputbox)
      printf 'Input Required'
      ;;
    --passwordbox)
      printf 'Secret Required'
      ;;
    --menu|--radiolist)
      printf 'Selection Required'
      ;;
    --checklist)
      printf 'Module Selection'
      ;;
    --msgbox|--textbox|--infobox)
      printf 'Information'
      ;;
    *)
      printf 'Hosting Perfect Setup'
      ;;
  esac
}

dialog_button_icon() {
  local button_kind="${1:-}"

  case "${button_kind}" in
    yes|ok)
      printf '✅'
      ;;
    no|cancel)
      printf '❌'
      ;;
    *)
      printf '✨'
      ;;
  esac
}

dialog_default_button_label() {
  local button_kind="${1:-}"
  local dialog_type="${2:-}"

  case "${button_kind}" in
    yes)
      printf 'Yes'
      ;;
    no)
      printf 'No'
      ;;
    cancel)
      printf 'Cancel'
      ;;
    ok)
      case "${dialog_type}" in
        --inputbox|--passwordbox)
          printf 'Continue'
          ;;
        --menu|--radiolist)
          printf 'Select'
          ;;
        --checklist)
          printf 'Confirm'
          ;;
        *)
          printf 'OK'
          ;;
      esac
      ;;
    *)
      printf 'OK'
      ;;
  esac
}

dialog_decorate_button_label() {
  local button_kind="${1:-}"
  local label="${2:-}"
  local dialog_type="${3:-}"

  if [[ -z "${label}" ]]; then
    label="$(dialog_default_button_label "${button_kind}" "${dialog_type}")"
  fi

  if dialog_text_has_prefix_icon "${label}"; then
    printf '%s' "${label}"
    return 0
  fi

  printf '%s %s' "$(dialog_button_icon "${button_kind}")" "${label}"
}

prepare_whiptail_args() {
  local dialog_type=""
  local arg=""
  local value=""
  local seen_dialog=0
  local have_title=0
  local have_ok_button=0
  local have_cancel_button=0
  local have_yes_button=0
  local have_no_button=0
  local disable_cancel=0
  local before_dialog=()
  local after_dialog=()

  while (( $# > 0 )); do
    arg="$1"
    shift

    case "${arg}" in
      --title|--ok-button|--cancel-button|--yes-button|--no-button)
        (( $# > 0 )) || die "Missing value for ${arg}"
        value="$1"
        shift
        case "${arg}" in
          --title)
            have_title=1
            value="$(dialog_decorate_title "${value}")"
            ;;
          --ok-button)
            have_ok_button=1
            value="$(dialog_decorate_button_label ok "${value}" "${dialog_type}")"
            ;;
          --cancel-button)
            have_cancel_button=1
            value="$(dialog_decorate_button_label cancel "${value}" "${dialog_type}")"
            ;;
          --yes-button)
            have_yes_button=1
            value="$(dialog_decorate_button_label yes "${value}" "${dialog_type}")"
            ;;
          --no-button)
            have_no_button=1
            value="$(dialog_decorate_button_label no "${value}" "${dialog_type}")"
            ;;
        esac

        if (( seen_dialog )); then
          after_dialog+=("${arg}" "${value}")
        else
          before_dialog+=("${arg}" "${value}")
        fi
        ;;
      --nocancel)
        disable_cancel=1
        if (( seen_dialog )); then
          after_dialog+=("${arg}")
        else
          before_dialog+=("${arg}")
        fi
        ;;
      --yesno|--msgbox|--inputbox|--passwordbox|--menu|--checklist|--radiolist|--textbox|--infobox)
        [[ -n "${dialog_type}" ]] || dialog_type="${arg}"
        seen_dialog=1
        after_dialog+=("${arg}")
        ;;
      *)
        if (( seen_dialog )); then
          after_dialog+=("${arg}")
        else
          before_dialog+=("${arg}")
        fi
        ;;
    esac
  done

  if [[ -n "${dialog_type}" ]]; then
    if (( ! have_title )); then
      before_dialog+=(--title "$(dialog_decorate_title "$(dialog_default_title "${dialog_type}")")")
    fi

    case "${dialog_type}" in
      --yesno)
        if (( ! have_yes_button )); then
          before_dialog+=(--yes-button "$(dialog_decorate_button_label yes "" "${dialog_type}")")
        fi
        if (( ! have_no_button )); then
          before_dialog+=(--no-button "$(dialog_decorate_button_label no "" "${dialog_type}")")
        fi
        ;;
      --msgbox)
        if (( ! have_ok_button )); then
          before_dialog+=(--ok-button "$(dialog_decorate_button_label ok "" "${dialog_type}")")
        fi
        ;;
      --inputbox|--passwordbox|--menu|--checklist|--radiolist)
        if (( ! have_ok_button )); then
          before_dialog+=(--ok-button "$(dialog_decorate_button_label ok "" "${dialog_type}")")
        fi
        if (( ! have_cancel_button && ! disable_cancel )); then
          before_dialog+=(--cancel-button "$(dialog_decorate_button_label cancel "" "${dialog_type}")")
        fi
        ;;
    esac
  fi

  HOSTING_WHIPTAIL_ARGS=("${before_dialog[@]}" "${after_dialog[@]}")
}

whiptail_on_tty() {
  prepare_whiptail_args "$@"
  whiptail "${HOSTING_WHIPTAIL_ARGS[@]}" </dev/tty >/dev/tty 2>&1
}

whiptail_capture_on_tty() {
  prepare_whiptail_args "$@"
  whiptail "${HOSTING_WHIPTAIL_ARGS[@]}" 3>&1 1>/dev/tty 2>&3 </dev/tty
}

ensure_dialog_ui() {
  local purpose="${1:-the hosting setup}"
  local install_status=1

  if ! is_interactive || dialog_ui_available || hosting_is_dry_run; then
    return 0
  fi

  if [[ "${HOSTING_DIALOG_INSTALL_ATTEMPTED:-0}" == "1" ]]; then
    warn "whiptail is unavailable, so ${purpose} will continue with plain terminal prompts."
    return 0
  fi

  export HOSTING_DIALOG_INSTALL_ATTEMPTED=1

  if ! command -v dpkg >/dev/null 2>&1 || ! command -v apt-get >/dev/null 2>&1; then
    warn "whiptail is not installed, so ${purpose} will continue with plain terminal prompts."
    return 0
  fi

  if dpkg -s whiptail >/dev/null 2>&1; then
    return 0
  fi

  log "whiptail is missing; attempting to install it so ${purpose} can use the visual interface."

  if (( EUID == 0 )); then
    if apt-get update && apt-get install -y whiptail; then
      install_status=0
    fi
  elif command -v sudo >/dev/null 2>&1; then
    if sudo apt-get update && sudo apt-get install -y whiptail; then
      install_status=0
    fi
  fi

  if (( install_status == 0 )) && dialog_ui_available; then
    success "whiptail installed successfully."
    return 0
  fi

  warn "Could not install whiptail automatically, so ${purpose} will continue with plain terminal prompts."
}

# Compute a whiptail --msgbox height that fits the message. whiptail wraps text
# and adds chrome, so budget the newline-delimited line count plus padding and
# clamp to a range that stays usable on small terminals.
dialog_msgbox_height() {
  local message="${1:-}"
  local lines=1
  lines="$(printf '%s\n' "${message}" | wc -l)"
  local height=$(( lines + 7 ))
  (( height < 10 )) && height=10
  (( height > 22 )) && height=22
  printf '%s' "${height}"
}

show_message() {
  local title="$1"
  local message="$2"

  if dialog_ui_available; then
    whiptail_on_tty \
      --title "${title}" \
      --msgbox "${message}" \
      18 78
    return 0
  fi

  printf '%s\n' "${message}"
}

prompt_value() {
  local prompt="$1"
  local default_value="${2:-}"
  local value=""

  if ! is_interactive; then
    printf '%s' "${default_value}"
    return 0
  fi

  if dialog_ui_available; then
    value="$(
      whiptail_capture_on_tty \
        --title "Input Required" \
        --inputbox "${prompt}" \
        13 78 "${default_value}" \
    )" || die "Prompt cancelled."
    printf '%s' "${value}"
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

  if dialog_ui_available; then
    value="$(
      whiptail_capture_on_tty \
        --title "Secret Required" \
        --passwordbox "${prompt}" \
        13 78 \
    )" || die "Prompt cancelled."
    printf '%s' "${value}"
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

  # --assume-yes/-y: auto-accept every confirmation, including default-no ones,
  # so unattended runs do not stall or abort on prompts.
  if [[ "${HOSTING_ASSUME_YES:-0}" == "1" ]]; then
    log "${prompt} ${suffix} yes (auto)"
    return 0
  fi

  if ! is_interactive; then
    [[ "${default_answer}" == "yes" ]]
    return
  fi

  if dialog_ui_available; then
    if [[ "${default_answer}" == "no" ]]; then
      whiptail_on_tty \
        --title "Confirmation" \
        --defaultno \
        --yesno "${prompt}" \
        12 78
    else
      whiptail_on_tty \
        --title "Confirmation" \
        --yesno "${prompt}" \
        12 78
    fi
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

# module_param_env_var MODULE KEY
#
# Derives the environment variable name for a module parameter from the module
# namespace and key. Module code never needs to know or reference env var names.
#
# Convention: uppercase(module with - replaced by _) + "_" + uppercase(key)
# Examples:
#   module_param_env_var "authelia"       "username"          → AUTHELIA_USERNAME
#   module_param_env_var "cloudflare-ddns" "api_token"        → CLOUDFLARE_DDNS_API_TOKEN
#   module_param_env_var "supabase"        "connection_string" → SUPABASE_CONNECTION_STRING
module_param_env_var() {
  local module="$1" key="$2"
  local sanitized="${module//-/_}"
  printf '%s_%s' "${sanitized^^}" "${key^^}"
}

# module_get_param KEY TYPE REQUIRED LABEL [STAGED_FALLBACK] [DEFAULT]
#
# Resolves a module parameter — module code never references env var names.
# Resolution order: CLI-supplied (via --module-param) → STAGED_FALLBACK → prompt → DEFAULT.
#
# TYPE:           string → prompt_value, secret → prompt_secret, bool → prompt_yes_no ("true"/"false")
# REQUIRED:       "true" → warns and returns 1 if no value could be obtained
# LABEL:          used verbatim in whiptail inputbox and plain-terminal prompt (single source of truth)
# STAGED_FALLBACK: current value read from a staged .env file (for preserving values on re-runs)
# DEFAULT:        fallback used only for non-interactive runs with prompt_value
#
# Requires MODULE_NAME to be set in the calling module (all modules already do this).
module_get_param() {
  local key="$1"
  local type="$2"
  local required="$3"
  local label="$4"
  local staged_fallback="${5:-}"
  local default="${6:-}"

  [[ -n "${MODULE_NAME:-}" ]] || die "module_get_param: MODULE_NAME must be set in calling module"

  local env_var
  env_var="$(module_param_env_var "${MODULE_NAME}" "${key}")"
  local value="${!env_var:-${staged_fallback}}"

  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  if is_interactive; then
    case "${type}" in
      secret)
        value="$(prompt_secret "${label}")"
        ;;
      bool)
        if prompt_yes_no "${label}"; then
          value=true
        else
          value=false
        fi
        ;;
      *)
        value="$(prompt_value "${label}" "${default}")"
        ;;
    esac
  fi

  if [[ -z "${value}" ]] && [[ -n "${default}" ]]; then
    value="${default}"
  fi

  if [[ -z "${value}" && "${required}" == "true" ]]; then
    warn "${label}: required but not provided in unattended mode"
    return 1
  fi

  printf '%s' "${value}"
}

prompt_choice() {
  local title="$1"
  local prompt="$2"
  local default_value="${3:-}"
  shift 3
  local options=("$@")
  local args=()
  local default_args=()
  local choice="" token="" description="" index=0

  (( ${#options[@]} > 0 )) || die "prompt_choice requires at least one option"

  if dialog_ui_available; then
    while (( index < ${#options[@]} )); do
      token="${options[index]}"
      description="${options[index + 1]:-}"
      args+=("${token}" "${description}")
      index=$((index + 2))
    done

    if [[ -n "${default_value}" ]]; then
      default_args=(--default-item "${default_value}")
    fi

    choice="$(
      whiptail_capture_on_tty \
        "${default_args[@]}" \
        --title "${title}" \
        --menu "${prompt}" \
        18 88 8 \
        "${args[@]}"
    )" || die "Prompt cancelled."
    printf '%s' "${choice}"
    return 0
  fi

  printf '%s\n' "${prompt}" >&2
  index=0
  while (( index < ${#options[@]} )); do
    token="${options[index]}"
    description="${options[index + 1]:-}"
    printf '  %s. %s\n' "${token}" "${description}" >&2
    index=$((index + 2))
  done

  choice="$(prompt_value "Enter the option token for this setup step so the script can continue" "${default_value}")"
  printf '%s' "${choice}"
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

selected_module_enabled() {
  local module="$1"
  local selected_modules_file="${2:-${HOSTING_SELECTED_MODULES_FILE:-}}"

  if [[ -z "${selected_modules_file}" || ! -f "${selected_modules_file}" ]]; then
    return 0
  fi

  grep -Fqx -- "${module}" "${selected_modules_file}"
}

hook_target_enabled() {
  local module="$1"
  local hook_targets_file="${2:-${HOSTING_MODULE_HOOK_TARGETS_FILE:-}}"

  if [[ -z "${hook_targets_file}" || ! -f "${hook_targets_file}" ]]; then
    return 0
  fi

  grep -Fqx -- "${module}" "${hook_targets_file}"
}

hook_sync_only_enabled() {
  local module="$1"
  local sync_only_file="${2:-${HOSTING_MODULE_SYNC_ONLY_FILE:-}}"

  if [[ -z "${sync_only_file}" || ! -f "${sync_only_file}" ]]; then
    return 1
  fi

  grep -Fqx -- "${module}" "${sync_only_file}"
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

env_write_value() {
  local mode="$1"
  local file="$2"
  local key="$3"
  local value="$4"
  local tmp_file

  tmp_file="$(temp_file_next_to "${file}")"
  HOSTING_ENV_WRITE_MODE="${mode}" \
  HOSTING_ENV_WRITE_FILE="${file}" \
  HOSTING_ENV_WRITE_KEY="${key}" \
  HOSTING_ENV_WRITE_VALUE="${value}" \
  HOSTING_ENV_WRITE_TMP_FILE="${tmp_file}" \
  python3 - <<'PY'
import os
import re

mode = os.environ["HOSTING_ENV_WRITE_MODE"]
file_path = os.environ["HOSTING_ENV_WRITE_FILE"]
key = os.environ["HOSTING_ENV_WRITE_KEY"]
value = os.environ["HOSTING_ENV_WRITE_VALUE"]
tmp_file = os.environ["HOSTING_ENV_WRITE_TMP_FILE"]

if os.path.exists(file_path):
  with open(file_path, "r", encoding="utf-8") as handle:
    lines = handle.readlines()
else:
  lines = []

entry = f"{key}={value}\n"

if mode == "upsert":
  new_lines = []
  done = False
  for line in lines:
    if line.startswith(f"{key}="):
      new_lines.append(entry)
      done = True
      continue
    new_lines.append(line)
  if not done:
    new_lines.append(entry)
elif mode == "near_hostnames":
  existing = -1
  last_hostname = -1
  for index, line in enumerate(lines):
    if line.startswith(f"{key}="):
      existing = index
    if "_HOSTNAME=" in line:
      last_hostname = index

  new_lines = []
  if existing >= 0:
    for index, line in enumerate(lines):
      if index == existing:
        new_lines.append(entry)
      else:
        new_lines.append(line)
  elif last_hostname >= 0:
    for index, line in enumerate(lines):
      new_lines.append(line)
      if index == last_hostname:
        new_lines.append(entry)
  else:
    new_lines = list(lines)
    new_lines.append(entry)
elif mode == "uncomment":
  pattern = re.compile(rf'^[ \t]*#?[ \t]*{re.escape(key)}=')
  new_lines = []
  done = False
  for line in lines:
    if pattern.match(line) and not done:
      new_lines.append(entry)
      done = True
      continue
    new_lines.append(line)
  if not done:
    new_lines.append(entry)
elif mode == "comment":
  # Comment out the first active (uncommented) KEY= line so the app treats the
  # variable as unset. Already-commented or absent keys are left untouched. The
  # value argument is ignored.
  pattern = re.compile(rf'^([ \t]*)({re.escape(key)}=.*)$')
  new_lines = []
  done = False
  for line in lines:
    m = pattern.match(line.rstrip("\n"))
    if m and not done:
      new_lines.append(f"{m.group(1)}# {m.group(2)}\n")
      done = True
      continue
    new_lines.append(line)
else:
  raise SystemExit(f"Unsupported env write mode: {mode}")

with open(tmp_file, "w", encoding="utf-8") as handle:
  handle.writelines(new_lines)
PY
  mv "${tmp_file}" "${file}"
}

extract_connection_string_password() {
  local connection_string="$1"

  python3 - "${connection_string}" <<'PY'
from urllib.parse import unquote, urlsplit
import sys

connection_string = sys.argv[1]

try:
    parsed = urlsplit(connection_string)
except ValueError:
    print("", end="")
    raise SystemExit(0)

password = parsed.password
if password is None:
    print("", end="")
else:
    print(unquote(password), end="")
PY
}

env_upsert() {
  local file="$1"
  local key="$2"
  local value="$3"

  env_write_value upsert "${file}" "${key}" "${value}"
}

env_upsert_near_hostnames() {
  local file="$1"
  local key="$2"
  local value="$3"

  env_write_value near_hostnames "${file}" "${key}" "${value}"
}

env_upsert_uncomment() {
  local file="$1"
  local key="$2"
  local value="$3"

  env_write_value uncomment "${file}" "${key}" "${value}"
}

env_comment() {
  local file="$1"
  local key="$2"

  env_write_value comment "${file}" "${key}" ""
}

env_remove() {
  local file="$1"
  local key="$2"
  local tmp_file

  tmp_file="$(temp_file_next_to "${file}")"
  awk -v key="${key}" '$0 !~ ("^" key "=") { print }' "${file}" > "${tmp_file}"
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
  local expanded_path=""
  local home_lookup="" user_name="" remainder=""

  if [[ -z "${input_path}" ]]; then
    return 0
  fi

  case "${input_path}" in
    [~])
      expanded_path="${HOME}"
      ;;
    [~]/*)
      expanded_path="${HOME}/${input_path:2}"
      ;;
    [~]*)
      user_name="${input_path:1}"
      user_name="${user_name%%/*}"
      remainder="${input_path:$((1 + ${#user_name}))}"
      if command -v getent >/dev/null 2>&1; then
        home_lookup="$(getent passwd "${user_name}" | cut -d: -f6)"
      fi
      [[ -n "${home_lookup}" ]] || die "Could not resolve home directory for ~${user_name}"
      expanded_path="${home_lookup}${remainder}"
      ;;
    *)
      expanded_path="${input_path}"
      ;;
  esac

  if [[ "${expanded_path}" == /* ]]; then
    printf '%s' "${expanded_path}"
  else
    printf '%s/%s' "$(pwd)" "${expanded_path#./}"
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

prime_sudo_session() {
  local purpose="${1:-this setup}"

  if hosting_is_dry_run || (( EUID == 0 )) || ! is_interactive; then
    return 0
  fi

  command -v sudo >/dev/null 2>&1 || die "${purpose} needs elevated privileges, but sudo is not installed."

  if [[ "${HOSTING_SUDO_PRIMED:-0}" == "1" ]]; then
    return 0
  fi

  if sudo -n true 2>/dev/null; then
    log "Passwordless sudo is available for ${purpose}."
    HOSTING_SUDO_PRIMED=1
    return 0
  fi

  log "Requesting sudo access up front so ${purpose} can complete without repeated privilege prompts."
  sudo -v || die "Could not obtain sudo access for ${purpose}."
  HOSTING_SUDO_PRIMED=1
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

# write_zip_archive <source_dir> <archive_path>
#   Creates a deflate-compressed ZIP from <source_dir>, skipping dotfiles except .env.
#   All top-level directory contents are walked recursively in sorted order.
write_zip_archive() {
  local source_dir="$1"
  local archive_path="$2"

  python3 - "${source_dir}" "${archive_path}" <<'PY'
import os
import sys
import zipfile

root = sys.argv[1]
archive = sys.argv[2]

with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for entry in sorted(os.listdir(root)):
        if entry.startswith(".") and entry != ".env":
            continue
        path = os.path.join(root, entry)
        if os.path.isdir(path):
            for dirpath, _, filenames in os.walk(path):
                for filename in sorted(filenames):
                    file_path = os.path.join(dirpath, filename)
                    archive_name = os.path.relpath(file_path, root)
                    zf.write(file_path, archive_name)
        else:
            zf.write(path, entry)
PY
}

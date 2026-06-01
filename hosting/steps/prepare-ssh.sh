#!/usr/bin/env bash

# Prepares a local SSH identity and optional SSH config alias for VPS access.
#
# Purpose:
#   This helper covers the prompt.md SSH preflight. It can use an explicit
#   private key, detect an existing default key, or generate a new ed25519 key
#   under ~/.ssh. It also writes or replaces a Host block in ~/.ssh/config.
#
# Usage:
#   ./hosting/steps/prepare-ssh.sh
#   ./hosting/steps/prepare-ssh.sh --use-default-key --alias streaming
#   ./hosting/steps/prepare-ssh.sh --generate-key --key-name streaming --alias streaming --host vps.example.com --user root
#
# Scope:
#   This script only prepares the local key and SSH client config. It does not
#   install the public key on the VPS.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"

load_defaults

SSH_DIR="${HOME}/.ssh"
SSH_CONFIG="${SSH_DIR}/config"
KEY_PATH=""
KEY_NAME="${DEFAULT_SSH_KEY_NAME:-streaming}"
SSH_ALIAS="${DEFAULT_SSH_ALIAS:-streaming}"
SSH_HOST=""
SSH_USER=""
USE_DEFAULT_KEY=0
GENERATE_KEY=0
ALIAS_SET=0

while (( $# > 0 )); do
  case "$1" in
    --key-path)
      KEY_PATH="$2"
      shift 2
      ;;
    --key-name)
      KEY_NAME="$2"
      shift 2
      ;;
    --alias)
      SSH_ALIAS="$2"
      ALIAS_SET=1
      shift 2
      ;;
    --host)
      SSH_HOST="$2"
      shift 2
      ;;
    --user)
      SSH_USER="$2"
      shift 2
      ;;
    --use-default-key)
      USE_DEFAULT_KEY=1
      shift
      ;;
    --generate-key)
      GENERATE_KEY=1
      shift
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

find_default_key() {
  local candidates=()
  local candidate=""
  split_csv_into_array "${DEFAULT_EXISTING_SSH_KEYS:-id_ed25519,ed25519,id_rsa}" candidates
  for candidate in "${candidates[@]}"; do
    if [[ -f "${SSH_DIR}/${candidate}" ]]; then
      printf '%s' "${SSH_DIR}/${candidate}"
      return 0
    fi
  done
  return 1
}

select_key() {
  local detected_key=""

  if [[ -n "${KEY_PATH}" ]]; then
    [[ -f "${KEY_PATH}" ]] || die "SSH key does not exist: ${KEY_PATH}"
    return 0
  fi

  if (( USE_DEFAULT_KEY )); then
    KEY_PATH="$(find_default_key)" || die "No default SSH key was found in ${SSH_DIR}"
    return 0
  fi

  if (( GENERATE_KEY )); then
    KEY_PATH="${SSH_DIR}/${KEY_NAME}"
    return 0
  fi

  detected_key="$(find_default_key || true)"

  if is_interactive; then
    if [[ -n "${detected_key}" ]] && prompt_yes_no "Use the default SSH key at ${detected_key}?" yes; then
      KEY_PATH="${detected_key}"
      return 0
    fi

    KEY_PATH="$(prompt_value "Enter an existing SSH private key path, or leave blank to generate ${SSH_DIR}/${KEY_NAME}")"
    if [[ -n "${KEY_PATH}" ]]; then
      [[ -f "${KEY_PATH}" ]] || die "SSH key does not exist: ${KEY_PATH}"
    else
      KEY_PATH="${SSH_DIR}/${KEY_NAME}"
      GENERATE_KEY=1
    fi
    return 0
  fi

  if [[ -n "${detected_key}" ]]; then
    KEY_PATH="${detected_key}"
  else
    KEY_PATH="${SSH_DIR}/${KEY_NAME}"
    GENERATE_KEY=1
  fi
}

ensure_key_exists() {
  ensure_directory "${SSH_DIR}"
  chmod 700 "${SSH_DIR}"

  if (( GENERATE_KEY )) && [[ ! -f "${KEY_PATH}" ]]; then
    log "Generating SSH key ${KEY_PATH}"
    ssh-keygen -t ed25519 -f "${KEY_PATH}" -N "" >/dev/null
  fi

  [[ -f "${KEY_PATH}" ]] || die "SSH key does not exist: ${KEY_PATH}"
  [[ -f "${KEY_PATH}.pub" ]] || die "SSH public key does not exist: ${KEY_PATH}.pub"

  chmod 600 "${KEY_PATH}"
  chmod 644 "${KEY_PATH}.pub"
}

configure_ssh_alias() {
  if (( ALIAS_SET )) || ! is_interactive; then
    return 0
  fi

  if prompt_yes_no "Use the default SSH alias ${SSH_ALIAS}?" yes; then
    return 0
  fi

  SSH_ALIAS="$(prompt_value "Enter the SSH alias to write into ${SSH_CONFIG}" "${SSH_ALIAS}")"
  [[ -n "${SSH_ALIAS}" ]] || die "SSH alias cannot be empty"
}

update_ssh_config() {
  local tmp_file=""

  [[ -n "${SSH_ALIAS}" ]] || return 0
  touch "${SSH_CONFIG}"
  chmod 600 "${SSH_CONFIG}"

  tmp_file="$(temp_file_next_to "${SSH_CONFIG}")"
  awk -v alias="${SSH_ALIAS}" '
    BEGIN { skip = 0 }
    $1 == "Host" && $2 == alias { skip = 1; next }
    $1 == "Host" && skip == 1 { skip = 0 }
    skip == 0 { print }
  ' "${SSH_CONFIG}" > "${tmp_file}"
  mv "${tmp_file}" "${SSH_CONFIG}"

  {
    printf '\nHost %s\n' "${SSH_ALIAS}"
    [[ -n "${SSH_HOST}" ]] && printf '  HostName %s\n' "${SSH_HOST}"
    [[ -n "${SSH_USER}" ]] && printf '  User %s\n' "${SSH_USER}"
    printf '  IdentityFile %s\n' "${KEY_PATH}"
    printf '  IdentitiesOnly yes\n'
    printf '  AddKeysToAgent yes\n'
  } >> "${SSH_CONFIG}"
}

select_key
ensure_key_exists
configure_ssh_alias
update_ssh_config

log "SSH key ready: ${KEY_PATH}"
log "Public key: ${KEY_PATH}.pub"

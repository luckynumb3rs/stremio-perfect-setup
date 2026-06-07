#!/usr/bin/env bash

# Prepares a local SSH identity and optional SSH config alias for VPS access.
#
# Purpose:
#   This helper prepares SSH access to the VPS before the local-to-VPS deploy.
#   It can use an explicit private key, detect an existing default key,
#   generate a new ed25519 key under ~/.ssh, or reuse an SSH alias that is
#   already configured and working. When preparing a key for a new alias, it
#   also writes or replaces a Host block in ~/.ssh/config.
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
ensure_dialog_ui "SSH preparation"

SSH_DIR="${HOME}/.ssh"
SSH_CONFIG="${SSH_DIR}/config"
KEY_PATH=""
KEY_NAME="${DEFAULT_SSH_KEY_NAME:-streaming}"
KEY_NAME_SET=0
SSH_ALIAS="${DEFAULT_SSH_ALIAS:-streaming}"
SSH_HOST=""
SSH_USER=""
USE_DEFAULT_KEY=0
GENERATE_KEY=0
USE_EXISTING_ALIAS=0
ALIAS_SET=0

while (( $# > 0 )); do
  case "$1" in
    --key-path)
      KEY_PATH="$2"
      shift 2
      ;;
    --key-name)
      KEY_NAME="$2"
      KEY_NAME_SET=1
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

sync_key_name_from_alias() {
  if (( ! KEY_NAME_SET )) && [[ -z "${KEY_PATH}" ]]; then
    KEY_NAME="${SSH_ALIAS}"
  fi
}

normalize_key_path() {
  local raw_path="$1"

  [[ -n "${raw_path}" ]] || {
    printf '%s' ""
    return 0
  }

  absolute_path "${raw_path}"
}

prepare_generated_key_path() {
  if is_interactive && (( ! KEY_NAME_SET )) && (( ! ALIAS_SET )); then
    KEY_NAME="$(prompt_value "Choose the local SSH key file name to create under ${SSH_DIR}. This only names the key pair on this machine; the VPS host, user, and SSH alias are configured in the next step [SSH_KEY_NAME]" "${KEY_NAME}")"
    [[ -n "${KEY_NAME}" ]] || die "SSH key name cannot be empty"
    KEY_NAME_SET=1
  fi

  KEY_PATH="${SSH_DIR}/${KEY_NAME}"
  GENERATE_KEY=1
}

prepare_existing_alias() {
  USE_EXISTING_ALIAS=1
  KEY_PATH=""
  SSH_HOST=""
  SSH_USER=""
}

collect_existing_alias() {
  if ! is_interactive; then
    [[ -n "${SSH_ALIAS}" ]] || die "SSH alias cannot be empty"
    return 0
  fi

  if (( ! ALIAS_SET )); then
    SSH_ALIAS="$(prompt_value "Enter the SSH alias name that is already configured and working for this VPS [SSH_ALIAS]" "${SSH_ALIAS}")"
  fi
  [[ -n "${SSH_ALIAS}" ]] || die "SSH alias cannot be empty"
}

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
  local key_mode=""

  if [[ -n "${KEY_PATH}" ]]; then
    KEY_PATH="$(normalize_key_path "${KEY_PATH}")"
    [[ -f "${KEY_PATH}" ]] || die "SSH key does not exist: ${KEY_PATH}"
    return 0
  fi

  if (( USE_DEFAULT_KEY )); then
    KEY_PATH="$(find_default_key)" || die "No default SSH key was found in ${SSH_DIR}"
    return 0
  fi

  if (( GENERATE_KEY )); then
    prepare_generated_key_path
    return 0
  fi

  detected_key="$(find_default_key || true)"

  if is_interactive; then
    if [[ -n "${detected_key}" ]]; then
      key_mode="$(prompt_choice \
        "SSH Key" \
        "Choose how the SSH helper should prepare SSH access for this VPS. You can reuse a detected key, point to another key, create a new key, or continue with an SSH alias that is already configured and working." \
        "use-default" \
        "use-default" "Use the detected key at ${detected_key}" \
        "existing-path" "Enter a different existing private key path" \
        "existing-alias" "Use an existing SSH alias that is already configured" \
        "generate-new" "Create a new ed25519 key in ${SSH_DIR}")"
      case "${key_mode}" in
        use-default)
          KEY_PATH="${detected_key}"
          return 0
          ;;
        existing-path)
          KEY_PATH="$(prompt_value "Enter the existing SSH private key path so the script can reference it in your SSH client config [SSH_KEY_PATH]")"
          KEY_PATH="$(normalize_key_path "${KEY_PATH}")"
          [[ -f "${KEY_PATH}" ]] || die "SSH key does not exist: ${KEY_PATH}"
          return 0
          ;;
        existing-alias)
          prepare_existing_alias
          return 0
          ;;
        generate-new)
          prepare_generated_key_path
          return 0
          ;;
        *)
          die "Unknown SSH key selection: ${key_mode}"
          ;;
      esac
    fi

    key_mode="$(prompt_choice \
      "SSH Key" \
      "No default SSH key was detected. Choose whether to reuse an existing private key, create a new key, or continue with an SSH alias that is already configured and working." \
      "generate-new" \
      "existing-path" "Enter an existing private key path" \
      "existing-alias" "Use an existing SSH alias that is already configured" \
      "generate-new" "Create a new ed25519 key in ${SSH_DIR}")"
    case "${key_mode}" in
      existing-path)
        KEY_PATH="$(prompt_value "Enter the existing SSH private key path so the script can reference it in your SSH client config [SSH_KEY_PATH]")"
        KEY_PATH="$(normalize_key_path "${KEY_PATH}")"
        [[ -f "${KEY_PATH}" ]] || die "SSH key does not exist: ${KEY_PATH}"
        ;;
      existing-alias)
        prepare_existing_alias
        ;;
      generate-new)
        prepare_generated_key_path
        ;;
      *)
        die "Unknown SSH key selection: ${key_mode}"
        ;;
    esac
    return 0
  fi

  if [[ -n "${detected_key}" ]]; then
    KEY_PATH="${detected_key}"
  else
    prepare_generated_key_path
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

  if [[ ! -f "${KEY_PATH}.pub" ]]; then
    log "Public key ${KEY_PATH}.pub not found; deriving it from the private key."
    ssh-keygen -y -f "${KEY_PATH}" > "${KEY_PATH}.pub" \
      || die "Could not derive public key from ${KEY_PATH}. Provide the matching .pub file manually."
  fi

  chmod 600 "${KEY_PATH}"
  chmod 644 "${KEY_PATH}.pub"
}

show_key_install_guidance() {
  local message=""

  if ! is_interactive; then
    return 0
  fi

  message=$(
    cat <<EOF
Your SSH key is ready on this machine.

Before you configure the SSH alias, make sure the public key will be accepted by the VPS using whichever method your provider expects:

1. If you are still creating the VPS, paste the contents of ${KEY_PATH}.pub into the provider's SSH key field or upload that public key in the provider panel.
2. If the VPS already exists, add the same public key with the provider's console or documented SSH-key flow.
3. If password SSH access is available, the script can run ssh-copy-id for you after the next step.

Public key file: ${KEY_PATH}.pub
Review or copy it now with: cat ${KEY_PATH}.pub
EOF
  )

  show_message "SSH Key Ready" "${message}"
}

configure_ssh_alias() {
  if ! is_interactive; then
    sync_key_name_from_alias
    return 0
  fi

  if (( ! ALIAS_SET )); then
    SSH_ALIAS="$(prompt_value "Choose the short SSH alias name to save in ${SSH_CONFIG}. This lets you connect with a simple \`ssh <alias>\` command later [SSH_ALIAS]" "${SSH_ALIAS}")"
  fi
  [[ -n "${SSH_ALIAS}" ]] || die "SSH alias cannot be empty"
  sync_key_name_from_alias
}

collect_connection_details() {
  if ! is_interactive; then
    [[ -n "${SSH_HOST}" ]] || die "Use --host to provide the VPS IP address or hostname"
    [[ -n "${SSH_USER}" ]] || die "Use --user to provide the VPS SSH username"
    return 0
  fi

  if [[ -z "${SSH_HOST}" ]]; then
    SSH_HOST="$(prompt_value "Enter the VPS IP address or hostname that this SSH alias should connect to [SSH_HOST]" )"
  fi
  if [[ -z "${SSH_USER}" ]]; then
    SSH_USER="$(prompt_value "Enter the SSH username that should be used when connecting to ${SSH_HOST:-the VPS} [SSH_USER]" "root")"
  fi

  [[ -n "${SSH_HOST}" ]] || die "VPS IP address or hostname is required to configure the SSH alias"
  [[ -n "${SSH_USER}" ]] || die "SSH username is required to configure the SSH alias"
}

update_ssh_config() {
  local tmp_file=""
  local alias_exists=0

  [[ -n "${SSH_ALIAS}" ]] || return 0
  touch "${SSH_CONFIG}"
  chmod 600 "${SSH_CONFIG}"

  if awk -v alias="${SSH_ALIAS}" '$1 == "Host" && $2 == alias { found = 1 } END { exit !found }' "${SSH_CONFIG}"; then
    alias_exists=1
  fi

  if (( alias_exists )) && is_interactive; then
    prompt_yes_no "SSH alias ${SSH_ALIAS} already exists in ${SSH_CONFIG}. Replace it with the new HostName, User, and key settings so future \`ssh ${SSH_ALIAS}\` connections use the values from this setup?" yes || die "SSH alias update cancelled."
  fi

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

try_ssh_copy_id() {
  if ! is_interactive; then
    return 0
  fi

  if [[ -z "${SSH_HOST}" || -z "${SSH_USER}" || -z "${KEY_PATH}" ]]; then
    return 0
  fi

  if ! prompt_yes_no "Run ssh-copy-id now to install your public key on the VPS? The VPS will prompt you for its password." no; then
    return 0
  fi

  log "Running ssh-copy-id — enter the VPS password when prompted."
  if ssh-copy-id -i "${KEY_PATH}.pub" "${SSH_USER}@${SSH_HOST}"; then
    success "SSH public key successfully installed on ${SSH_HOST}."
  else
    warn "ssh-copy-id failed. You will need to add the public key manually."
  fi
}

show_final_instructions() {
  local message=""
  local copy_command=""
  local connect_command=""

  if (( USE_EXISTING_ALIAS )); then
    connect_command="ssh ${SSH_ALIAS}"
    message=$(
      cat <<EOF
Your SSH setup is ready.

This setup will reuse the existing SSH alias ${SSH_ALIAS}.

Next:
1. Make sure ${connect_command} already logs you into the VPS from this machine.
2. Return to main.sh and continue the local-to-VPS setup with that alias.
EOF
    )

    show_message "SSH Setup Complete" "${message}"
    log "Reusing existing SSH alias: ${SSH_ALIAS}"
    return 0
  fi

  copy_command="cat ${KEY_PATH}.pub"
  if [[ -n "${SSH_HOST}" && -n "${SSH_USER}" ]]; then
    copy_command="ssh-copy-id -i ${KEY_PATH}.pub ${SSH_USER}@${SSH_HOST}"
  fi

  connect_command="ssh ${SSH_ALIAS}"
  message=$(
    cat <<EOF
Your local SSH setup is ready.

If the VPS provider did not already install ${KEY_PATH}.pub while you created the instance, install that public key before you try the alias:

1. Review or copy the public key:
  cat ${KEY_PATH}.pub
2. Add it with your provider's SSH-key flow, or if password SSH is available, run:
  ${copy_command}
3. Connect using the alias: ${connect_command}
EOF
  )

  show_message "SSH Setup Complete" "${message}"

  log "Next step: install ${KEY_PATH}.pub on the VPS, then connect with ${connect_command}"
}

if (( ALIAS_SET )); then
  sync_key_name_from_alias
fi

select_key
if (( USE_EXISTING_ALIAS )); then
  collect_existing_alias
else
  ensure_key_exists
  show_key_install_guidance
  collect_connection_details
  configure_ssh_alias
  update_ssh_config
  try_ssh_copy_id
fi

if [[ -n "${HOSTING_SSH_TARGET_FILE:-}" ]]; then
  {
    printf 'SSH_ALIAS=%q\n' "${SSH_ALIAS}"
    printf 'SSH_HOST=%q\n' "${SSH_HOST}"
    printf 'SSH_USER=%q\n' "${SSH_USER}"
    printf 'KEY_PATH=%q\n' "${KEY_PATH}"
  } > "${HOSTING_SSH_TARGET_FILE}"
fi

if (( USE_EXISTING_ALIAS )); then
  log "SSH alias ready: ${SSH_ALIAS}"
else
  log "SSH key ready: ${KEY_PATH}"
  log "Public key: ${KEY_PATH}.pub"
fi
show_final_instructions

#!/usr/bin/env bash

# Installs Docker Engine and configures docker group access.
#
# Purpose:
#   This is the Docker bootstrap step used by main.sh. It supports Debian
#   and Ubuntu, adds Docker's official apt repository, installs Docker Engine
#   plus the Compose plugin, and adds the target user to the docker group.
#
# Usage:
#   ./hosting/steps/install-docker.sh
#   ./hosting/steps/install-docker.sh --user myuser
#
# Notes:
#   If the user is newly added to the docker group, the user may need to log out
#   and back in before docker commands run without sudo.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"

load_defaults

RUN_USER="${SUDO_USER:-$USER}"

while (( $# > 0 )); do
  case "$1" in
    --user)
      RUN_USER="$2"
      shift 2
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker is already installed."
    return 0
  fi

  [[ -r /etc/os-release ]] || die "Unsupported Linux distribution: missing /etc/os-release"
  # shellcheck disable=SC1091
  source /etc/os-release

  local docker_repo="" docker_suite="" docker_sources=""
  case "${ID:-}" in
    ubuntu)
      docker_repo="https://download.docker.com/linux/ubuntu"
      docker_suite="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
      ;;
    debian)
      docker_repo="https://download.docker.com/linux/debian"
      docker_suite="${VERSION_CODENAME:-}"
      ;;
    *)
      die "Automated Docker installation currently supports Ubuntu and Debian only."
      ;;
  esac

  [[ -n "${docker_suite}" ]] || die "Could not determine distro codename for Docker apt repository."

  ensure_apt_packages ca-certificates curl git openssh-client
  run_privileged install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "${docker_repo}/gpg" | run_privileged tee /etc/apt/keyrings/docker.asc >/dev/null
  run_privileged chmod a+r /etc/apt/keyrings/docker.asc
  docker_sources="$(mktemp)"
  cat > "${docker_sources}" <<EOF
Types: deb
URIs: ${docker_repo}
Suites: ${docker_suite}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  run_privileged cp "${docker_sources}" /etc/apt/sources.list.d/docker.sources
  rm -f "${docker_sources}"
  run_privileged apt-get update
  run_privileged apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

configure_docker_access() {
  if ! getent group docker >/dev/null 2>&1; then
    run_privileged groupadd docker
  fi
  run_privileged usermod -aG docker "${RUN_USER}"
}

install_docker
configure_docker_access
success "Docker is ready. Log out and back in if this is the first time ${RUN_USER} was added to the docker group."

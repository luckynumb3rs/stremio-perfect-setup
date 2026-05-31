#!/usr/bin/env bash

# Starts the prepared Docker Compose stack.
#
# Purpose:
#   The template has a required profile for infrastructure services such as
#   Traefik and Authelia. This step starts that profile first, then starts the
#   full configured stack using COMPOSE_PROFILES from the deployed root .env.
#
# Usage:
#   ./hosting/steps/start-stack.sh --target-dir /opt/docker
#
# Output:
#   Runs docker compose ps at the end so the user can see container status.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"

load_defaults

TARGET_DIR_ARG=""

while (( $# > 0 )); do
  case "$1" in
    --target-dir)
      TARGET_DIR_ARG="$2"
      shift 2
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "${TARGET_DIR_ARG}" ]] || die "--target-dir is required"
[[ -d "${TARGET_DIR_ARG}" ]] || die "Target directory does not exist: ${TARGET_DIR_ARG}"

(
  cd "${TARGET_DIR_ARG}"
  log "Starting required profile: ${REQUIRED_PROFILE:-required}"
  run_docker_compose --profile "${REQUIRED_PROFILE:-required}" up -d
  log "Starting configured COMPOSE_PROFILES from ${TARGET_DIR_ARG}/.env"
  run_docker_compose up -d
  run_docker_compose ps
)

success "Docker Compose stack started."

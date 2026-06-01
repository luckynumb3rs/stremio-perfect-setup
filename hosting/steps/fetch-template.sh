#!/usr/bin/env bash

# Fetches the compose template into a temporary working directory.
#
# Purpose:
#   This step replaces the old checked-in docker/ mirror. It either clones the
#   upstream docker-compose-template repository or copies an explicitly supplied
#   local template directory. The output directory is deleted and recreated on
#   each run so later steps start from a clean template.
#
# Usage:
#   ./hosting/steps/fetch-template.sh
#   ./hosting/steps/fetch-template.sh --template-dir ./hosting/.work/docker
#   LOCAL_TEMPLATE_DIR=/path/to/docker-compose-template ./hosting/steps/fetch-template.sh --source local
#
# Inputs:
#   --source upstream|local  Select clone source. Defaults to upstream.
#   --template-dir PATH     Destination directory. Defaults from defaults.env.
#   --repo URL              Upstream git URL.
#   --ref REF               Upstream branch/tag/ref.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../lib/common.sh"

load_defaults

TEMPLATE_SOURCE_VALUE="${TEMPLATE_SOURCE:-upstream}"
TARGET_TEMPLATE_DIR="${HOSTING_ROOT}/${TEMPLATE_DIR:-.work/docker}"
UPSTREAM_REPO_VALUE="${UPSTREAM_REPO}"
UPSTREAM_REF_VALUE="${UPSTREAM_REF}"
LOCAL_TEMPLATE_DIR="${LOCAL_TEMPLATE_DIR:-${HOSTING_ROOT}/docker}"

while (( $# > 0 )); do
  case "$1" in
    --source)
      TEMPLATE_SOURCE_VALUE="$2"
      shift 2
      ;;
    --template-dir)
      TARGET_TEMPLATE_DIR="$2"
      shift 2
      ;;
    --repo)
      UPSTREAM_REPO_VALUE="$2"
      shift 2
      ;;
    --ref)
      UPSTREAM_REF_VALUE="$2"
      shift 2
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

rm -rf "${TARGET_TEMPLATE_DIR}"
ensure_directory "$(dirname "${TARGET_TEMPLATE_DIR}")"

case "${TEMPLATE_SOURCE_VALUE}" in
  upstream)
    log "Cloning ${UPSTREAM_REPO_VALUE}@${UPSTREAM_REF_VALUE}"
    ensure_apt_packages git
    git clone --depth 1 --branch "${UPSTREAM_REF_VALUE}" "${UPSTREAM_REPO_VALUE}" "${TARGET_TEMPLATE_DIR}" >/dev/null
    rm -rf "${TARGET_TEMPLATE_DIR}/.git"
    ;;
  local)
    [[ -d "${LOCAL_TEMPLATE_DIR}" ]] || die "Local template source does not exist: ${LOCAL_TEMPLATE_DIR}"
    log "Copying local template from ${LOCAL_TEMPLATE_DIR}"
    ensure_apt_packages rsync
    require_commands rsync
    rsync -a --delete "${LOCAL_TEMPLATE_DIR}/" "${TARGET_TEMPLATE_DIR}/"
    ;;
  *)
    die "Unsupported template source: ${TEMPLATE_SOURCE_VALUE}"
    ;;
esac

[[ -f "${TARGET_TEMPLATE_DIR}/compose.yaml" || -f "${TARGET_TEMPLATE_DIR}/compose.yml" ]] || die "Fetched template does not contain compose.yaml or compose.yml"
success "Template ready at ${TARGET_TEMPLATE_DIR}"

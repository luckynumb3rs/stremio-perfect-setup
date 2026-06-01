#!/usr/bin/env bash

# Configures the staged Honey dashboard JSON.
#
# Purpose:
#   Honey's upstream dashboard lists many services whether or not they are
#   selected. This hook rewrites HONEY_HOSTNAME to stream.${DOMAIN}, replaces
#   trusted-domain placeholders with the configured DOMAIN, resolves selected
#   module hostnames, and removes dashboard services whose href host does not
#   belong to the selected module set.
#
# Called automatically by main.sh when honey is selected.
#
# Manual hook contract:
#
#   HOSTING_TEMPLATE_DIR=./hosting/.work/docker \
#   HOSTING_CONFIG_DIR=./hosting/.work/config \
#   HOSTING_SELECTED_MODULES_FILE=./hosting/.work/selected-modules.txt \
#   HOSTING_ROOT_ENV=./hosting/.work/config/.env \
#   ./hosting/modules/honey.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/template.sh"

MODULE_NAME=honey
HONEY_HOSTNAME_VALUE='stream.${DOMAIN}'

if [[ "${1:-}" == "--metadata" ]]; then
    printf 'scope=module\nmodule=%s\norder=50\n' "${MODULE_NAME}"
  exit 0
fi

[[ -n "${HOSTING_TEMPLATE_DIR:-}" ]] || die "HOSTING_TEMPLATE_DIR is not set"
[[ -n "${HOSTING_CONFIG_DIR:-}" ]] || die "HOSTING_CONFIG_DIR is not set"
[[ -n "${HOSTING_SELECTED_MODULES_FILE:-}" ]] || die "HOSTING_SELECTED_MODULES_FILE is not set"
[[ -n "${HOSTING_ROOT_ENV:-}" ]] || die "HOSTING_ROOT_ENV is not set"

HONEY_CONFIG="${HOSTING_CONFIG_DIR}/$(stage_name_for "${MODULE_NAME}" config.json)"
[[ -f "${HONEY_CONFIG}" ]] || exit 0

DOMAIN_VALUE="$(env_get "${HOSTING_ROOT_ENV}" DOMAIN)"
[[ -n "${DOMAIN_VALUE}" ]] || die "DOMAIN must be set before running the honey module"

env_upsert "${HOSTING_ROOT_ENV}" HONEY_HOSTNAME "${HONEY_HOSTNAME_VALUE}"

hostnames=()
while IFS= read -r module; do
  while IFS= read -r env_var; do
    [[ -n "${env_var}" ]] || continue
    value="$(env_get_resolved "${HOSTING_ROOT_ENV}" "${env_var}")"
    [[ -n "${value}" ]] && hostnames+=("${value}")
  done < <(module_host_env_vars "${HOSTING_TEMPLATE_DIR}" "${module}")
done < <(read_lines_file "${HOSTING_SELECTED_MODULES_FILE}")

HOSTING_HONEY_DOMAIN="${DOMAIN_VALUE}" HOSTING_HONEY_HOSTS="$(printf '%s\n' "${hostnames[@]}" | dedupe_lines)" python3 - "${HONEY_CONFIG}" <<'PY'
import json
import os
import sys
from urllib.parse import urlparse

config_path = sys.argv[1]
target_domain = os.environ["HOSTING_HONEY_DOMAIN"]
keep_hosts = {line for line in os.environ.get("HOSTING_HONEY_HOSTS", "").splitlines() if line}

with open(config_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

old_domains = list(data.get("ui", {}).get("trusted_domains", []))

def replace_domain(value):
    if isinstance(value, str):
        for old_domain in old_domains:
            value = value.replace(old_domain, target_domain)
        return value
    if isinstance(value, list):
        return [replace_domain(item) for item in value]
    if isinstance(value, dict):
        return {key: replace_domain(item) for key, item in value.items()}
    return value

data = replace_domain(data)
data.setdefault("ui", {})["trusted_domains"] = [target_domain]

filtered_services = []
for service in data.get("services", []):
    host = urlparse(service.get("href", "")).hostname
    if host and host in keep_hosts:
        filtered_services.append(service)

data["services"] = filtered_services

with open(config_path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
PY

success "Updated Honey dashboard config for the selected modules"

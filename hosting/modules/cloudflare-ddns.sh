#!/usr/bin/env bash

# Configures Cloudflare DDNS and Traefik DNS challenge for selected modules.
#
# Purpose:
#   This hook resolves the cloudflare-ddns inconsistency described in prompt.md.
#   It asks for or accepts CLOUDFLARE_API_TOKEN, disables cloudflare-ddns when no
#   token is available, stages the Cloudflare DDNS and Traefik compose files,
#   limits the DDNS DOMAINS list to selected modules, makes PROXIED configurable,
#   and switches Traefik from TLS challenge to Cloudflare DNS challenge.
#
# Called automatically by main.sh when cloudflare-ddns is selected.
#
# Manual hook contract:
#
#   HOSTING_TEMPLATE_DIR=./hosting/.work/docker \
#   HOSTING_CONFIG_DIR=./hosting/.work/config \
#   HOSTING_MANIFEST_FILE=./hosting/.work/config/.stage-map.tsv \
#   HOSTING_SELECTED_MODULES_FILE=./hosting/.work/selected-modules.txt \
#   HOSTING_ROOT_ENV=./hosting/.work/config/.env \
#   HOSTING_CLOUDFLARE_API_TOKEN='token' \
#   ./hosting/modules/cloudflare-ddns.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/template.sh"

MODULE_NAME=cloudflare-ddns
TRAEFIK_MODULE=traefik
DEFAULT_PROXIED_WHEN_ENABLED=true

if [[ "${1:-}" == "--metadata" ]]; then
  printf 'scope=module\nmodule=%s\norder=90\n' "${MODULE_NAME}"
  exit 0
fi

[[ -n "${HOSTING_TEMPLATE_DIR:-}" ]] || die "HOSTING_TEMPLATE_DIR is not set"
[[ -n "${HOSTING_CONFIG_DIR:-}" ]] || die "HOSTING_CONFIG_DIR is not set"
[[ -n "${HOSTING_MANIFEST_FILE:-}" ]] || die "HOSTING_MANIFEST_FILE is not set"
[[ -n "${HOSTING_SELECTED_MODULES_FILE:-}" ]] || die "HOSTING_SELECTED_MODULES_FILE is not set"
[[ -n "${HOSTING_ROOT_ENV:-}" ]] || die "HOSTING_ROOT_ENV is not set"

token_value="${HOSTING_CLOUDFLARE_API_TOKEN:-$(env_get "${HOSTING_ROOT_ENV}" CLOUDFLARE_API_TOKEN)}"
proxied_value="${HOSTING_CLOUDFLARE_PROXIED:-$(env_get "${HOSTING_ROOT_ENV}" CLOUDFLARE_PROXIED)}"
proxied_value="${proxied_value:-${DEFAULT_PROXIED_WHEN_ENABLED}}"

if [[ -z "${token_value}" ]] && is_interactive; then
  printf 'Cloudflare DDNS creates proxied DNS records and only works when your DNS is hosted on Cloudflare.\n'
  token_value="$(prompt_secret "Enter the Cloudflare API token, or leave blank to disable cloudflare-ddns")"
fi

if [[ -z "${token_value}" ]]; then
  warn "cloudflare-ddns was selected without a token. Disabling it."
  remove_line_from_file "${HOSTING_SELECTED_MODULES_FILE}" "${MODULE_NAME}"
  env_upsert "${HOSTING_ROOT_ENV}" CLOUDFLARE_API_TOKEN ""
  exit 0
fi

env_upsert "${HOSTING_ROOT_ENV}" CLOUDFLARE_API_TOKEN "${token_value}"
env_upsert "${HOSTING_ROOT_ENV}" CLOUDFLARE_PROXIED "${proxied_value}"

cloudflare_compose_rel="$(module_compose_relative_path "${HOSTING_TEMPLATE_DIR}" "${MODULE_NAME}")"
cloudflare_compose_name="$(basename "${cloudflare_compose_rel}")"
traefik_compose_rel="$(module_compose_relative_path "${HOSTING_TEMPLATE_DIR}" "${TRAEFIK_MODULE}")"
traefik_compose_name="$(basename "${traefik_compose_rel}")"

stage_item "${MODULE_NAME}" "${cloudflare_compose_rel}" "${HOSTING_MANIFEST_FILE}" "${HOSTING_TEMPLATE_DIR}" "${HOSTING_CONFIG_DIR}"
stage_item "${TRAEFIK_MODULE}" "${traefik_compose_rel}" "${HOSTING_MANIFEST_FILE}" "${HOSTING_TEMPLATE_DIR}" "${HOSTING_CONFIG_DIR}"

cloudflare_compose="${HOSTING_CONFIG_DIR}/$(stage_name_for "${MODULE_NAME}" "${cloudflare_compose_name}")"
traefik_compose="${HOSTING_CONFIG_DIR}/$(stage_name_for "${TRAEFIK_MODULE}" "${traefik_compose_name}")"

host_vars=()
while IFS= read -r module; do
  while IFS= read -r env_var; do
    [[ -n "${env_var}" ]] || continue
    host_vars+=("${env_var}")
  done < <(module_host_env_vars "${HOSTING_TEMPLATE_DIR}" "${module}")
done < <(read_lines_file "${HOSTING_SELECTED_MODULES_FILE}")

HOSTING_CF_HOST_VARS="$(printf '%s\n' "${host_vars[@]}" | dedupe_lines)" python3 - "${cloudflare_compose}" <<'PY'
import os
import sys

compose_path = sys.argv[1]
host_vars = [line for line in os.environ.get("HOSTING_CF_HOST_VARS", "").splitlines() if line]

with open(compose_path, "r", encoding="utf-8") as handle:
    lines = handle.readlines()

new_lines = []
index = 0
while index < len(lines):
    stripped = lines[index].lstrip()
    if stripped.startswith("PROXIED:"):
      new_lines.append('      PROXIED: "${CLOUDFLARE_PROXIED:-true}"\n')
      index += 1
      continue
    if stripped.startswith("DOMAINS:"):
      new_lines.append("      DOMAINS: >\n")
      for env_var in host_vars:
        new_lines.append(f"        ${{{env_var}}},\n")
      index += 1
      while index < len(lines):
        current = lines[index]
        if current.startswith("    profiles:"):
          break
        if current.startswith("      ") or current.strip() == "":
          index += 1
          continue
        break
      continue
    new_lines.append(lines[index])
    index += 1

with open(compose_path, "w", encoding="utf-8") as handle:
    handle.writelines(new_lines)
PY

python3 - "${traefik_compose}" <<'PY'
import sys

compose_path = sys.argv[1]
with open(compose_path, "r", encoding="utf-8") as handle:
    lines = handle.readlines()

if not any("CF_DNS_API_TOKEN" in line for line in lines):
    for idx, line in enumerate(lines):
        if line.strip() == "environment:":
            lines.insert(idx + 1, '      - CF_DNS_API_TOKEN=${CLOUDFLARE_DNS_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}\n')
            lines.insert(idx + 2, '      - CF_ZONE_API_TOKEN=${CLOUDFLARE_ZONE_API_TOKEN:-${CLOUDFLARE_DNS_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}}\n')
            break

for idx, line in enumerate(lines):
    if "--certificatesresolvers.letsencrypt.acme.tlschallenge=true" in line:
        lines[idx] = line.replace("tlschallenge=true", "dnschallenge=true")
        if idx + 1 >= len(lines) or "dnschallenge.provider=cloudflare" not in lines[idx + 1]:
            lines.insert(idx + 1, "      - '--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=cloudflare'\n")
        break
else:
    if not any("dnschallenge.provider=cloudflare" in line for line in lines):
        for idx, line in enumerate(lines):
            if "--certificatesresolvers.letsencrypt.acme.dnschallenge=true" in line:
                lines.insert(idx + 1, "      - '--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=cloudflare'\n")
                break

with open(compose_path, "w", encoding="utf-8") as handle:
    handle.writelines(lines)
PY

success "Updated Cloudflare DDNS and Traefik configs for the selected hostnames"

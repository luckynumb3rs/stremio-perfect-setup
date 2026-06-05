#!/usr/bin/env bash

# Configures the staged Watchly .env file and registers it with Authelia.
#
# Purpose:
#   Watchly needs a random TOKEN_SALT and an optional TMDB_API_KEY. This hook
#   fills TOKEN_SALT with a generated value (preserving any existing one),
#   prompts for an optional TMDB_API_KEY (whiptail + console fallback, skippable),
#   and — when Authelia is selected — registers ${WATCHLY_HOSTNAME} in the
#   Authelia TEMPLATE_STREMIO_ADDON_HOSTNAMES bypass list so the addon's
#   manifest/catalog endpoints stay publicly reachable while /configure remains
#   protected, exactly like upstream Stremio addons.
#
# Runs at order 80 (before authelia at 85) so the template patch lands before
# authelia.sh stages and filters the addon-hostnames block.
#
# Called automatically by main.sh when watchly is selected.
#
# Manual hook contract:
#
#   HOSTING_TEMPLATE_DIR=./hosting/.work/docker \
#   HOSTING_CONFIG_DIR=./hosting/.work/config \
#   HOSTING_SELECTED_MODULES_FILE=./hosting/.work/selected-modules.txt \
#   ./hosting/modules/watchly.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"

MODULE_NAME=watchly
AUTHELIA_MODULE=authelia

if [[ "${1:-}" == "--metadata" ]]; then
  printf 'scope=module\nmodule=%s\norder=80\n' "${MODULE_NAME}"
  exit 0
fi

[[ -n "${HOSTING_CONFIG_DIR:-}" ]] || die "HOSTING_CONFIG_DIR is not set"
[[ -n "${HOSTING_TEMPLATE_DIR:-}" ]] || die "HOSTING_TEMPLATE_DIR is not set"

if ! hook_target_enabled "${MODULE_NAME}"; then
  exit 0
fi

if ! selected_module_enabled "${MODULE_NAME}"; then
  exit 0
fi

WATCHLY_ENV="${HOSTING_CONFIG_DIR}/WATCHLY.env"
[[ -f "${WATCHLY_ENV}" ]] || die "Missing staged Watchly env file: ${WATCHLY_ENV}"

# ── TOKEN_SALT: preserve existing non-empty value, otherwise generate one. ──────
current_token_salt="$(env_get "${WATCHLY_ENV}" TOKEN_SALT || true)"
env_upsert "${WATCHLY_ENV}" TOKEN_SALT "${current_token_salt:-$(generate_secret_hex)}"

# ── TMDB_API_KEY: optional prompt (whiptail + console fallback). ────────────────
current_tmdb_key="$(env_get "${WATCHLY_ENV}" TMDB_API_KEY || true)"
tmdb_key="${current_tmdb_key}"
if is_interactive; then
  if dialog_ui_available; then
    tmdb_key="$(
      whiptail_capture_on_tty \
        --title "Watchly TMDB API Key" \
        --inputbox "Optional: enter a TMDB API key for Watchly catalogs.\n\nLeave empty to skip." \
        12 84 "${current_tmdb_key}"
    )" || die "Prompt cancelled."
  else
    tmdb_key="$(prompt_value "Optional: enter a TMDB API key for Watchly. Leave empty to skip [TMDB_API_KEY]" "${current_tmdb_key}")"
  fi
fi
env_upsert "${WATCHLY_ENV}" TMDB_API_KEY "${tmdb_key}"

# ── Register WATCHLY_HOSTNAME in Authelia's Stremio-addon bypass list. ──────────
if selected_module_enabled "${AUTHELIA_MODULE}"; then
  authelia_compose="${HOSTING_TEMPLATE_DIR}/apps/${AUTHELIA_MODULE}/compose.yaml"
  if [[ ! -f "${authelia_compose}" ]]; then
    authelia_compose="${HOSTING_TEMPLATE_DIR}/apps/${AUTHELIA_MODULE}/compose.yml"
  fi
  if [[ -f "${authelia_compose}" ]]; then
    python3 - "${authelia_compose}" <<'PY'
import re
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
    lines = fh.readlines()

# Idempotent: do nothing if already registered anywhere in the file.
if any("${WATCHLY_HOSTNAME}" in line for line in lines):
    sys.exit(0)

key_re = re.compile(r'^(\s+)TEMPLATE_STREMIO_ADDON_HOSTNAMES:\s*>-\s*$')
value_indent_re = re.compile(r'^(\s+)\$\{[A-Z0-9_]+_HOSTNAME\}')

out = []
patched = False
for i, line in enumerate(lines):
    out.append(line)
    if patched:
        continue
    m = key_re.match(line)
    if m:
        indent = None
        if i + 1 < len(lines):
            nm = value_indent_re.match(lines[i + 1])
            if nm:
                indent = nm.group(1)
        if indent is None:
            indent = m.group(1) + "  "
        out.append("%s${WATCHLY_HOSTNAME},\n" % indent)
        patched = True

if patched:
    with open(path, "w", encoding="utf-8") as fh:
        fh.writelines(out)
PY
  fi
fi

success "Configured Watchly env file and Authelia addon registration"

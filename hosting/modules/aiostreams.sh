#!/usr/bin/env bash

# Configures the staged AIOStreams .env file.
#
# Purpose:
#   This hook applies the AIOStreams defaults in the staged AIOSTREAMS.env file:
#   set the configured parameter values, generate SECRET_KEY, optionally prompt
#   for AIOSTREAMS_AUTH (commenting it out when left empty, since AIOStreams
#   rejects an empty value), and point BUILTIN_STREMTHRU_URL at the local
#   stremthru container when stremthru was selected.
#
# Called automatically by main.sh when aiostreams is selected.
#
# Manual hook contract:
#
#   HOSTING_CONFIG_DIR=./hosting/.work/config \
#   HOSTING_SELECTED_MODULES_FILE=./hosting/.work/selected-modules.txt \
#   ./hosting/modules/aiostreams.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/common.sh"

MODULE_NAME=aiostreams
STREMTHRU_MODULE=stremthru
LOCAL_STREMTHRU_URL=http://stremthru:8080
read -r -d '' PARAMETERS <<'JSON' || true
{
  "TORRENTIO_URL": "https://torrentio.stremio.ru/",
  "FEATURED_TEMPLATE_IDS": "stremio.perfect.setup",
  "SEL_SYNC_ACCESS":"trusted",
  "TEMPLATE_URLS": "[\"https://numb3rs.stream/templates/AIOStreams.json\", \"https://numb3rs.stream/templates/AIOStreams-Formatter.json\"]",
  "WHITELISTED_SEL_URLS":"[\"https://raw.githubusercontent.com/Tam-Taro/SEL-Filtering-and-Sorting/refs/heads/main/AIOStreams-SyncedURLs/Tamtaro-synced-ESEs-extended.json\",\"https://raw.githubusercontent.com/Tam-Taro/SEL-Filtering-and-Sorting/refs/heads/main/AIOStreams-SyncedURLs/Tamtaro-synced-ESEs-standard.json\",\"https://raw.githubusercontent.com/Tam-Taro/SEL-Filtering-and-Sorting/refs/heads/main/AIOStreams-SyncedURLs/Tamtaro-synced-ISEs.json\",\"https://raw.githubusercontent.com/Tam-Taro/SEL-Filtering-and-Sorting/refs/heads/main/AIOStreams-SyncedURLs/Tamtaro-synced-PSEs.json\",\"https://raw.githubusercontent.com/Vidhin05/Releases-Regex/main/English/expressions.json\",\"https://raw.githubusercontent.com/Vidhin05/Releases-Regex/main/German/expressions.json\",\"https://raw.githubusercontent.com/Vidhin05/Releases-Regex/main/English/legacy-expressions.json\"]",
  "WHITELISTED_REGEX_PATTERNS_URLS":"[\"https://raw.githubusercontent.com/Vidhin05/Releases-Regex/main/English/regexes.json\",\"https://raw.githubusercontent.com/Vidhin05/Releases-Regex/main/German/regexes.json\",\"https://raw.githubusercontent.com/Tam-Taro/SEL-Filtering-and-Sorting/refs/heads/main/AIOStreams-SyncedURLs/Tamtaro-synced-excluded-regex.json\"]",
  "CUSTOM_HTML":"<div class=\"UI-Card__content p-4 pt-4 space-y-3 flex-wrap\"><div class=\"[&_a]:text-[--brand] [&_a:hover]:underline\"><div class=\"sps-wizard-card\" style=\"background:transparent;color:#fff;padding:24px 28px;margin:0;width:100%;max-width:none;position:relative;overflow:hidden;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;display:flex;align-items:center;justify-content:space-between;gap:28px;text-align:center;\"><div class=\"sps-wizard-emoji\" style=\"font-size:116px;line-height:1;flex:0 0 auto;text-shadow:0 0 30px rgba(124,92,255,0.45);animation:crystalMagic 7.5s ease-in-out infinite;transform-origin:center;\">🔮</div><div class=\"sps-wizard-copy\" style=\"min-width:0;flex:1 1 auto;text-align:center;\"><h2 class=\"sps-wizard-title\" style=\"margin:0 0 9px 0;font-size:1.8em;font-weight:700;line-height:1.2;\"><span style=\"color:#ffffff;\">Welcome to your</span> <span style=\"color:#9b7cff;text-shadow:0 0 20px rgba(124,92,255,0.18);\">Perfect Setup</span></h2><p class=\"sps-wizard-lead\" style=\"margin:0 0 8px 0;font-size:1.12em;line-height:1.45;opacity:0.94;font-weight:400;\">Skip the manual work and let the wizard configure your setup in seconds.</p><p class=\"sps-wizard-body\" style=\"margin:0 0 10px 0;font-size:0.98em;line-height:1.45;opacity:0.9;font-weight:400;\"><span style=\"color:#c7b8ff;font-weight:700;\">Fast guided flow</span> for apps, addons, providers, and settings.<br />Less copy-paste, fewer mistakes, and a <span style=\"color:#d8ccff;font-weight:700;\">cleaner setup from the start</span>.</p><a class=\"sps-wizard-donate\" href=\"https://ko-fi.com/luckynumb3rs\" target=\"_blank\" style=\"font-size:0.95em;color:#ccc;text-decoration:none;opacity:0.8;transition:opacity 0.2s ease;\">☕ Donate via Ko-fi</a></div><a class=\"sps-wizard-button\" href=\"https://numb3rs.stream/\" onmouseover=\"this.style.background='rgba(155,124,255,0.18)';this.style.borderColor='#b89cff';this.style.color='#d8ccff';this.style.transform='translateY(-2px) scale(1.025)';\" onmouseout=\"this.style.background='rgba(124,92,255,0.08)';this.style.borderColor='#9b7cff';this.style.color='#a986ff';this.style.transform='translateY(0) scale(1)';\" style=\"display:inline-flex;align-items:center;justify-content:center;gap:12px;flex:0 0 auto;background:rgba(124,92,255,0.08);color:#a986ff;padding:18px 34px;border-radius:18px;font-size:1.25em;font-weight:800;line-height:1;text-decoration:none;box-shadow:none;transition:background 0.22s ease,border-color 0.22s ease,color 0.22s ease,transform 0.22s ease;animation:wizardButtonPulse 3.8s ease-in-out infinite;border:2px solid #9b7cff;white-space:nowrap;cursor:pointer;\"><svg class=\"sps-wizard-icon\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" style=\"display:block;flex:0 0 auto;\"><path d=\"M15 4V2\"></path><path d=\"M15 10V8\"></path><path d=\"M19 6h2\"></path><path d=\"M9 6H7\"></path><path d=\"m18 3 1 1\"></path><path d=\"m11 10 1 1\"></path><path d=\"m18 9 1-1\"></path><path d=\"m11 2 1 1\"></path><path d=\"m14 7-9 9 2 2 9-9-2-2Z\"></path></svg><span>Launch Wizard</span></a><style>.sps-wizard-card{box-sizing:border-box}.sps-wizard-copy{min-width:0}.sps-wizard-button{max-width:100%}@keyframes crystalMagic{0%,100%{transform:translateY(0) rotate(0deg) scale(1);filter:brightness(1)}20%{transform:translateY(-10px) rotate(-5deg) scale(1.06);filter:brightness(1.16)}45%{transform:translateY(4px) rotate(4deg) scale(0.98);filter:brightness(1)}65%{transform:translateY(-7px) rotate(5deg) scale(1.08);filter:brightness(1.2)}82%{transform:translateY(2px) rotate(-3deg) scale(1.02);filter:brightness(1.08)}}@keyframes wizardButtonPulse{0%,100%{box-shadow:0 0 0 rgba(155,124,255,0);filter:brightness(1)}50%{box-shadow:0 0 16px rgba(155,124,255,0.18);filter:brightness(1.08)}}@media (max-width:980px){.sps-wizard-card{flex-direction:column !important;align-items:center !important;justify-content:center !important;gap:18px !important;padding:20px 18px !important}.sps-wizard-emoji{font-size:72px !important}.sps-wizard-title{font-size:1.3em !important}.sps-wizard-lead{font-size:0.98em !important}.sps-wizard-body{font-size:0.88em !important}.sps-wizard-donate{font-size:0.86em !important}.sps-wizard-button{width:auto !important;max-width:100% !important;padding:14px 22px !important;font-size:1.02em !important;white-space:normal !important}.sps-wizard-icon{width:20px !important;height:20px !important}}</style></div></div></div>"
}
JSON


build_final_parameters_json() {
  local base_parameters_json="$1"
  local secret_key_value="$2"
  local auth_value="$3"
  local enable_local_stremthru="$4"

  HOSTING_AIOSTREAMS_BASE_PARAMETERS_JSON="${base_parameters_json}" \
  HOSTING_AIOSTREAMS_SECRET_KEY="${secret_key_value}" \
  HOSTING_AIOSTREAMS_AUTH_VALUE="${auth_value}" \
  HOSTING_AIOSTREAMS_LOCAL_STREMTHRU_URL="${LOCAL_STREMTHRU_URL}" \
  HOSTING_AIOSTREAMS_ENABLE_LOCAL_STREMTHRU="${enable_local_stremthru}" \
  python3 - <<'PY'
import json
import os

values = json.loads(os.environ["HOSTING_AIOSTREAMS_BASE_PARAMETERS_JSON"])
values["SECRET_KEY"] = os.environ["HOSTING_AIOSTREAMS_SECRET_KEY"]
# Only set AIOSTREAMS_AUTH when a value is provided. AIOStreams rejects an empty
# value ("Proxy auth must be a comma separated list..."), so an empty value is
# left out here and the staged line is commented out by the caller instead.
_auth = os.environ["HOSTING_AIOSTREAMS_AUTH_VALUE"]
if _auth.strip():
    values["AIOSTREAMS_AUTH"] = _auth

if os.environ.get("HOSTING_AIOSTREAMS_ENABLE_LOCAL_STREMTHRU", "").strip() == "1":
    values["BUILTIN_STREMTHRU_URL"] = os.environ["HOSTING_AIOSTREAMS_LOCAL_STREMTHRU_URL"]

print(json.dumps(values), end="")
PY
}

apply_parameters_json() {
  local file="$1"
  local parameters_json="$2"
  local parameter_rows=""
  local key="" value=""

  parameter_rows="$(
    HOSTING_AIOSTREAMS_PARAMETERS_JSON="${parameters_json}" python3 - <<'PY'
import json
import os

for key, value in json.loads(os.environ["HOSTING_AIOSTREAMS_PARAMETERS_JSON"]).items():
    if key == "CUSTOM_HTML":
        value = json.dumps(value, ensure_ascii=False)
    print(f"{key}\t{value}")
PY
  )"

  while IFS=$'\t' read -r key value; do
    [[ -n "${key}" ]] || continue
    env_upsert_uncomment "${file}" "${key}" "${value}"
  done <<< "${parameter_rows}"
}

if [[ "${1:-}" == "--metadata" ]]; then
  printf 'scope=module\nmodule=%s\n' "${MODULE_NAME}"
  printf 'param=auth|string|false|AIOStreams proxy users (comma-separated username:password pairs, e.g. user1:pass1,user2:pass2)\n'
  exit 0
fi

[[ -n "${HOSTING_CONFIG_DIR:-}" ]] || die "HOSTING_CONFIG_DIR is not set"
[[ -n "${HOSTING_SELECTED_MODULES_FILE:-}" ]] || die "HOSTING_SELECTED_MODULES_FILE is not set"

if ! hook_target_enabled "${MODULE_NAME}"; then
  exit 0
fi

if ! selected_module_enabled "${MODULE_NAME}"; then
  exit 0
fi

AIOSTREAMS_ENV="${HOSTING_CONFIG_DIR}/AIOSTREAMS.env"
[[ -f "${AIOSTREAMS_ENV}" ]] || die "Missing staged AIOStreams env file: ${AIOSTREAMS_ENV}"

current_secret_key="$(env_get "${AIOSTREAMS_ENV}" SECRET_KEY || true)"
staged_auth="$(env_get "${AIOSTREAMS_ENV}" AIOSTREAMS_AUTH || true)"

AIOSTREAMS_ENABLE_LOCAL_STREMTHRU=0
if selected_module_enabled "${STREMTHRU_MODULE}"; then
  AIOSTREAMS_ENABLE_LOCAL_STREMTHRU=1
fi

auth_value="$(module_get_param "auth" "string" "false" \
  "AIOStreams proxy users (comma-separated username:password pairs, e.g. user1:pass1,user2:pass2)" \
  "${staged_auth}")" || true

apply_parameters_json \
  "${AIOSTREAMS_ENV}" \
  "$(build_final_parameters_json \
    "${PARAMETERS}" \
    "${current_secret_key:-$(generate_secret_hex)}" \
    "${auth_value}" \
    "${AIOSTREAMS_ENABLE_LOCAL_STREMTHRU}")"

# AIOStreams crash-loops on an empty AIOSTREAMS_AUTH; comment it out when unset
# so the app treats it as disabled instead of invalid.
if [[ -z "${auth_value//[[:space:]]/}" ]]; then
  env_comment "${AIOSTREAMS_ENV}" AIOSTREAMS_AUTH
fi

success "Configured AIOStreams defaults"

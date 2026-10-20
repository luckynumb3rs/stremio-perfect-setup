#!/usr/bin/env bash
#
# Copy Nuvio TV/Mobile settings and optionally connected-service credentials.
#
# Requirements: bash, curl, jq.
#
# Required parameters:
#   --email EMAIL
#       Source Nuvio account email.
#   --password PASSWORD
#       Source account password. Use --password-stdin to avoid putting it in
#       shell history.
#   --source PROFILE
#       Source profile index, such as 1, or exact profile name.
#   --targets LIST
#       Comma-separated target profile indexes or exact profile names.
#       May be replaced or combined with repeated --target options.
#
# Target-account parameters:
#   --target-email EMAIL
#       Optional separate Nuvio account for all target profiles. If omitted,
#       targets are copied within the source account.
#   --target-password PASSWORD
#       Password for --target-email.
#   --target PROFILE
#       Add one target profile; may be repeated.
#
# Copy selection:
#   --platform tv|mobile|both
#       TV/mobile settings to copy. Default: both.
#   --copy-credentials
#       Also copy connected-service credentials/API keys (for example TorBox).
#       API keys are not copied unless this flag is supplied. When omitted,
#       existing target keys are preserved and source keys are removed from
#       the settings payload.
#
# Execution options:
#   --interactive
#       Ask questions for missing values. Running copy-nuvio-settings.sh with no arguments in
#       an interactive terminal also starts this mode.
#   --dry-run
#       Authenticate, resolve profiles, and read source settings without
#       changing any target profile. With --copy-credentials, also reads the
#       source credential records but never writes them.
#   --yes
#       Skip the final confirmation prompt before writing.
#   --password-stdin
#       Read the source password from one line of stdin.
#   --target-password-stdin
#       Read the separate target-account password from one line of stdin.
#   --help
#       Show the command-line help.
#
# Examples:
#   scripts/copy-nuvio-settings.sh --email source@example.com --password 'secret' \
#     --source 1 --targets 2,3 --platform both
#
#   scripts/copy-nuvio-settings.sh --email source@example.com --password 'secret' \
#     --source 1 --target-email target@example.com --target-password 'secret2' \
#     --targets 1,2 --platform tv --copy-credentials --yes
#
# Optional environment fallbacks are NUVIO_EMAIL, NUVIO_PASSWORD,
# NUVIO_TARGET_EMAIL, and NUVIO_TARGET_PASSWORD. They are not required.

set -euo pipefail

NUVIO_API_BASE="${NUVIO_API_BASE:-https://api.nuvio.tv}"
NUVIO_PUBLISHABLE_KEY="${NUVIO_PUBLISHABLE_KEY:-sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN}"

EMAIL="${NUVIO_EMAIL:-}"
PASSWORD="${NUVIO_PASSWORD:-}"
TARGET_EMAIL="${NUVIO_TARGET_EMAIL:-}"
TARGET_PASSWORD="${NUVIO_TARGET_PASSWORD:-}"
SOURCE_VALUE=""
TARGET_VALUES=()
PLATFORM_VALUE=""
PASSWORD_FROM_STDIN=0
TARGET_PASSWORD_FROM_STDIN=0
INTERACTIVE=0
DRY_RUN=0
SKIP_CONFIRMATION=0
COPY_CREDENTIALS=0

HTTP_BODY=""
HTTP_STATUS=""
RPC_RESULT=""
LOGIN_TOKEN=""
PROFILES_JSON="[]"
TARGET_PROFILES_JSON="[]"
SOURCE_INDEX=""
SOURCE_NAME=""
TARGET_INDEXES=()
TARGET_NAMES=()
PLATFORM_LIST=()
SETTINGS_JSON=""
PROVIDER_CREDENTIALS_JSON="[]"
SOURCE_PROVIDER_CREDENTIALS_JSON="[]"
PROVIDER_ORIGIN_CLIENT_ID=""
declare -A SOURCE_SETTINGS=()
declare -A TARGET_SEEN=()

cleanup_terminal() {
  stty echo 2>/dev/null || true
}

trap cleanup_terminal EXIT

die() {
  echo "Error: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Copy Nuvio TV/Mobile settings and optionally connected-service credentials.

Usage:
  scripts/copy-nuvio-settings.sh --email you@example.com --password '...' \
    --source 1 --targets 2,3 --platform both

  scripts/copy-nuvio-settings.sh --interactive

Options:
  --email EMAIL             Source Nuvio email
  --password PASSWORD       Source password (prefer --password-stdin for shell history safety)
  --password-stdin          Read the source password from stdin
  --target-email EMAIL      Optional separate account for all target profiles
  --target-password VALUE   Target password
  --target-password-stdin   Read the target-account password from stdin
  --source PROFILE          Source profile index or exact name
  --targets LIST            Comma-separated target indexes or exact names
  --target PROFILE          Add one target; may be repeated
  --platform VALUE          tv, mobile, or both (default: both)
  --copy-credentials        Also copy connected-service credentials/API keys (default: off)
  --interactive             Ask for missing values step by step
  --dry-run                 Validate without changing Nuvio
  --yes                     Skip the confirmation prompt
  --help                    Show this help
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

require_value() {
  [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "Missing value for $1"
}

request_json() {
  local path="$1"
  local token="$2"
  local body="$3"
  local response
  local -a curl_args=(
    --silent --show-error
    --connect-timeout 20
    --max-time 60
    -X POST
    -H "Content-Type: application/json"
    -H "apikey: ${NUVIO_PUBLISHABLE_KEY}"
    --data "$body"
  )

  if [[ -n "$token" ]]; then
    curl_args+=( -H "Authorization: Bearer ${token}" )
  fi

  if ! response="$(curl "${curl_args[@]}" -w $'\n%{http_code}' "${NUVIO_API_BASE}${path}")"; then
    die "Could not reach the Nuvio server."
  fi

  HTTP_STATUS="${response##*$'\n'}"
  HTTP_BODY="${response%$'\n'*}"
}

rpc() {
  local token="$1"
  local path="$2"
  local body="$3"
  local detail

  request_json "$path" "$token" "$body"
  if [[ ! "$HTTP_STATUS" =~ ^2 ]]; then
    detail="$(jq -r '.msg // .message // .error_description // .error.message // .error // empty' <<<"$HTTP_BODY" 2>/dev/null || true)"
    [[ -n "$detail" ]] || detail="HTTP ${HTTP_STATUS}"
    die "Nuvio ${path} failed: ${detail}"
  fi
  RPC_RESULT="$HTTP_BODY"
}

login() {
  local email="$1"
  local password="$2"
  local payload
  local detail

  payload="$(jq -nc --arg email "$email" --arg password "$password" '{email: $email, password: $password}')"
  request_json '/auth/v1/token?grant_type=password' '' "$payload"
  if [[ ! "$HTTP_STATUS" =~ ^2 ]]; then
    detail="$(jq -r '.msg // .message // .error_description // .error.message // .error // empty' <<<"$HTTP_BODY" 2>/dev/null || true)"
    [[ -n "$detail" ]] || detail="HTTP ${HTTP_STATUS}"
    die "Nuvio sign-in failed: ${detail}"
  fi

  LOGIN_TOKEN="$(jq -r '.access_token // empty' <<<"$HTTP_BODY")"
  [[ -n "$LOGIN_TOKEN" ]] || die "Nuvio sign-in succeeded but did not return an access token."
}

load_profiles() {
  local token="$1"

  rpc "$token" '/rest/v1/rpc/sync_pull_profiles' '{}'
  PROFILES_JSON="$(jq -c '
    (if type == "array" then . else (.profiles // []) end)
    | map(select(type == "object")
      | {profile_index: ((.profile_index // .id) | tonumber), name: ((.name // "") | tostring | gsub("^\\s+|\\s+$"; ""))})
      | map(select(.profile_index >= 1))
      | unique_by(.profile_index)
      | sort_by(.profile_index)
  ' <<<"$RPC_RESULT")"
}

profiles_label() {
  jq -r 'map("\(.name) (profile \(.profile_index))") | join(", ")' <<<"$PROFILES_JSON"
}

resolve_profile() {
  local requested="$1"
  local option_name="$2"
  local count=0
  local normalized_index

  requested="${requested#"${requested%%[![:space:]]*}"}"
  requested="${requested%"${requested##*[![:space:]]}"}"
  [[ -n "$requested" ]] || die "Missing ${option_name}."

  if [[ "$requested" =~ ^[0-9]+$ ]]; then
    normalized_index=$((10#$requested))
    count="$(jq --argjson index "$normalized_index" '[.[] | select(.profile_index == $index)] | length' <<<"$PROFILES_JSON")"
    if [[ "$count" -eq 1 ]]; then
      RESOLVED_INDEX="$normalized_index"
      RESOLVED_NAME="$(jq -r --argjson index "$normalized_index" '.[] | select(.profile_index == $index) | .name' <<<"$PROFILES_JSON")"
      return 0
    fi
  else
    count="$(jq --arg name "$requested" '[.[] | select((.name | ascii_downcase) == ($name | ascii_downcase))] | length' <<<"$PROFILES_JSON")"
    if [[ "$count" -eq 1 ]]; then
      RESOLVED_INDEX="$(jq -r --arg name "$requested" '.[] | select((.name | ascii_downcase) == ($name | ascii_downcase)) | .profile_index' <<<"$PROFILES_JSON")"
      RESOLVED_NAME="$(jq -r --arg name "$requested" '.[] | select((.name | ascii_downcase) == ($name | ascii_downcase)) | .name' <<<"$PROFILES_JSON")"
      return 0
    fi
  fi

  if [[ "$count" -gt 1 ]]; then
    die "${option_name} \"${requested}\" is ambiguous. Select the profile by index instead."
  fi
  die "${option_name} \"${requested}\" was not found. Available profiles: $(profiles_label || true)"
}

resolve_targets() {
  local value part
  local -a parts

  TARGET_INDEXES=()
  TARGET_NAMES=()
  TARGET_SEEN=()
  ((${#TARGET_VALUES[@]} > 0)) || die "At least one --target or --targets value is required."

  for value in "${TARGET_VALUES[@]}"; do
    IFS=',' read -r -a parts <<<"$value"
    for part in "${parts[@]}"; do
      [[ -n "${part//[[:space:]]/}" ]] || continue
      resolve_profile "$part" '--target'
      if [[ -z "${TARGET_SEEN[$RESOLVED_INDEX]+x}" ]]; then
        TARGET_SEEN["$RESOLVED_INDEX"]=1
        TARGET_INDEXES+=("$RESOLVED_INDEX")
        TARGET_NAMES+=("$RESOLVED_NAME")
      fi
    done
  done

  ((${#TARGET_INDEXES[@]} > 0)) || die "At least one target profile is required."
}

get_profile_settings() {
  local token="$1"
  local profile_index="$2"
  local platform="$3"
  local payload

  payload="$(jq -nc --argjson profile_id "$profile_index" --arg platform "$platform" '{p_profile_id: $profile_id, p_platform: $platform}')"
  rpc "$token" '/rest/v1/rpc/sync_pull_profile_settings_blob' "$payload"
  SETTINGS_JSON="$(jq -c 'if type == "array" then ((.[0].settings_json // {}) // {}) else (.settings_json // {}) end' <<<"$RPC_RESULT")"
}

push_profile_settings() {
  local token="$1"
  local profile_index="$2"
  local platform="$3"
  local settings_json="$4"
  local payload

  payload="$(jq -nc --argjson profile_id "$profile_index" --arg platform "$platform" --argjson settings "$settings_json" '{p_profile_id: $profile_id, p_platform: $platform, p_settings_json: $settings}')"
  rpc "$token" '/rest/v1/rpc/sync_push_profile_settings_blob' "$payload"
}

prepare_settings_for_copy() {
  local source_settings="$1"
  local target_settings="${2:-}"

  [[ -n "$target_settings" ]] || target_settings='{}'

  if [[ $COPY_CREDENTIALS -eq 1 ]]; then
    printf '%s' "$source_settings"
    return 0
  fi

  jq -c --argjson target "$target_settings" '
    .features = (.features // {})
    | def preserve_feature_credentials($feature; $fields):
        (.features[$feature] // {}) as $source_feature
        | (($target.features[$feature] // {}) | if type == "object" then . else {} end) as $target_feature
        | .features[$feature] = (
            reduce $fields[] as $field
              ($source_feature;
                del(.[$field])
                | if ($target_feature | has($field)) then
                    .[$field] = $target_feature[$field]
                  else
                    .
                  end)
          );
    preserve_feature_credentials("debrid_settings"; [
      "torbox_api_key",
      "premiumize_api_key",
      "real_debrid_api_key"
    ])
    | preserve_feature_credentials("tmdb_settings"; [
      "tmdb_api_key",
      "tmdb_access_token"
    ])
    | preserve_feature_credentials("mdblist_settings"; [
      "mdblist_api_key"
    ])
    | preserve_feature_credentials("animeskip_settings"; [
      "animeskip_client_id"
    ])
  ' <<<"$source_settings"
}

get_provider_credentials() {
  local token="$1"
  local profile_index="$2"
  local payload

  payload="$(jq -nc --argjson profile_id "$profile_index" '{p_profile_id: $profile_id}')"
  rpc "$token" '/rest/v1/rpc/sync_pull_provider_credentials' "$payload"
  PROVIDER_CREDENTIALS_JSON="$(jq -c '
    def credential_object:
      (.credential_json // .credentialJson // {})
      | if type == "string" then (try fromjson catch {}) else . end;

    if type != "array" then []
    else
      map({
        provider: ((.provider // "") | tostring),
        credential_json: credential_object
      })
      | map(select(.provider != "" and (.credential_json | type) == "object"))
      | map(select((.credential_json | to_entries | any(.value != null and ((.value | tostring) != "")))))
      | sort_by(.provider)
    end
  ' <<<"$RPC_RESULT")"
}

push_provider_credentials() {
  local token="$1"
  local profile_index="$2"
  local credentials_json="$3"
  local payload

  payload="$(jq -nc \
    --argjson profile_id "$profile_index" \
    --arg origin_client_id "$PROVIDER_ORIGIN_CLIENT_ID" \
    --argjson credentials "$credentials_json" \
    '{p_profile_id: $profile_id, p_origin_client_id: $origin_client_id, p_credentials: $credentials}')"
  rpc "$token" '/rest/v1/rpc/sync_push_provider_credentials' "$payload"
}

provider_credentials_match() {
  local expected_json="$1"
  local actual_json="$2"

  jq -n -e \
    --argjson expected "$expected_json" \
    --argjson actual "$actual_json" \
    'all($expected[]; . as $wanted
      | any($actual[]; .provider == $wanted.provider
        and .credential_json == $wanted.credential_json))' \
    >/dev/null
}

prompt_text() {
  local prompt="$1"
  local default_value="${2:-}"
  local answer

  if [[ -n "$default_value" ]]; then
    read -r -p "${prompt} [${default_value}]: " answer
    printf '%s' "${answer:-$default_value}"
  else
    read -r -p "${prompt}: " answer
    printf '%s' "$answer"
  fi
}

prompt_hidden() {
  local prompt="$1"
  local answer

  printf '%s' "$prompt" >&2
  stty -echo
  IFS= read -r answer
  stty echo
  printf '\n' >&2
  printf '%s' "$answer"
}

normalize_platforms() {
  case "${1,,}" in
    both|all) PLATFORM_LIST=(tv mobile) ;;
    tv|mobile) PLATFORM_LIST=("${1,,}") ;;
    *) die "Invalid --platform value \"$1\". Use tv, mobile, or both." ;;
  esac
}

confirm_copy() {
  local answer
  local prompt='This will overwrite the selected target settings.'

  if [[ ! -t 0 || ! -t 1 ]]; then
    die 'Refusing to write without confirmation in a non-interactive terminal. Re-run with --yes.'
  fi
  if [[ $COPY_CREDENTIALS -eq 1 ]]; then
    prompt+=' Connected-service credentials/API keys will also be copied.'
  fi
  read -r -p "${prompt} Type \"copy\" to continue: " answer
  [[ "${answer,,}" == 'copy' ]] || { echo 'Cancelled; no settings were changed.'; exit 0; }
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --help|-h) usage; exit 0 ;;
      --interactive) INTERACTIVE=1; shift ;;
      --dry-run) DRY_RUN=1; shift ;;
      --yes) SKIP_CONFIRMATION=1; shift ;;
      --copy-credentials) COPY_CREDENTIALS=1; shift ;;
      --password-stdin) PASSWORD_FROM_STDIN=1; shift ;;
      --target-password-stdin) TARGET_PASSWORD_FROM_STDIN=1; shift ;;
      --email|--password|--target-email|--target-password|--source|--targets|--target|--platform)
        require_value "$1" "${2:-}"
        case "$1" in
          --email) EMAIL="$2" ;;
          --password) PASSWORD="$2" ;;
          --target-email) TARGET_EMAIL="$2" ;;
          --target-password) TARGET_PASSWORD="$2" ;;
          --source) SOURCE_VALUE="$2" ;;
          --targets|--target) TARGET_VALUES+=("$2") ;;
          --platform) PLATFORM_VALUE="$2" ;;
        esac
        shift 2
        ;;
      --email=*|--password=*|--target-email=*|--target-password=*|--source=*|--targets=*|--target=*|--platform=*)
        key="${1%%=*}"
        value="${1#*=}"
        [[ -n "$value" ]] || die "Missing value for ${key}"
        case "$key" in
          --email) EMAIL="$value" ;;
          --password) PASSWORD="$value" ;;
          --target-email) TARGET_EMAIL="$value" ;;
          --target-password) TARGET_PASSWORD="$value" ;;
          --source) SOURCE_VALUE="$value" ;;
          --targets|--target) TARGET_VALUES+=("$value") ;;
          --platform) PLATFORM_VALUE="$value" ;;
        esac
        shift
        ;;
      *) die "Unknown option or argument: $1" ;;
    esac
  done
}

require_command curl
require_command jq
parse_args "$@"

if [[ $INTERACTIVE -eq 0 && $# -eq 0 && -t 0 && -t 1 ]]; then
  INTERACTIVE=1
fi

if [[ $PASSWORD_FROM_STDIN -eq 1 && $TARGET_PASSWORD_FROM_STDIN -eq 1 ]]; then
  die 'stdin can only be consumed once; use NUVIO_TARGET_PASSWORD or --target-password for one account.'
fi

if [[ -z "$EMAIL" && $INTERACTIVE -eq 1 ]]; then
  EMAIL="$(prompt_text 'Source Nuvio email')"
fi
[[ -n "$EMAIL" ]] || die 'Missing source email. Use --email, NUVIO_EMAIL, or --interactive.'

if [[ $PASSWORD_FROM_STDIN -eq 1 ]]; then
  IFS= read -r PASSWORD || true
elif [[ -z "$PASSWORD" && $INTERACTIVE -eq 1 ]]; then
  PASSWORD="$(prompt_hidden 'Source Nuvio password: ')"
fi
[[ -n "$PASSWORD" ]] || die 'Missing source password. Use --password, NUVIO_PASSWORD, --password-stdin, or --interactive.'

login "$EMAIL" "$PASSWORD"
SOURCE_TOKEN="$LOGIN_TOKEN"
load_profiles "$SOURCE_TOKEN"

if [[ -z "$SOURCE_VALUE" && $INTERACTIVE -eq 1 ]]; then
  SOURCE_VALUE="$(prompt_text "Source profile (index or exact name; available: $(profiles_label))")"
fi
resolve_profile "$SOURCE_VALUE" '--source'
SOURCE_INDEX="$RESOLVED_INDEX"
SOURCE_NAME="$RESOLVED_NAME"

if [[ -z "$TARGET_EMAIL" && $INTERACTIVE -eq 1 ]]; then
  TARGET_EMAIL="$(prompt_text 'Target account email (leave blank for the source account)')"
fi
TARGET_EMAIL="${TARGET_EMAIL:-$EMAIL}"

if [[ "${TARGET_EMAIL,,}" == "${EMAIL,,}" ]]; then
  TARGET_TOKEN="$SOURCE_TOKEN"
  TARGET_PROFILES_JSON="$PROFILES_JSON"
  SAME_ACCOUNT=1
else
  SAME_ACCOUNT=0
  if [[ $TARGET_PASSWORD_FROM_STDIN -eq 1 ]]; then
    IFS= read -r TARGET_PASSWORD || true
  elif [[ -z "$TARGET_PASSWORD" && $INTERACTIVE -eq 1 ]]; then
    TARGET_PASSWORD="$(prompt_hidden "Password for target account ${TARGET_EMAIL}: ")"
  fi
  [[ -n "$TARGET_PASSWORD" ]] || die 'Missing target-account password. Use --target-password, NUVIO_TARGET_PASSWORD, --target-password-stdin, or --interactive.'
  login "$TARGET_EMAIL" "$TARGET_PASSWORD"
  TARGET_TOKEN="$LOGIN_TOKEN"
  load_profiles "$TARGET_TOKEN"
  TARGET_PROFILES_JSON="$PROFILES_JSON"
  PROFILES_JSON="$TARGET_PROFILES_JSON"
fi

if [[ ${#TARGET_VALUES[@]} -eq 0 && $INTERACTIVE -eq 1 ]]; then
  TARGET_VALUES+=("$(prompt_text "Target profile(s), comma-separated (available: $(profiles_label))")")
fi
resolve_targets

if [[ -z "$PLATFORM_VALUE" ]]; then
  if [[ $INTERACTIVE -eq 1 ]]; then
    PLATFORM_VALUE="$(prompt_text 'Platforms (tv, mobile, or both)' 'both')"
  else
    PLATFORM_VALUE='both'
  fi
fi
normalize_platforms "$PLATFORM_VALUE"

if [[ $COPY_CREDENTIALS -eq 0 && $INTERACTIVE -eq 1 ]]; then
  copy_credentials_answer="$(prompt_text 'Copy connected-service credentials/API keys?' 'no')"
  case "${copy_credentials_answer,,}" in
    y|yes) COPY_CREDENTIALS=1 ;;
    n|no|'') ;;
    *) die 'Please answer yes or no for copying connected-service credentials.' ;;
  esac
fi

PROVIDER_ORIGIN_CLIENT_ID="nuvio-copy-$$-${RANDOM}${RANDOM}${RANDOM}"

if [[ $SAME_ACCOUNT -eq 1 ]]; then
  for target_index in "${TARGET_INDEXES[@]}"; do
    [[ "$target_index" != "$SOURCE_INDEX" ]] || die 'The source profile cannot also be a target profile.'
  done
fi

echo "Source account: ${EMAIL}"
echo "Source: ${SOURCE_NAME} (profile ${SOURCE_INDEX})"
if [[ $SAME_ACCOUNT -eq 1 ]]; then
  echo "Target account: ${TARGET_EMAIL} (same account)"
else
  echo "Target account: ${TARGET_EMAIL}"
fi
printf 'Targets:'
for ((index = 0; index < ${#TARGET_INDEXES[@]}; index += 1)); do
  printf ' %s (profile %s)' "${TARGET_NAMES[$index]}" "${TARGET_INDEXES[$index]}"
  [[ $index -eq $((${#TARGET_INDEXES[@]} - 1)) ]] || printf ','
done
printf '\nPlatforms: %s\n' "${PLATFORM_LIST[*]}"

for platform in "${PLATFORM_LIST[@]}"; do
  get_profile_settings "$SOURCE_TOKEN" "$SOURCE_INDEX" "$platform"
  SOURCE_SETTINGS["$platform"]="$SETTINGS_JSON"
done
source_provider_credential_count=0
if [[ $COPY_CREDENTIALS -eq 1 ]]; then
  get_provider_credentials "$SOURCE_TOKEN" "$SOURCE_INDEX"
  SOURCE_PROVIDER_CREDENTIALS_JSON="$PROVIDER_CREDENTIALS_JSON"
  source_provider_credential_count="$(jq 'length' <<<"$SOURCE_PROVIDER_CREDENTIALS_JSON")"
  printf 'Connected-service credentials selected: %s\n' "$source_provider_credential_count"
else
  echo 'Connected-service credentials: not selected (use --copy-credentials to include them).'
fi

if [[ $DRY_RUN -eq 0 && $SKIP_CONFIRMATION -eq 0 ]]; then
  confirm_copy
fi

copied_count=0
copied_credential_count=0
for ((target_index = 0; target_index < ${#TARGET_INDEXES[@]}; target_index += 1)); do
  target_profile_index="${TARGET_INDEXES[$target_index]}"
  target_profile_name="${TARGET_NAMES[$target_index]}"
  for platform in "${PLATFORM_LIST[@]}"; do
    if [[ $DRY_RUN -eq 0 ]]; then
      settings_to_push="${SOURCE_SETTINGS[$platform]}"
      if [[ $COPY_CREDENTIALS -eq 0 ]]; then
        get_profile_settings "$TARGET_TOKEN" "$target_profile_index" "$platform"
        target_current_settings="$SETTINGS_JSON"
        settings_to_push="$(prepare_settings_for_copy "${SOURCE_SETTINGS[$platform]}" "$target_current_settings")"
      fi
      push_profile_settings "$TARGET_TOKEN" "$target_profile_index" "$platform" "$settings_to_push"
      get_profile_settings "$TARGET_TOKEN" "$target_profile_index" "$platform"
      source_canonical="$(jq -cS . <<<"$settings_to_push")"
      target_canonical="$(jq -cS . <<<"$SETTINGS_JSON")"
      [[ "$source_canonical" == "$target_canonical" ]] || die "Verification failed for ${target_profile_name} (profile ${target_profile_index}, ${platform})."
    fi
    copied_count=$((copied_count + 1))
  done

  if [[ "$source_provider_credential_count" -gt 0 ]]; then
    if [[ $DRY_RUN -eq 0 ]]; then
      push_provider_credentials "$TARGET_TOKEN" "$target_profile_index" "$SOURCE_PROVIDER_CREDENTIALS_JSON"
      get_provider_credentials "$TARGET_TOKEN" "$target_profile_index"
      provider_credentials_match "$SOURCE_PROVIDER_CREDENTIALS_JSON" "$PROVIDER_CREDENTIALS_JSON" || die "Verification failed for ${target_profile_name} (profile ${target_profile_index}, connected-service credentials)."
    fi
    copied_credential_count=$((copied_credential_count + source_provider_credential_count))
  fi
done

if [[ $COPY_CREDENTIALS -eq 1 ]]; then
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "Would copy ${copied_count} setting set(s) and ${copied_credential_count} connected-service credential set(s) successfully."
  else
    echo "Copied ${copied_count} setting set(s) and ${copied_credential_count} connected-service credential set(s) successfully."
  fi
elif [[ $DRY_RUN -eq 1 ]]; then
  echo "Would copy ${copied_count} setting set(s) successfully; connected-service credentials were excluded."
else
  echo "Copied ${copied_count} setting set(s) successfully; connected-service credentials were excluded."
fi

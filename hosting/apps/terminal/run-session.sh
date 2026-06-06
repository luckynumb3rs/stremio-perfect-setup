#!/usr/bin/env bash
set -Eeuo pipefail

# Per-session isolation: each browser connection gets its own tmpfs workspace
SESSION_ID="$(openssl rand -hex 8)"
SESSION_DIR="/tmp/session-${SESSION_ID}"
mkdir -p "${SESSION_DIR}"

# Workspace directories
export HOME="${SESSION_DIR}"
SSH_DIR="${SESSION_DIR}/.ssh"
mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"

# Hard timeout: kill the session after SESSION_TIMEOUT_SECONDS (default 30 min)
TIMEOUT="${SESSION_TIMEOUT_SECONDS:-1800}"
(
  sleep "${TIMEOUT}"
  echo ""
  echo "Session timeout reached ($(( TIMEOUT / 60 )) minutes). Closing."
  kill -TERM -- -$$ 2>/dev/null || true
) &
TIMEOUT_PID=$!

# EXIT trap: unconditionally remove all session data, kill timeout process
trap "kill '${TIMEOUT_PID}' 2>/dev/null || true; rm -rf '${SESSION_DIR}'" EXIT

# Clone the hosting source into the session workspace
# Use sparse clone to fetch only the hosting/ directory (faster than full clone)
WORK_DIR="${SESSION_DIR}/hosting"
git clone --depth 1 --filter=blob:none --sparse \
  "https://github.com/${GIT_REPO_OWNER:-ssterjo}/stremio-perfect-setup.git" \
  "${WORK_DIR}" 2>&1 | grep -v "^Cloning into\|^Receiving objects" || true
cd "${WORK_DIR}"
git sparse-checkout set hosting 2>&1 | grep -v "^Updating files" || true

# Copy hosting contents up one level (sparse clone puts them nested)
if [[ -d hosting ]]; then
  mv hosting/* .
  rmdir hosting
fi

# Run main.sh in the session context
# --local tells main.sh to configure the local machine (not a VPS)
# The setup then SSHes to the user's actual VPS to continue
exec ./main.sh --local

#!/usr/bin/env bash
#
# Local full-site test runner for the Stremio/Nuvio Perfect Setup repo.
#
# What this script does:
# 1. Generates guide stats data for local builds.
#    If GA4 env vars are missing, the stats script falls back to baseline-only data.
# 2. Prepares a temporary Jekyll source with README.md promoted to the homepage.
# 3. Builds the Jekyll guide into ./_site.
# 4. Builds the React/Vite wizard from ./wizard/web.
# 5. Copies the built wizard into ./_site/wizard to match the GitHub Pages layout.
# 6. Serves ./_site over a local static HTTP server.
#
# Usage:
#   scripts/local-serve.sh
#
# Optional environment variables:
#   HOST=127.0.0.1        Bind address for the local server. Default: 127.0.0.1
#   PORT=8000             Port for the local server. Default: 8000
#   SKIP_NPM_INSTALL=1    Skip automatic `npm ci` when wizard/web/node_modules is missing
#
# What to open after startup:
#   Guide root:   http://127.0.0.1:8000/
#   Wizard root:  http://127.0.0.1:8000/wizard/
#
# Notes:
# - This script serves the already-built static output. It does not watch for file changes.
#   Re-run it after edits if you want a fresh build.
# - This script expects `jekyll`, `node`, `npm`, and `python3` to be installed locally.
# - For fast wizard-only iteration, use:
#     cd wizard/web && npm run dev

set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
SKIP_NPM_INSTALL="${SKIP_NPM_INSTALL:-0}"

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SITE_DIR="${REPO_ROOT}/_site"
WIZARD_WEB_DIR="${REPO_ROOT}/wizard/web"
STAGED_SOURCE_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${STAGED_SOURCE_DIR}"
}

trap cleanup EXIT

usage() {
  sed -n '2,34p' "$0"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_cmd python3
require_cmd node
require_cmd npm
require_cmd jekyll

echo "==> Building guide stats"
python3 "${REPO_ROOT}/scripts/build-guide-stats.py"

echo "==> Preparing staged site source"
"${REPO_ROOT}/scripts/prepare-site-source.sh" "${STAGED_SOURCE_DIR}"

echo "==> Building guide with Jekyll"
rm -rf "${SITE_DIR}"
jekyll build --source "${STAGED_SOURCE_DIR}" --destination "${SITE_DIR}"

if [[ ! -d "${WIZARD_WEB_DIR}/node_modules" && "${SKIP_NPM_INSTALL}" != "1" ]]; then
  echo "==> Installing wizard dependencies"
  (
    cd "${WIZARD_WEB_DIR}"
    npm ci
  )
fi

echo "==> Building wizard"
(
  cd "${WIZARD_WEB_DIR}"
  npm run build
)

echo "==> Copying wizard into site output"
mkdir -p "${SITE_DIR}/wizard"
cp -r "${WIZARD_WEB_DIR}/dist/." "${SITE_DIR}/wizard/"

echo
echo "Full site is ready."
echo "Guide:  http://${HOST}:${PORT}/"
echo "Wizard: http://${HOST}:${PORT}/wizard/"
echo
echo "Press Ctrl+C to stop the server."
exec python3 -m http.server "${PORT}" --bind "${HOST}" --directory "${SITE_DIR}"

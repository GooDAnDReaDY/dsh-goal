#!/usr/bin/env bash
# ==============================================================================
# deploy.sh — Production deployment & verification runner for @goodandready/dsh-goal
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-verify}"
ARG_VERSION="${2:-}"
ARG_PROFILE="${3:-web}"

PACKAGE_NAME="@goodandready/dsh-goal"
PORT="${DSH_PORT:-3080}"
PROFILE="${ARG_PROFILE:-web}"
SERVICE_NAME="dsh-${PROFILE}.service"

# Environment paths for MiniAI
export PATH="/home/vadim/.nvm/versions/node/v24.15.0/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export HOME="${HOME:-/home/vadim}"
export DSH_HOME="${DSH_HOME:-/home/vadim/.dsh}"

case "$MODE" in
  check)
    echo "==> Running test suite..."
    NODE_ENV=test node --test test/*.test.mjs

    echo "==> Running preflight verification..."
    PREFLIGHT_SCRIPT="/home/vadim/.dsh/skills/dsh-plugin-preflight/scripts/preflight.sh"
    if [ -f "$PREFLIGHT_SCRIPT" ]; then
      bash "$PREFLIGHT_SCRIPT" .
    fi

    echo "==> Checking git working tree cleanliness..."
    if ! git diff-index --quiet HEAD --; then
      echo "WARN: Working directory has uncommitted changes"
    else
      echo "OK: Git working tree is clean"
    fi
    echo "==> Check passed."
    ;;

  install)
    VERSION="${ARG_VERSION:-$(node -p 'require("./package.json").version')}"
    echo "==> Deploying ${PACKAGE_NAME}@${VERSION} to DSH profile '${PROFILE}'..."

    dsh plugin --profile "${PROFILE}" add "${PACKAGE_NAME}@${VERSION}"

    if command -v systemctl >/dev/null 2>&1; then
      echo "==> Restarting ${SERVICE_NAME}..."
      sudo systemctl restart "${SERVICE_NAME}"
    fi

    sleep 3
    "$0" verify "$PROFILE"
    ;;

  verify)
    echo "==> Verifying ${PACKAGE_NAME} on http://127.0.0.1:${PORT}..."

    # 1. Check systemd unit if running locally
    if command -v systemctl >/dev/null 2>&1; then
      if systemctl is-active --quiet "${SERVICE_NAME}"; then
        echo "OK: ${SERVICE_NAME} is active (running)"
      else
        echo "WARN: ${SERVICE_NAME} is not running"
      fi
    fi

    # 2. Check updater endpoint
    echo "==> Checking /api/dsh-goal/update..."
    UPDATE_PAYLOAD=$(curl -fsS "http://127.0.0.1:${PORT}/api/dsh-goal/update" 2>/dev/null || true)
    if [ -n "$UPDATE_PAYLOAD" ] && echo "$UPDATE_PAYLOAD" | grep -q '"packageName":"@goodandready/dsh-goal"'; then
      echo "OK: Updater endpoint returned valid payload: $UPDATE_PAYLOAD"
    else
      echo "ERROR: Updater endpoint check failed: $UPDATE_PAYLOAD" >&2
      exit 1
    fi

    # 3. Check SSE events stream
    echo "==> Checking /dsh-goal/events stream..."
    SSE_SAMPLE=$(curl -s --max-time 2 -H "Origin: http://127.0.0.1:${PORT}" "http://127.0.0.1:${PORT}/dsh-goal/events" 2>/dev/null || true)
    if [ -n "$SSE_SAMPLE" ] && echo "$SSE_SAMPLE" | grep -q 'data:'; then
      echo "OK: SSE events endpoint streaming successfully"
    else
      echo "WARN: SSE events endpoint did not stream within timeout"
    fi

    echo "==> Verification completed successfully."
    ;;

  *)
    echo "Usage: $0 {check|install [version] [profile]|verify [profile]}" >&2
    exit 1
    ;;
esac

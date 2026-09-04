#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PORT=${KPI_QA_PORT:-8777}
NODE_BIN=${NODE_BIN:-node}
RUNTIME_ROOT=${CODEX_RUNTIME_ROOT:-/Users/laibaihan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node}

if ! "$NODE_BIN" -e "require('playwright')" >/dev/null 2>&1 && [ -x "$RUNTIME_ROOT/bin/node" ]; then
  NODE_BIN="$RUNTIME_ROOT/bin/node"
  export NODE_PATH="$RUNTIME_ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"
fi

cd "$ROOT"

"$NODE_BIN" --check review/anqin-v2/app.js
"$NODE_BIN" --check review/talent-v2/app.js
"$NODE_BIN" --check review/admin-marketing-v1/app.js
"$NODE_BIN" tests/api-transport.test.cjs
"$NODE_BIN" tests/anqin-task-ui.test.cjs
"$NODE_BIN" tests/talent-rules.test.cjs
"$NODE_BIN" tests/admin-marketing-rules.test.cjs
"$NODE_BIN" tests/production-integrity.test.cjs

python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/kpi-release-gate-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" >/dev/null 2>&1 || true' EXIT INT TERM
sleep 1

KPI_QA_BASE_URL="http://127.0.0.1:$PORT" "$NODE_BIN" tests/release-e2e.cjs

echo "Local release gate passed. Deploy, then run the five-item production delivery check before announcing completion."

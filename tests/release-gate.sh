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
"$NODE_BIN" --check shared/local-drafts.js
"$NODE_BIN" tests/api-transport.test.cjs
"$NODE_BIN" tests/api-pending-persistence.test.cjs
"$NODE_BIN" tests/api-auth-recovery.test.cjs
"$NODE_BIN" tests/mutation-receipts.test.cjs
"$NODE_BIN" tests/backend-receipt-safety-20260916.test.cjs
"$NODE_BIN" tests/backend-text-safety-20260916.test.cjs
"$NODE_BIN" tests/write-throughput.test.cjs
"$NODE_BIN" tests/spreadsheet-handle.test.cjs
"$NODE_BIN" tests/drive-viewer-identity.test.cjs
"$NODE_BIN" tests/staging/cloud-diagnostics.test.cjs
"$NODE_BIN" tests/session-continuity.test.cjs
"$NODE_BIN" tests/push-resilience.test.cjs
"$NODE_BIN" tests/icon-catalog.test.cjs
"$NODE_BIN" tests/anqin-lateness-score.test.cjs
"$NODE_BIN" tests/anqin-september-bonus-score.test.cjs
"$NODE_BIN" tests/anqin-evaluation-load-race.test.cjs
"$NODE_BIN" tests/evaluation-year-month-normalization.test.cjs
"$NODE_BIN" tests/anqin-task-ui.test.cjs
"$NODE_BIN" tests/anqin-manager-month.test.cjs
"$NODE_BIN" tests/anqin-photo-batch.test.cjs
"$NODE_BIN" tests/anqin-course-record.test.cjs
"$NODE_BIN" tests/anqin-course-record-backend.test.cjs
"$NODE_BIN" tests/course-record-editor-delivery.test.cjs
"$NODE_BIN" tests/anqin-summary-state.test.cjs
"$NODE_BIN" tests/anqin-storage-warning.test.cjs
"$NODE_BIN" tests/anqin-local-media.test.cjs
"$NODE_BIN" tests/submitted-state-regressions.test.cjs
"$NODE_BIN" tests/anqin-submit-recovery.test.cjs
"$NODE_BIN" tests/talent-rules.test.cjs
"$NODE_BIN" tests/talent-approval-rubric.test.cjs
"$NODE_BIN" tests/admin-marketing-rules.test.cjs
"$NODE_BIN" tests/secondary-save-safety.test.cjs
"$NODE_BIN" tests/local-drafts.test.cjs
"$NODE_BIN" tests/class-roster-rules.test.cjs
"$NODE_BIN" tests/teacher-roster-access.test.cjs
"$NODE_BIN" tests/roster-time.test.cjs
"$NODE_BIN" tests/system-logic-audit.test.cjs
"$NODE_BIN" tests/production-integrity.test.cjs
"$NODE_BIN" tests/reliability-regressions.test.cjs
"$NODE_BIN" tests/reliability-secondary.test.cjs
"$NODE_BIN" tests/weekend-policy.test.cjs
"$NODE_BIN" tests/legacy-attachment-delivery.test.cjs
"$NODE_BIN" scripts/bundle-apps-script.cjs --check
"$NODE_BIN" tests/staging/build-media-fixtures.cjs
"$NODE_BIN" tests/staging/build-isolated.cjs
"$NODE_BIN" tests/staging/isolation.test.cjs

python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/kpi-release-gate-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" >/dev/null 2>&1 || true' EXIT INT TERM
sleep 1

KPI_QA_BASE_URL="http://127.0.0.1:$PORT" "$NODE_BIN" tests/release-e2e.cjs
KPI_QA_BASE_URL="http://127.0.0.1:$PORT" "$NODE_BIN" tests/teacher-roster-e2e.cjs
KPI_QA_BASE_URL="http://127.0.0.1:$PORT" "$NODE_BIN" tests/system-logic-ui-e2e.cjs
"$NODE_BIN" tests/upload-resilience-e2e.cjs
"$NODE_BIN" tests/anqin-local-media-e2e.cjs
"$NODE_BIN" tests/anqin-course-record-e2e.cjs
"$NODE_BIN" tests/workspace-draft-recovery-e2e.cjs
"$NODE_BIN" tests/controlled-50-e2e.cjs

echo "Local gate passed only. Candidate Google, real-device, concurrency and observation gates still require separate evidence before production deployment."

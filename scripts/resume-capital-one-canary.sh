#!/bin/zsh
set -euo pipefail

RUNTIME_ROOT="/Users/tomasnieves/Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter"
PORT=3210
BASE_URL="http://127.0.0.1:${PORT}"

cd "$RUNTIME_ROOT"

echo "== Freeing port ${PORT} if a stale server is still listening =="
lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | xargs -r kill || true
sleep 1

echo "== Building the app =="
npm run build

echo "== Starting local Career OS API on ${BASE_URL} =="
mkdir -p .career-os-browser-worker
APP_BASE_URL="$BASE_URL" NEXT_PUBLIC_BASE_URL="$BASE_URL" \
  nohup npm run start -- --hostname 127.0.0.1 --port "$PORT" \
  > .career-os-browser-worker/local-api-${PORT}.log 2>&1 &
SERVER_PID=$!
echo "server pid: ${SERVER_PID}"

echo "== Waiting for local API to become ready =="
for attempt in $(seq 1 60); do
  if curl --fail --silent "${BASE_URL}/api/career-os/health" >/dev/null 2>&1; then
    echo "Local Career OS API ready at ${BASE_URL}"
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Local Career OS API exited before becoming ready. Last log lines:"
    tail -n 80 ".career-os-browser-worker/local-api-${PORT}.log" || true
    exit 1
  fi
  sleep 1
done

echo "== worker:health =="
npm run worker:health

echo "== Attempting the Capital One Workday canary claim (single attempt, no submit without CAREER_OS_WORKDAY_SUBMIT_APPROVAL) =="
node ./scripts/career-os-browser-companion.mjs run-once

echo "== worker:health (post-run) =="
npm run worker:health

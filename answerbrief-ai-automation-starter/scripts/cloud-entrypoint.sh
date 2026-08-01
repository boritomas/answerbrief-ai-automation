#!/usr/bin/env bash
set -euo pipefail

mkdir -p .career-os-browser-worker .career-os-debug career-os-state career-os-applications data

cleanup() {
  if [[ -n "${WEB_PID:-}" ]]; then kill "$WEB_PID" 2>/dev/null || true; fi
  if [[ -n "${WORKER_PID:-}" ]]; then kill "$WORKER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

npm start -- -p "${PORT:-3000}" &
WEB_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/career-os/worker/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

npm run worker:start &
WORKER_PID=$!

wait -n "$WEB_PID" "$WORKER_PID"

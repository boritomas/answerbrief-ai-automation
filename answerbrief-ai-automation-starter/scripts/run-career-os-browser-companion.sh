#!/bin/zsh
set -euo pipefail

RUNTIME_ROOT="/Users/tomasnieves/Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter"

cd "$RUNTIME_ROOT"

if [[ -f ".env.local" ]]; then
  set -a
  source ".env.local"
  set +a
fi

exec /usr/local/bin/node ./scripts/career-os-browser-companion.mjs start

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${1:-$ROOT/dist/answerbrief-career-os-cloud-$STAMP}"
ARCHIVE="$OUT.tar.gz"

rm -rf "$OUT" "$ARCHIVE"
mkdir -p "$OUT/app" "$OUT/state"

rsync -a "$ROOT/" "$OUT/app/" \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env.local' \
  --exclude '.env.cloud' \
  --exclude '.vercel' \
  --exclude '.career-os-runtime-backups' \
  --exclude '.runtime-backups'

for path in .career-os-browser-worker .career-os-debug career-os-state career-os-applications data; do
  if [[ -e "$ROOT/$path" ]]; then
    rsync -a "$ROOT/$path" "$OUT/state/"
  fi
done

cp "$ROOT/.env.cloud.example" "$OUT/.env.cloud.example"
cat > "$OUT/README-FIRST.txt" <<'EOF'
ANSWERBRIEF CAREER OS CLOUD TRANSFER

1. Copy this archive to the cloud host.
2. Extract it.
3. cd app
4. cp ../.env.cloud.example .env.cloud
5. Populate .env.cloud from your password manager/current .env.local. Do not upload secrets publicly.
6. Restore state folders from ../state into app if needed.
7. Run: docker compose -f docker-compose.cloud.yml up -d --build
8. Verify: curl -fsS http://localhost:3000/api/career-os/worker/health

The archive deliberately excludes .env.local, Git metadata, node_modules, build output, and Vercel metadata.
EOF

tar -czf "$ARCHIVE" -C "$(dirname "$OUT")" "$(basename "$OUT")"
printf '%s\n' "$ARCHIVE"

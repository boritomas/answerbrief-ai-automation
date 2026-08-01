#!/usr/bin/env bash
set -euo pipefail

ROOT="${CAREER_OS_RUNTIME:-/Users/tomasnieves/Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter}"
LABEL="com.nieveslabs.careeros-mcp"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
STATE="$ROOT/.career-os-control"
ENV_FILE="$STATE/control-plane.env"
LOG_DIR="$STATE/logs"
PORT="${CAREER_OS_MCP_PORT:-4318}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer requires macOS." >&2
  exit 1
fi

mkdir -p "$STATE" "$LOG_DIR" "$HOME/Library/LaunchAgents"
chmod 700 "$STATE" "$LOG_DIR"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Opening the installer page."
  open "https://brew.sh"
  exit 2
fi

brew list node >/dev/null 2>&1 || brew install node
brew list tailscale >/dev/null 2>&1 || brew install tailscale

cd "$ROOT"
npm install

TOKEN=""
if [[ -f "$ENV_FILE" ]]; then
  TOKEN="$(awk -F= '/^CAREER_OS_MCP_TOKEN=/{print substr($0,index($0,"=")+1)}' "$ENV_FILE" | tail -1)"
fi
if [[ ${#TOKEN} -lt 32 ]]; then
  TOKEN="$(openssl rand -hex 32)"
fi
cat > "$ENV_FILE" <<EOF
CAREER_OS_MCP_TOKEN=$TOKEN
CAREER_OS_MCP_HOST=127.0.0.1
CAREER_OS_MCP_PORT=$PORT
EOF
chmod 600 "$ENV_FILE"

NODE_BIN="$(command -v node)"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>set -a; source '$ENV_FILE'; set +a; cd '$ROOT'; exec '$NODE_BIN' ./scripts/career-os-mcp-server.mjs</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StandardOutPath</key><string>$LOG_DIR/mcp.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/mcp.err.log</string>
  <key>ProcessType</key><string>Background</string>
  <key>ThrottleInterval</key><integer>10</integer>
</dict>
</plist>
EOF
chmod 600 "$PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null

if ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale authentication is required. A browser may open."
  tailscale up
fi

echo "Enabling secure public HTTPS Funnel for the MCP endpoint."
tailscale funnel --bg "$PORT"
FUNNEL_URL="$(tailscale funnel status --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(iter(d.get("Web",{}).keys()),""))' 2>/dev/null || true)"
if [[ -z "$FUNNEL_URL" ]]; then
  FUNNEL_URL="$(tailscale status --json | python3 -c 'import json,sys; d=json.load(sys.stdin); name=d.get("Self",{}).get("DNSName","").rstrip("."); print("https://"+name if name else "")')"
fi

cat > "$HOME/Desktop/CareerOS-Control-Plane.txt" <<EOF
CareerOS MCP control plane is running.

MCP URL: ${FUNNEL_URL%/}/mcp
Authorization header: Bearer $TOKEN

Keep this file private. It grants access only to the restricted CareerOS tools defined in the MCP server.
EOF
chmod 600 "$HOME/Desktop/CareerOS-Control-Plane.txt"

echo "Control plane installed. Connection details saved to Desktop/CareerOS-Control-Plane.txt"

#!/bin/bash
set -euo pipefail

RUNTIME="/Users/tomasnieves/Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter"
LOG="$HOME/Desktop/career-os-runner-install.log"

exec > >(tee -a "$LOG") 2>&1

echo "Career OS control-plane setup started: $(date)"

if [[ ! -d "$RUNTIME/.git" ]]; then
  echo "Career OS runtime was not found at:"
  echo "$RUNTIME"
  read -r -p "Press Return to close."
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required for the local open-source toolchain."
  open "https://brew.sh"
  read -r -p "Install Homebrew, then double-click this file again. Press Return to close."
  exit 2
fi

cd "$RUNTIME"
git fetch origin main
git checkout main
git merge --ff-only origin/main

if ! command -v gh >/dev/null 2>&1; then
  brew install gh
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub authentication is required. Your browser will open."
  gh auth login --hostname github.com --git-protocol https --web
fi

if ! command -v node >/dev/null 2>&1; then
  brew install node
fi

if command -v openhands >/dev/null 2>&1; then
  echo "Using existing OpenHands installation: $(command -v openhands)"
  openhands --version || true
else
  echo "OpenHands is not available on PATH. The existing uv installation may need its bin directory added to PATH."
fi

if ! command -v gemini >/dev/null 2>&1; then
  echo "Installing Gemini CLI as the first fallback repair engine..."
  npm install -g @google/gemini-cli@latest
fi

if ! command -v opencode >/dev/null 2>&1; then
  echo "Installing OpenCode as the second fallback repair engine..."
  brew install anomalyco/tap/opencode || brew install opencode || true
fi

if ! command -v aider >/dev/null 2>&1; then
  echo "Installing Aider as the third fallback repair engine..."
  python3 -m pip install --user aider-install >/dev/null 2>&1 || true
  if command -v aider-install >/dev/null 2>&1; then
    aider-install || true
  else
    curl -LsSf https://aider.chat/install.sh | sh || true
  fi
fi

chmod +x scripts/bootstrap-career-os-mac-runner.sh
chmod +x scripts/install-career-os-control-plane.sh
chmod +x scripts/career-os-autonomous-supervisor.mjs
chmod +x scripts/career-os-mcp-server.mjs
chmod +x scripts/manage-openhands-service.mjs

bash scripts/bootstrap-career-os-mac-runner.sh
bash scripts/install-career-os-control-plane.sh

if command -v openhands >/dev/null 2>&1; then
  echo "Ensuring OpenHands GUI service is available on localhost:3000..."
  node scripts/manage-openhands-service.mjs start || node scripts/manage-openhands-service.mjs status || true
fi

mkdir -p "$HOME/.career-os"
{
  echo "installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "runtime=$RUNTIME"
  echo "github_cli=$(command -v gh || true)"
  echo "openhands=$(command -v openhands || true)"
  echo "openhands_url=http://127.0.0.1:3000"
  echo "gemini=$(command -v gemini || true)"
  echo "opencode=$(command -v opencode || true)"
  echo "aider=$(command -v aider || true)"
  echo "mcp_details=$HOME/Desktop/CareerOS-Control-Plane.txt"
} > "$HOME/.career-os/control-plane.env"
chmod 600 "$HOME/.career-os/control-plane.env"

echo "Installed repair providers:"
for tool in openhands gemini opencode aider; do
  if command -v "$tool" >/dev/null 2>&1; then
    "$tool" --version 2>/dev/null | head -n 1 || command -v "$tool"
  else
    echo "$tool: not installed"
  fi
done

node scripts/manage-openhands-service.mjs status || true

echo "Triggering the bounded Career OS production supervisor..."
gh workflow run career-os-mac-production.yml --repo boritomas/answerbrief-ai-automation -f run_canary=true

echo
echo "Control-plane installation and production dispatch completed."
echo "OpenHands is the primary local repair engine."
echo "MCP connection details are stored privately on your Desktop in CareerOS-Control-Plane.txt."
echo "Log saved to: $LOG"
read -r -p "Press Return to close."

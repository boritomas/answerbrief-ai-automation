#!/bin/bash
set -euo pipefail

RUNTIME="/Users/tomasnieves/Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter"
LOG="$HOME/Desktop/career-os-runner-install.log"

exec > >(tee -a "$LOG") 2>&1

echo "Career OS runner setup started: $(date)"

if [[ ! -d "$RUNTIME/.git" ]]; then
  echo "Career OS runtime was not found at:"
  echo "$RUNTIME"
  read -r -p "Press Return to close."
  exit 1
fi

cd "$RUNTIME"

git fetch origin main
git checkout main
git merge --ff-only origin/main

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is not installed. Installing with Homebrew..."
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is required but is not installed."
    open "https://brew.sh"
    read -r -p "Install Homebrew, then double-click this file again. Press Return to close."
    exit 2
  fi
  brew install gh
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub authentication is required. Your browser will open."
  gh auth login --hostname github.com --git-protocol https --web
fi

chmod +x scripts/bootstrap-career-os-mac-runner.sh
bash scripts/bootstrap-career-os-mac-runner.sh

echo "Triggering the Career OS production canary..."
gh workflow run career-os-mac-production.yml --repo boritomas/answerbrief-ai-automation -f run_canary=true

echo
echo "Runner installation and production canary dispatch completed."
echo "Log saved to: $LOG"
read -r -p "Press Return to close."

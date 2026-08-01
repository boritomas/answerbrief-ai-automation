#!/usr/bin/env bash
set -euo pipefail

REPO_SLUG="${CAREER_OS_RUNNER_REPO_SLUG:-boritomas/answerbrief-ai-automation}"
REPO_URL="${CAREER_OS_RUNNER_REPO_URL:-https://github.com/${REPO_SLUG}}"
RUNNER_DIR="${CAREER_OS_RUNNER_DIR:-$HOME/actions-runner-career-os}"
RUNNER_NAME="${CAREER_OS_RUNNER_NAME:-career-os-mac-$(scutil --get LocalHostName 2>/dev/null || hostname)}"
RUNNER_LABELS="${CAREER_OS_RUNNER_LABELS:-career-os}"
RUNNER_VERSION="${CAREER_OS_RUNNER_VERSION:-2.336.0}"
RUNNER_TOKEN="${CAREER_OS_RUNNER_TOKEN:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This bootstrap must run on macOS." >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) PACKAGE_ARCH="arm64" ;;
  x86_64) PACKAGE_ARCH="x64" ;;
  *) echo "Unsupported Mac architecture: $ARCH" >&2; exit 1 ;;
esac

if [[ -z "$RUNNER_TOKEN" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "GitHub CLI is required when CAREER_OS_RUNNER_TOKEN is not supplied." >&2
    echo "Install it with: brew install gh" >&2
    exit 2
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
    exit 2
  fi
  RUNNER_TOKEN="$(gh api --method POST "repos/${REPO_SLUG}/actions/runners/registration-token" --jq .token)"
fi

if [[ -z "$RUNNER_TOKEN" ]]; then
  echo "Unable to obtain a GitHub runner registration token." >&2
  exit 2
fi

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

PACKAGE="actions-runner-osx-${PACKAGE_ARCH}-${RUNNER_VERSION}.tar.gz"
URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${PACKAGE}"

if [[ ! -x ./config.sh ]]; then
  curl -fL --retry 3 --retry-delay 2 -o "$PACKAGE" "$URL"
  tar xzf "$PACKAGE"
  rm -f "$PACKAGE"
fi

if [[ -f .runner ]]; then
  echo "Runner is already configured in $RUNNER_DIR."
else
  ./config.sh \
    --unattended \
    --replace \
    --url "$REPO_URL" \
    --token "$RUNNER_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work "_work"
fi

./svc.sh install || true
./svc.sh start
./svc.sh status

echo "Career OS runner installed and started: $RUNNER_NAME"

# Career OS Autonomous Developer Layer

Build 27 adds a provider-neutral developer-agent contract with OpenHands as the preferred primary agent and Aider as the lightweight secondary agent.

## Preflight requirement

An agent must verify that it can write files, create a branch, commit, push, open a pull request, trigger CI, and inspect CI. If any capability is unavailable, it must stop and report a hard blocker. Planning output is not implementation evidence.

## Providers

- OpenHands: full implementation tasks and repository-scale changes.
- Aider: focused fixes, refactors, and documentation updates.
- Codex and Claude Code: supported through the same abstraction when configured.

## Security

Never commit tokens or model credentials. Supply secrets through the local environment or GitHub Actions secrets. Human approval remains mandatory before merge.

## Operating loop

1. Run capability preflight.
2. Create an isolated feature branch.
3. Implement the approved issue only.
4. Run typecheck, lint, tests, and build.
5. Open a pull request.
6. Use GitHub Actions as the validation source of truth.
7. Repair failures on the same branch.
8. Wait for human approval before merge.

## Local examples

Copy `answerbrief-ai-automation-starter/config/developer-agents.example.json` outside the repository secrets boundary and configure the required environment variables.

OpenHands task example:

```sh
openhands --task "Implement GitHub issue 27 without unrelated refactoring"
```

Aider task example:

```sh
aider --yes-always --message "Fix the failing Build 27 acceptance test"
```

# Career OS production isolation

## Incident this fixes

On 2026-08-05, edits made during an interactive Claude Code session in the
shared runtime directory
(`/Users/tomasnieves/Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter`)
appeared on `main` before that session ever ran `git add`, `git commit`, or
`git push` itself. Investigation found:

- No script in this repository performs `git add`/`git commit`/`git push`
  (confirmed by exhaustive `grep`).
- `.github/workflows/career-os-mac-production.yml`'s `production-canary`
  job (self-hosted Mac runner, triggered on every push to `main`) runs
  `npm run supervisor` (`scripts/career-os-autonomous-supervisor.mjs`),
  which on detecting a production defect shells out via
  `scripts/answerbrief-executor.mjs` to an external, fully autonomous
  coding-agent CLI (`ANSWERBRIEF_EXECUTOR_PROVIDER_ORDER=openhands,gemini,
  opencode,aider,claude-code,codex`).
- That external tool -- not code in this repository -- is what actually
  runs `git commit`/`git push`. It was invoked with `cwd: process.cwd()`,
  which under the workflow's own env is the **same persistent runtime
  directory** an interactive session may be editing live
  (`CAREER_OS_RUNTIME` in that workflow).
- `main` had **no branch protection** at all, so a direct push from that
  agent (or from anyone) succeeded silently, with no PR and no review.
- `scripts/lib/career-os-developer-agent.mjs`'s `requireHumanMerge` /
  `branchPrefix` / `repository` config fields were computed but never
  actually passed to the invoked CLI in any form (`buildProviderCommand`
  only ever sent the raw task text) -- so "require human merge" was purely
  decorative and enforced nothing.

Net effect: an autonomous agent with full shell access, operating in a
directory a human might also be editing, could commit and push anything --
including a human's unrelated in-progress work swept up by a broad
`git add` -- straight to an unprotected `main`.

## Fix: two independent, load-bearing controls

Neither control alone is sufficient; both are required.

### 1. Filesystem isolation (`scripts/lib/career-os-isolated-worktree.mjs`)

Every autonomous-repair attempt now gets its own disposable, from-scratch
`git clone` of `origin/main`, on its own freshly generated
`auto-repair/<timestamp>-<task-slug>-<nonce>` branch, in a directory the
executor controls (`ANSWERBRIEF_EXECUTOR_WORKTREE_ROOT`, defaulting to
`$RUNNER_TEMP/career-os-auto-repair` in CI or
`~/.career-os-auto-repair/worktrees` locally -- never the shared runtime
directory). The invoked provider CLI's `cwd` is this isolated clone, not
`process.cwd()`. It has no visibility into any other directory on disk.

`scripts/answerbrief-executor.mjs` itself -- not the provider CLI -- now
owns every git-affecting step after the agent runs:

1. Check whether the isolated clone has any uncommitted changes at all
   (`hasUncommittedChanges`). If not: report `no_changes` and stop -- no
   commit, no push, no PR.
2. Run the validate command (`typecheck && lint && test && build`) inside
   the isolated clone.
3. `commitIsolatedChanges` -- stage and commit inside the isolated clone.
4. `pushIsolatedBranch` -- push only the `auto-repair/*` branch, never
   `main`.
5. `openIsolatedPullRequest` -- open a PR from that branch. Auto-merge is
   never invoked anywhere in this flow (`ANSWERBRIEF_EXECUTOR_AUTO_MERGE`
   defaults to disabled, and merging is simply not something this code
   path does).
6. `cleanupIsolatedWorktree` -- remove the isolated clone afterward
   (skippable via `ANSWERBRIEF_EXECUTOR_KEEP_WORKTREE=1` for debugging).

`assertNotProtectedBranch()` is called before every push and every PR
creation as a defense-in-depth guard -- even if a future bug generated a
bad branch name, this throws before any git/`gh` command runs.

### 2. Branch protection on `main` (GitHub-enforced, not local)

Filesystem isolation stops an agent from ever seeing unrelated files, but
it cannot stop a *deliberate* `git push origin HEAD:main` from inside the
isolated clone -- that guarantee has to come from the remote, not from
trusting any local script. `main` now has:

- `required_pull_request_reviews` present (any presence of this block
  requires all changes go through a PR; `required_approving_review_count`
  is `0` since this is currently a single-maintainer repository -- the
  requirement is "go through a PR", not "get a second approver").
- `enforce_admins: true` -- applies to every actor, including repo admins
  and any token with admin-equivalent access. No bypass.
- `required_status_checks`: the `validate` check (Career OS PR Validation)
  must pass, `strict: true` (branch must be up to date with `main`).
- `allow_force_pushes: false`, `allow_deletions: false`.

This was verified empirically, not just configured: a real commit pushed
directly at `main` from a fresh clone was rejected by GitHub with
`GH006: Protected branch update failed ... Changes must be made through a
pull request.` No autonomous process, tool, or human can push directly to
`main` anymore, full stop.

## What changed

| File | Change |
| --- | --- |
| `scripts/lib/career-os-isolated-worktree.mjs` | New. Clone/branch/commit/push/PR/cleanup primitives, all branch-name-guarded. |
| `scripts/answerbrief-executor.mjs` | Provider CLI now runs inside an isolated clone; executor itself owns commit/push/PR, not the provider. |
| `.github/workflows/career-os-mac-production.yml` | Documents the isolation architecture inline; adds `ANSWERBRIEF_EXECUTOR_WORKTREE_ROOT`/`ANSWERBRIEF_EXECUTOR_REPOSITORY`/`ANSWERBRIEF_EXECUTOR_AUTO_MERGE` env; `pull-requests: read` -> `write` so the workflow's own token can open PRs if the runner's `gh` auth is ever unavailable. Currently **disabled** (see below). |
| `tests/acceptance/career-os-isolated-worktree.test.mjs` | New. Proves the full clone -> edit -> commit -> push cycle against a real local git remote, proves `main` is untouched afterward, proves an unrelated sibling directory's file is never read or modified, proves the protected-branch guard throws before any git/gh call. |
| Branch protection on `main` | Configured via the GitHub API (see above); not stored in this repo. |

## Current status: both production workflows are disabled

`.github/workflows/career-os-force-now.yml` and
`.github/workflows/career-os-mac-production.yml` are both
`disabled_manually` at the GitHub level (not just paused locally) pending
this fix landing and a deliberate decision to re-enable. See the PR/report
for the recommended re-enable sequence.

## Residual risk / what this does *not* cover

- This does not change what the autonomous agent is *allowed to ask for* --
  it can still request any code change within its isolated clone. The
  control is entirely about *where the change lands* (its own branch,
  behind a PR, never `main` directly), not about reviewing the change's
  content before it becomes a PR.
- `career-os-force-now.yml` (the live Workday-submission workflow) is a
  separate concern from this fix -- it doesn't invoke the executor at all,
  it directly runs `npm run worker:run-once` against production. Disabling
  it was a separate, earlier decision; nothing in this PR re-enables it or
  changes its behavior.
- The two paused local launchd agents
  (`actions.runner.boritomas-answerbrief-ai-automation.Mac-mini-career-os`,
  `com.careeros.claude-github-bridge`) are unrelated delivery mechanisms
  (they control whether the self-hosted runner and the issue-comment bridge
  are listening at all) -- they are not what this fix addresses, and
  restoring them is a separate decision from re-enabling the two GitHub
  workflows.

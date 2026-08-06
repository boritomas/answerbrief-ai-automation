// Production isolation for the autonomous executor.
//
// Root cause this exists to fix: the executor used to invoke autonomous
// coding-agent CLIs (openhands/gemini/opencode/aider/claude-code/codex)
// directly inside process.cwd() -- which, when launched from
// career-os-mac-production.yml, is the same persistent runtime directory an
// interactive Claude Code session may be editing live. An agent's own broad
// `git add` could sweep up and push unrelated, still-in-progress edits
// straight to `main`, with no PR and no review.
//
// This module gives every autonomous-repair run its own disposable git
// clone, on its own freshly generated branch, entirely independent of
// whatever working directory the caller happens to be running in. The
// caller (scripts/answerbrief-executor.mjs) is responsible for deciding
// whether to commit/push/open a PR -- this module never merges anything and
// never pushes to a protected branch; buildAutoRepairBranchName() always
// produces an `auto-repair/...` branch name, and
// assertNotProtectedBranch() is a defense-in-depth guard called before any
// push so a bug elsewhere can't silently target `main`.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master'];

export function resolveIsolatedWorktreeRoot(env = process.env) {
  const configured = clean(env.ANSWERBRIEF_EXECUTOR_WORKTREE_ROOT);
  if (configured) return configured;
  const runnerTemp = clean(env.RUNNER_TEMP);
  if (runnerTemp) return path.join(runnerTemp, 'career-os-auto-repair');
  return path.join(os.homedir(), '.career-os-auto-repair', 'worktrees');
}

export function buildAutoRepairBranchName(task, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
  const taskSlug = slug(task).slice(0, 40) || 'task';
  const nonce = crypto.randomBytes(3).toString('hex');
  return `auto-repair/${stamp}-${taskSlug}-${nonce}`;
}

export function assertNotProtectedBranch(branchName, protectedBranches = DEFAULT_PROTECTED_BRANCHES) {
  const normalized = clean(branchName).toLowerCase();
  if (!normalized) throw new Error('Refusing to operate on an empty branch name.');
  if (protectedBranches.some((protectedBranch) => normalized === clean(protectedBranch).toLowerCase())) {
    throw new Error(`Refusing to push or open a PR against protected branch "${branchName}". Autonomous repair must always land on an auto-repair/* branch.`);
  }
}

export function prepareIsolatedWorktree(input = {}) {
  const repository = clean(input.repository);
  if (!repository) throw new Error('prepareIsolatedWorktree requires a repository (owner/name).');
  const baseBranch = clean(input.baseBranch) || 'main';
  const branchName = clean(input.branchName) || buildAutoRepairBranchName(input.task || 'auto-repair');
  assertNotProtectedBranch(branchName);
  const worktreeRoot = clean(input.worktreeRoot) || resolveIsolatedWorktreeRoot(input.env);
  const worktreePath = path.join(worktreeRoot, sanitizePathSegment(branchName));

  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.rmSync(worktreePath, { force: true, recursive: true });

  const remoteUrl = clean(input.remoteUrl) || `https://github.com/${repository}.git`;
  const clone = run(['git', 'clone', '--quiet', '--depth', '1', '--branch', baseBranch, remoteUrl, worktreePath]);
  if (!clone.ok) throw new Error(`Failed to create isolated clone: ${clone.message}`);

  const checkout = run(['git', '-C', worktreePath, 'checkout', '--quiet', '-b', branchName]);
  if (!checkout.ok) throw new Error(`Failed to create isolated branch: ${checkout.message}`);

  configureIsolatedIdentity(worktreePath, input.gitIdentity);

  return { baseBranch, branchName, remoteUrl, repository, worktreePath };
}

export function hasUncommittedChanges(worktreePath) {
  const status = run(['git', '-C', worktreePath, 'status', '--porcelain']);
  if (!status.ok) throw new Error(`Failed to read isolated worktree status: ${status.message}`);
  return status.stdout.trim().length > 0;
}

export function commitIsolatedChanges(input = {}) {
  const { worktreePath, message } = input;
  if (!hasUncommittedChanges(worktreePath)) return { committed: false };
  const add = run(['git', '-C', worktreePath, 'add', '-A']);
  if (!add.ok) throw new Error(`Failed to stage isolated changes: ${add.message}`);
  const commit = run(['git', '-C', worktreePath, 'commit', '--quiet', '-m', message || 'Autonomous repair']);
  if (!commit.ok) throw new Error(`Failed to commit isolated changes: ${commit.message}`);
  return { committed: true };
}

export function pushIsolatedBranch(input = {}) {
  const { branchName, worktreePath } = input;
  assertNotProtectedBranch(branchName, input.protectedBranches);
  const push = run(['git', '-C', worktreePath, 'push', '--quiet', 'origin', `HEAD:refs/heads/${branchName}`]);
  if (!push.ok) throw new Error(`Failed to push isolated branch: ${push.message}`);
  return { pushed: true };
}

export function openIsolatedPullRequest(input = {}) {
  const { baseBranch, body, branchName, repository, title, worktreePath } = input;
  assertNotProtectedBranch(branchName, input.protectedBranches);
  const args = [
    'pr', 'create',
    '--repo', repository,
    '--base', baseBranch || 'main',
    '--head', branchName,
    '--title', title || `Autonomous repair: ${branchName}`,
    '--body', body || 'Opened automatically by the isolated autonomous executor. Requires human review before merge -- this flow never auto-merges.',
  ];
  const pr = run(['gh', ...args], { cwd: worktreePath });
  if (!pr.ok) throw new Error(`Failed to open pull request: ${pr.message}`);
  return { ok: true, url: pr.stdout.trim() };
}

export function cleanupIsolatedWorktree(worktreePath, env = process.env) {
  if (clean(env.ANSWERBRIEF_EXECUTOR_KEEP_WORKTREE) === '1') return { removed: false };
  if (!worktreePath) return { removed: false };
  fs.rmSync(worktreePath, { force: true, recursive: true });
  return { removed: true };
}

function configureIsolatedIdentity(worktreePath, identity = {}) {
  const name = clean(identity.name) || 'career-os-autonomous-executor';
  const email = clean(identity.email) || 'career-os-autonomous-executor@users.noreply.github.com';
  run(['git', '-C', worktreePath, 'config', 'user.name', name]);
  run(['git', '-C', worktreePath, 'config', 'user.email', email]);
}

function run(command, options = {}) {
  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  if (result.error) return { ok: false, message: result.error.message, stdout: '' };
  if (result.status !== 0) {
    return { ok: false, message: clean(result.stderr) || `${binary} exited with status ${result.status}`, stdout: result.stdout || '' };
  }
  return { ok: true, message: '', stdout: result.stdout || '' };
}

function slug(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function sanitizePathSegment(value) {
  return clean(value).replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

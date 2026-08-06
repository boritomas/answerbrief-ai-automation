import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertNotProtectedBranch,
  buildAutoRepairBranchName,
  cleanupIsolatedWorktree,
  commitIsolatedChanges,
  hasUncommittedChanges,
  openIsolatedPullRequest,
  prepareIsolatedWorktree,
  pushIsolatedBranch,
  resolveIsolatedWorktreeRoot,
} from '../../scripts/lib/career-os-isolated-worktree.mjs';

// These tests exercise the production-isolation guarantee end to end
// against a real, throwaway local git remote -- not a mock -- so a
// regression here would actually be caught, not just asserted away.

test('buildAutoRepairBranchName always produces a namespaced, unique, non-protected branch name', () => {
  const first = buildAutoRepairBranchName('Fix the phone extension bug');
  const second = buildAutoRepairBranchName('Fix the phone extension bug');
  assert.match(first, /^auto-repair\//);
  assert.match(second, /^auto-repair\//);
  assert.notEqual(first, second, 'two calls for the same task must not collide');
  assert.doesNotThrow(() => assertNotProtectedBranch(first));
});

test('assertNotProtectedBranch rejects main and master (case-insensitive) and empty names', () => {
  assert.throws(() => assertNotProtectedBranch('main'), /protected branch/);
  assert.throws(() => assertNotProtectedBranch('Main'), /protected branch/);
  assert.throws(() => assertNotProtectedBranch('MASTER'), /protected branch/);
  assert.throws(() => assertNotProtectedBranch(''), /empty branch name/);
  assert.doesNotThrow(() => assertNotProtectedBranch('auto-repair/2026-08-06-fix-x'));
});

test('resolveIsolatedWorktreeRoot honors an explicit override, then RUNNER_TEMP, then falls back under the home directory', () => {
  assert.equal(
    resolveIsolatedWorktreeRoot({ ANSWERBRIEF_EXECUTOR_WORKTREE_ROOT: '/tmp/custom-root' }),
    '/tmp/custom-root',
  );
  assert.equal(
    resolveIsolatedWorktreeRoot({ RUNNER_TEMP: '/tmp/runner-temp' }),
    path.join('/tmp/runner-temp', 'career-os-auto-repair'),
  );
  const fallback = resolveIsolatedWorktreeRoot({});
  assert.ok(fallback.startsWith(os.homedir()), 'fallback must live under the home directory, not a shared runtime path');
});

test('openIsolatedPullRequest refuses to run against a protected branch before it ever shells out to gh', () => {
  assert.throws(
    () => openIsolatedPullRequest({ baseBranch: 'main', branchName: 'main', repository: 'x/y', worktreePath: '/nonexistent' }),
    /protected branch/,
  );
});

test('pushIsolatedBranch refuses to push a protected branch name before it ever shells out to git', () => {
  assert.throws(
    () => pushIsolatedBranch({ branchName: 'main', worktreePath: '/nonexistent' }),
    /protected branch/,
  );
});

test('isolated worktree: full clone-edit-commit-push cycle never touches main and never sees an unrelated shared directory', { timeout: 60_000 }, () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-isolation-test-'));
  const bareRemote = path.join(scratch, 'origin.git');
  const seedClone = path.join(scratch, 'seed-clone');
  const sharedHumanDir = path.join(scratch, 'shared-human-runtime-dir');
  const worktreeRoot = path.join(scratch, 'auto-repair-worktrees');

  try {
    // Set up a real local "origin" with one commit on main.
    git(['init', '--bare', '--initial-branch=main', bareRemote]);
    git(['clone', bareRemote, seedClone]);
    fs.writeFileSync(path.join(seedClone, 'README.md'), 'seed\n');
    git(['-C', seedClone, 'add', '.']);
    git(['-C', seedClone, '-c', 'user.name=seed', '-c', 'user.email=seed@example.invalid', 'commit', '-m', 'seed'], seedClone);
    git(['-C', seedClone, 'push', 'origin', 'main'], seedClone);
    const mainShaBefore = git(['-C', seedClone, 'rev-parse', 'main']).trim();

    // Simulate a human's unrelated, uncommitted work sitting in a separate
    // directory -- this is the exact scenario that leaked into `main`
    // before this module existed.
    fs.mkdirSync(sharedHumanDir, { recursive: true });
    fs.writeFileSync(path.join(sharedHumanDir, 'unrelated-in-progress-work.txt'), 'do not touch me\n');

    const worktree = prepareIsolatedWorktree({
      baseBranch: 'main',
      remoteUrl: bareRemote,
      repository: 'test/isolated-worktree',
      task: 'Fix a simulated production defect',
      worktreeRoot,
    });

    assert.match(worktree.branchName, /^auto-repair\//);
    assert.ok(worktree.worktreePath.startsWith(worktreeRoot));
    assert.ok(fs.existsSync(worktree.worktreePath));

    // The isolated worktree must be a disjoint directory tree from wherever
    // a human's in-progress edits live.
    assert.equal(path.relative(sharedHumanDir, worktree.worktreePath).startsWith('..'), true);
    assert.equal(fs.existsSync(path.join(worktree.worktreePath, 'unrelated-in-progress-work.txt')), false);

    const currentBranch = git(['-C', worktree.worktreePath, 'branch', '--show-current']).trim();
    assert.equal(currentBranch, worktree.branchName);
    assert.notEqual(currentBranch, 'main');

    assert.equal(hasUncommittedChanges(worktree.worktreePath), false, 'a fresh clone should start clean');

    // Simulate the autonomous agent making a fix -- only inside the isolated worktree.
    fs.writeFileSync(path.join(worktree.worktreePath, 'fix.txt'), 'the fix\n');
    assert.equal(hasUncommittedChanges(worktree.worktreePath), true);

    const commitResult = commitIsolatedChanges({ message: 'test: simulated autonomous fix', worktreePath: worktree.worktreePath });
    assert.equal(commitResult.committed, true);
    assert.equal(hasUncommittedChanges(worktree.worktreePath), false);

    const pushResult = pushIsolatedBranch({ branchName: worktree.branchName, worktreePath: worktree.worktreePath });
    assert.equal(pushResult.pushed, true);

    // The strongest proof: inspect the "origin" directly. The new branch
    // must exist there, and `main` must be byte-identical to before --
    // this is the exact guarantee that was missing in production.
    const remoteBranches = git(['--git-dir', bareRemote, 'branch', '--list']);
    assert.match(remoteBranches, new RegExp(worktree.branchName.replace(/[/-]/g, '.')));
    const mainShaAfter = git(['--git-dir', bareRemote, 'rev-parse', 'main']).trim();
    assert.equal(mainShaAfter, mainShaBefore, 'main on the remote must be untouched by the isolated push');

    // The unrelated shared-directory file must still be exactly as it was.
    assert.equal(fs.readFileSync(path.join(sharedHumanDir, 'unrelated-in-progress-work.txt'), 'utf8'), 'do not touch me\n');

    const cleanup = cleanupIsolatedWorktree(worktree.worktreePath, {});
    assert.equal(cleanup.removed, true);
    assert.equal(fs.existsSync(worktree.worktreePath), false);
  } finally {
    fs.rmSync(scratch, { force: true, recursive: true });
  }
});

test('cleanupIsolatedWorktree is a no-op when ANSWERBRIEF_EXECUTOR_KEEP_WORKTREE=1 (debugging escape hatch)', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-isolation-keep-test-'));
  try {
    fs.writeFileSync(path.join(scratch, 'marker.txt'), 'still here\n');
    const result = cleanupIsolatedWorktree(scratch, { ANSWERBRIEF_EXECUTOR_KEEP_WORKTREE: '1' });
    assert.equal(result.removed, false);
    assert.equal(fs.existsSync(path.join(scratch, 'marker.txt')), true);
  } finally {
    fs.rmSync(scratch, { force: true, recursive: true });
  }
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

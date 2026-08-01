import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workerPath = path.join(root, 'lib', 'career-os-browser-worker.ts');
const hotfixPath = path.join(root, 'scripts', 'apply-workday-production-mode-hotfix.mjs');

test('Workday submit_enabled is not explicitly rejected by the production gate', () => {
  const source = fs.readFileSync(workerPath, 'utf8');
  assert.doesNotMatch(
    source,
    /Workday submit_enabled is rejected during controlled launch/,
  );
  assert.match(
    source,
    /\['inspect_only', 'assisted_apply', 'workday_single_canary', 'workday_first_submit', 'submit_enabled'\]/,
  );
});

test('production-mode hotfix is idempotent and guarded', () => {
  const source = fs.readFileSync(hotfixPath, 'utf8');
  assert.match(source, /already applied/);
  assert.match(source, /rejection is still present after hotfix/);
  assert.match(source, /allowlist was not updated/);
});

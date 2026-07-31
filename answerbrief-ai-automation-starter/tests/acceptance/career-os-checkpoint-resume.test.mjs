import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../lib/career-os-browser-worker.ts', import.meta.url), 'utf8');

test('browser worker builds a durable application checkpoint', () => {
  assert.match(source, /function buildBrowserCheckpoint\(/);
  assert.match(source, /completed_sections:/);
  assert.match(source, /completed_step:/);
  assert.match(source, /current_step:/);
  assert.match(source, /resume_url:/);
  assert.match(source, /updated_at: now/);
  assert.match(source, /version: 1/);
});

test('browser worker persists checkpoint with each progress report', () => {
  assert.match(source, /browser_checkpoint: browserCheckpoint/);
  assert.match(source, /resume_checkpoint: browserCheckpoint/);
});

test('retry status identifies the checkpoint used to resume', () => {
  assert.match(source, /Browser companion scheduled a retry from/);
  assert.match(source, /browserCheckpoint\.current_step/);
});

test('checkpoint retains prior state when a report has no new step metadata', () => {
  assert.match(source, /if \(!completedStep && !currentStep && !completedSections\.length\) return previous/);
});

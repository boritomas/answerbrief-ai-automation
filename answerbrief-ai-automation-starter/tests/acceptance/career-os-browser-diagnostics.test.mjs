import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../lib/career-os-browser-worker.ts', import.meta.url), 'utf8');

test('technical browser reports build structured diagnostics', () => {
  assert.match(source, /function buildBrowserWorkerTechnicalDiagnostic\(/);
  assert.match(source, /attempted_action:/);
  assert.match(source, /browser_exception:/);
  assert.match(source, /retry_count:/);
  assert.match(source, /retryable,/);
  assert.match(source, /selector,/);
  assert.match(source, /step,/);
});

test('technical diagnostics are persisted in the last browser report', () => {
  assert.match(source, /technical_diagnostic: technicalDiagnostic/);
});

test('technical blocker next action uses the diagnostic summary', () => {
  assert.match(source, /next_action: cleanEnv\(technicalDiagnostic\.summary\)/);
});

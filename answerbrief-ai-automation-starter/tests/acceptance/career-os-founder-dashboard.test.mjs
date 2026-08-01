import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = new URL('../../app/founder-dashboard/page.tsx', import.meta.url);
const stylePath = new URL('../../app/founder-dashboard/founder-dashboard.module.css', import.meta.url);

test('founder dashboard exposes the approved production sections', async () => {
  const source = await readFile(pagePath, 'utf8');

  for (const requiredText of [
    'Founder Success Dashboard',
    'Applications submitted',
    'Active applications',
    'Recruiter responses',
    'Interviews scheduled',
    'Application pipeline',
    'Resume intelligence',
    'Daily focus',
    'Production status',
  ]) {
    assert.match(source, new RegExp(requiredText, 'i'));
  }
});

test('founder dashboard reads verified Career OS production status', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /getCareerOsStatus/);
  assert.match(source, /status\.operationalTrust/);
  assert.match(source, /trust\.verifiedCounts/);
  assert.match(source, /status\.dailyWorkflow/);
  assert.match(source, /Live production data/);
  assert.doesNotMatch(source, /Applications submitted[^\n]*147/);
  assert.doesNotMatch(source, /Live data pending/);
});

test('founder dashboard preserves evidence-first offer reporting', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /No verified offer record connected yet/);
  assert.match(source, /Verified submitted applications/);
  assert.match(source, /Verified interview evidence/);
});

test('founder dashboard includes responsive styling', async () => {
  const source = await readFile(stylePath, 'utf8');

  assert.match(source, /@media \(max-width: 720px\)/);
  assert.match(source, /grid-template-columns: 1fr/);
});

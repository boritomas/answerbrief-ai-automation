import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = new URL('../../app/founder-dashboard/page.tsx', import.meta.url);
const stylePath = new URL('../../app/founder-dashboard/founder-dashboard.module.css', import.meta.url);

test('founder dashboard exposes the approved MVP sections', async () => {
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
    'Recent job-search events',
  ]) {
    assert.match(source, new RegExp(requiredText, 'i'));
  }
});

test('founder dashboard avoids fabricated production metrics', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /Live data pending/);
  assert.match(source, /Not connected/);
  assert.match(source, /No activity loaded yet/);
  assert.doesNotMatch(source, /Applications submitted[^\n]*147/);
});

test('founder dashboard includes responsive styling', async () => {
  const source = await readFile(stylePath, 'utf8');

  assert.match(source, /@media \(max-width: 720px\)/);
  assert.match(source, /grid-template-columns: 1fr/);
});

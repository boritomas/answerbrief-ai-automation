import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../lib/career-os-queue.ts', import.meta.url), 'utf8');

test('generic CAPTCHA, account, and Workday labels are not human blocker terms', () => {
  const humanTerms = source.match(/const HUMAN_BLOCKER_TERMS = \[([\s\S]*?)\n\];/)?.[1] || '';
  assert.equal(humanTerms.includes("'captcha'"), false);
  assert.equal(humanTerms.includes("'account'"), false);
  assert.equal(humanTerms.includes("'workday'"), false);
});

test('unsupported browser and ATS operations are technical blockers', () => {
  const technicalTerms = source.match(/const TECHNICAL_BLOCKER_TERMS = \[([\s\S]*?)\n\];/)?.[1] || '';
  assert.equal(technicalTerms.includes("'unsupported browser or ats operation'"), true);
  assert.equal(technicalTerms.includes("'selector not found'"), true);
  assert.equal(technicalTerms.includes("'resume upload failure'"), true);
});

test('technical blocker classification is evaluated before human handling', () => {
  const fnStart = source.indexOf('function humanOrTechnicalBlocker');
  assert.notEqual(fnStart, -1);
  const fn = source.slice(fnStart, fnStart + 1800);
  const technicalCheck = fn.indexOf('TECHNICAL_BLOCKER_TERMS');
  const humanCheck = fn.indexOf('HUMAN_BLOCKER_TERMS');
  assert.notEqual(technicalCheck, -1);
  if (humanCheck !== -1) assert.ok(technicalCheck < humanCheck);
});

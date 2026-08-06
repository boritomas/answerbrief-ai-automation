import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTsModule } from '../helpers/load-ts-module.mjs';

const { toCanonicalJob, toCanonicalJobs } = loadTsModule('lib/career-os-canonical-job.ts');

const qualifiedWorkdayPosting = {
  ats_platform: 'workday',
  canonical_url: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/x/Senior-Director-Product_REQ1-1',
  company: 'Acme Corp',
  compensation_max_usd: 260000,
  compensation_min_usd: 220000,
  compensation_text: '$220,000 - $260,000',
  created_at: '2026-08-06T00:00:00.000Z',
  external_requisition_id: 'REQ1-1',
  fit_score: 91,
  id: 'workday-acme-req1-1',
  last_checked_at: '2026-08-06T00:00:00.000Z',
  location: 'Remote, United States',
  owner_email: 'tomas@nieves.com',
  raw_record: {
    ats_platform: 'workday',
    compensation_policy_status: 'comp_meets_floor',
  },
  source_category: 'enterprise SaaS and digital transformation',
  source_run_id: 'source-run-1',
  status: 'discovered',
  title: 'Senior Director, Product Management',
  updated_at: '2026-08-06T00:00:00.000Z',
  work_arrangement: 'remote',
};

test('toCanonicalJob maps the persisted posting shape to a clean, camelCase model', () => {
  const job = toCanonicalJob(qualifiedWorkdayPosting, 85);
  assert.equal(job.id, 'workday-acme-req1-1');
  assert.equal(job.employer, 'Acme Corp');
  assert.equal(job.title, 'Senior Director, Product Management');
  assert.equal(job.atsPlatform, 'workday');
  assert.equal(job.fitScore, 91);
  assert.equal(job.compensationMinUsd, 220000);
  assert.equal(job.compensationMaxUsd, 260000);
  assert.equal(job.workArrangement, 'remote');
  assert.equal(job.discoveredStatus, 'discovered');
  assert.equal(job.qualification.compensationPolicyStatus, 'comp_meets_floor');
});

test('toCanonicalJob reuses qualifiesForCurrentProductionLane -- does not reimplement the qualification gate', () => {
  const qualified = toCanonicalJob(qualifiedWorkdayPosting, 85);
  assert.equal(qualified.qualification.qualifiesForReview, true);

  const belowFitScore = toCanonicalJob({ ...qualifiedWorkdayPosting, fit_score: 40 }, 85);
  assert.equal(belowFitScore.qualification.qualifiesForReview, false);
});

test('toCanonicalJob treats zero/negative compensation as unknown (null), not zero', () => {
  const job = toCanonicalJob({ ...qualifiedWorkdayPosting, compensation_max_usd: 0, compensation_min_usd: -1 });
  assert.equal(job.compensationMaxUsd, null);
  assert.equal(job.compensationMinUsd, null);
});

test('toCanonicalJob derives reviewState from raw_record.review_decision', () => {
  assert.equal(toCanonicalJob(qualifiedWorkdayPosting).reviewState, 'pending_review');
  assert.equal(
    toCanonicalJob({ ...qualifiedWorkdayPosting, raw_record: { ...qualifiedWorkdayPosting.raw_record, review_decision: 'approve' } }).reviewState,
    'approved',
  );
  assert.equal(
    toCanonicalJob({ ...qualifiedWorkdayPosting, raw_record: { ...qualifiedWorkdayPosting.raw_record, review_decision: 'reject' } }).reviewState,
    'rejected',
  );
});

test('toCanonicalJob defaults employer to "Employer" and title to "Role" for malformed postings, never throws', () => {
  const job = toCanonicalJob({ id: 'malformed-1' });
  assert.equal(job.employer, 'Employer');
  assert.equal(job.title, 'Role');
  assert.equal(job.fitScore, 0);
  assert.equal(job.qualification.qualifiesForReview, false);
});

test('toCanonicalJobs maps an array and preserves order', () => {
  const jobs = toCanonicalJobs([
    qualifiedWorkdayPosting,
    { ...qualifiedWorkdayPosting, id: 'second', fit_score: 70 },
  ], 85);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].id, 'workday-acme-req1-1');
  assert.equal(jobs[1].id, 'second');
  assert.equal(jobs[1].qualification.qualifiesForReview, false);
});

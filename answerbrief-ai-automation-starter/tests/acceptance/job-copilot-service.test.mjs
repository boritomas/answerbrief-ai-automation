import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadTsModule } from '../helpers/load-ts-module.mjs';

const { JobCopilotService } = loadTsModule('lib/job-copilot-service.ts');
const { approveReviewedJobPosting } = loadTsModule('lib/career-os-review-approval.ts');
const serviceSource = fs.readFileSync(new URL('../../lib/job-copilot-service.ts', import.meta.url), 'utf8');
const approvalSource = fs.readFileSync(new URL('../../lib/career-os-review-approval.ts', import.meta.url), 'utf8');
// Code-only view (strips `//` comment lines) so assertions about what the
// implementation does or doesn't call aren't tripped by explanatory prose
// that legitimately mentions the excluded names/tables.
const serviceCode = serviceSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

test('JobCopilotService requires an ownerEmail', () => {
  assert.throws(() => new JobCopilotService(''), /ownerEmail/);
  assert.throws(() => new JobCopilotService('   '), /ownerEmail/);
  assert.doesNotThrow(() => new JobCopilotService('tomas@nieves.com'));
});

test('JobCopilotService.discover reuses the existing discovery/normalization/scoring pipeline -- it does not reimplement fit scoring, compensation gating, or ATS detection', () => {
  assert.match(serviceSource, /from '\.\/career-os-market-universe'/);
  assert.match(serviceSource, /buildCareerOsDiscoveryPlan/);
  assert.match(serviceSource, /fetchWorkdaySourceResults/);
  assert.match(serviceSource, /fetchGreenhouseSourceBatches/);
  assert.match(serviceSource, /fetchOracleSourceResults/);
  assert.match(serviceSource, /normalizeWorkdayPosting/);
  assert.match(serviceSource, /normalizePosting/);
  assert.match(serviceSource, /normalizeOraclePosting/);
  assert.match(serviceSource, /dedupePostings/);
  assert.match(serviceSource, /qualifiesForCurrentProductionLane/);
});

test('JobCopilotService never invokes auto-promotion or auto package-generation -- discovery stops at the review queue', () => {
  assert.doesNotMatch(serviceCode, /buildAutoApplyPromotionRows/);
  assert.doesNotMatch(serviceCode, /buildAutoApplyPackageArtifacts/);
});

test('JobCopilotService never calls the queue processor, browser worker, or any ATS adapter directly', () => {
  assert.doesNotMatch(serviceSource, /processCareerOsQueue/);
  assert.doesNotMatch(serviceSource, /browser-worker/);
  assert.doesNotMatch(serviceSource, /browserWorker/);
  assert.doesNotMatch(serviceSource, /ats\/adapters/);
  assert.doesNotMatch(serviceSource, /AtsAdapterRegistry/);
});

test('JobCopilotService.discover only persists to career_os_job_postings', () => {
  const persistCalls = [...serviceSource.matchAll(/careerOsUpsertRows\('([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(persistCalls, ['career_os_job_postings']);
});

test('JobCopilotService.handoffToCareerOS delegates to approveReviewedJobPosting -- it does not duplicate the approval/promotion logic', () => {
  assert.match(serviceSource, /return approveReviewedJobPosting\(/);
});

test('approveReviewedJobPosting rejects without a valid action token, before touching Supabase or any queue state', async () => {
  const result = await approveReviewedJobPosting({
    opportunityId: 'posting-1',
    ownerEmail: 'tomas@nieves.com',
    // no actionToken
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unauthorized');
});

test('approveReviewedJobPosting rejects a missing opportunityId even with other fields present', async () => {
  const result = await approveReviewedJobPosting({
    actionToken: 'not-a-real-token',
    ownerEmail: 'tomas@nieves.com',
  });
  assert.equal(result.ok, false);
  assert.notEqual(result.status, 'success');
});

test('JobCopilotService.handoffToCareerOS surfaces the same unauthorized result for an unapproved request', async () => {
  const service = new JobCopilotService('tomas@nieves.com');
  const result = await service.handoffToCareerOS({ opportunityId: 'posting-1' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unauthorized');
});

test('career-os-review-approval.ts is an extraction, not new behavior -- the approve-role route calls it instead of duplicating the logic', () => {
  const routeSource = fs.readFileSync(new URL('../../app/api/career-os/approve-role/route.ts', import.meta.url), 'utf8');
  assert.match(routeSource, /approveReviewedJobPosting/);
  assert.doesNotMatch(routeSource, /careerOsUpsertRows/);
  assert.match(approvalSource, /lifecycle_stage: 'queued'/);
  assert.doesNotMatch(approvalSource, /processCareerOsQueue|browserWorker|worker:run/);
});

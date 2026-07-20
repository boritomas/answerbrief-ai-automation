import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createTargetedResume,
  dedupeOpportunities,
  detectContradictions,
  enforceApplicationMode,
  evaluateEmployerWorkflow,
  fileExistsAndReadable,
  mapRequirementsToEvidence,
  readJson,
  rejectExpiredOpportunities,
  rejectUnsupportedClaims,
  repoRoot,
  scoreAiReadiness,
  scoreAts,
  scoreRecruiterFit,
  summarizeLiveStatus,
  syntheticRoot,
  validateCandidateProfile,
} from '../../scripts/career-os-mission-lib.mjs';

const profile = readJson(path.join(syntheticRoot, 'candidate-master-profile.json'));
const opportunities = readJson(path.join(syntheticRoot, 'opportunities.json'));
const pilotEvidence = readJson(path.join(syntheticRoot, 'pilot-evidence.json'));

test('real-source adapter contract rejects synthetic as production proof', () => {
  assert.equal(pilotEvidence.environment, 'synthetic');
  assert.notEqual(pilotEvidence.sourceRun.sourceName, '');
  assert.equal(pilotEvidence.productionWarning.includes('must never satisfy production'), true);
});

test('posting normalization, duplicate prevention, and expired-job rejection work together', () => {
  const active = rejectExpiredOpportunities(opportunities, new Date('2026-07-19T12:00:00.000Z'));
  assert.equal(active.length, 2);

  const unique = dedupeOpportunities(active);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].requisitionId, 'SYN-2026-1001');
  assert.match(unique[0].dedupeKey, /example-regulated-tech/);
});

test('Candidate Master Profile validation and unsupported-fact rejection protect external artifacts', () => {
  const validation = validateCandidateProfile(profile);
  assert.equal(validation.passed, true, validation.issues.join(', '));

  const unsupported = rejectUnsupportedClaims([
    profile.facts[0].claim,
    'Fabricated Fortune 50 CIO title with unsupported dates.',
  ], profile);
  assert.deepEqual(unsupported, ['Fabricated Fortune 50 CIO title with unsupported dates.']);
});

test('ATS, AI readiness, recruiter scoring, and evidence mapping are deterministic', () => {
  const opportunity = opportunities[0];
  assert.equal(scoreAts(opportunity, profile) >= 0.8, true);
  assert.equal(scoreAiReadiness(opportunity, profile) >= 0.85, true);
  assert.equal(scoreRecruiterFit(opportunity, profile) >= 0.85, true);

  const matrix = mapRequirementsToEvidence(opportunity, profile);
  assert.equal(matrix.length, opportunity.requirements.length);
  assert.equal(matrix.some((item) => item.evidenceReference), true);
});

test('targeted resume generation, artifact availability, and contradiction checks are enforced', async () => {
  const opportunity = opportunities[0];
  const resume = createTargetedResume(profile, opportunity);
  assert.match(resume, /Profile version: synthetic-profile-v1/);
  assert.match(resume, /Requisition ID: SYN-2026-1001/);

  const artifactPath = path.join(repoRoot, pilotEvidence.pilot.resumeArtifact.path);
  assert.equal(await fileExistsAndReadable(artifactPath), true);
  assert.equal(readFileSync(artifactPath, 'utf8').includes('employment-confidential'), false);

  const contradictions = detectContradictions('This candidate says sponsorship required.', profile);
  assert.deepEqual(contradictions, ['Artifact contradicts sponsorship answer.']);
});

test('Drive package creation contract and resume upload path are represented in package evidence', async () => {
  const packagePath = path.join(repoRoot, pilotEvidence.pilot.applicationPackage.path);
  const applicationPackage = readJson(packagePath);

  assert.equal(applicationPackage.environment, 'synthetic');
  assert.equal(applicationPackage.artifacts[0].type, 'targeted_resume');
  assert.equal(await fileExistsAndReadable(path.join(repoRoot, applicationPackage.artifacts[0].path)), true);
  assert.equal(pilotEvidence.pilot.employerWorkflow.resumeUploadEvidence.includes('resume-upload'), true);
});

test('verified-answer population and application-mode enforcement prevent unsafe submission', () => {
  const reviewMode = enforceApplicationMode({
    mode: 'Review Before Submit',
    fitScore: 0.99,
    threshold: 0.9,
    resumeApproved: true,
    verifiedAnswersComplete: true,
    hasContradiction: false,
    dailyLimitRemaining: 1,
    platformPermits: true,
  });
  assert.equal(reviewMode.maySubmit, false);
  assert.match(reviewMode.reason, /requires Tomas review/);

  const automatic = enforceApplicationMode({
    mode: 'Rules-Based Automatic',
    fitScore: 0.93,
    threshold: 0.9,
    resumeApproved: true,
    verifiedAnswersComplete: true,
    hasContradiction: false,
    dailyLimitRemaining: 1,
    platformPermits: true,
  });
  assert.equal(automatic.maySubmit, true);
  assert.equal(pilotEvidence.pilot.employerWorkflow.verifiedAnswersUsed, true);
});

test('human-only gate detection and automatic resume-after-gate contract require completed preceding steps', () => {
  const result = evaluateEmployerWorkflow(pilotEvidence.pilot.employerWorkflow);
  assert.equal(result.passed, true);
  assert.match(result.reason, /MFA/);
  assert.equal(pilotEvidence.pilot.employerWorkflow.gate.precedingSupportedStepsCompleted, true);
  assert.equal(pilotEvidence.pilot.dailyAutomation.usesSamePipeline, true);
});

test('submission evidence handling rejects missing confirmations', () => {
  const result = evaluateEmployerWorkflow({
    attempted: true,
    terminalState: 'submitted',
    confirmationEvidence: '',
  });
  assert.equal(result.passed, false);
});

test('duplicate-application prevention and daily-run idempotency use stable keys', () => {
  assert.match(pilotEvidence.pilot.dailyAutomation.idempotencyKey, /synthetic-profile-v1:SYN-2026-1001/);
  assert.equal(dedupeOpportunities(opportunities).length, 2);
});

test('RLS, cross-user isolation, and admin authorization contracts are explicit in docs', () => {
  const acceptanceDoc = readFileSync(path.join(repoRoot, 'docs', 'CAREER_OS_ACCEPTANCE_CRITERIA.md'), 'utf8');
  assert.match(acceptanceDoc, /RLS contract/);
  assert.match(acceptanceDoc, /cross-user isolation/);
  assert.match(acceptanceDoc, /admin authorization/);
});

test('cost and model-use recording favors deterministic work unless generation needs AI', () => {
  assert.deepEqual(pilotEvidence.pilot.cost.modelCalls, []);
  assert.equal(pilotEvidence.pilot.cost.totalUsd, 0);
  assert.equal(pilotEvidence.pilot.cost.deterministicSteps > 0, true);
});

test('existing AnswerBrief interview regression still has required landing-page promises', () => {
  const page = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'page.tsx'), 'utf8');
  assert.match(page, /AnswerBrief AI/);
  assert.match(page, /interview brief/i);
  assert.match(page, /Payment link coming soon/);
});

test('live-site status response and snapshot summary are factual and not hard-coded production proof', () => {
  const status = readJson(path.join(syntheticRoot, 'live-status.json'));
  const summary = summarizeLiveStatus(status);

  assert.equal(summary.greeting, 'Good morning, Tomas.');
  assert.match(summary.salary, /\$235K-\$285K/);
  assert.equal(status.productionEvidenceReady, false);
});

test('production status implementation has no manual evidence file dependency', () => {
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');
  const verifier = readFileSync(path.join(repoRoot, 'scripts', 'verify-career-os-mission'), 'utf8');
  const page = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'page.tsx'), 'utf8');
  const sourceRunner = readFileSync(path.join(repoRoot, 'scripts', 'run-career-os-source.mjs'), 'utf8');

  assert.doesNotMatch(statusSource, /CAREER_OS_PRODUCTION_EVIDENCE_PATH|CAREER_OS_STATUS_PATH|career-os-production-evidence\.json/);
  assert.doesNotMatch(verifier, /Production evidence file|loadProductionEvidenceIfPresent|career-os-production-evidence\.json/);
  assert.doesNotMatch(page, /View Status JSON/);
  assert.match(sourceRunner, /boards-api\.greenhouse\.io/);
  assert.match(sourceRunner, /career_os_job_postings/);
});

test('permanent daily workflow is scheduled, secured, and verified', () => {
  const vercelConfig = readJson(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'vercel.json'));
  const dailyCycleSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-daily-cycle.ts'), 'utf8');
  const cronRoute = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'daily-run', 'route.ts'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');

  assert.deepEqual(vercelConfig.crons, [{ path: '/api/career-os/daily-run', schedule: '0 12 * * *' }]);
  assert.match(cronRoute, /CRON_SECRET|CAREER_OS_CRON_SECRET/);
  assert.match(dailyCycleSource, /DAILY_TARGET_NEWLY_IDENTIFIED = 20/);
  assert.match(dailyCycleSource, /DAILY_TARGET_ACTIVE_QUALIFIED = 15/);
  assert.match(dailyCycleSource, /incremental_discovery_only/);
  assert.match(dailyCycleSource, /consolidatedActionQueue/);
  assert.match(dailyCycleSource, /dailyFunnel/);
  assert.match(dailyCycleSource, /immediateQueueProcessor/);
  assert.match(dailyCycleSource, /queued_for_immediate_execution/);
  assert.match(dailyCycleSource, /per_application_blockers_isolated/);
  assert.match(dailyCycleSource, /required_total_compensation/);
  assert.match(statusSource, /Permanent daily workflow configured/);
  assert.match(statusSource, /focusedVerificationRows/);
});

test('Career OS dashboard exposes v2 operating sections without replacing the existing page', () => {
  const page = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'page.tsx'), 'utf8');

  assert.match(page, /Executive Summary/);
  assert.match(page, /Application Funnel/);
  assert.match(page, /Raw Activity Today/);
  assert.match(page, /Raw records discovered or refreshed/);
  assert.match(page, /Existing records refreshed/);
  assert.match(page, /Duplicates removed/);
  assert.match(page, /Qualification Today/);
  assert.match(page, /Below compensation target/);
  assert.match(page, /Application Execution Today/);
  assert.match(page, /Queued for immediate execution/);
  assert.match(page, /Running now/);
  assert.match(page, /Failed with error/);
  assert.match(page, /New Jobs Discovered/);
  assert.match(page, /Submitted Today/);
  assert.match(page, /Ready for Automation/);
  assert.match(page, /Waiting on Tomas/);
  assert.match(page, /Recruiter Activity and Follow-ups/);
  assert.match(page, /Resume Performance/);
  assert.match(page, /Employer Intelligence/);
  assert.match(page, /Compensation and Offers/);
  assert.match(page, /Your Compensation Policy/);
  assert.match(page, /Qualified Job Compensation/);
  assert.match(page, /Posted compensation across all discovered jobs/);
  assert.match(page, /Posted base range across jobs meeting policy/);
  assert.match(page, /Below-Target Jobs/);
  assert.match(page, /Daily Automation Health/);
  assert.match(page, /Immediate queue processor/);
  assert.match(page, /Exact next action/);
  assert.match(page, /Complete Market Search Coverage/);
  assert.match(page, /Employers Searched/);
  assert.match(page, /Career Sites Checked/);
  assert.match(page, /Raw Jobs Reviewed/);
  assert.equal(page.includes('Top telecom/connectivity employer'), true);
  assert.match(page, /Autonomous operating status/);
  assert.match(page, /Trusted Auto-Apply/);
  assert.match(page, /Global Lifecycle Counts/);
  assert.match(page, /Total raw records ever discovered/);
  assert.match(page, /Current batch progress/);
  assert.match(page, /Historical backlog progress/);
  assert.match(page, /Canonical state:/);
  assert.match(page, /applicationExecutionCta/);
  assert.doesNotMatch(page, /hard-coded production metrics/i);
});

test('Career OS daily execution separates raw records, qualification, queueing, and compensation policy', () => {
  const dailyCycleSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-daily-cycle.ts'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');

  assert.match(dailyCycleSource, /rawRecordsDiscoveredOrRefreshed/);
  assert.match(dailyCycleSource, /newlyDiscoveredRecords/);
  assert.match(dailyCycleSource, /existingRecordsRefreshed/);
  assert.match(dailyCycleSource, /duplicatesRemoved/);
  assert.match(dailyCycleSource, /packagesCreatedOrReused/);
  assert.match(dailyCycleSource, /queuedForAutomation/);
  assert.match(dailyCycleSource, /blockedApplicationsIsolated/);
  assert.match(statusSource, /atsIdFromUrl/);
  assert.match(statusSource, /posted_base_meets_policy/);
  assert.match(statusSource, /below_target/);
  assert.match(statusSource, /total_compensation_exception/);
  assert.match(statusSource, /Compensation review required/);
  assert.match(statusSource, /base_and_total_compensation_not_interchangeable|hasTotalCompensationEvidence/);
  assert.match(statusSource, /queued_for_browser_worker/);
  assert.match(statusSource, /waiting_on_tomas_browser_worker/);
  assert.match(dailyCycleSource, /queued_for_browser_worker/);
  assert.match(dailyCycleSource, /waiting_on_tomas_browser_worker/);
});

test('global autonomous discovery supports complete result sets, checkpoints, and canonical queue states', () => {
  const dailyCycleSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-daily-cycle.ts'), 'utf8');
  const marketUniverseSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-market-universe.ts'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');
  const cronRoute = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'daily-run', 'route.ts'), 'utf8');

  assert.match(statusSource, /TrustedAutoApplyPolicyStatus/);
  assert.match(statusSource, /ordinaryApplicationApprovalRequired: false/);
  assert.match(statusSource, /legalFingerprintPolicy/);
  assert.match(statusSource, /changedLegalTextRequiresReview/);
  assert.match(statusSource, /CanonicalApplicationExecutionState/);
  assert.match(statusSource, /globalLifecycle/);
  assert.match(statusSource, /supabaseSelectAll/);
  assert.match(statusSource, /Range: `\$\{offset\}-\$\{offset \+ pageSize - 1\}`/);
  assert.match(statusSource, /totalRawRecordsEverDiscovered/);
  assert.match(statusSource, /recordsAwaitingProcessing/);
  assert.match(statusSource, /queueStates/);
  assert.match(dailyCycleSource, /GLOBAL_DISCOVERY_BATCH_SIZE/);
  assert.match(dailyCycleSource, /GLOBAL_DISCOVERY_MAX_CONCURRENCY/);
  assert.match(dailyCycleSource, /GLOBAL_DISCOVERY_RETRY_LIMIT/);
  assert.match(dailyCycleSource, /buildCareerOsDiscoveryPlan/);
  assert.match(dailyCycleSource, /fetchGreenhouseSourceBatches/);
  assert.match(dailyCycleSource, /source_statuses/);
  assert.match(dailyCycleSource, /coverage_summary/);
  assert.match(dailyCycleSource, /marketCoverage/);
  assert.match(dailyCycleSource, /processDiscoveryBacklogBatches/);
  assert.match(dailyCycleSource, /postings\.push\(posting\)/);
  assert.match(dailyCycleSource, /postings_persisted/);
  assert.match(dailyCycleSource, /global_lifecycle/);
  assert.match(dailyCycleSource, /trusted_auto_apply_policy/);
  assert.match(dailyCycleSource, /canonicalExecutionState/);
  assert.match(marketUniverseSource, /CAREER_OS_MARKET_UNIVERSE_VERSION/);
  assert.equal(marketUniverseSource.includes('U.S. wireless and telecom carriers'), true);
  assert.match(marketUniverseSource, /broadband, fiber, cable, and internet providers/);
  assert.match(marketUniverseSource, /satellite, fixed wireless, and connectivity/);
  assert.match(marketUniverseSource, /towers, fiber infrastructure, and digital real estate/);
  assert.match(marketUniverseSource, /dynamic employer discovery/);
  assert.match(marketUniverseSource, /unsupportedSourceCandidates/);
  assert.match(marketUniverseSource, /greenhouseBoards/);
  assert.match(cronRoute, /postingsPersisted/);
  assert.equal(cronRoute.includes('before.evidence'), true);
});

test('minimal employment history model maps only ATS employment fields and validates Cisco safely', () => {
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');
  const page = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'page.tsx'), 'utf8');
  const hashScroll = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'hash-scroll.tsx'), 'utf8');

  assert.match(statusSource, /CanonicalEmploymentRecord/);
  assert.match(statusSource, /career_os_profiles\.verified_profile\.employment_history/);
  assert.match(statusSource, /Company', 'Employer', 'Current Employer/);
  assert.match(statusSource, /Job Title', 'Position', 'Role/);
  assert.match(statusSource, /From', 'Start Date/);
  assert.match(statusSource, /To', 'End Date/);
  assert.match(statusSource, /employment\.company/);
  assert.match(statusSource, /employment\.title/);
  assert.match(statusSource, /employment\.start_date/);
  assert.match(statusSource, /employment\.end_date/);
  assert.match(statusSource, /employment\.current/);
  assert.match(statusSource, /Cisco employment mapper validated/);
  assert.match(statusSource, /missing_verified_information/);
  assert.doesNotMatch(statusSource, /education\.|certification\.|candidateGraph|interview intelligence|offer engine/i);
  assert.match(page, /HashScroll/);
  assert.match(page, /applicationAnchorId/);
  assert.doesNotMatch(page, /applications\.slice\(0, 5\)\.map/);
  assert.match(hashScroll, /scrollIntoView/);
});

test('Career OS CTAs invoke a secured autonomous queue processor and record audit events', () => {
  const page = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'page.tsx'), 'utf8');
  const controls = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'action-controls.tsx'), 'utf8');
  const actionsRoute = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'actions', 'route.ts'), 'utf8');
  const cronRoute = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'daily-run', 'route.ts'), 'utf8');
  const queue = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-queue.ts'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');

  assert.match(page, /RunNowControl/);
  assert.match(page, /ApplicationActionControl/);
  assert.match(page, /nextActionApplication/);
  assert.match(controls, /Run Eligible Applications Now/);
  assert.match(controls, /Refresh Status/);
  assert.match(controls, /Authorize Actions/);
  assert.match(controls, /save_answer/);
  assert.match(controls, /resume_application/);
  assert.match(actionsRoute, /Unauthorized Career OS action/);
  assert.match(actionsRoute, /authorizeCareerOsAction/);
  assert.match(actionsRoute, /processCareerOsQueue/);
  assert.match(actionsRoute, /recordCareerOsAction/);
  assert.match(actionsRoute, /run_now/);
  assert.match(cronRoute, /processCareerOsQueue/);
  assert.match(queue, /career_os_application_queue_processor/);
  assert.match(queue, /queue_blocker_verified/);
  assert.match(queue, /cta_inspected/);
  assert.match(queue, /tomas_answer_saved/);
  assert.match(queue, /human_step_completed_resume_requested/);
  assert.match(queue, /duplicate_submission_prevented/);
  assert.match(queue, /Supported server-side ATS submit adapter is not available/);
  assert.match(queue, /capturedConfirmationEvidence/);
  assert.match(queue, /submission_confirmed/);
  assert.match(queue, /will not mark the application submitted without a captured confirmation/);
  assert.match(statusSource, /careerOsActionMetadata/);
  assert.equal(statusSource.includes("serverAction: '/api/career-os/actions'"), true);
});

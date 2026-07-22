import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  detectVisibleCaptchaEvidence,
  greenhouseConfirmationDetected,
} from '../../answerbrief-ai-automation-starter/scripts/lib/career-os-ats-adapters.mjs';
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

test('terminal applications with duplicate locks or confirmation evidence cannot re-enter active execution states', () => {
  const activeExecutionResidue = (application) => {
    const raw = application.raw_record || {};
    const workerStatus = String(raw.browser_worker?.status || '').toLowerCase();
    const lastReportStatus = String(raw.browser_worker_last_report?.status || '').toLowerCase();
    const executionStatus = String(raw.execution_status || '').toLowerCase();
    const reasons = [];
    if (['queued', 'running', 'waiting_on_tomas'].includes(workerStatus)) reasons.push(`browser_worker.status ${workerStatus}`);
    if (['queued', 'running', 'waiting_on_tomas'].includes(lastReportStatus)) reasons.push(`browser_worker_last_report.status ${lastReportStatus}`);
    if (['queued', 'running', 'waiting_on_tomas', 'resumable'].includes(executionStatus)) reasons.push(`execution_status ${executionStatus}`);
    return reasons;
  };

  const staleResidueFixtures = [
    {
      id: 'app-affirm-7718659003',
      raw_record: {
        duplicate_locked: true,
        externally_submitted: true,
        execution_status: 'externally_submitted',
        browser_worker: { status: 'waiting_on_tomas' },
        browser_worker_last_report: { status: 'waiting_on_tomas' },
      },
    },
    {
      id: 'app-affirm-7780490003',
      raw_record: {
        externally_confirmed: true,
        externally_submitted: true,
        execution_status: 'confirmed',
        browser_worker: { status: 'waiting_on_tomas' },
        browser_worker_last_report: { status: 'waiting_on_tomas' },
      },
    },
  ];
  assert.deepEqual(
    staleResidueFixtures.map((application) => ({ id: application.id, reasons: activeExecutionResidue(application) })),
    [
      { id: 'app-affirm-7718659003', reasons: ['browser_worker.status waiting_on_tomas', 'browser_worker_last_report.status waiting_on_tomas'] },
      { id: 'app-affirm-7780490003', reasons: ['browser_worker.status waiting_on_tomas', 'browser_worker_last_report.status waiting_on_tomas'] },
    ],
  );

  const cleanedTerminalFixtures = [
    {
      id: 'app-affirm-7718659003',
      raw_record: {
        duplicate_locked: true,
        externally_submitted: true,
        execution_status: 'externally_submitted',
        browser_worker: { status: 'terminal_locked' },
        browser_worker_last_report: { status: 'terminal_locked' },
      },
    },
    {
      id: 'app-affirm-7780490003',
      raw_record: {
        externally_confirmed: true,
        externally_submitted: true,
        execution_status: 'confirmed',
        browser_worker: { status: 'terminal_locked' },
        browser_worker_last_report: { status: 'terminal_locked' },
      },
    },
    {
      id: 'app-twilio-8029164',
      raw_record: {
        manual_submission_attested: true,
        execution_status: 'externally_submitted',
      },
    },
    {
      id: 'app-cloudflare-8022491',
      raw_record: {
        manual_submission_attested: true,
        execution_status: 'externally_submitted',
      },
    },
    {
      id: 'app-mongodb-7974801',
      raw_record: {
        duplicate_locked: true,
        externally_confirmed: true,
        execution_status: 'duplicate_locked',
      },
    },
    {
      id: 'app-servicenow-744000138413067',
      raw_record: {
        duplicate_locked: true,
        externally_confirmed: true,
        execution_status: 'duplicate_locked',
      },
    },
    {
      id: 'app-five9-5811077004',
      raw_record: {
        duplicate_locked: true,
        externally_confirmed: true,
        execution_status: 'duplicate_locked',
      },
    },
  ];
  for (const application of cleanedTerminalFixtures) {
    assert.deepEqual(activeExecutionResidue(application), [], application.id);
  }
});

test('Affirm Greenhouse false-CAPTCHA regression requires visible challenge evidence and terminal confirmation', () => {
  const noCaptcha = detectVisibleCaptchaEvidence({
    detectedAt: '2026-07-21T13:00:00.000Z',
    elements: [],
    visibleText: 'Please complete all required fields before submitting your application.',
  });
  assert.equal(noCaptcha.detected, false);

  const visibleCaptcha = detectVisibleCaptchaEvidence({
    detectedAt: '2026-07-21T13:00:00.000Z',
    elements: [
      {
        selector: 'iframe[src*="recaptcha"]',
        tagName: 'iframe',
        title: 'reCAPTCHA',
        src: 'https://www.google.com/recaptcha/api2/anchor?k=test',
        className: '',
        text: '',
        visible: true,
      },
    ],
    visibleText: '',
  });
  assert.equal(visibleCaptcha.detected, true);
  assert.equal(visibleCaptcha.detectorType, 'visible_recaptcha');

  assert.equal(
    greenhouseConfirmationDetected({
      currentUrl: 'https://job-boards.greenhouse.io/affirm/jobs/7770395003/confirmation',
      pageText: 'Thank you for applying to Affirm. We have received your application and will be in touch shortly.',
    }),
    true,
  );

  const queueSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-queue.ts'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');
  const companionSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'scripts', 'career-os-browser-companion.mjs'), 'utf8');
  const adaptersSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'scripts', 'lib', 'career-os-ats-adapters.mjs'), 'utf8');

  assert.match(companionSource, /captchaEvidence/);
  assert.match(adaptersSource, /Greenhouse requires additional verified answers before continuing/);
  assert.match(queueSource, /manual tomas completion/);
  assert.match(statusSource, /manual_tomas_completion/);
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

test('Career OS default page is candidate-focused and moves operational detail into admin', () => {
  const page = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'page.tsx'), 'utf8');
  const adminPage = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'admin', 'page.tsx'), 'utf8');

  assert.match(page, /CAREER OS TODAY/);
  assert.match(page, /Last successful run:/);
  assert.match(page, /Today&apos;s Priorities/);
  assert.match(page, /Recent Activity/);
  assert.match(page, /Pipeline/);
  assert.match(page, /My Review Queue/);
  assert.match(page, /Today&apos;s Tasks/);
  assert.match(page, /Raw Source Records/);
  assert.match(page, /Unique Live Roles/);
  assert.match(page, /Qualified Roles/);
  assert.match(page, /Applications Attempted Today/);
  assert.match(page, /Submitted Today/);
  assert.match(page, /Total Submitted/);
  assert.match(page, /Latest Run Work/);
  assert.match(page, /Qualified Matches/);
  assert.match(page, /Active Opportunities/);
  assert.match(page, /Ready to Apply/);
  assert.match(page, /Tasks for You/);
  assert.match(page, /System Issues/);
  assert.match(page, /Applications Affected/);
  assert.match(page, /Verified Indicators/);
  assert.match(page, /Exact Action/);
  assert.match(page, /Affected Roles/);
  assert.match(page, /Evidence/);
  assert.match(page, /Compensation not posted/);
  assert.doesNotMatch(page, /Daily Automation Health/);
  assert.doesNotMatch(page, /Global Lifecycle Counts/);
  assert.doesNotMatch(page, /Complete Market Search Coverage/);
  assert.doesNotMatch(page, /Current batch progress/);
  assert.match(adminPage, /Operational Detail/);
  assert.match(adminPage, /Career OS Trust Report/);
  assert.match(adminPage, /State Inspector/);
  assert.match(adminPage, /Consistency Checks/);
  assert.match(adminPage, /Daily Automation Health/);
  assert.match(adminPage, /Funnel/);
  assert.match(adminPage, /Discovery and Coverage/);
  assert.match(adminPage, /System Health/);
  assert.match(adminPage, /Employers and Knowledge Base/);
  assert.doesNotMatch(page, /hard-coded production metrics/i);
});

test('Operational trust contract keeps unsupported and synthetic states out of Candidate Mode selectors', () => {
  const page = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'page.tsx'), 'utf8');
  const adminPage = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'admin', 'page.tsx'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');

  assert.match(page, /trust\.verifiedCounts\.systemIssues/);
  assert.match(page, /trust\.verifiedActionCenterRecords/);
  assert.match(page, /trust\.verifiedReadyToResumeRecords/);
  assert.match(page, /trust\.verifiedApplyingRecords/);
  assert.match(page, /buildTaskGroups/);
  assert.match(page, /taskGroupingKey/);
  assert.match(page, /Employer Account or Sign-In/);
  assert.match(page, /Candidate Mode is suppressing unsupported or stale records/);
  assert.match(adminPage, /Unsupported Claims Removed/);
  assert.match(adminPage, /Synthetic Records/);
  assert.match(adminPage, /Applications Without Checkpoints/);
  assert.match(adminPage, /Terminal Applications Incorrectly Actionable/);
  assert.match(statusSource, /OperationalTrustStatus/);
  assert.match(statusSource, /candidateModeUnsupportedClaimsRemoved/);
  assert.match(statusSource, /stateInspectorReady: true/);
  assert.match(statusSource, /consistencyChecksReady: true/);
  assert.match(statusSource, /browser_worker_blocked/);
  assert.match(statusSource, /last-known-good/);
});

test('Career OS daily execution separates raw records, qualification, queueing, and compensation policy', () => {
  const dailyCycleSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-daily-cycle.ts'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');
  const queueSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-queue.ts'), 'utf8');

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
  assert.match(queueSource, /waiting_on_tomas_browser_worker/);
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
  assert.match(statusSource, /rangeEnd: offset \+ pageSize - 1/);
  assert.match(statusSource, /rangeStart: offset/);
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
  assert.match(marketUniverseSource, /JPMorgan Chase/);
  assert.match(marketUniverseSource, /oracle/);
  assert.match(marketUniverseSource, /unsupportedSourceCandidates/);
  assert.match(marketUniverseSource, /oracleSources/);
  assert.match(marketUniverseSource, /greenhouseBoards/);
  assert.match(cronRoute, /postingsPersisted/);
  assert.equal(cronRoute.includes('before.evidence'), true);
});

test('Career OS permanent role policy retains target product-management levels and excludes executive titles before scoring', () => {
  const marketUniverseSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-market-universe.ts'), 'utf8');
  const dailyCycleSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-daily-cycle.ts'), 'utf8');
  const sourceRunner = readFileSync(path.join(repoRoot, 'scripts', 'run-career-os-source.mjs'), 'utf8');

  assert.match(marketUniverseSource, /'Product Manager'/);
  assert.match(marketUniverseSource, /'Senior Product Manager'/);
  assert.match(marketUniverseSource, /'Group Product Manager'/);
  assert.match(marketUniverseSource, /'Principal Product Manager'/);
  assert.match(marketUniverseSource, /'Director of Product Management'/);
  assert.match(marketUniverseSource, /'Senior Director of Product Management'/);
  assert.doesNotMatch(marketUniverseSource, /'Vice President of Product'/);
  assert.doesNotMatch(marketUniverseSource, /'Head of Product'/);
  assert.match(dailyCycleSource, /classifyRolePolicy/);
  assert.match(dailyCycleSource, /excluded_executive_level/);
  assert.match(dailyCycleSource, /excluded_junior_level/);
  assert.match(dailyCycleSource, /excluded_non_product_scope/);
  assert.match(sourceRunner, /excluded_executive_level/);
  assert.match(sourceRunner, /executiveExclusionTokens/);
  assert.doesNotMatch(marketUniverseSource, /'Vice President'/);
  assert.doesNotMatch(marketUniverseSource, /'Head of Product'/);
});

test('JPMorgan Oracle pilot uses the public Candidate Experience finder and persists individual requisitions', () => {
  const dailyCycleSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-daily-cycle.ts'), 'utf8');
  const sourceRunner = readFileSync(path.join(repoRoot, 'scripts', 'run-career-os-source.mjs'), 'utf8');

  assert.match(dailyCycleSource, /fetchJpmorganOracleJobs/);
  assert.match(dailyCycleSource, /const finder = `findReqs;siteNumber=CX_1001/);
  assert.match(dailyCycleSource, /findReqs/);
  assert.match(dailyCycleSource, /encodeURIComponent\(finder\)/);
  assert.match(dailyCycleSource, /expand=requisitionList/);
  assert.match(dailyCycleSource, /selectedCategoriesFacet/);
  assert.match(dailyCycleSource, /selectedLocationsFacet/);
  assert.match(dailyCycleSource, /normalizeOraclePosting/);
  assert.match(dailyCycleSource, /hcmUI\/CandidateExperience/);
  assert.match(dailyCycleSource, /\/job\/\$\{encodeURIComponent/);
  assert.match(sourceRunner, /fetchJpmorganOraclePilot/);
  assert.match(sourceRunner, /deterministic_oracle_source_runner_v1/);
  assert.match(sourceRunner, /career_os_job_postings/);
});

test('Oracle browser execution path is supported and can stop at the employer verification gate', () => {
  const adapterSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'scripts', 'lib', 'career-os-ats-adapters.mjs'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');
  const queueSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-queue.ts'), 'utf8');

  assert.match(adapterSource, /const oracleAdapter =/);
  assert.match(adapterSource, /button\.apply-now-button/);
  assert.match(adapterSource, /job-details__section-apply-button button/);
  assert.match(adapterSource, /Oracle Recruiting requires employer-controlled hCaptcha verification/);
  assert.match(adapterSource, /primary-email/);
  assert.match(adapterSource, /h-captcha-response/);
  assert.match(adapterSource, /email-authentication step/);
  assert.match(queueSource, /oracle adapter could not open the employer apply flow from the public job page/);
  assert.match(statusSource, /platform\.includes\('oracle'\)\) return 'supported'/);
  assert.match(queueSource, /does not yet have an ats adapter for platform/);
  assert.match(queueSource, /package_ready' : 'qualified'/);
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
  const adminPage = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'admin', 'page.tsx'), 'utf8');
  const controls = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'action-controls.tsx'), 'utf8');
  const actionsRoute = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'actions', 'route.ts'), 'utf8');
  const cronRoute = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'daily-run', 'route.ts'), 'utf8');
  const queue = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-queue.ts'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');

  assert.match(adminPage, /RunNowControl/);
  assert.match(page, /ApplicationActionControl/);
  assert.match(page, /nextActionApplication/);
  assert.match(controls, /Run Eligible Applications Now/);
  assert.match(controls, /Refresh Job Pool/);
  assert.match(controls, /Refresh Status/);
  assert.doesNotMatch(controls, /Authorize Actions/);
  assert.match(controls, /router\.refresh\(\)/);
  assert.match(controls, /save_answer/);
  assert.match(controls, /resume_application/);
  assert.match(controls, /review_opportunity/);
  assert.match(controls, /Approve Application/);
  assert.match(controls, /Skip This Role/);
  assert.match(controls, /Do Not Show Similar Roles/);
  assert.match(actionsRoute, /Unauthorized Career OS action/);
  assert.match(actionsRoute, /authorizeCareerOsAction/);
  assert.match(actionsRoute, /processCareerOsQueue/);
  assert.match(actionsRoute, /recordCareerOsAction/);
  assert.match(actionsRoute, /run_now/);
  assert.match(actionsRoute, /refresh_discovery/);
  assert.match(actionsRoute, /recordOpportunityReviewDecision/);
  assert.match(actionsRoute, /runDailyGreenhouseDiscovery/);
  assert.match(actionsRoute, /persistDailyCycleReport/);
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

test('Career OS review approvals create or reuse a canonical opportunity before application upsert', () => {
  const actionsRoute = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'actions', 'route.ts'), 'utf8');

  assert.match(actionsRoute, /findExistingOpportunity/);
  assert.match(actionsRoute, /career_os_opportunities/);
  assert.match(actionsRoute, /resolvedOpportunityId/);
  assert.match(actionsRoute, /opportunity_id: resolvedOpportunityId/);
  assert.match(actionsRoute, /status: 'approved_pending_application'/);
  assert.match(actionsRoute, /canonical_job_posting_id: opportunityId/);
});

test('Career OS canonical opportunity identity uses exact ATS and URL keys before any strong-match fallback', () => {
  const canonical = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-canonical-opportunity.ts'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');
  const dailyCycle = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-daily-cycle.ts'), 'utf8');
  const applicationMatchFunction = statusSource.match(/function applicationMatchesCanonical\([\s\S]*?\n}\n/);

  assert.match(canonical, /canonicalOpportunityIdentity/);
  assert.match(canonical, /tier_1_exact|:req:|:job:/);
  assert.match(canonical, /url:/);
  assert.match(canonical, /possibleDuplicateKey/);
  assert.match(canonical, /applicationMatchesCanonicalOpportunity/);
  assert.match(statusSource, /applicationMatchesCanonicalOpportunity/);
  assert.match(dailyCycle, /canonical_opportunity_id/);
  assert.match(dailyCycle, /source_sightings/);
  assert.ok(applicationMatchFunction, 'applicationMatchesCanonical should exist.');
  assert.doesNotMatch(applicationMatchFunction[0], /compactKey\(application\.employer\).*normalizeTitle\(application\.position\)/s);
});

test('Career OS duplicate-submission locks prevent requeueing and backward transitions', () => {
  const queue = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-queue.ts'), 'utf8');
  const duplicateLock = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-duplicate-lock.ts'), 'utf8');

  assert.match(queue, /careerOsQueuePaused/);
  assert.match(queue, /CAREER_OS_QUEUE_ENABLED/);
  assert.match(queue, /isTerminalSubmission\(application\)/);
  assert.match(queue, /terminal_submission_action_blocked/);
  assert.match(queue, /Submitted\/confirmed applications cannot be reopened or returned to the queue/);
  assert.match(queue, /duplicateSubmissionMatch\(application/);
  assert.match(queue, /lockDuplicateApplication/);
  assert.match(queue, /duplicate_submission_prevented/);
  assert.match(duplicateLock, /externally_submitted/);
  assert.match(duplicateLock, /externally_confirmed/);
  assert.match(duplicateLock, /duplicate_locked/);
  assert.match(duplicateLock, /employer_requisition/);
  assert.match(duplicateLock, /employer_title_url/);
  assert.match(duplicateLock, /employer_title_requisition/);
});

test('Career OS browser worker rejects locked applications before claim and before final submit', () => {
  const worker = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-browser-worker.ts'), 'utf8');
  const submitCheck = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'worker', 'submit-check', 'route.ts'), 'utf8');
  const companion = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'scripts', 'career-os-browser-companion.mjs'), 'utf8');
  const adapters = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'scripts', 'lib', 'career-os-ats-adapters.mjs'), 'utf8');

  assert.match(worker, /const queuePaused = careerOsQueuePaused\(\)/);
  assert.match(worker, /queuePaused && !isExplicitlyResumedApplication/);
  assert.match(worker, /checkBrowserWorkerSubmitSafety/);
  assert.match(worker, /terminal_submission_reopen_prevented/);
  assert.match(worker, /duplicate_submission_report_rejected/);
  assert.match(worker, /duplicate_submission_prevented/);
  assert.match(submitCheck, /authorizeBrowserWorker/);
  assert.match(submitCheck, /status: result\.ok \? 200 : 409/);
  assert.match(companion, /assertSafeToSubmit/);
  assert.match(companion, /duplicate_submission_prevented/);
  assert.match(adapters, /beforeClick/);
  assert.match(adapters, /runtime\.assertSafeToSubmit\(\)/);
  assert.match(adapters, /Submitting the employer application/);
});

test('Career OS duplicate key matching covers tracking parameters, ATS ids, requisitions, and new requisitions', () => {
  const submittedMongo = {
    confirmationNumber: 'mongodb-confirmed',
    employer: 'MongoDB',
    lifecycleStage: 'confirmed',
    position: 'Staff Product Manager',
    raw: {
      application_url: 'https://www.mongodb.com/careers/jobs/7974801?utm_source=linkedin&gh_jid=7974801',
      ats_job_id: '7974801',
      external_requisition_id: '7974801',
    },
  };
  const submittedServiceNow = {
    confirmationNumber: 'servicenow-confirmed',
    employer: 'ServiceNow',
    lifecycleStage: 'submitted',
    position: 'Director, Outbound Product Management',
    raw: {
      application_url: 'https://jobs.smartrecruiters.com/ServiceNow/744000138413067-director-outbound-product-management?trid=123',
      ats_job_id: '744000138413067',
    },
  };
  const sameMongoTracking = {
    employer: 'MongoDB',
    lifecycleStage: 'queued',
    position: 'Staff Product Manager',
    raw: { application_url: 'https://www.mongodb.com/careers/jobs/7974801?utm_campaign=x&gh_jid=7974801' },
  };
  const sameServiceNowAts = {
    employer: 'ServiceNow',
    lifecycleStage: 'package_ready',
    position: 'Director, Outbound Product Management',
    raw: { ats_job_id: '744000138413067' },
  };
  const sameEmployerRequisition = {
    employer: 'MongoDB',
    lifecycleStage: 'qualified',
    position: 'Different Display Title',
    raw: { external_requisition_id: '7974801' },
  };
  const newMongoRequisition = {
    employer: 'MongoDB',
    lifecycleStage: 'qualified',
    position: 'Staff Product Manager',
    raw: {
      application_url: 'https://www.mongodb.com/careers/jobs/9000000?gh_jid=9000000',
      ats_job_id: '9000000',
    },
  };

  const submitted = [submittedMongo, submittedServiceNow];
  assert.equal(findDuplicate(sameMongoTracking, submitted).reason, 'duplicate_submission_prevented');
  assert.equal(findDuplicate(sameServiceNowAts, submitted).reason, 'duplicate_submission_prevented');
  assert.equal(findDuplicate(sameEmployerRequisition, submitted).reason, 'duplicate_submission_prevented');
  assert.equal(findDuplicate(newMongoRequisition, submitted), null);
});

test('Career OS database duplicate lock migration defines production uniqueness backstops', () => {
  const sql = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'docs', 'sql', 'career-os-submission-lock.sql'), 'utf8');

  assert.match(sql, /career_os_applications_unique_employer_requisition/);
  assert.match(sql, /career_os_applications_unique_employer_title_url/);
  assert.match(sql, /owner_email/);
  assert.match(sql, /raw_record->>'external_requisition_id'/);
  assert.match(sql, /raw_record->>'ats_job_id'/);
  assert.match(sql, /raw_record->>'canonical_url'/);
});

test('Career OS waiting-on-Tomas CTAs expose one action, resume explicitly, and refresh dashboard state', () => {
  const controls = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'action-controls.tsx'), 'utf8');
  const queue = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-queue.ts'), 'utf8');
  const worker = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-browser-worker.ts'), 'utf8');

  assert.equal(controls.includes('const [checkpointOpened, setCheckpointOpened]'), true);
  assert.match(controls, /function submit/);
  assert.match(controls, /primaryLabel/);
  assert.match(controls, /Check Again/);
  assert.match(controls, /window\.open\('about:blank', '_blank'\)/);
  assert.match(controls, /checkpointWindow\.location\.href = result\.openUrl/);
  assert.equal(controls.includes('router.refresh()'), true);
  assert.equal(controls.includes('Open checkpoint</a>'), false);
  assert.match(queue, /allowPausedForApplication/);
  assert.match(queue, /explicitApplicationResume/);
  assert.match(queue, /explicit_resume_requested_at/);
  assert.match(worker, /isExplicitlyResumedApplication/);
  assert.match(worker, /queuePaused && !isExplicitlyResumedApplication/);
});

test('Career OS daily discovery is independent from submission queue processing', () => {
  const dailyRun = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'daily-run', 'route.ts'), 'utf8');
  const actionsRoute = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'api', 'career-os', 'actions', 'route.ts'), 'utf8');
  const dailyCycle = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-daily-cycle.ts'), 'utf8');

  assert.match(dailyRun, /runDailyGreenhouseDiscovery/);
  assert.match(dailyRun, /runSubmissionQueueAfterDiscovery/);
  assert.match(dailyRun, /careerOsQueuePaused/);
  assert.match(dailyRun, /career_os_queue_paused/);
  assert.match(dailyRun, /persistDailyCycleReport/);
  assert.match(actionsRoute, /body\.action === 'refresh_discovery'/);
  assert.match(actionsRoute, /FOREGROUND_DISCOVERY_MAX_BOARDS/);
  assert.match(actionsRoute, /runDailyGreenhouseDiscovery\(ownerEmail, before\.evidence, \{ maxBoards: FOREGROUND_DISCOVERY_MAX_BOARDS \}\)/);
  assert.match(dailyCycle, /firstPositiveNumber/);
  assert.match(dailyCycle, /fallbackPlan\.coverageSummary\.supportedOfficialSources/);
  assert.match(dailyCycle, /GLOBAL_DISCOVERY_SOURCE_TIMEOUT_MS/);
  assert.match(dailyCycle, /AbortSignal\.timeout\(GLOBAL_DISCOVERY_SOURCE_TIMEOUT_MS\)/);
  assert.match(dailyCycle, /FOREGROUND_DISCOVERY_MAX_BOARDS = 3/);
  assert.match(dailyCycle, /foreground_batch_boards_processed/);
});

test('Career OS dashboard metrics and daily action queue are actionable controls', () => {
  const page = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'app', 'career-os', 'page.tsx'), 'utf8');
  const statusSource = readFileSync(path.join(repoRoot, 'answerbrief-ai-automation-starter', 'lib', 'career-os-status.ts'), 'utf8');

  assert.equal(page.includes('href="/career-os/admin#daily" label="Raw Source Records"'), true);
  assert.equal(page.includes('href="/career-os?view=latest-run#latest-run-work" label="Unique Live Roles"'), true);
  assert.equal(page.includes('href="/career-os?view=latest-run#latest-run-work" label="Applications Attempted Today"'), true);
  assert.equal(page.includes('href="/career-os?view=submitted-history#applications" label="Total Submitted"'), true);
  assert.equal(page.includes("Review My Tasks"), true);
  assert.equal(page.includes('Career OS evaluated ${uniqueLiveRoles} unique live roles'), true);
  assert.match(page, /Review \$\{qualifiedMatchRows\.length\} Matches/);
  assert.match(page, /View Active Pipeline/);
  assert.match(page, /Apply Now/);
  assert.match(page, /Complete Task/);
  assert.match(page, /View Blocker/);
  assert.match(page, /Already Submitted/);
  assert.match(page, /ApplicationActionControl/);
  assert.match(page, /ReviewQueueActionControl/);
  assert.match(page, /buildWorkflowRows/);
  assert.match(page, /buildLatestRunSections/);
  assert.match(page, /buildTodayPriorities/);
  assert.match(page, /buildSystemNotice/);
  assert.match(page, /buildPrimaryAction/);
  assert.match(statusSource, /autoApplyThreshold: 85/);
  assert.match(statusSource, /reviewQueueRange: '60-84'/);
  assert.match(statusSource, /archiveRange: '0-59'/);
  assert.match(statusSource, /reviewQueueCount/);
  assert.match(statusSource, /export function selectReviewQueueItems/);
  assert.match(statusSource, /reviewDecision === 'none'/);
});

function findDuplicate(candidate, existingApplications) {
  const candidateKeys = duplicateKeys(candidate);
  for (const existing of existingApplications) {
    if (!isTerminal(existing)) continue;
    const existingKeys = new Set(duplicateKeys(existing));
    const lockKey = candidateKeys.find((key) => existingKeys.has(key));
    if (lockKey) return { lockKey, reason: 'duplicate_submission_prevented' };
  }
  return null;
}

function duplicateKeys(application) {
  const raw = application.raw || {};
  const employer = normalizeEmployer(application.employer || raw.employer || raw.company);
  const requisition = normalizeId(raw.external_requisition_id || raw.requisition_id || raw.ats_job_id || raw.job_id || raw.token);
  const title = normalizeTitle(application.position || raw.position || raw.title || raw.role);
  const url = normalizeUrl(raw.canonical_url || raw.application_url || raw.job_url || raw.posting_url);
  const keys = [];
  if (employer && requisition) keys.push(`employer_requisition:${employer}:${requisition}`);
  if (employer && title && url) keys.push(`employer_title_url:${employer}:${title}:${url}`);
  if (employer && title && requisition) keys.push(`employer_title_requisition:${employer}:${title}:${requisition}`);
  return Array.from(new Set(keys));
}

function isTerminal(application) {
  const raw = application.raw || {};
  return Boolean(application.confirmationNumber || application.submissionEvidence)
    || ['confirmed', 'submitted', 'externally_confirmed', 'externally_submitted', 'duplicate_locked'].includes(String(application.lifecycleStage || raw.execution_status || '').toLowerCase())
    || raw.duplicate_locked === true;
}

function normalizeEmployer(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeTitle(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const url = new URL(text);
  url.hash = '';
  const keep = new URLSearchParams();
  for (const key of ['for', 'token', 'gh_jid', 'jobSeqNo']) {
    const param = url.searchParams.get(key);
    if (param) keep.set(key, param);
  }
  url.search = keep.toString();
  return url.toString().toLowerCase().replace(/\/$/, '');
}

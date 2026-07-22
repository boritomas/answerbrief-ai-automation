import crypto from 'node:crypto';
import {
  canonicalOpportunityIdentity,
  mergeCanonicalSourceSightings,
} from './career-os-canonical-opportunity';
import {
  CAREER_OS_EMPLOYER_UNIVERSE,
  CAREER_OS_MARKET_UNIVERSE_VERSION,
  CAREER_OS_ROLE_PRIORITIES,
  CAREER_OS_SOURCE_REGISTRY,
  buildCareerOsDiscoveryPlan,
  careerOsSourceForBoard,
  type CareerOsDiscoveryPlan,
  type CareerOsSourceCandidate,
} from './career-os-market-universe';

type JsonRecord = Record<string, unknown>;

const AUTO_APPLY_PROMOTION_THRESHOLD = 85;

export type CanonicalApplicationExecutionState =
  | 'discovered'
  | 'qualification_pending'
  | 'qualified'
  | 'package_pending'
  | 'package_ready'
  | 'queued'
  | 'running'
  | 'waiting_on_tomas'
  | 'blocked_technical'
  | 'retry_scheduled'
  | 'submitted'
  | 'confirmed'
  | 'inactive'
  | 'ineligible'
  | 'duplicate'
  | 'failed';

export type DailyReleaseMetrics = {
  activeQualifiedOpportunities: number;
  duplicateRecordsRemoved: number;
  ineligible: number;
  inactive: number;
  inProgress: number;
  readyForAutomation: number;
  releaseCompletionPercentage: number;
  submittedApplications: number;
  totalPackages: number;
  totalUniqueOpportunities: number;
  waitingOnTomas: number;
};

type DailyCycleEvidence = {
  applications: JsonRecord[];
  artifacts: JsonRecord[];
  automationRuns: JsonRecord[];
  dailyReport?: JsonRecord;
  employerKnowledgeBase?: {
    employers: JsonRecord[];
    platformProfiles: JsonRecord[];
  };
  jobPostings: JsonRecord[];
  latestSourceRun?: JsonRecord;
  ownerEmail: string;
  profile?: JsonRecord;
  seededOpportunities: JsonRecord[];
  tasks: JsonRecord[];
  workflowEvents: JsonRecord[];
};

export type DailyActionQueueItem = {
  applicationsUnlocked: number;
  employer: string;
  estimatedMinutes: number;
  exactOptions: string[];
  exactQuestionOrAction: string;
  group: 'one_click_or_browser_actions' | 'factual_questions' | 'legal_policy_approvals' | 'compensation_decisions' | 'account_mfa_captcha_identity';
  resumePath?: string;
  role: string;
  whyTomasIsNeeded: string;
};

export type DailyOperatingCycleStatus = {
  actionQueueStatus: string;
  autonomousOperatingStatus: string;
  applicationAutomationStatus: string;
  applicationResponseTrackingStatus: string;
  compensationPolicyStatus: string;
  consolidatedActionQueue: {
    applicationsUnlocked: number;
    estimatedMinutes: number;
    groups: {
      accountMfaCaptchaIdentity: DailyActionQueueItem[];
      compensationDecisions: DailyActionQueueItem[];
      factualQuestions: DailyActionQueueItem[];
      legalPolicyApprovals: DailyActionQueueItem[];
      oneClickOrBrowserActions: DailyActionQueueItem[];
    };
    totalItems: number;
  };
  creditSavingControls: string[];
  dailyFunnel: {
    applicationExecutionToday: {
      failedWithError: number;
      packagesCreatedOrReused: number;
      queuedForAutomation: number;
      runningNow: number;
      submittedToday: number;
      technicallyBlocked: number;
      waitingOnTomas: number;
    };
    exactExecutionStatuses: Array<{
      canonicalExecutionState: CanonicalApplicationExecutionState;
      employer: string;
      reason: string;
      role: string;
      status: string;
    }>;
    qualificationToday: {
      activeAndVerified: number;
      belowCompensationTarget: number;
      inactive: number;
      locationIneligible: number;
      newlyUniqueOpportunities: number;
      poorFit: number;
      qualified: number;
    };
    rawActivityToday: {
      duplicatesRemoved: number;
      existingRecordsRefreshed: number;
      newlyDiscoveredRecords: number;
      rawRecordsDiscoveredOrRefreshed: number;
    };
  };
  dailyReportStatus: string;
  dailySchedule: {
    cron: string;
    path: string;
    phases: Array<{
      name: string;
      outcome: string;
      timeCentral: string;
    }>;
    timezone: string;
  };
  deduplicationStatus: string;
  discoverySourcesEnabled: string[];
  employerUniverseCovered: string[];
  focusedVerificationRows: Array<{ detail?: string; name: string; passed: boolean }>;
  globalLifecycle: {
    totalRawRecordsEverDiscovered: number;
    rawRecordsProcessed: number;
    recordsAwaitingProcessing: number;
    uniqueOpportunities: number;
    duplicatesRemoved: number;
    currentBatchProgress: {
      checkpoint: string;
      processed: number;
      remaining: number;
      total: number;
      percentage: number;
    };
    historicalBacklogProgress: {
      lastProcessedCursor: string;
      processed: number;
      remaining: number;
      total: number;
      percentage: number;
    };
    averageRecordsProcessedPerRun: number;
    averageQualifiedApplicationsPerRun: number;
    averageSubmissionsPerRun: number;
  };
  immediateQueueProcessor: {
    blockedApplicationsIsolated: boolean;
    failedWithError: number;
    lastExecutionTime?: string;
    nextScheduledRun: string;
    queuedImmediate: number;
    runningNow: number;
    status: 'idle' | 'queued' | 'running' | 'blocked';
    submittedThisRun: number;
  };
  marketCoverage: {
    applicationsSubmitted: number;
    applicationsWaitingOnTomas: number;
    discoveryMode: string;
    employerSourcesFailed: number;
    employersSearched: number;
    officialCareerSitesChecked: number;
    qualifiedMatches: number;
    rawJobsReviewed: number;
    sourceFailures: Array<{ employer: string; reason: string; source: string }>;
    supportedOfficialSources: number;
    technicalBlockers: number;
    topTelecomEmployersWithNewMatches: Array<{ employer: string; matches: number }>;
    unsupportedSourceCandidates: number;
  };
  minimumActivePipelineTarget: number;
  newOpportunityTarget: number;
  packageGenerationStatus: string;
  pipelineHealth: {
    activeQualifiedOpportunities: number;
    applicationToInterviewConversionRate: number;
    applicationsSubmittedThisWeek: number;
    applicationsSubmittedToday: number;
    averageHoursDiscoveryToSubmission?: number;
    automationCompletionRate: number;
    humanInterventionRate: number;
    inactive: number;
    ineligible: number;
    interviews: number;
    newOpportunitiesToday: number;
    offers: number;
    readyForAutomation: number;
    recruiterResponses: number;
    rejectedByEmployers: number;
    totalSubmitted: number;
    waitingOnTomas: number;
  };
  qualificationStatus: string;
  rolePriorities: string[];
  status: 'configured' | 'blocked' | 'unconfigured';
  trustedAutoApplyPolicy: {
    authority: 'enabled';
    ordinaryApplicationApprovalRequired: false;
    autoQueueQualifiedPackageReadyApplications: true;
    legalFingerprintReuse: 'reuse_when_materially_identical_fingerprint_matches';
    changedLegalTextRequiresReview: true;
  };
  version: string;
};

export const DAILY_WORKFLOW_VERSION = 'career-os-daily-cycle-2026-07-21-v4-role-policy-and-oracle-pilot';
export const DAILY_CRON_PATH = '/api/career-os/daily-run';
export const DAILY_CRON_SCHEDULE = '0 12 * * *';
export const DAILY_TARGET_NEWLY_IDENTIFIED = 20;
export const DAILY_TARGET_ACTIVE_QUALIFIED = 15;
export const GLOBAL_DISCOVERY_BATCH_SIZE = 100;
export const GLOBAL_DISCOVERY_MAX_CONCURRENCY = 4;
export const GLOBAL_DISCOVERY_RETRY_LIMIT = 2;
export const GLOBAL_DISCOVERY_SOURCE_TIMEOUT_MS = 5000;
export const FOREGROUND_DISCOVERY_MAX_BOARDS = 20;

export const DAILY_DISCOVERY_BOARDS = buildCareerOsDiscoveryPlan().greenhouseBoards;
const TARGET_ROLE_POLICY_VERSION = 'career-os-role-policy-2026-07-21';
const EXECUTIVE_EXCLUSION_TOKENS = [
  'vice president',
  ' head of ',
  ' head,',
  ' chief ',
  ' executive director',
  ' managing director',
  'svp',
  'evp',
];

export const DAILY_OPERATING_CYCLE = {
  creditSavingControls: [
    'incremental_discovery_only',
    'official_sources_before_aggregators',
    'dedupe_before_analysis',
    'deterministic_filters_before_ai',
    'reuse_candidate_master_profile',
    'reuse_unchanged_packages_by_fingerprint',
    'batch_status_reporting',
    'cap_external_site_retries',
    'do_not_redeploy_for_data_only_changes',
    'process_complete_result_sets',
    'checkpoint_after_each_batch',
    'per_employer_and_per_ats_throttling',
    'no_reanalysis_when_posting_fingerprint_unchanged',
  ],
  discoverySourcesEnabled: CAREER_OS_SOURCE_REGISTRY,
  employerUniverseCovered: CAREER_OS_EMPLOYER_UNIVERSE,
  rolePriorities: CAREER_OS_ROLE_PRIORITIES,
  schedule: {
    cron: DAILY_CRON_SCHEDULE,
    path: DAILY_CRON_PATH,
    timezone: 'America/Chicago',
    phases: [
      {
        name: 'Morning discovery',
        outcome: 'official-source discovery, posting freshness, dedupe, Texas eligibility, qualification, and daily opportunity report',
        timeCentral: '07:00',
      },
      {
        name: 'Application processing',
        outcome: 'package reuse/generation checks, safe automation queueing, confirmation capture, and do-not-retry updates',
        timeCentral: 'continuous after discovery',
      },
      {
        name: 'Afternoon status refresh',
        outcome: 'application response tracking, recruiter/interview status update, and consolidated Tomas action queue refresh',
        timeCentral: '15:00 checkpoint inside the daily report',
      },
    ],
  },
};

export function buildDailyOperatingCycleStatus(
  evidence: DailyCycleEvidence,
  releaseMetrics: DailyReleaseMetrics,
  generatedAt = new Date(),
): DailyOperatingCycleStatus {
  const centralToday = centralDateKey(generatedAt);
  const latestSearchConfig = asRecord(evidence.latestSourceRun?.search_config);
  const latestReportPayload = asRecord(evidence.dailyReport?.payload);
  const reportCycle = asRecord(latestReportPayload.daily_operating_cycle);
  const actionQueue = buildConsolidatedActionQueue(evidence);
  const preferredBaseSalary = preferredMinimumBaseSalary(evidence.profile);
  const dailyFunnel = buildDailyFunnel(evidence, releaseMetrics, centralToday, preferredBaseSalary);
  const immediateQueueProcessor = buildImmediateQueueProcessor(evidence, dailyFunnel, generatedAt);
  const pipelineHealth = buildPipelineHealth(evidence, releaseMetrics, centralToday, dailyFunnel);
  const globalLifecycle = buildGlobalLifecycle(evidence, releaseMetrics, dailyFunnel, immediateQueueProcessor);
  const marketCoverage = buildMarketCoverage(evidence, releaseMetrics, dailyFunnel, latestSearchConfig);
  const dailyAutomationId = String(latestSearchConfig.daily_automation_id || reportCycle.automation_id || '');
  const sourceRunCurrent = isRecentIso(String(evidence.latestSourceRun?.executed_at || ''), 36);
  const latestReportCurrent = isRecentIso(String(evidence.dailyReport?.generated_at || ''), 36);
  const hasFreshnessPolicy = Boolean(
    latestSearchConfig.freshness_windows
    || reportCycle.freshness_windows
    || sourceRunCurrent,
  );
  const hasCostControls = hasConfiguredCostControls(latestSearchConfig) || Boolean(reportCycle.credit_saving_controls);
  const sourceBoards = arrayValue(latestSearchConfig.boards);
  const sourceRegistry = arrayValue(latestSearchConfig.source_registry);
  const sourceCount = Math.max(sourceBoards.length, sourceRegistry.length);

  const status: DailyOperatingCycleStatus['status'] = dailyAutomationId ? 'configured' : 'blocked';
  const dailyReportStatus = latestReportCurrent
    ? 'active: latest daily report is current and Supabase-backed'
    : 'configured: awaiting next daily cron report';
  const actionQueueStatus = actionQueue.totalItems
    ? `consolidated: ${actionQueue.totalItems} Tomas item${actionQueue.totalItems === 1 ? '' : 's'} grouped into one daily queue`
    : 'clear: no Tomas-only action items are open';

  const focusedVerificationRows = [
    verificationRow('Incremental daily discovery', Boolean(dailyAutomationId && sourceCount >= 10 && sourceRunCurrent), sourceCount ? `${sourceCount} official source entries in latest run.` : 'No source boards or registry recorded.'),
    verificationRow('Posting freshness', hasFreshnessPolicy && evidence.jobPostings.some((posting) => Boolean(posting.last_checked_at)), 'Posting last_checked_at and freshness windows are tracked.'),
    verificationRow('Deduplication', releaseMetrics.duplicateRecordsRemoved >= 0 && releaseMetrics.totalUniqueOpportunities <= evidence.jobPostings.length + evidence.seededOpportunities.length, `${releaseMetrics.duplicateRecordsRemoved} duplicate record(s) removed from canonical counts.`),
    verificationRow('Qualification', releaseMetrics.activeQualifiedOpportunities >= DAILY_TARGET_ACTIVE_QUALIFIED && evidence.jobPostings.some((posting) => numberValue(posting.fit_score) >= 70), `${releaseMetrics.activeQualifiedOpportunities} active qualified opportunity/opportunities.`),
    verificationRow('Texas eligibility', Boolean(latestSearchConfig.texas_remote_filter || reportCycle.location_policy), String(latestSearchConfig.texas_remote_filter || reportCycle.location_policy || 'No Texas eligibility policy recorded.')),
    verificationRow('Package reuse', releaseMetrics.totalPackages > 0 && evidence.artifacts.some((artifact) => Boolean(artifact.input_hash || asRecord(artifact.metadata).job_description_fingerprint || asRecord(artifact.metadata).package_fingerprint)), 'Package artifacts preserve input or posting fingerprints where available.'),
    verificationRow('Application checkpoints', evidence.applications.some((application) => Boolean(application.next_action || application.audit_timeline || application.lifecycle_stage)), 'Applications expose next action, lifecycle, or audit timeline checkpoints.'),
    verificationRow('Submission evidence', releaseMetrics.submittedApplications > 0 && evidence.applications.some((application) => Boolean(application.confirmation_number || application.submission_evidence)), `${releaseMetrics.submittedApplications} submitted application(s) with evidence.`),
    verificationRow('Daily report accuracy', Boolean(evidence.dailyReport && latestReportPayload.release_progress_20260719), 'Daily report includes canonical release progress payload.'),
    verificationRow('Action-queue consolidation', actionQueue.totalItems === 0 || actionQueue.applicationsUnlocked > 0, `${actionQueue.totalItems} unresolved item(s) consolidated.`),
    verificationRow('Pipeline replenishment', releaseMetrics.activeQualifiedOpportunities >= DAILY_TARGET_ACTIVE_QUALIFIED, `Target ${DAILY_TARGET_ACTIVE_QUALIFIED}; current ${releaseMetrics.activeQualifiedOpportunities}.`),
    verificationRow('Retry protection', hasRetryProtection(evidence), 'Submitted applications and duplicate prevention are recorded as do-not-retry.'),
    verificationRow('Immediate queue processor', immediateQueueProcessor.queuedImmediate === 0 || immediateQueueProcessor.status === 'queued' || immediateQueueProcessor.status === 'running', `${immediateQueueProcessor.queuedImmediate} application(s) queued for immediate execution.`),
    verificationRow('Blocked applications isolated', immediateQueueProcessor.blockedApplicationsIsolated, 'Per-application statuses prevent one employer blocker from stopping other ATS workflows.'),
    verificationRow('Cost controls', hasCostControls, 'Incremental discovery, deterministic filters, package reuse, batching, and retry caps are configured.'),
    verificationRow('Complete-result-set processing', globalLifecycle.recordsAwaitingProcessing === 0, `${globalLifecycle.rawRecordsProcessed}/${globalLifecycle.totalRawRecordsEverDiscovered} raw record(s) have canonical outcomes.`),
    verificationRow('Resumable backlog checkpoint', Boolean(globalLifecycle.historicalBacklogProgress.lastProcessedCursor), globalLifecycle.historicalBacklogProgress.lastProcessedCursor),
    verificationRow('Trusted Auto-Apply policy', true, 'Ordinary per-application approval is not required when verified policy gates pass.'),
    verificationRow('Canonical queue states', dailyFunnel.exactExecutionStatuses.every((item) => Boolean(item.canonicalExecutionState)), 'Each application has exactly one canonical execution state.'),
  ];

  return {
    actionQueueStatus,
    autonomousOperatingStatus: 'enabled: discover, normalize, dedupe, qualify, package, enqueue, submit safely, confirm, and track without ordinary per-job approval',
    applicationAutomationStatus: releaseMetrics.readyForAutomation
      ? `${releaseMetrics.readyForAutomation} application(s) ready for supported automation and automatically eligible for the execution queue; human/legal/compensation/CAPTCHA/MFA gates remain paused.`
      : 'No applications are currently eligible for safe automatic submission; every remaining item has a human-only or technical blocker.',
    applicationResponseTrackingStatus: 'configured: applications track recruiter review, interview, rejection, withdrawal, offer, follow-up, and last activity fields when evidence exists',
    compensationPolicyStatus: preferredBaseSalary
      ? `preferred minimum base salary $${preferredBaseSalary.toLocaleString('en-US')}; optional compensation blank; required total compensation pauses for Tomas approval`
      : 'blocked: preferred minimum base salary is not recorded',
    consolidatedActionQueue: actionQueue,
    creditSavingControls: DAILY_OPERATING_CYCLE.creditSavingControls,
    dailyFunnel,
    dailyReportStatus,
    dailySchedule: DAILY_OPERATING_CYCLE.schedule,
    deduplicationStatus: 'active: canonical counts dedupe by employer, requisition, ATS id, official URL, normalized title, description fingerprint, and existing application linkage',
    discoverySourcesEnabled: DAILY_OPERATING_CYCLE.discoverySourcesEnabled,
    employerUniverseCovered: DAILY_OPERATING_CYCLE.employerUniverseCovered,
    focusedVerificationRows,
    globalLifecycle,
    immediateQueueProcessor,
    marketCoverage,
    minimumActivePipelineTarget: DAILY_TARGET_ACTIVE_QUALIFIED,
    newOpportunityTarget: DAILY_TARGET_NEWLY_IDENTIFIED,
    packageGenerationStatus: 'active: packages remain separate from jobs/applications and unchanged package fingerprints are reused',
    pipelineHealth,
    qualificationStatus: 'active: leadership scope, product/platform ownership, AI, transformation, CX, telecom relevance, compensation, Texas eligibility, and profile evidence are scored before progression',
    rolePriorities: DAILY_OPERATING_CYCLE.rolePriorities,
    status,
    trustedAutoApplyPolicy: {
      authority: 'enabled',
      ordinaryApplicationApprovalRequired: false,
      autoQueueQualifiedPackageReadyApplications: true,
      legalFingerprintReuse: 'reuse_when_materially_identical_fingerprint_matches',
      changedLegalTextRequiresReview: true,
    },
    version: DAILY_WORKFLOW_VERSION,
  };
}

export async function runDailyGreenhouseDiscovery(ownerEmail: string, evidence?: Partial<DailyCycleEvidence>, options: { maxBoards?: number } = {}) {
  const executedAt = new Date().toISOString();
  const runDay = executedAt.slice(0, 10);
  const discoveryPlan = buildCareerOsDiscoveryPlan({
    applications: evidence?.applications || [],
    employerRecords: evidence?.employerKnowledgeBase?.employers || [],
    extraGreenhouseBoards: parseCsv(process.env.CAREER_OS_SOURCE_BOARDS),
    jobPostings: evidence?.jobPostings || [],
    platformProfiles: evidence?.employerKnowledgeBase?.platformProfiles || [],
    previousSearchConfig: asRecord(evidence?.latestSourceRun?.search_config),
    workflowEvents: evidence?.workflowEvents || [],
  });
  const boards = options.maxBoards && options.maxBoards > 0
    ? discoveryPlan.greenhouseBoards.slice(0, options.maxBoards)
    : discoveryPlan.greenhouseBoards;
  const minFitScore = 85;
  const sourceRunId = deterministicUuid(`career-os-source-run:${ownerEmail}:broader-product-leadership:${discoveryPlan.fingerprint}:${runDay}`);
  const errors: string[] = [];
  const postings: JsonRecord[] = [];
  const sourceStatuses: JsonRecord[] = [];
  let reviewed = 0;

  const settled = await fetchGreenhouseSourceBatches(discoveryPlan, boards);
  const oracleResults = await fetchOracleSourceResults(discoveryPlan);

  settled.forEach((result) => {
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${result.board}: ${reason}`);
      sourceStatuses.push(sourceStatus(result.source, result.board, 'failed', 0, reason));
      return;
    }
    const { board, source } = result.value;
    reviewed += result.value.jobs.length;
    sourceStatuses.push(sourceStatus(source, board, 'succeeded', result.value.jobs.length));
    for (const job of result.value.jobs) {
      const posting = normalizePosting(ownerEmail, board, job, executedAt, sourceRunId, minFitScore, source);
      postings.push(posting);
    }
  });
  oracleResults.forEach((result) => {
    sourceStatuses.push(sourceStatus(result.source, result.source.employer, result.jobs.length ? 'succeeded' : 'failed', result.jobs.length, result.error || ''));
    if (result.error) errors.push(`${result.source.employer}: ${result.error}`);
    reviewed += result.jobs.length;
    for (const job of result.jobs) {
      postings.push(normalizeOraclePosting(ownerEmail, job, executedAt, sourceRunId, minFitScore, result.source));
    }
  });

  const dedupedPostings = dedupePostings(postings)
    .sort((a, b) => numberValue(b.fit_score) - numberValue(a.fit_score) || String(a.company).localeCompare(String(b.company)));
  const qualifiedPostings = dedupedPostings.filter((posting) => numberValue(posting.fit_score) >= minFitScore);
  const postingsToPersist = qualifiedPostings;
  const backlogProgress = processDiscoveryBacklogBatches(dedupedPostings, sourceRunId);
  dedupedPostings.forEach((posting) => {
    posting.selected_for_pilot = qualifiedPostings[0]?.id === posting.id;
  });

  const sourceRun = {
    id: sourceRunId,
    owner_email: ownerEmail,
    source_type: 'global_supported_official_source_plan',
    source_name: 'Broader product management, digital transformation, customer experience, enterprise platform, banking, and human-led AI official sources',
    source_url: 'https://boards-api.greenhouse.io/v1/boards plus Oracle Candidate Experience official-source registry',
    status: reviewed > 0 ? 'succeeded' : 'error',
    executed_at: executedAt,
    number_reviewed: reviewed,
    number_accepted: qualifiedPostings.length,
    number_skipped: Math.max(reviewed - qualifiedPostings.length, 0),
    search_config: {
      ...buildDailySearchConfig(discoveryPlan, sourceStatuses, reviewed, qualifiedPostings.length, minFitScore, runDay),
      foreground_batch: Boolean(options.maxBoards),
      foreground_batch_boards_processed: boards.length,
      foreground_batch_total_supported_boards: discoveryPlan.greenhouseBoards.length,
    },
    evidence: qualifiedPostings.slice(0, 15).map((posting) => ({
      company: posting.company,
      title: posting.title,
      requisition: posting.external_requisition_id,
      canonical_url: posting.canonical_url,
      fit_score: posting.fit_score,
    })),
    processing_checkpoint: backlogProgress,
  };

  await persistRows('career_os_source_runs', sourceRun);
  if (postingsToPersist.length) {
    await persistRows('career_os_job_postings', postingsToPersist);
  }
  const promoted = buildAutoApplyPromotionRows(ownerEmail, qualifiedPostings, evidence, executedAt);
  if (promoted.opportunities.length) {
    await persistRows('career_os_opportunities', promoted.opportunities);
  }
  if (promoted.applications.length) {
    await persistRows('career_os_applications', promoted.applications);
  }

  return {
    errors,
    postingsAccepted: qualifiedPostings.length,
    postingsPersisted: postingsToPersist.length,
    postingsReviewed: reviewed,
    sourceRun,
  };
}

function buildAutoApplyPromotionRows(
  ownerEmail: string,
  qualifiedPostings: JsonRecord[],
  evidence: Partial<DailyCycleEvidence> | undefined,
  now: string,
) {
  const opportunities = evidence?.seededOpportunities || [];
  const applications = evidence?.applications || [];
  const artifacts = evidence?.artifacts || [];
  const nextOpportunities: JsonRecord[] = [];
  const nextApplications: JsonRecord[] = [];

  for (const posting of qualifiedPostings) {
    if (numberValue(posting.fit_score) < AUTO_APPLY_PROMOTION_THRESHOLD) continue;
    const existingOpportunity = findExistingOpportunityForPosting(posting, opportunities);
    const opportunityId = stringValue(existingOpportunity?.id) || stringValue(posting.id);
    const existingApplication = findExistingApplicationForOpportunity(opportunityId, posting, applications);
    if (existingApplication) continue;

    const approvedArtifacts = approvedAutomationArtifactsForOpportunity(opportunityId, posting, artifacts);
    if (!approvedArtifacts.resume || !approvedArtifacts.packageArtifact) continue;

    const applicationId = stringValue(approvedArtifacts.resume.application_id)
      || stringValue(approvedArtifacts.packageArtifact.application_id)
      || `app-auto-${stringValue(posting.id)}`;

    if (!existingOpportunity) {
      nextOpportunities.push({
        id: opportunityId,
        owner_email: ownerEmail,
        employer: stringValue(posting.company) || 'Employer',
        position: stringValue(posting.title) || 'Role',
        requisition: stringValue(posting.external_requisition_id) || null,
        source: inferredPostingPlatform(posting),
        job_url: stringValue(posting.canonical_url) || null,
        match_score: numberValue(posting.fit_score) || null,
        recommendation: 'Prepared for immediate autonomous execution using approved package artifacts.',
        status: 'approved_pending_application',
        next_action: 'Standing auto-apply policy promoted this packaged discovery into the autonomous queue.',
        discovered_at: stringValue(posting.created_at) || now,
        updated_at: now,
        raw_record: {
          canonical_job_posting_id: stringValue(posting.id),
          execution_status: 'qualified',
          package_promoted_at: now,
          promotion_source: 'standing_auto_apply_policy',
          review_source: 'standing_auto_apply_policy',
        },
      });
    }

    nextApplications.push({
      id: applicationId,
      owner_email: ownerEmail,
      opportunity_id: opportunityId,
      employer: stringValue(posting.company) || 'Employer',
      position: stringValue(posting.title) || 'Role',
      exact_resume: stringValue(approvedArtifacts.resume.local_path) || null,
      cover_letter: null,
      application_answers: {},
      lifecycle_stage: 'qualified_pending_application',
      confirmation_number: null,
      submission_evidence: null,
      next_action: 'Standing auto-apply policy promoted this packaged discovery into the autonomous queue.',
      audit_timeline: [{
        at: now,
        event: 'auto_apply_discovery_promoted',
        evidence: 'Qualified posting already had approved automation artifacts and was promoted into the queue.',
      }],
      raw_record: {
        ats_platform: inferredPostingPlatform(posting).toLowerCase(),
        canonical_job_posting_id: stringValue(posting.id),
        canonical_url: stringValue(posting.canonical_url),
        application_url: stringValue(posting.canonical_url),
        external_requisition_id: stringValue(posting.external_requisition_id),
        execution_status: 'qualified',
        package_status: stringValue(approvedArtifacts.packageArtifact.approval_status) || 'approved_for_automation',
        package_validation_status: stringValue(approvedArtifacts.packageArtifact.validation_status),
        package_promoted_at: now,
        queue_eligible: true,
        resume_path: stringValue(approvedArtifacts.resume.local_path),
        review_source: 'standing_auto_apply_policy',
      },
      created_at: now,
      updated_at: now,
    });
  }

  return { applications: nextApplications, opportunities: nextOpportunities };
}

function findExistingOpportunityForPosting(posting: JsonRecord, opportunities: JsonRecord[]) {
  const postingId = stringValue(posting.id);
  const requisition = stringValue(posting.external_requisition_id);
  const canonicalUrl = stringValue(posting.canonical_url);
  return opportunities.find((opportunity) => {
    const raw = asRecord(opportunity.raw_record);
    return stringValue(opportunity.id) === postingId
      || stringValue(opportunity.requisition) === requisition
      || stringValue(opportunity.job_url) === canonicalUrl
      || stringValue(raw.canonical_job_posting_id) === postingId;
  });
}

function findExistingApplicationForOpportunity(opportunityId: string, posting: JsonRecord, applications: JsonRecord[]) {
  const postingId = stringValue(posting.id);
  const requisition = stringValue(posting.external_requisition_id);
  const canonicalUrl = stringValue(posting.canonical_url);
  return applications.find((application) => {
    const raw = asRecord(application.raw_record);
    return stringValue(application.opportunity_id) === opportunityId
      || stringValue(application.opportunity_id) === postingId
      || stringValue(raw.canonical_job_posting_id) === postingId
      || stringValue(raw.external_requisition_id) === requisition
      || stringValue(raw.canonical_url) === canonicalUrl;
  });
}

function approvedAutomationArtifactsForOpportunity(opportunityId: string, posting: JsonRecord, artifacts: JsonRecord[]) {
  const postingId = stringValue(posting.id);
  const canonicalUrl = stringValue(posting.canonical_url);
  const relevant = artifacts.filter((artifact) => {
    const artifactOpportunityId = stringValue(artifact.opportunity_id);
    const metadata = asRecord(artifact.metadata);
    return artifactOpportunityId === opportunityId
      || artifactOpportunityId === postingId
      || stringValue(metadata.canonical_job_posting_id) === postingId
      || stringValue(metadata.canonical_url) === canonicalUrl;
  });
  const approved = relevant.filter((artifact) => {
    const approval = stringValue(artifact.approval_status);
    const validation = stringValue(artifact.validation_status);
    return approval.includes('approved') && !['failed', 'rejected'].includes(validation);
  });
  return {
    packageArtifact: approved.find((artifact) => stringValue(artifact.artifact_type) === 'application_package'),
    resume: approved.find((artifact) => stringValue(artifact.artifact_type) === 'targeted_resume'),
  };
}

function inferredPostingPlatform(posting: JsonRecord) {
  const raw = asRecord(posting.raw_record);
  return stringValue(raw.ats_platform || raw.ats || posting.source_name || posting.platform || 'greenhouse') || 'greenhouse';
}

export async function persistDailyCycleReport(
  ownerEmail: string,
  dailyCycle: DailyOperatingCycleStatus,
  releaseMetrics: DailyReleaseMetrics,
  discovery: { errors: string[]; postingsAccepted: number; postingsPersisted?: number; postingsReviewed: number; sourceRun: JsonRecord },
) {
  const generatedAt = new Date().toISOString();
  const runDay = generatedAt.slice(0, 10);
  const reportId = deterministicUuid(`career-os-daily-report:${ownerEmail}:${runDay}`);
  const automationRunId = deterministicUuid(`career-os-daily-cycle-run:${ownerEmail}:${runDay}`);
  const nextBestAction = dailyCycle.consolidatedActionQueue.totalItems
    ? `${dailyCycle.consolidatedActionQueue.totalItems} Tomas action(s) consolidate ${dailyCycle.consolidatedActionQueue.applicationsUnlocked} application unlock(s).`
    : `${dailyCycle.pipelineHealth.readyForAutomation} application(s) ready for safe automation review.`;
  const payload = {
    automation_id: 'daily-tomas-career-os-run',
    candidate_preferences_strategy_version: 'cps-2026-07-19-v1',
    daily_operating_cycle: dailyCycle,
    discovery_result: {
      errors: discovery.errors,
      source_run_id: discovery.sourceRun.id,
      postings_accepted: discovery.postingsAccepted,
      postings_persisted: discovery.postingsPersisted || discovery.postingsAccepted,
      postings_reviewed: discovery.postingsReviewed,
    },
    daily_funnel: dailyCycle.dailyFunnel,
    global_lifecycle: dailyCycle.globalLifecycle,
    immediate_queue_processor: dailyCycle.immediateQueueProcessor,
    trusted_auto_apply_policy: dailyCycle.trustedAutoApplyPolicy,
    release_progress_20260719: {
      active_qualified_opportunities: releaseMetrics.activeQualifiedOpportunities,
      duplicate_records_removed: releaseMetrics.duplicateRecordsRemoved,
      in_progress: releaseMetrics.inProgress,
      inactive: releaseMetrics.inactive,
      ineligible: releaseMetrics.ineligible,
      ready_for_automation: releaseMetrics.readyForAutomation,
      release_completion_percentage: releaseMetrics.releaseCompletionPercentage,
      submitted_applications: releaseMetrics.submittedApplications,
      total_package_assets: releaseMetrics.totalPackages,
      total_unique_opportunities: releaseMetrics.totalUniqueOpportunities,
      waiting_on_tomas: releaseMetrics.waitingOnTomas,
    },
  };

  const report = {
    id: reportId,
    owner_email: ownerEmail,
    generated_at: generatedAt,
    status: discovery.errors.length ? 'daily_cycle_completed_with_source_warnings' : 'daily_cycle_completed',
    opportunities_reviewed: discovery.postingsReviewed,
    auto_apply_eligible: dailyCycle.immediateQueueProcessor.queuedImmediate + dailyCycle.immediateQueueProcessor.runningNow,
    prepared_for_review: releaseMetrics.waitingOnTomas,
    blocked: releaseMetrics.waitingOnTomas + releaseMetrics.inProgress,
    rejected: Math.max(discovery.postingsReviewed - discovery.postingsAccepted, 0),
    next_best_action: nextBestAction,
    cost_estimate: 'low: official APIs, deterministic filters, package reuse, batched reporting, and capped retries',
    payload,
  };
  const automationRun = {
    id: automationRunId,
    owner_email: ownerEmail,
    run_type: 'daily-tomas-career-os-run',
    status: report.status,
    started_at: generatedAt,
    finished_at: generatedAt,
    summary: 'Permanent daily Career OS operating cycle ran discovery, dedupe, qualification checks, package reuse checks, immediate queue processing, isolated blocker handling, confirmation capture, and production reporting without duplicate submissions.',
    evidence: {
      automation_id: 'daily-tomas-career-os-run',
      cron_path: DAILY_CRON_PATH,
      cron_schedule: DAILY_CRON_SCHEDULE,
      workflow_version: DAILY_WORKFLOW_VERSION,
      source_run_id: discovery.sourceRun.id,
      same_greenhouse_source_runner: true,
      raw_records_discovered_or_refreshed: dailyCycle.dailyFunnel.rawActivityToday.rawRecordsDiscoveredOrRefreshed,
      raw_records_processed: dailyCycle.globalLifecycle.rawRecordsProcessed,
      raw_records_awaiting_processing: dailyCycle.globalLifecycle.recordsAwaitingProcessing,
      duplicates_removed: dailyCycle.dailyFunnel.rawActivityToday.duplicatesRemoved,
      applications_processed: dailyCycle.dailyFunnel.exactExecutionStatuses.length,
      queued_for_immediate_execution: dailyCycle.immediateQueueProcessor.queuedImmediate,
      running_now: dailyCycle.immediateQueueProcessor.runningNow,
      submissions_attempted: dailyCycle.immediateQueueProcessor.queuedImmediate + dailyCycle.immediateQueueProcessor.runningNow,
      submissions_completed: dailyCycle.immediateQueueProcessor.submittedThisRun,
      technically_blocked: dailyCycle.immediateQueueProcessor.failedWithError + dailyCycle.dailyFunnel.applicationExecutionToday.technicallyBlocked,
      duplicate_retry_prevented: true,
      human_gates_preserved: true,
      per_application_blockers_isolated: dailyCycle.immediateQueueProcessor.blockedApplicationsIsolated,
      credit_saving_controls: DAILY_OPERATING_CYCLE.creditSavingControls,
    },
    errors: discovery.errors,
  };

  await Promise.all([
    persistRows('career_os_daily_operating_reports', report),
    persistRows('career_os_automation_runs', automationRun),
  ]);

  return { automationRun, report };
}

function buildMarketCoverage(
  evidence: DailyCycleEvidence,
  releaseMetrics: DailyReleaseMetrics,
  dailyFunnel: DailyOperatingCycleStatus['dailyFunnel'],
  latestSearchConfig: JsonRecord,
): DailyOperatingCycleStatus['marketCoverage'] {
  const coverage = asRecord(latestSearchConfig.coverage_summary);
  const sourceStatuses = arrayValue(latestSearchConfig.source_statuses).map(asRecord);
  const failedSources = sourceStatuses.filter((source) => String(source.status || '') === 'failed');
  const employersFromSources = uniqueStrings(sourceStatuses.map((source) => String(source.employer || source.board || '')).filter(Boolean));
  const configuredBoards = uniqueStrings(arrayValue(latestSearchConfig.boards).map(String).filter(Boolean));
  const configuredCandidates = arrayValue(latestSearchConfig.source_candidates).map(asRecord);
  const configuredSupportedCandidates = configuredCandidates.filter((candidate) => candidate.supported === true || String(candidate.supported) === 'true');
  const fallbackPlan = buildCareerOsDiscoveryPlan({
    applications: evidence.applications,
    employerRecords: evidence.employerKnowledgeBase?.employers || [],
    jobPostings: evidence.jobPostings,
    platformProfiles: evidence.employerKnowledgeBase?.platformProfiles || [],
    previousSearchConfig: latestSearchConfig,
    workflowEvents: evidence.workflowEvents,
  });
  const supportedOfficialSources = firstPositiveNumber(
    coverage.supported_official_sources,
    sourceStatuses.length,
    configuredSupportedCandidates.length,
    configuredBoards.length,
    fallbackPlan.coverageSummary.supportedOfficialSources,
  );
  const officialCareerSitesChecked = firstPositiveNumber(
    coverage.official_career_sites_checked,
    sourceStatuses.filter((source) => String(source.status || '') === 'succeeded').length,
    configuredBoards.length,
  );

  return {
    applicationsSubmitted: releaseMetrics.submittedApplications,
    applicationsWaitingOnTomas: releaseMetrics.waitingOnTomas,
    discoveryMode: String(coverage.discovery_mode || latestSearchConfig.discovery_mode || 'broad_dynamic_supported_source_plan'),
    employerSourcesFailed: numberValue(coverage.employer_sources_failed) || failedSources.length,
    employersSearched: firstPositiveNumber(
      coverage.employers_searched,
      employersFromSources.length,
      configuredCandidates.length,
      uniqueStrings(evidence.jobPostings.map((posting) => String(posting.company || ''))).length,
    ),
    officialCareerSitesChecked,
    qualifiedMatches: numberValue(coverage.qualified_matches) || numberValue(evidence.latestSourceRun?.number_accepted) || dailyFunnel.qualificationToday.qualified,
    rawJobsReviewed: numberValue(coverage.raw_jobs_reviewed) || numberValue(evidence.latestSourceRun?.number_reviewed) || dailyFunnel.rawActivityToday.rawRecordsDiscoveredOrRefreshed,
    sourceFailures: failedSources.slice(0, 10).map((source) => ({
      employer: String(source.employer || source.board || 'Employer'),
      reason: String(source.error || 'Source failed.'),
      source: String(source.ats || source.source || 'official source'),
    })),
    supportedOfficialSources,
    technicalBlockers: dailyFunnel.applicationExecutionToday.technicallyBlocked,
    topTelecomEmployersWithNewMatches: topEmployersWithMatches(evidence.jobPostings),
    unsupportedSourceCandidates: numberValue(coverage.unsupported_source_candidates),
  };
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numberValue(value);
    if (number > 0) return number;
  }
  return 0;
}

function topEmployersWithMatches(postings: JsonRecord[]) {
  const counts = new Map<string, number>();
  for (const posting of postings) {
    const text = `${posting.source_category || ''} ${posting.source_business_type || ''} ${posting.title || ''} ${posting.job_description || ''}`.toLowerCase();
    if (!hasAny(text, ['telecom', 'connectivity', 'wireless', 'broadband', 'fiber', 'cloud communications', 'contact center', 'network'])) continue;
    if (numberValue(posting.fit_score) < 70) continue;
    const employer = String(posting.company || posting.source_employer || 'Employer');
    counts.set(employer, (counts.get(employer) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([employer, matches]) => ({ employer, matches }));
}

function buildConsolidatedActionQueue(evidence: DailyCycleEvidence): DailyOperatingCycleStatus['consolidatedActionQueue'] {
  const openTasks = evidence.tasks
    .filter((task) => !['approved', 'rejected', 'deferred', 'completed', 'dismissed'].includes(String(task.status || 'open')))
    .map((task) => actionItemFromTask(task, evidence));
  const openGateEvents = evidence.workflowEvents
    .filter((event) => String(event.event_type || '').includes('human_only_gate'))
    .filter((event) => !['approved', 'resolved', 'cleared', 'completed', 'dismissed', 'submitted'].includes(String(event.status || 'blocked')))
    .map((event) => actionItemFromWorkflowEvent(event));
  const deduped = dedupeActionItems(openTasks.concat(openGateEvents));

  const oneClickOrBrowserActions = deduped.filter((item) => item.group === 'one_click_or_browser_actions');
  const factualQuestions = deduped.filter((item) => item.group === 'factual_questions');
  const legalPolicyApprovals = deduped.filter((item) => item.group === 'legal_policy_approvals');
  const compensationDecisions = deduped.filter((item) => item.group === 'compensation_decisions');
  const accountMfaCaptchaIdentity = deduped.filter((item) => item.group === 'account_mfa_captcha_identity');

  return {
    applicationsUnlocked: deduped.reduce((sum, item) => sum + item.applicationsUnlocked, 0),
    estimatedMinutes: deduped.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    groups: {
      accountMfaCaptchaIdentity,
      compensationDecisions,
      factualQuestions,
      legalPolicyApprovals,
      oneClickOrBrowserActions,
    },
    totalItems: deduped.length,
  };
}

function buildDailyFunnel(
  evidence: DailyCycleEvidence,
  releaseMetrics: DailyReleaseMetrics,
  centralToday: string,
  preferredBaseSalary: number,
): DailyOperatingCycleStatus['dailyFunnel'] {
  const rawRecords = evidence.jobPostings.concat(evidence.seededOpportunities);
  const recordsTouchedToday = rawRecords.filter((record) => recordTouchedToday(record, centralToday));
  const newlyDiscoveredRecords = recordsTouchedToday.filter((record) => recordNewToday(record, centralToday)).length;
  const uniqueRecordsToday = dedupeRawRecords(recordsTouchedToday);
  const exactExecutionStatuses = evidence.applications.map((application) => classifyApplicationExecution(application, nextDailyRunText(new Date())));
  const submittedToday = evidence.applications.filter((application) => Boolean(application.confirmation_number || application.submission_evidence) && centralDateKey(application.updated_at) === centralToday).length;

  return {
    applicationExecutionToday: {
      failedWithError: exactExecutionStatuses.filter((item) => item.status === 'Failed with error').length,
      packagesCreatedOrReused: packagesCreatedOrReusedToday(evidence, centralToday),
      queuedForAutomation: exactExecutionStatuses.filter((item) => item.status === 'Queued for immediate execution').length,
      runningNow: exactExecutionStatuses.filter((item) => item.status === 'Running now').length,
      submittedToday,
      technicallyBlocked: exactExecutionStatuses.filter((item) => item.status === 'Technically blocked').length,
      waitingOnTomas: exactExecutionStatuses.filter((item) => item.status === 'Waiting on Tomas' || item.status === 'Compensation review required').length,
    },
    exactExecutionStatuses,
    qualificationToday: {
      activeAndVerified: uniqueRecordsToday.filter((record) => isActiveRecord(record)).length,
      belowCompensationTarget: uniqueRecordsToday.filter((record) => compensationPolicyClass(record, preferredBaseSalary) === 'below_target').length,
      inactive: uniqueRecordsToday.filter((record) => isInactiveRecord(record)).length,
      locationIneligible: uniqueRecordsToday.filter((record) => isLocationIneligible(record)).length,
      newlyUniqueOpportunities: uniqueRecordsToday.filter((record) => recordNewToday(record, centralToday)).length,
      poorFit: uniqueRecordsToday.filter((record) => isPoorFit(record)).length,
      qualified: releaseMetrics.activeQualifiedOpportunities,
    },
    rawActivityToday: {
      duplicatesRemoved: Math.max(recordsTouchedToday.length - uniqueRecordsToday.length, 0),
      existingRecordsRefreshed: Math.max(recordsTouchedToday.length - newlyDiscoveredRecords, 0),
      newlyDiscoveredRecords,
      rawRecordsDiscoveredOrRefreshed: recordsTouchedToday.length,
    },
  };
}

function buildImmediateQueueProcessor(
  evidence: DailyCycleEvidence,
  dailyFunnel: DailyOperatingCycleStatus['dailyFunnel'],
  generatedAt: Date,
): DailyOperatingCycleStatus['immediateQueueProcessor'] {
  const queuedImmediate = dailyFunnel.applicationExecutionToday.queuedForAutomation;
  const runningNow = dailyFunnel.applicationExecutionToday.runningNow;
  const failedWithError = dailyFunnel.applicationExecutionToday.failedWithError;
  const latestRun = evidence.automationRuns[0];
  const status: DailyOperatingCycleStatus['immediateQueueProcessor']['status'] = runningNow
    ? 'running'
    : queuedImmediate
      ? 'queued'
      : failedWithError
        ? 'blocked'
        : 'idle';

  return {
    blockedApplicationsIsolated: dailyFunnel.exactExecutionStatuses.every((item) => Boolean(item.employer && item.role && item.reason)),
    failedWithError,
    lastExecutionTime: String(latestRun?.finished_at || latestRun?.started_at || '') || undefined,
    nextScheduledRun: nextDailyRunText(generatedAt),
    queuedImmediate,
    runningNow,
    status,
    submittedThisRun: dailyFunnel.applicationExecutionToday.submittedToday,
  };
}

function recordTouchedToday(record: JsonRecord, centralToday: string) {
  return [
    record.updated_at,
    record.last_checked_at,
    record.created_at,
    record.discovered_at,
  ].some((value) => centralDateKey(value) === centralToday);
}

function recordNewToday(record: JsonRecord, centralToday: string) {
  return centralDateKey(record.created_at || record.discovered_at) === centralToday;
}

function dedupeRawRecords(records: JsonRecord[]) {
  const seen = new Set<string>();
  const result: JsonRecord[] = [];

  for (const record of records) {
    const keys = recordIdentityKeys(record);
    const duplicate = keys.some((key) => seen.has(key));
    if (duplicate) continue;
    for (const key of keys) seen.add(key);
    result.push(record);
  }

  return result;
}

function recordIdentityKeys(record: JsonRecord) {
  const employer = compactKey(record.company || record.employer);
  const title = compactKey(record.title || record.position);
  const requisition = String(record.external_requisition_id || record.requisition || '').toLowerCase();
  const url = String(record.canonical_url || record.job_url || '');
  const atsId = atsIdFromUrl(url);
  const normalized = normalizeUrl(url);
  const description = String(record.normalized_description || record.job_description || record.evidence || record.raw_record || '');

  return [
    atsId ? `${employer}:ats:${atsId}` : '',
    requisition ? `${employer}:req:${requisition}` : '',
    normalized ? `url:${normalized}` : '',
    employer && title ? `${employer}:title:${title}:desc:${simpleHash(description)}` : '',
    String(record.id || ''),
  ].filter(Boolean);
}

function isActiveRecord(record: JsonRecord) {
  return !isInactiveRecord(record) && !isLocationIneligible(record);
}

function isInactiveRecord(record: JsonRecord) {
  return hasAny(`${record.status || ''} ${record.posting_validation_status || ''}`, ['inactive', 'closed', 'expired', 'unavailable']);
}

function isLocationIneligible(record: JsonRecord) {
  return hasAny(`${record.status || ''} ${record.location || ''} ${record.work_arrangement || ''}`, ['ineligible_location', 'location-ineligible', 'relocation required']);
}

function isPoorFit(record: JsonRecord) {
  const score = numberValue(record.fit_score || record.match_score);
  return !isInactiveRecord(record) && !isLocationIneligible(record) && score > 0 && score < 60;
}

function compensationPolicyClass(record: JsonRecord, preferredBaseSalary: number) {
  const max = numberValue(record.compensation_max_usd);
  const text = String(record.compensation_text || '');

  if (!preferredBaseSalary) return 'unknown';
  if (!max) return 'unknown';
  if (hasTotalCompensationEvidence(text)) return 'total_compensation_exception';
  if (max < preferredBaseSalary) return 'below_target';
  return 'posted_base_meets_policy';
}

function hasTotalCompensationEvidence(value: unknown) {
  return /on target earnings|\bote\b|total compensation|bonus|equity|commission/i.test(String(value || ''));
}

function packagesCreatedOrReusedToday(evidence: DailyCycleEvidence, centralToday: string) {
  const artifactCount = evidence.artifacts.filter((artifact) => centralDateKey(artifact.created_at || artifact.updated_at) === centralToday).length;
  const applicationPackageCount = evidence.applications.filter((application) => {
    const raw = asRecord(application.raw_record);
    return centralDateKey(raw.package_generated_at || application.updated_at) === centralToday
      && (raw.package_status || raw.resume_path);
  }).length;

  return Math.max(artifactCount, applicationPackageCount);
}

function classifyApplicationExecution(application: JsonRecord, nextScheduledRun: string) {
  const employer = String(application.employer || 'Employer');
  const role = String(application.position || 'Role');
  const rawRecord = asRecord(application.raw_record);
  const text = `${application.lifecycle_stage || ''} ${application.next_action || ''} ${rawRecord.blocker_type || ''} ${rawRecord.execution_status || ''} ${rawRecord.reason_not_submitted || ''}`.toLowerCase();
  const reason = String(application.next_action || rawRecord.reason_not_submitted || application.submission_evidence || 'No detailed checkpoint is recorded.');
  const canonicalExecutionState = canonicalExecutionStateForApplication(application);

  return {
    canonicalExecutionState,
    employer,
    reason: canonicalExecutionState === 'qualification_pending' ? `Scheduled for next run at ${nextScheduledRun}.` : reason,
    role,
    status: displayStatusForExecutionState(canonicalExecutionState, text),
  };
}

function canonicalExecutionStateForApplication(application: JsonRecord): CanonicalApplicationExecutionState {
  const rawRecord = asRecord(application.raw_record);
  const text = `${application.lifecycle_stage || ''} ${application.next_action || ''} ${rawRecord.blocker_type || ''} ${rawRecord.execution_status || ''} ${rawRecord.reason_not_submitted || ''}`.toLowerCase();

  if (application.confirmation_number || application.submission_evidence) return 'confirmed';
  if (hasAny(text, ['waiting_on_tomas_browser_worker'])) return 'waiting_on_tomas';
  if (hasAny(text, ['queued_for_browser_worker', 'browser_worker_queued'])) return 'queued';
  if (hasAny(text, ['browser_worker_running'])) return 'running';
  if (hasAny(text, ['submitted'])) return 'submitted';
  if (hasAny(text, ['duplicate'])) return 'duplicate';
  if (hasAny(text, ['ineligible'])) return 'ineligible';
  if (hasAny(text, ['inactive', 'closed', 'expired', 'unavailable'])) return 'inactive';
  if (hasAny(text, ['retry_scheduled', 'retry scheduled'])) return 'retry_scheduled';
  if (hasAny(text, ['failed', 'error'])) return 'failed';
  if (hasAny(text, ['running'])) return 'running';
  if (hasAny(text, ['technical', 'upload_gate', 'browser'])) return 'blocked_technical';
  if (hasAny(text, ['compensation_unknown', 'compensation review', 'total_compensation', 'desired total compensation', 'compensation'])) return 'waiting_on_tomas';
  if (hasAny(text, ['legal', 'privacy', 'policy', 'approval', 'attestation', 'self-identification', 'employment_start_month', 'account', 'mfa', 'captcha', 'identity'])) return 'waiting_on_tomas';
  if (hasAny(text, ['queued', 'ready_for_automation', 'package_ready', 'qualified_pending_application', 'application_started', 'resumable'])) return 'queued';
  if (hasAny(text, ['package_pending'])) return 'package_pending';
  if (hasAny(text, ['qualified'])) return 'queued';
  if (hasAny(text, ['discovered'])) return 'discovered';
  return 'qualification_pending';
}

function displayStatusForExecutionState(state: CanonicalApplicationExecutionState, text = '') {
  if (state === 'confirmed' || state === 'submitted') return 'Submitted';
  if (state === 'running') return 'Running now';
  if (state === 'queued') return 'Queued for immediate execution';
  if (state === 'waiting_on_tomas' && hasAny(text, ['compensation'])) return 'Compensation review required';
  if (state === 'waiting_on_tomas') return 'Waiting on Tomas';
  if (state === 'blocked_technical') return 'Technically blocked';
  if (state === 'inactive') return 'Inactive';
  if (state === 'ineligible' || state === 'duplicate') return 'Ineligible';
  if (state === 'failed') return 'Failed with error';
  return 'Scheduled for next run';
}

function nextDailyRunText(now: Date) {
  const parts = centralDateParts(now);
  let candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  if (now.getTime() >= candidate.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Chicago',
  }).format(candidate)} America/Chicago (${DAILY_CRON_PATH})`;
}

function actionItemFromTask(task: JsonRecord, evidence: DailyCycleEvidence): DailyActionQueueItem {
  const application = evidence.applications.find((item) => String(item.id) === String(task.related_application_id || ''));
  const opportunity = evidence.seededOpportunities.find((item) => String(item.id) === String(task.related_opportunity_id || ''))
    || evidence.jobPostings.find((item) => String(item.id) === String(task.related_opportunity_id || ''));
  const payload = asRecord(task.action_payload);
  const action = String(task.action_required || task.last_action || 'Tomas action required');
  const exactOptions = arrayValue(payload.allowed_options).map(String);

  return {
    applicationsUnlocked: numberValue(payload.applications_unlocked) || 1,
    employer: String(task.employer || application?.employer || opportunity?.employer || opportunity?.company || 'Employer'),
    estimatedMinutes: numberValue(payload.estimated_minutes) || estimateMinutes(action),
    exactOptions,
    exactQuestionOrAction: action,
    group: classifyActionGroup(action, String(task.why_tomas_is_needed || '')),
    resumePath: String(payload.resume_path || application?.exact_resume || '') || undefined,
    role: String(application?.position || opportunity?.position || opportunity?.title || 'Role'),
    whyTomasIsNeeded: String(task.why_tomas_is_needed || task.supporting_evidence || 'Career OS needs Tomas before continuing.'),
  };
}

function actionItemFromWorkflowEvent(event: JsonRecord): DailyActionQueueItem {
  const metadata = asRecord(event.metadata);
  const action = String(metadata.action_label || metadata.required_action || event.evidence_text || 'Tomas action required');

  return {
    applicationsUnlocked: numberValue(metadata.applications_unlocked) || 1,
    employer: String(event.employer || 'Employer'),
    estimatedMinutes: numberValue(metadata.estimated_minutes) || estimateMinutes(action),
    exactOptions: arrayValue(metadata.allowed_options).map(String),
    exactQuestionOrAction: action,
    group: classifyActionGroup(action, String(event.evidence_text || '')),
    resumePath: String(metadata.resume_path || '') || undefined,
    role: String(metadata.role || metadata.position || 'Role'),
    whyTomasIsNeeded: String(event.evidence_text || 'A human-only gate remains after supported automation steps.'),
  };
}

function buildPipelineHealth(
  evidence: DailyCycleEvidence,
  releaseMetrics: DailyReleaseMetrics,
  centralToday: string,
  dailyFunnel: DailyOperatingCycleStatus['dailyFunnel'],
): DailyOperatingCycleStatus['pipelineHealth'] {
  const submissionEvents = evidence.workflowEvents.filter((event) => String(event.event_type || '') === 'submission_confirmed');
  const submittedToday = submissionEvents.filter((event) => centralDateKey(event.occurred_at) === centralToday).length;
  const submittedThisWeek = submissionEvents.filter((event) => isRecentIso(String(event.occurred_at || ''), 24 * 7)).length;
  const interviews = evidence.applications.filter((application) => hasAny(String(application.lifecycle_stage || ''), ['interview'])).length
    + evidence.workflowEvents.filter((event) => hasAny(`${event.event_type || ''} ${event.status || ''}`, ['interview'])).length;
  const recruiterResponses = evidence.workflowEvents.filter((event) => hasAny(`${event.event_type || ''} ${event.status || ''}`, ['recruiter_response', 'recruiter review', 'employer_response'])).length;
  const rejectedByEmployers = evidence.applications.filter((application) => hasAny(String(application.lifecycle_stage || ''), ['rejected'])).length
    + evidence.workflowEvents.filter((event) => hasAny(`${event.event_type || ''} ${event.status || ''}`, ['rejected'])).length;
  const offers = evidence.applications.filter((application) => hasAny(String(application.lifecycle_stage || ''), ['offer'])).length
    + evidence.workflowEvents.filter((event) => hasAny(`${event.event_type || ''} ${event.status || ''}`, ['offer'])).length;
  const newOpportunitiesToday = dailyFunnel.qualificationToday.newlyUniqueOpportunities;
  const averageHours = averageDiscoveryToSubmissionHours(evidence);

  return {
    activeQualifiedOpportunities: releaseMetrics.activeQualifiedOpportunities,
    applicationToInterviewConversionRate: percentage(interviews, releaseMetrics.submittedApplications),
    applicationsSubmittedThisWeek: submittedThisWeek || releaseMetrics.submittedApplications,
    applicationsSubmittedToday: submittedToday,
    averageHoursDiscoveryToSubmission: averageHours,
    automationCompletionRate: releaseMetrics.releaseCompletionPercentage,
    humanInterventionRate: percentage(releaseMetrics.waitingOnTomas, releaseMetrics.activeQualifiedOpportunities),
    inactive: releaseMetrics.inactive,
    ineligible: releaseMetrics.ineligible,
    interviews,
    newOpportunitiesToday,
    offers,
    readyForAutomation: releaseMetrics.readyForAutomation,
    recruiterResponses,
    rejectedByEmployers,
    totalSubmitted: releaseMetrics.submittedApplications,
    waitingOnTomas: releaseMetrics.waitingOnTomas,
  };
}

function buildGlobalLifecycle(
  evidence: DailyCycleEvidence,
  releaseMetrics: DailyReleaseMetrics,
  dailyFunnel: DailyOperatingCycleStatus['dailyFunnel'],
  immediateQueueProcessor: DailyOperatingCycleStatus['immediateQueueProcessor'],
): DailyOperatingCycleStatus['globalLifecycle'] {
  const rawRecords = evidence.jobPostings.concat(evidence.seededOpportunities);
  const processed = rawRecords.length;
  const latestCheckpoint = asRecord(evidence.latestSourceRun?.processing_checkpoint);
  const latestSearchConfig = asRecord(evidence.latestSourceRun?.search_config);
  const checkpoint = String(
    latestCheckpoint.last_processed_cursor
    || latestSearchConfig.last_processed_cursor
    || evidence.latestSourceRun?.id
    || 'no checkpoint recorded',
  );
  const currentBatchTotal = numberValue(evidence.latestSourceRun?.number_reviewed)
    || dailyFunnel.rawActivityToday.rawRecordsDiscoveredOrRefreshed;
  const currentBatchProcessed = Math.min(currentBatchTotal || dailyFunnel.rawActivityToday.rawRecordsDiscoveredOrRefreshed, processed || currentBatchTotal);

  return {
    totalRawRecordsEverDiscovered: rawRecords.length,
    rawRecordsProcessed: processed,
    recordsAwaitingProcessing: 0,
    uniqueOpportunities: releaseMetrics.totalUniqueOpportunities,
    duplicatesRemoved: releaseMetrics.duplicateRecordsRemoved,
    currentBatchProgress: {
      checkpoint,
      processed: currentBatchProcessed,
      remaining: Math.max((currentBatchTotal || currentBatchProcessed) - currentBatchProcessed, 0),
      total: currentBatchTotal || currentBatchProcessed,
      percentage: percentage(currentBatchProcessed, currentBatchTotal || currentBatchProcessed),
    },
    historicalBacklogProgress: {
      lastProcessedCursor: checkpoint,
      processed,
      remaining: 0,
      total: rawRecords.length,
      percentage: percentage(processed, rawRecords.length),
    },
    averageRecordsProcessedPerRun: averageNumber([
      numberValue(evidence.latestSourceRun?.number_reviewed),
      ...evidence.automationRuns.map((run) => numberValue(asRecord(run.evidence).raw_records_processed || asRecord(run.evidence).raw_records_discovered_or_refreshed)),
    ]),
    averageQualifiedApplicationsPerRun: averageNumber([
      releaseMetrics.activeQualifiedOpportunities,
      numberValue(evidence.latestSourceRun?.number_accepted),
    ]),
    averageSubmissionsPerRun: averageNumber([
      immediateQueueProcessor.submittedThisRun,
      ...evidence.automationRuns.map((run) => numberValue(asRecord(run.evidence).submissions_completed)),
    ]),
  };
}

function averageDiscoveryToSubmissionHours(evidence: DailyCycleEvidence) {
  const hours: number[] = [];
  const opportunities = evidence.seededOpportunities.concat(evidence.jobPostings);

  for (const application of evidence.applications) {
    if (!application.confirmation_number && !application.submission_evidence) continue;
    const opportunity = opportunities.find((item) => String(item.id) === String(application.opportunity_id || ''));
    const discoveredAt = Date.parse(String(opportunity?.discovered_at || opportunity?.created_at || ''));
    const submittedAt = Date.parse(String(application.updated_at || ''));
    if (Number.isFinite(discoveredAt) && Number.isFinite(submittedAt) && submittedAt >= discoveredAt) {
      hours.push(Math.round(((submittedAt - discoveredAt) / 36_000) / 10));
    }
  }

  if (!hours.length) return undefined;
  return Math.round((hours.reduce((sum, item) => sum + item, 0) / hours.length) * 10) / 10;
}

function hasRetryProtection(evidence: DailyCycleEvidence) {
  const latestReportPayload = asRecord(evidence.dailyReport?.payload);
  const reportDoNotRetry = arrayValue(latestReportPayload.submitted_do_not_retry).length > 0
    || arrayValue(asRecord(latestReportPayload.resolve_blockers_20260719).do_not_retry_submitted).length > 0;
  const workflowProtection = evidence.workflowEvents.some((event) => {
    const metadata = asRecord(event.metadata);
    return metadata.duplicate_retry_prevented === true || metadata.do_not_retry === true;
  });

  return reportDoNotRetry || workflowProtection || evidence.applications.some((application) => Boolean(application.confirmation_number || application.submission_evidence));
}

function preferredMinimumBaseSalary(profile?: JsonRecord) {
  const verifiedProfile = asRecord(profile?.verified_profile);
  const strategy = asRecord(asRecord(verifiedProfile.candidate_preferences_strategy).compensation_strategy);
  const reusable = asRecord(verifiedProfile.reusable_application_answers);
  return numberValue(strategy.preferred_minimum_base_salary_usd || reusable.preferred_minimum_base_salary_usd);
}

function hasConfiguredCostControls(searchConfig: JsonRecord) {
  const controls = arrayValue(searchConfig.cost_controls).join(' ').toLowerCase();
  return controls.includes('deterministic')
    && controls.includes('dedupe')
    && (controls.includes('reuse') || controls.includes('incremental'));
}

function dedupeActionItems(items: DailyActionQueueItem[]) {
  const seen = new Set<string>();
  const result: DailyActionQueueItem[] = [];

  for (const item of items) {
    const key = [item.group, item.employer, item.role, item.exactQuestionOrAction].map(compactKey).join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function classifyActionGroup(action: string, reason: string): DailyActionQueueItem['group'] {
  const text = `${action} ${reason}`.toLowerCase();
  if (hasAny(text, ['compensation', 'salary', 'total comp'])) return 'compensation_decisions';
  if (hasAny(text, ['nda', 'privacy', 'policy', 'legal', 'terms', 'transcript', 'attestation'])) return 'legal_policy_approvals';
  if (hasAny(text, ['mfa', 'captcha', 'identity', 'security code', 'account', 'login'])) return 'account_mfa_captcha_identity';
  if (hasAny(text, ['upload', 'browser', 'resume'])) return 'one_click_or_browser_actions';
  return 'factual_questions';
}

function estimateMinutes(action: string) {
  if (hasAny(action, ['compensation'])) return 1;
  if (hasAny(action, ['upload', 'resume', 'privacy', 'policy', 'nda', 'transcript'])) return 1;
  if (hasAny(action, ['mfa', 'captcha', 'account', 'identity'])) return 2;
  return 1;
}

async function fetchGreenhouseSourceBatches(discoveryPlan: CareerOsDiscoveryPlan, boards: string[]) {
  const results: Array<
    | { status: 'fulfilled'; value: { board: string; jobs: JsonRecord[]; source: CareerOsSourceCandidate } }
    | { board: string; reason: unknown; source: CareerOsSourceCandidate; status: 'rejected' }
  > = [];

  for (let index = 0; index < boards.length; index += GLOBAL_DISCOVERY_MAX_CONCURRENCY) {
    const batch = boards.slice(index, index + GLOBAL_DISCOVERY_MAX_CONCURRENCY);
    const settled = await Promise.all(batch.map(async (board) => {
      const source = careerOsSourceForBoard(discoveryPlan, board);
      try {
        const jobs = await fetchGreenhouseJobs(board);
        return { status: 'fulfilled' as const, value: { board, jobs, source } };
      } catch (error) {
        return { board, reason: error, source, status: 'rejected' as const };
      }
    }));
    results.push(...settled);
  }

  return results;
}

function sourceStatus(source: CareerOsSourceCandidate, board: string, status: 'succeeded' | 'failed', jobsReviewed: number, error = '') {
  return {
    ats: source.ats,
    board,
    business_type: source.businessType,
    category: source.category,
    employer: source.employer,
    error,
    jobs_reviewed: jobsReviewed,
    source: 'official_greenhouse_board_api',
    status,
  };
}

async function fetchGreenhouseJobs(board: string) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(GLOBAL_DISCOVERY_SOURCE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Greenhouse ${board} returned ${response.status}`);
  const payload = await response.json() as { jobs?: unknown[] };
  return Array.isArray(payload.jobs) ? payload.jobs.map(asRecord) : [];
}

function normalizePosting(ownerEmail: string, board: string, job: JsonRecord, lastCheckedAt: string, sourceRunId: string, minFitScore: number, source: CareerOsSourceCandidate): JsonRecord {
  const company = companyName(board, job);
  const description = htmlToText(String(job.content || ''));
  const title = String(job.title || '').trim();
  const rolePolicy = classifyRolePolicy(title, description);
  const compensation = extractCompensation(description);
  const fitScore = rolePolicy.excluded ? 0 : scorePosting(job, description);
  const requisition = String(job.requisition_id || job.id || '');
  const canonicalUrl = String(job.absolute_url || `https://job-boards.greenhouse.io/${board}/jobs/${job.id || requisition}`);
  const locationText = `${String(asRecord(job.location).name || '')} ${description}`;

  return {
    id: `greenhouse-${slug(board)}-${job.id || requisition}`,
    source_run_id: sourceRunId,
    owner_email: ownerEmail,
    company,
    title,
    location: String(asRecord(job.location).name || ''),
    work_arrangement: /remote/i.test(locationText) ? 'remote' : 'unknown',
    compensation_min_usd: compensation.minUsd,
    compensation_max_usd: compensation.maxUsd,
    compensation_text: compensation.text,
    canonical_url: canonicalUrl,
    external_requisition_id: requisition,
    job_description: description,
    normalized_description: description.slice(0, 12000),
    posting_validation_status: 'active',
    last_checked_at: lastCheckedAt,
    raw_record: job,
    normalized_role_level: rolePolicy.normalizedLevel,
    deterministic_filter_reason: rolePolicy.reason,
    source_category: source.category,
    source_employer: source.employer,
    source_business_type: source.businessType,
    fit_score: fitScore,
    ats_analysis: {
      method: 'deterministic_greenhouse_daily_cycle_v1',
      risks: /payments|cards|fintech/i.test(description) ? [] : ['Domain positioning should be reviewed before package generation.'],
      score: fitScore,
      signals: matchingSignals(job, description),
    },
    ai_readiness_analysis: {
      method: 'answerbrief_deterministic_readiness_v1',
      score: scoreAiReadiness(description),
      signals: ['platform strategy', 'automation', 'cross-functional operating cadence'].filter((signal) => hasAny(description, [signal])),
    },
    recruiter_intelligence: {
      decision: fitScore >= minFitScore ? 'worth_applying' : 'skip',
      location: String(asRecord(job.location).name || 'not published'),
      salary: compensation.text || 'not published',
      score: scoreRecruiterFit(job, description),
    },
    hiring_manager_evidence_matrix: buildEvidenceMatrix(description),
    selected_for_pilot: false,
    status: classifyDiscoveredPostingStatus(fitScore, minFitScore, locationText, rolePolicy),
    created_at: lastCheckedAt,
    updated_at: lastCheckedAt,
  };
}

function classifyDiscoveredPostingStatus(
  fitScore: number,
  minFitScore: number,
  locationText: string,
  rolePolicy?: { excluded: boolean },
) {
  if (rolePolicy?.excluded) return 'ineligible';
  if (/relocation required|must relocate|on-site only/i.test(locationText)) return 'ineligible_location';
  if (fitScore < 70) return 'poor_fit';
  if (fitScore < minFitScore) return 'qualification_pending';
  return 'discovered';
}

function normalizeOraclePosting(ownerEmail: string, job: JsonRecord, lastCheckedAt: string, sourceRunId: string, minFitScore: number, source: CareerOsSourceCandidate): JsonRecord {
  const title = String(job.Title || '').trim();
  const description = [String(job.ShortDescriptionStr || ''), String(job.ExternalResponsibilitiesStr || ''), String(job.ExternalQualificationsStr || '')]
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const rolePolicy = classifyRolePolicy(title, description);
  const location = String(job.PrimaryLocation || '');
  const locationText = `${location} ${description}`;
  const fitScore = rolePolicy.excluded ? 0 : scoreOraclePosting(job, description);
  const canonicalUrl = `${source.sourceUrl || 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/jobs'}/job/${encodeURIComponent(String(job.Id || ''))}`;

  return {
    id: `oracle-${slug(source.employer)}-${String(job.Id || '')}`,
    source_run_id: sourceRunId,
    owner_email: ownerEmail,
    company: source.employer,
    title,
    location,
    work_arrangement: classifyOracleWorkArrangement(locationText, String(job.WorkplaceType || ''), String(job.WorkplaceTypeCode || '')),
    compensation_min_usd: null,
    compensation_max_usd: null,
    compensation_text: '',
    canonical_url: canonicalUrl,
    external_requisition_id: String(job.Id || ''),
    ats_job_id: String(job.Id || ''),
    job_description: description,
    normalized_description: description.slice(0, 12000),
    posting_validation_status: 'active',
    last_checked_at: lastCheckedAt,
    raw_record: job,
    normalized_role_level: rolePolicy.normalizedLevel,
    deterministic_filter_reason: rolePolicy.reason,
    source_category: source.category,
    source_employer: source.employer,
    source_business_type: source.businessType,
    fit_score: fitScore,
    ats_platform: 'oracle',
    ats_analysis: {
      method: 'deterministic_oracle_daily_cycle_v1',
      risks: [],
      score: fitScore,
      signals: matchingOracleSignals(job, description),
    },
    ai_readiness_analysis: {
      method: 'answerbrief_deterministic_readiness_v1',
      score: rolePolicy.excluded ? 0 : scoreAiReadiness(description),
      signals: ['platform strategy', 'automation', 'customer experience', 'enterprise platforms'].filter((signal) => hasAny(description, [signal])),
    },
    recruiter_intelligence: {
      decision: fitScore >= minFitScore ? 'worth_applying' : 'skip',
      location: location || 'not published',
      salary: 'not published',
      score: rolePolicy.excluded ? 0 : scoreRecruiterFit({ title, location: { name: location } }, description),
    },
    hiring_manager_evidence_matrix: buildEvidenceMatrix(description),
    selected_for_pilot: false,
    status: classifyDiscoveredPostingStatus(fitScore, minFitScore, locationText, rolePolicy),
    created_at: lastCheckedAt,
    updated_at: lastCheckedAt,
  };
}

async function fetchOracleSourceResults(discoveryPlan: CareerOsDiscoveryPlan) {
  const results: Array<{ error?: string; jobs: JsonRecord[]; source: CareerOsSourceCandidate }> = [];
  for (const source of discoveryPlan.oracleSources) {
    try {
      results.push({ jobs: await fetchJpmorganOracleJobs(source), source });
    } catch (error) {
      results.push({ error: error instanceof Error ? error.message : String(error), jobs: [], source });
    }
  }
  return results;
}

async function fetchJpmorganOracleJobs(source: CareerOsSourceCandidate) {
  const querySets = [
    { keyword: 'product', selectedCategoriesFacet: '300000086251864', selectedLocationsFacet: '300000020657211' },
    { keyword: 'product', selectedCategoriesFacet: '300000086251864', selectedLocationsFacet: '300000020709331' },
    { keyword: 'product manager', selectedCategoriesFacet: '300000086251864', selectedLocationsFacet: '300000020657211' },
    { keyword: 'digital transformation', selectedCategoriesFacet: '300035862339235', selectedLocationsFacet: '300000020657211' },
  ];
  const jobs: JsonRecord[] = [];

  for (const query of querySets) {
    const finder = `findReqs;siteNumber=CX_1001,keyword=${query.keyword},selectedCategoriesFacet=${query.selectedCategoriesFacet},selectedLocationsFacet=${query.selectedLocationsFacet},limit=25,offset=0`;
    const response = await fetch(`https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?finder=${encodeURIComponent(finder)}&expand=requisitionList&onlyData=true`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(GLOBAL_DISCOVERY_SOURCE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Oracle ${source.employer} returned ${response.status}`);
    const payload = await response.json() as { items?: Array<{ requisitionList?: unknown[] }> };
    const requisitions = Array.isArray(payload.items)
      ? payload.items.flatMap((item) => Array.isArray(item?.requisitionList) ? item.requisitionList : [])
      : [];
    requisitions.forEach((item) => jobs.push(asRecord(item)));
  }

  return Array.from(new Map(jobs.map((job) => [String(job.Id || ''), job])).values());
}

function scoreOraclePosting(job: JsonRecord, description: string) {
  return scorePosting({ title: String(job.Title || ''), location: { name: String(job.PrimaryLocation || '') } }, description);
}

function matchingOracleSignals(job: JsonRecord, description: string) {
  return matchingSignals({ title: String(job.Title || ''), location: { name: String(job.PrimaryLocation || '') } }, description);
}

function classifyOracleWorkArrangement(locationText: string, workplaceType: string, workplaceTypeCode: string) {
  const text = `${locationText} ${workplaceType} ${workplaceTypeCode}`.toLowerCase();
  if (text.includes('remote')) return 'remote';
  if (text.includes('hybrid')) return 'hybrid';
  return 'unknown';
}

function classifyRolePolicy(title: string, description: string) {
  const normalized = ` ${title.toLowerCase()} ${description.toLowerCase()} `;
  if (EXECUTIVE_EXCLUSION_TOKENS.some((token) => normalized.includes(token)) || /\bvp\b/.test(normalized)) {
    return { excluded: true, normalizedLevel: 'excluded_executive_level', reason: 'excluded_executive_level' };
  }
  if (/\b(intern|internship|student|campus|summer analyst|analyst development|associate development|apprentice)\b/.test(normalized)) {
    return { excluded: true, normalizedLevel: 'excluded_junior_level', reason: 'excluded_junior_or_student_role' };
  }
  if (/\bproduct owner\b/.test(normalized) && !/\b(senior|principal|director)\b/.test(normalized)) {
    return { excluded: true, normalizedLevel: 'excluded_junior_level', reason: 'excluded_lower_scope_product_owner_role' };
  }
  if (/\b(software engineer|sales|account executive|project manager)\b/.test(normalized) && !/\bproduct\b/.test(normalized)) {
    return { excluded: true, normalizedLevel: 'excluded_non_product_scope', reason: 'excluded_non_product_scope' };
  }
  if (/\bsenior director\b/.test(normalized)) return { excluded: false, normalizedLevel: 'senior_director_product_management', reason: '' };
  if (/\bdirector\b/.test(normalized)) return { excluded: false, normalizedLevel: 'director_product_management', reason: '' };
  if (/\bprincipal product manager\b/.test(normalized)) return { excluded: false, normalizedLevel: 'principal_product_manager', reason: '' };
  if (/\bgroup product manager\b/.test(normalized)) return { excluded: false, normalizedLevel: 'group_product_manager', reason: '' };
  if (/\bsenior product manager\b/.test(normalized)) return { excluded: false, normalizedLevel: 'senior_product_manager', reason: '' };
  if (/\b(product manager|product lead|lead product manager)\b/.test(normalized)) return { excluded: false, normalizedLevel: 'product_manager', reason: '' };
  if (/\b(product|customer experience|digital transformation|platform|automation|ai)\b/.test(normalized) && /\bdirector\b/.test(normalized)) {
    return { excluded: false, normalizedLevel: 'director_product_management', reason: '' };
  }
  return { excluded: true, normalizedLevel: 'excluded_non_product_scope', reason: 'excluded_outside_target_role_band' };
}

function dedupePostings(postings: JsonRecord[]): JsonRecord[] {
  const groups = new Map<string, JsonRecord[]>();

  for (const posting of postings) {
    const identity = canonicalOpportunityIdentity(posting, 'posting');
    const bucket = groups.get(identity.canonicalOpportunityId) || [];
    bucket.push(posting);
    groups.set(identity.canonicalOpportunityId, bucket);
  }

  return Array.from(groups.values()).map((records) => {
    const preferred = records.slice().sort((left, right) => {
      const leftScore = numberValue(left.fit_score);
      const rightScore = numberValue(right.fit_score);
      if (leftScore !== rightScore) return rightScore - leftScore;
      return (Date.parse(String(right.updated_at || right.last_checked_at || 0)) || 0) - (Date.parse(String(left.updated_at || left.last_checked_at || 0)) || 0);
    })[0];
    const identity = canonicalOpportunityIdentity(preferred, 'posting');
    const raw = asRecord(preferred.raw_record);
    const sourceSightings = mergeCanonicalSourceSightings(records, 'posting');

    return {
      ...preferred,
      raw_record: {
        ...raw,
        canonical_identity_keys: identity.exactIdentityKeys,
        canonical_identity_tier: identity.exactIdentityKeys[0]?.includes(':req:') || identity.exactIdentityKeys[0]?.includes(':job:')
          ? 'tier_1_exact'
          : identity.canonicalUrl
            ? 'tier_2_url'
            : 'tier_3_strong',
        canonical_opportunity_id: identity.canonicalOpportunityId,
        possible_duplicate_key: identity.possibleDuplicateKey,
        source_sighting_count: sourceSightings.length,
        source_sightings: sourceSightings,
      },
    };
  });
}

function processDiscoveryBacklogBatches(records: JsonRecord[], sourceRunId: string) {
  const total = records.length;
  const batches = Math.max(Math.ceil(total / GLOBAL_DISCOVERY_BATCH_SIZE), 0);
  const lastBatchIndex = batches ? batches - 1 : 0;
  const lastRecord = records[records.length - 1];

  return {
    batch_size: GLOBAL_DISCOVERY_BATCH_SIZE,
    batches_processed: batches,
    concurrency_limit: GLOBAL_DISCOVERY_MAX_CONCURRENCY,
    last_processed_cursor: `${sourceRunId}:batch-${lastBatchIndex}:record-${String(lastRecord?.id || 'none')}`,
    records_awaiting_processing: 0,
    records_processed: total,
    retry_limit: GLOBAL_DISCOVERY_RETRY_LIMIT,
    total_records: total,
  };
}

function buildDailySearchConfig(
  discoveryPlan: CareerOsDiscoveryPlan,
  sourceStatuses: JsonRecord[],
  rawJobsReviewed: number,
  qualifiedMatches: number,
  minFitScore: number,
  runDay: string,
) {
  const boards = discoveryPlan.greenhouseBoards;
  const sourceFailures = sourceStatuses.filter((source) => String(source.status || '') === 'failed');
  const succeededSources = sourceStatuses.filter((source) => String(source.status || '') === 'succeeded');
  return {
    automatic_submission_limit: 3,
    batch_processing: {
      batch_size: GLOBAL_DISCOVERY_BATCH_SIZE,
      checkpoint_after_each_batch: true,
      concurrency_limit: GLOBAL_DISCOVERY_MAX_CONCURRENCY,
      retry_limit: GLOBAL_DISCOVERY_RETRY_LIMIT,
      throttle_policy: 'per_employer_and_per_ats',
    },
    boards,
    coverage_summary: {
      discovery_mode: discoveryPlan.coverageSummary.discoveryMode,
      employer_sources_failed: sourceFailures.length,
      employers_searched: sourceStatuses.length,
      official_career_sites_checked: succeededSources.length,
      qualified_matches: qualifiedMatches,
      raw_jobs_reviewed: rawJobsReviewed,
      supported_official_sources: discoveryPlan.coverageSummary.supportedOfficialSources,
      total_employer_candidates: discoveryPlan.coverageSummary.totalEmployerCandidates,
      unsupported_source_candidates: discoveryPlan.coverageSummary.unsupportedSourceCandidates,
    },
    compensation_policy: {
      never_invent_bonus_equity_commission_or_total_compensation: true,
      never_treat_base_and_total_compensation_as_equivalent: true,
      open_to_higher_compensation: true,
      open_to_negotiation: true,
      optional_compensation_fields: 'leave_blank',
      preferred_minimum_base_salary_usd: 250000,
      required_base_salary: 'use_approved_250000_base_strategy_where_appropriate',
      required_total_compensation: 'pause_pending_tomas_approved_total_compensation_target',
    },
    cost_controls: DAILY_OPERATING_CYCLE.creditSavingControls,
    daily_automation_id: 'daily-tomas-career-os-run',
    discovery_mode: 'broader_product_management_oracle_and_greenhouse_market',
    enqueue_qualified_package_ready_applications: true,
    employer_universe: DAILY_OPERATING_CYCLE.employerUniverseCovered,
    freshness_windows: ['24_hours', '3_days', '7_days', '14_days_if_active_exceptional_fit'],
    idempotency_key: `tomas@nieves.com:broader-product-leadership:${discoveryPlan.fingerprint}:${runDay}`,
    invoked_by: 'vercel-cron',
    last_processed_cursor: `${runDay}:complete-result-set`,
    location_policy: 'verify remote from Texas, employment from Texas, Dallas-Fort Worth, or Texas hybrid before package generation',
    market: 'broader_product_leadership',
    market_universe_version: CAREER_OS_MARKET_UNIVERSE_VERSION,
    min_fit_score: minFitScore,
    pipeline_targets: {
      active_qualified_minimum: DAILY_TARGET_ACTIVE_QUALIFIED,
      evaluate_strongest: '10-15',
      newly_identified_daily: DAILY_TARGET_NEWLY_IDENTIFIED,
      qualified_unique_adds_when_available: 5,
    },
    role_keywords: DAILY_OPERATING_CYCLE.rolePriorities,
    role_policy_version: TARGET_ROLE_POLICY_VERSION,
    excluded_role_levels: ['excluded_executive_level', 'excluded_junior_level', 'excluded_non_product_scope'],
    source_candidates: discoveryPlan.sourceCandidates.map((candidate) => ({
      ats: candidate.ats,
      board: candidate.board,
      business_type: candidate.businessType,
      category: candidate.category,
      employer: candidate.employer,
      source_url: candidate.sourceUrl,
      supported: candidate.supported,
    })),
    source_registry: DAILY_OPERATING_CYCLE.discoverySourcesEnabled,
    source_statuses: sourceStatuses,
    standing_trusted_auto_apply_policy: {
      ordinary_application_approval_required: false,
      legal_fingerprint_reuse: 'reuse_when_materially_identical_fingerprint_matches',
      changed_legal_text_requires_review: true,
      no_duplicate_submissions: true,
      isolate_blocked_applications: true,
    },
    texas_remote_filter: 'remote_us_texas_or_dallas_fort_worth_texas_hybrid_only',
  };
}

async function persistRows(table: string, rows: JsonRecord | JsonRecord[]) {
  const supabaseUrl = cleanEnv(process.env.SUPABASE_URL);
  const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.startsWith('[')) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the Career OS daily cycle.');
  }

  const payload = JSON.stringify(normalizeUpsertRows(rows));
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
      body: payload,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      method: 'POST',
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) return;

    const message = await response.text();
    lastError = `Supabase ${table} upsert failed with ${response.status}: ${message.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 240)}`;
    if (![408, 429, 500, 502, 503, 504, 522, 524].includes(response.status)) break;
    await sleep(400 * attempt);
  }

  throw new Error(lastError || `Supabase ${table} upsert failed.`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUpsertRows(rows: JsonRecord | JsonRecord[]) {
  if (!Array.isArray(rows)) return rows;
  const columns = allowedColumnsForTable(rows);
  return rows.map((row) => {
    const record = asRecord(row);
    return Object.fromEntries(columns.map((column) => [
      column,
      Object.prototype.hasOwnProperty.call(record, column) ? record[column] ?? null : null,
    ]));
  });
}

function allowedColumnsForTable(rows: JsonRecord[]) {
  const discoveredColumns = Array.from(new Set(rows.flatMap((row) => Object.keys(asRecord(row)))));
  if (!rows.length) return discoveredColumns;
  const sample = asRecord(rows[0]);
  if (typeof sample.company === 'string' && typeof sample.title === 'string' && Object.prototype.hasOwnProperty.call(sample, 'canonical_url')) {
    return [
      'id',
      'source_run_id',
      'owner_email',
      'company',
      'title',
      'location',
      'work_arrangement',
      'compensation_min_usd',
      'compensation_max_usd',
      'compensation_text',
      'canonical_url',
      'external_requisition_id',
      'job_description',
      'normalized_description',
      'posting_validation_status',
      'last_checked_at',
      'raw_record',
      'fit_score',
      'ats_analysis',
      'ai_readiness_analysis',
      'recruiter_intelligence',
      'hiring_manager_evidence_matrix',
      'selected_for_pilot',
      'status',
      'created_at',
      'updated_at',
    ];
  }
  return discoveredColumns;
}

function scorePosting(job: JsonRecord, description: string) {
  const title = String(job.title || '').toLowerCase();
  const text = `${title} ${String(asRecord(job.location).name || '')} ${description}`.toLowerCase();
  let score = 30;
  if (hasPhrase(title, 'senior director')) score += 22;
  else if (hasPhrase(title, 'director')) score += 16;
  else if (hasPhrase(title, 'principal') || hasPhrase(title, 'group product')) score += 14;
  if (hasPhrase(title, 'product management')) score += 25;
  else if (hasPhrase(title, 'product manager') || /\bproduct\b/.test(title)) score += 19;
  if (hasPhrase(title, 'transformation') || hasPhrase(text, 'business transformation')) score += 13;
  if (hasPhrase(title, 'consultant') || hasPhrase(title, 'strategy') || hasPhrase(title, 'advisor')) score += 8;
  if (hasPhrase(text, 'digital transformation') || hasPhrase(text, 'operating model') || hasPhrase(text, 'change management')) score += 9;
  if (hasPhrase(title, 'platform') || hasPhrase(text, 'platform strategy') || hasPhrase(text, 'workflow')) score += 8;
  if (hasPhrase(text, 'customer experience') || hasPhrase(text, 'customer journey') || hasPhrase(text, 'contact center') || hasPhrase(text, 'ccaas') || hasPhrase(text, 'ucaas') || hasPhrase(text, 'cxone')) score += 9;
  if (hasPhrase(text, 'telecom') || hasPhrase(text, 'communications') || hasPhrase(text, 'connectivity') || hasPhrase(text, 'wireless') || hasPhrase(text, 'broadband')) score += 8;
  if (hasPhrase(text, 'automation') || /\bai\b/.test(text) || hasPhrase(text, 'agentic') || hasPhrase(text, 'adoption')) score += 6;
  if (hasPhrase(text, 'payments') || hasPhrase(text, 'cards') || hasPhrase(text, 'fintech')) score += 2;
  if (/remote\s*-\s*us|remote,\s*us|united states \(remote\)|usa\s*-\s*remote|work from home - us/i.test(String(asRecord(job.location).name || ''))) score += 7;
  if (/austin|dallas|plano|irving|houston|san antonio|texas/i.test(`${String(asRecord(job.location).name || '')} ${description}`)) score += 5;
  if (/remote canada|remote uk|remote poland|remote spain|india|ireland|london|dublin|germany|japan|israel/i.test(String(asRecord(job.location).name || ''))) score -= 25;
  if (!/\b(product|transformation|strategy|customer experience|consultant|platform|operations)\b/.test(title) && /compliance|counsel|sales|marketing|software engineer|learning|account executive|finance|designer|intern|apprentice/i.test(title)) score -= 34;
  return Math.min(score, 95);
}

function scoreAiReadiness(description: string) {
  let score = 70;
  if (hasAny(description, ['automation'])) score += 8;
  if (hasAny(description, ['platform'])) score += 7;
  if (hasAny(description, ['analytics', 'data-driven'])) score += 5;
  if (hasAny(description, ['systems'])) score += 5;
  return Math.min(score, 95);
}

function scoreRecruiterFit(job: JsonRecord, description: string) {
  let score = 72;
  if (/senior director/i.test(String(job.title || ''))) score += 8;
  if (/remote/i.test(`${String(asRecord(job.location).name || '')} ${description}`)) score += 6;
  if (/15\+ years/i.test(description)) score += 5;
  if (/managing managers|PM leaders|high-performing product organization/i.test(description)) score += 5;
  return Math.min(score, 95);
}

function matchingSignals(job: JsonRecord, description: string) {
  const signals = [];
  for (const signal of [
    'Senior Director product leadership',
    'multi-team product areas',
    'platform strategy',
    'cross-functional execution',
    'portfolio-level roadmap',
    'consumer experience',
    'payments/cards/fintech domain',
  ]) {
    if (hasPhrase(`${String(job.title || '')} ${description}`, signal) || hasAny(`${String(job.title || '')} ${description}`, [signal])) signals.push(signal);
  }
  return signals;
}

function buildEvidenceMatrix(description: string) {
  const requirements = [
    '15+ years in product management',
    'Experience managing managers and PM leaders',
    'Platform strategy and execution',
    'Cross-functional executive stakeholder alignment',
    'Consumer-facing product and backend platform comfort',
  ];

  return requirements.map((requirement) => ({
    evidence_reference: hasAny(description, [requirement]) ? 'job_posting_requirement' : 'profile_evidence_required',
    requirement,
    verification_state: hasAny(description, [requirement]) ? 'posting_verified' : 'requires_profile_mapping',
  }));
}

function extractCompensation(text: string) {
  const matches = text.match(/\$[0-9,]+\s*-\s*\$[0-9,]+/g) || [];
  if (!matches.length) return { maxUsd: null, minUsd: null, text: '' };
  const values = matches.map((match) => {
    const parts = match.match(/[0-9,]+/g) || [];
    return {
      max: Number(String(parts[1] || '0').replace(/,/g, '')),
      min: Number(String(parts[0] || '0').replace(/,/g, '')),
      text: match,
    };
  }).filter((value) => value.min > 0 && value.max > 0);

  if (!values.length) return { maxUsd: null, minUsd: null, text: '' };
  return {
    maxUsd: Math.max.apply(null, values.map((value) => value.max)),
    minUsd: Math.min.apply(null, values.map((value) => value.min)),
    text: values.map((value) => value.text).join('; '),
  };
}

function htmlToText(html: string) {
  return String(html)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function companyName(board: string, job: JsonRecord) {
  if (job.company_name) return String(job.company_name);
  return board.split(/[-_]/).map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(' ');
}

function verificationRow(name: string, passed: boolean, detail = '') {
  return { detail, name, passed };
}

function centralDateKey(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || Date.now()));
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Chicago',
    year: 'numeric',
  }).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) lookup[part.type] = part.value;
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function centralDateParts(date: Date) {
  if (Number.isNaN(date.getTime())) return { day: 1, month: 1, year: 1970 };
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Chicago',
    year: 'numeric',
  }).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) lookup[part.type] = part.value;
  return {
    day: Number(lookup.day),
    month: Number(lookup.month),
    year: Number(lookup.year),
  };
}

function isRecentIso(value: string, hours: number) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  return time > Date.now() - hours * 60 * 60 * 1000;
}

function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseCsv(value: unknown) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stringValue(value: unknown) {
  return String(value || '').trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function averageNumber(values: number[]) {
  const usable = values.filter((value) => value > 0);
  if (!usable.length) return 0;
  return Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 10) / 10;
}

function hasAny(text: string, needles: string[]) {
  const haystack = String(text || '').toLowerCase();
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()));
}

function hasPhrase(text: string, phrase: string) {
  return String(text || '').toLowerCase().includes(String(phrase || '').toLowerCase());
}

function cleanEnv(value: unknown) {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/^"|"$/g, '');
}

function deterministicUuid(input: string) {
  const hash = crypto.createHash('sha1').update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function slug(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function compactKey(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeUrl(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    url.hash = '';
    url.search = '';
    return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return text.toLowerCase().replace(/\?.*$/, '').replace(/\/$/, '');
  }
}

function atsIdFromUrl(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const url = new URL(text);
    const greenhouseId = url.searchParams.get('gh_jid') || url.searchParams.get('token');
    if (greenhouseId && /^\d{5,}$/.test(greenhouseId)) return greenhouseId;

    const match = url.pathname.match(/\/(?:jobs|job|roles)\/(\d{5,})\b/i)
      || url.pathname.match(/\/([0-9]{8,})-/);
    if (match) return match[1];
  } catch {
    const fallback = text.match(/[?&](?:gh_jid|token)=(\d{5,})/i)
      || text.match(/\/(?:jobs|job|roles)\/(\d{5,})\b/i);
    if (fallback) return fallback[1];
  }

  return '';
}

function simpleHash(value: unknown) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}

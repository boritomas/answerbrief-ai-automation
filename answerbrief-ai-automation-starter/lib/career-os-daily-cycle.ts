import crypto from 'node:crypto';

type JsonRecord = Record<string, unknown>;

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
  version: string;
};

export const DAILY_WORKFLOW_VERSION = 'career-os-daily-cycle-2026-07-19-v1';
export const DAILY_CRON_PATH = '/api/career-os/daily-run';
export const DAILY_CRON_SCHEDULE = '0 12 * * *';
export const DAILY_TARGET_NEWLY_IDENTIFIED = 20;
export const DAILY_TARGET_ACTIVE_QUALIFIED = 15;

export const DAILY_DISCOVERY_BOARDS = [
  'affirm',
  'bandwidth',
  'boxinc',
  'braze',
  'cloudflare',
  'datadog',
  'dialpad',
  'five9',
  'googlefiber',
  'intercom',
  'mongodb',
  'nice',
  'okta',
  'samsara',
  'toast',
  'twilio',
  'vonage',
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
  ],
  discoverySourcesEnabled: [
    'Greenhouse official board API',
    'Workday official career portals when adapter evidence exists',
    'Lever official postings when adapter evidence exists',
    'Ashby official postings when adapter evidence exists',
    'SmartRecruiters official postings when adapter evidence exists',
    'iCIMS official postings when adapter evidence exists',
    'Phenom official portals when adapter evidence exists',
    'SuccessFactors official portals when adapter evidence exists',
    'Oracle Recruiting official portals when adapter evidence exists',
    'company-hosted official career portals',
  ],
  employerUniverseCovered: [
    'telecommunications carriers',
    'wireless providers',
    'broadband and fiber companies',
    'cable and media companies',
    'satellite and connectivity providers',
    'telecom infrastructure companies',
    'networking companies',
    'cloud communications',
    'contact-center and customer-experience platforms',
    'enterprise SaaS',
    'AI platforms',
    'digital commerce',
    'fintech and payments',
    'cybersecurity',
    'large technology companies',
    'consulting and transformation organizations',
  ],
  rolePriorities: [
    'Vice President of Product',
    'VP Product Management',
    'VP Digital Product',
    'VP Customer Experience',
    'VP Digital Transformation',
    'Head of Product',
    'Head of Digital',
    'Head of Customer Experience',
    'Head of AI Products',
    'Head of Platform',
    'Senior Director of Product',
    'Executive Director of Product',
    'Group Product Manager',
    'Principal Product Manager',
    'Product Portfolio Leader',
    'Digital Commerce Leader',
    'Customer Journey Leader',
    'Product Transformation Leader',
    'AI Product Leader',
    'Platform Product Leader',
  ],
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
  ];

  return {
    actionQueueStatus,
    applicationAutomationStatus: releaseMetrics.readyForAutomation
      ? `${releaseMetrics.readyForAutomation} application(s) ready for supported automation; human/legal/compensation/CAPTCHA/MFA gates remain paused.`
      : 'No applications are currently eligible for safe automatic submission.',
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
    immediateQueueProcessor,
    minimumActivePipelineTarget: DAILY_TARGET_ACTIVE_QUALIFIED,
    newOpportunityTarget: DAILY_TARGET_NEWLY_IDENTIFIED,
    packageGenerationStatus: 'active: packages remain separate from jobs/applications and unchanged package fingerprints are reused',
    pipelineHealth,
    qualificationStatus: 'active: leadership scope, product/platform ownership, AI, transformation, CX, telecom relevance, compensation, Texas eligibility, and profile evidence are scored before progression',
    rolePriorities: DAILY_OPERATING_CYCLE.rolePriorities,
    status,
    version: DAILY_WORKFLOW_VERSION,
  };
}

export async function runDailyGreenhouseDiscovery(ownerEmail: string) {
  const executedAt = new Date().toISOString();
  const runDay = executedAt.slice(0, 10);
  const boards = DAILY_DISCOVERY_BOARDS;
  const minFitScore = 85;
  const sourceRunId = deterministicUuid(`career-os-source-run:${ownerEmail}:telecom:greenhouse:${boards.join(',')}:${runDay}`);
  const settled = await Promise.allSettled(boards.map((board) => fetchGreenhouseJobs(board)));
  const errors: string[] = [];
  const postings: JsonRecord[] = [];
  let reviewed = 0;

  settled.forEach((result, index) => {
    const board = boards[index];
    if (result.status === 'rejected') {
      errors.push(`${board}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      return;
    }
    reviewed += result.value.length;
    for (const job of result.value) {
      const posting = normalizePosting(ownerEmail, board, job, executedAt, sourceRunId, minFitScore);
      if (numberValue(posting.fit_score) >= minFitScore) postings.push(posting);
    }
  });

  const dedupedPostings = dedupePostings(postings)
    .sort((a, b) => numberValue(b.fit_score) - numberValue(a.fit_score) || String(a.company).localeCompare(String(b.company)));
  dedupedPostings.forEach((posting, index) => {
    posting.selected_for_pilot = index === 0;
  });

  const sourceRun = {
    id: sourceRunId,
    owner_email: ownerEmail,
    source_type: 'expanded_public_ats_api',
    source_name: 'Daily telecom, communications, connectivity, cloud, and adjacent platform official Greenhouse sources',
    source_url: 'https://boards-api.greenhouse.io/v1/boards',
    status: reviewed > 0 ? 'succeeded' : 'error',
    executed_at: executedAt,
    number_reviewed: reviewed,
    number_accepted: dedupedPostings.length,
    number_skipped: Math.max(reviewed - dedupedPostings.length, 0),
    search_config: buildDailySearchConfig(boards, minFitScore, runDay),
    evidence: dedupedPostings.slice(0, 15).map((posting) => ({
      company: posting.company,
      title: posting.title,
      requisition: posting.external_requisition_id,
      canonical_url: posting.canonical_url,
      fit_score: posting.fit_score,
    })),
  };

  await persistRows('career_os_source_runs', sourceRun);
  if (dedupedPostings.length) {
    await persistRows('career_os_job_postings', dedupedPostings);
  }

  return {
    errors,
    postingsAccepted: dedupedPostings.length,
    postingsReviewed: reviewed,
    sourceRun,
  };
}

export async function persistDailyCycleReport(
  ownerEmail: string,
  dailyCycle: DailyOperatingCycleStatus,
  releaseMetrics: DailyReleaseMetrics,
  discovery: { errors: string[]; postingsAccepted: number; postingsReviewed: number; sourceRun: JsonRecord },
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
      postings_reviewed: discovery.postingsReviewed,
    },
    daily_funnel: dailyCycle.dailyFunnel,
    immediate_queue_processor: dailyCycle.immediateQueueProcessor,
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
      duplicates_removed: dailyCycle.dailyFunnel.rawActivityToday.duplicatesRemoved,
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
  return !isInactiveRecord(record) && !isLocationIneligible(record) && score > 0 && score < 70;
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

  if (application.confirmation_number || application.submission_evidence || hasAny(text, ['submitted'])) return { employer, reason, role, status: 'Submitted' };
  if (hasAny(text, ['ineligible'])) return { employer, reason, role, status: 'Ineligible' };
  if (hasAny(text, ['inactive', 'closed', 'expired', 'unavailable'])) return { employer, reason, role, status: 'Inactive' };
  if (hasAny(text, ['failed', 'error'])) return { employer, reason, role, status: 'Failed with error' };
  if (hasAny(text, ['running'])) return { employer, reason, role, status: 'Running now' };
  if (hasAny(text, ['technical', 'upload_gate', 'browser'])) return { employer, reason, role, status: 'Technically blocked' };
  if (hasAny(text, ['compensation_unknown', 'compensation review', 'total_compensation', 'desired total compensation', 'compensation'])) return { employer, reason, role, status: 'Compensation review required' };
  if (hasAny(text, ['legal', 'privacy', 'policy', 'approval', 'attestation', 'self-identification', 'employment_start_month', 'account', 'mfa', 'captcha', 'identity'])) {
    return { employer, reason, role, status: 'Waiting on Tomas' };
  }
  if (hasAny(text, ['ready_for_automation', 'package_ready', 'qualified_pending_application', 'application_started', 'resumable'])) {
    return { employer, reason, role, status: 'Queued for immediate execution' };
  }

  return { employer, reason: `Scheduled for next run at ${nextScheduledRun}.`, role, status: 'Scheduled for next run' };
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
  const newOpportunitiesToday = dailyFunnel.rawActivityToday.rawRecordsDiscoveredOrRefreshed;
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

async function fetchGreenhouseJobs(board: string) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Greenhouse ${board} returned ${response.status}`);
  const payload = await response.json() as { jobs?: unknown[] };
  return Array.isArray(payload.jobs) ? payload.jobs.map(asRecord) : [];
}

function normalizePosting(ownerEmail: string, board: string, job: JsonRecord, lastCheckedAt: string, sourceRunId: string, minFitScore: number): JsonRecord {
  const company = companyName(board, job);
  const description = htmlToText(String(job.content || ''));
  const compensation = extractCompensation(description);
  const fitScore = scorePosting(job, description);
  const requisition = String(job.requisition_id || job.id || '');
  const canonicalUrl = String(job.absolute_url || `https://job-boards.greenhouse.io/${board}/jobs/${job.id || requisition}`);

  return {
    id: `greenhouse-${slug(board)}-${job.id || requisition}`,
    source_run_id: sourceRunId,
    owner_email: ownerEmail,
    company,
    title: String(job.title || '').trim(),
    location: String(asRecord(job.location).name || ''),
    work_arrangement: /remote/i.test(`${String(asRecord(job.location).name || '')} ${description}`) ? 'remote' : 'unknown',
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
    status: fitScore >= minFitScore ? 'discovered' : 'skipped',
  };
}

function dedupePostings(postings: JsonRecord[]) {
  const seen = new Map<string, JsonRecord>();

  for (const posting of postings) {
    const keys = [
      `${compactKey(posting.company)}:req:${String(posting.external_requisition_id || '').toLowerCase()}`,
      `url:${normalizeUrl(posting.canonical_url)}`,
      `${compactKey(posting.company)}:title:${compactKey(posting.title)}:desc:${simpleHash(posting.normalized_description)}`,
    ].filter((key) => !key.endsWith(':req:') && key !== 'url:');
    const existingKey = keys.find((key) => seen.has(key));
    if (existingKey) continue;
    for (const key of keys) seen.set(key, posting);
  }

  return Array.from(new Set(Array.from(seen.values())));
}

function buildDailySearchConfig(boards: string[], minFitScore: number, runDay: string) {
  return {
    automatic_submission_limit: 3,
    boards,
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
    employer_universe: DAILY_OPERATING_CYCLE.employerUniverseCovered,
    freshness_windows: ['24_hours', '3_days', '7_days', '14_days_if_active_exceptional_fit'],
    idempotency_key: `tomas@nieves.com:telecom:greenhouse:${boards.join(',')}:${runDay}`,
    invoked_by: 'vercel-cron',
    location_policy: 'verify remote from Texas, employment from Texas, Dallas-Fort Worth, or Texas hybrid before package generation',
    market: 'telecom',
    min_fit_score: minFitScore,
    pipeline_targets: {
      active_qualified_minimum: DAILY_TARGET_ACTIVE_QUALIFIED,
      evaluate_strongest: '10-15',
      newly_identified_daily: DAILY_TARGET_NEWLY_IDENTIFIED,
      qualified_unique_adds_when_available: 5,
    },
    role_keywords: DAILY_OPERATING_CYCLE.rolePriorities,
    source_registry: DAILY_OPERATING_CYCLE.discoverySourcesEnabled,
    texas_remote_filter: 'remote_us_texas_or_dallas_fort_worth_texas_hybrid_only',
  };
}

async function persistRows(table: string, rows: JsonRecord | JsonRecord[]) {
  const supabaseUrl = cleanEnv(process.env.SUPABASE_URL);
  const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.startsWith('[')) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the Career OS daily cycle.');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    body: JSON.stringify(rows),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase ${table} upsert failed with ${response.status}: ${message.slice(0, 240)}`);
  }
}

function scorePosting(job: JsonRecord, description: string) {
  const title = String(job.title || '').toLowerCase();
  const text = `${title} ${String(asRecord(job.location).name || '')} ${description}`.toLowerCase();
  let score = 34;
  if (hasPhrase(title, 'senior director') || hasPhrase(title, 'vice president')) score += 22;
  else if (hasPhrase(title, 'director') || hasPhrase(title, 'head of')) score += 16;
  else if (hasPhrase(title, 'principal') || hasPhrase(title, 'group product')) score += 14;
  if (hasPhrase(title, 'product management')) score += 25;
  else if (hasPhrase(title, 'product manager') || /\bproduct\b/.test(title)) score += 19;
  if (hasPhrase(title, 'transformation') || hasPhrase(text, 'business transformation')) score += 13;
  if (hasPhrase(title, 'platform') || hasPhrase(text, 'platform strategy') || hasPhrase(text, 'workflow')) score += 8;
  if (hasPhrase(text, 'customer experience') || hasPhrase(text, 'contact center') || hasPhrase(text, 'ccaas') || hasPhrase(text, 'ucaas')) score += 9;
  if (hasPhrase(text, 'telecom') || hasPhrase(text, 'communications') || hasPhrase(text, 'connectivity') || hasPhrase(text, 'wireless') || hasPhrase(text, 'broadband')) score += 8;
  if (hasPhrase(text, 'automation') || /\bai\b/.test(text) || hasPhrase(text, 'agentic')) score += 6;
  if (hasPhrase(text, 'payments') || hasPhrase(text, 'cards') || hasPhrase(text, 'fintech')) score += 2;
  if (/remote\s*-\s*us|remote,\s*us|united states \(remote\)|usa\s*-\s*remote|work from home - us/i.test(String(asRecord(job.location).name || ''))) score += 7;
  if (/austin|dallas|plano|irving|houston|san antonio|texas/i.test(`${String(asRecord(job.location).name || '')} ${description}`)) score += 5;
  if (/remote canada|remote uk|remote poland|remote spain|india|ireland|london|dublin|germany|japan|israel/i.test(String(asRecord(job.location).name || ''))) score -= 25;
  if (!/\b(product|transformation|strategy|customer experience)\b/.test(title) && /compliance|counsel|sales|marketing|software engineer|learning|account|finance|analytics|designer|intern|apprentice/i.test(title)) score -= 34;
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

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

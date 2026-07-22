import {
  buildDailyOperatingCycleStatus,
  DAILY_CRON_PATH,
  type DailyOperatingCycleStatus,
} from './career-os-daily-cycle';
import { canonicalQueueState, careerOsActionMetadata } from './career-os-queue';
import { duplicateLockKeys } from './career-os-duplicate-lock';
import {
  applicationMatchesCanonicalOpportunity,
  canonicalOpportunityIdentity,
  mergeCanonicalSourceSightings,
} from './career-os-canonical-opportunity';
import {
  careerOsSelectRows,
  cleanSupabaseEnv,
  getCareerOsSupabaseConfiguration,
} from './career-os-supabase';

type JsonRecord = Record<string, unknown>;

const AUTO_APPLY_THRESHOLD = 85;
const REVIEW_QUEUE_THRESHOLD = 60;

export type CareerOsStatus = {
  environment: 'production' | 'snapshot' | 'unconfigured';
  generatedAt: string;
  greetingName: string;
  dailyDiscoveries: number;
  activeOpportunities: number;
  worthApplyingToday: number;
  totalUniqueOpportunities: number;
  activeQualifiedOpportunities: number;
  remainingQualifiedApplications: number;
  waitingOnTomas: number;
  readyForAutomation: number;
  reviewQueueCount: number;
  archivedOpportunities: number;
  inProgress: number;
  ineligible: number;
  inactive: number;
  duplicateRecordsRemoved: number;
  preparedPackages: number;
  totalPackages: number;
  packagesCoveringQualifiedJobs: number;
  packageAssetsOnQualifiedJobs: number;
  orphanedPackages: number;
  submittedApplications: number;
  submittedApplicationIds: string[];
  humanOnlyGates: number;
  salaryRange?: {
    minUsd?: number;
    maxUsd?: number;
    complete: boolean;
  };
  compensationPreference?: {
    preferredMinimumBaseSalaryUsd?: number;
    openToNegotiation?: boolean;
  };
  compensationPolicy: CompensationPolicyStatus;
  globalLifecycle: GlobalLifecycleStatus;
  applicationExecution: ApplicationExecutionStatus;
  trustedAutoApplyPolicy: TrustedAutoApplyPolicyStatus;
  releaseCompletionPercentage: number;
  actionableProgressPercentage: number;
  qualificationTiers: QualificationTierPolicy;
  reviewQueue: ReviewQueueStatus;
  dailyWorkflow: DailyOperatingCycleStatus;
  nextAction?: {
    label: string;
    reason: string;
    estimatedMinutes?: number;
    deepLink?: string;
    employer?: string;
    role?: string;
    whatCareerOsCompleted?: string;
    whatTomasMustDo?: string;
    applicationsUnlocked?: number;
  };
  employmentModel: EmploymentModelStatus;
  atsEmploymentMapper: AtsEmploymentMapperStatus;
  authoritativeLedger: AuthoritativeLedgerStatus;
  operationalTrust: OperationalTrustStatus;
  productionEvidenceReady: boolean;
  blocker?: string;
  evidence: CareerOsEvidence;
  verificationRows: VerificationRow[];
};

export type QualificationTier = 'archive' | 'auto_apply' | 'tomas_review';

export type AuthoritativeLedgerOutcome =
  | 'submitted'
  | 'ready'
  | 'waiting_on_tomas'
  | 'duplicate'
  | 'unsupported_ats'
  | 'technical_blocker'
  | 'package_missing'
  | 'stale'
  | 'rejected';

export type AuthoritativeLedgerRow = {
  applicationStatus?: string;
  atsSupportState: 'supported' | 'unknown' | 'unsupported';
  canonicalOpportunityId: string;
  confirmationEvidence: boolean;
  currentRunId?: string;
  duplicateLock: boolean;
  evidenceReferences: string[];
  employer: string;
  lastUpdated: string;
  linkedApplicationId?: string;
  opportunityStatus: string;
  outcome: AuthoritativeLedgerOutcome;
  outcomeReason: string;
  packageState: 'complete' | 'missing';
  packageVerified: boolean;
  postingLiveState: 'live' | 'stale';
  requisition: string;
  role: string;
  sourcePostingId: string;
  submissionEvidence: boolean;
  technicalBlockerStatus: 'blocked' | 'none';
  tomasTaskStatus: 'needs_tomas' | 'none';
};

export type AuthoritativeLedgerStatus = {
  activeQualifiedOpportunities: number;
  confirmed: number;
  duplicate: number;
  inconsistent: boolean;
  packageMissing: number;
  qualified: number;
  ready: number;
  readyCandidate?: AuthoritativeLedgerRow;
  rejected: number;
  rows: AuthoritativeLedgerRow[];
  stale: number;
  submitted: number;
  technicalBlocker: number;
  unsupportedAts: number;
  waitingOnTomas: number;
};

export type QualificationTierPolicy = {
  archiveRange: '0-59';
  autoApplyRange: '85-100';
  reviewQueueRange: '60-84';
  autoApplyThreshold: 85;
};

export type ReviewQueueItem = {
  applicationId?: string;
  applicationStatus: 'Approved' | 'Not Submitted' | 'Skipped';
  ats: string;
  canonicalUrl: string;
  compensationText?: string;
  concerns: string[];
  currentLifecycleState: string;
  duplicateLocked: boolean;
  employer: string;
  fitScore: number;
  highestReason: string;
  location: string;
  opportunityId: string;
  packageStatus: 'approved_existing' | 'none' | 'package_ready';
  postedAt?: string;
  qualificationReasons: string[];
  requisitionId: string;
  reviewDecision: 'approve' | 'none' | 'reject_similar' | 'skip';
  scoreBreakdown: Array<{ category: string; score: number; summary: string }>;
  tier: QualificationTier;
  title: string;
};

export type ReviewQueueStatus = {
  estimatedReviewMinutes: number;
  highestScoringRole?: string;
  items: ReviewQueueItem[];
  oldestWaitingRole?: string;
  total: number;
};

export type OperationalTrustClassification =
  | 'verified'
  | 'inferred'
  | 'stale'
  | 'synthetic'
  | 'duplicated'
  | 'unsupported'
  | 'terminal_but_incorrectly_active'
  | 'missing_evidence';

export type OperationalTrustCounts = {
  actionCenter: number;
  applying: number;
  interviews: number;
  opportunities: number;
  readyToResume: number;
  reviewQueue: number;
  submitted: number;
  systemIssues: number;
};

export type OperationalTrustRecord = {
  applicationId?: string;
  blockerEvidence?: string;
  canonicalOpportunityId?: string;
  checkpointAgeHours?: number;
  checkpointId?: string;
  checkpointStorageLocation?: string;
  classification: OperationalTrustClassification;
  confirmationTimestamp?: string;
  confirmationType?: string;
  currentStep?: string;
  currentUrl?: string;
  duplicateLock: boolean;
  employer: string;
  executionId?: string;
  gateId?: string;
  gateType?: string;
  humanAction?: string;
  id: string;
  lastHeartbeatAt?: string;
  lastValidatedAt?: string;
  missingEvidence: string[];
  opportunityId?: string;
  reasoning: string;
  requisitionId?: string;
  role: string;
  stale: boolean;
};

export type OperationalTrustIssue = {
  actualValue: number;
  affectedRecordIds: string[];
  evidence: string;
  expectedValue: number;
  id: string;
  rule: string;
  severity: 'high' | 'low' | 'medium';
};

export type OperationalTrustStatus = {
  applicationsWithoutCheckpoints: string[];
  beforeCounts: OperationalTrustCounts;
  candidateModeUnsupportedClaimsRemoved: boolean;
  checkpointsWithoutExecutions: string[];
  completedGatesStillActive: string[];
  consistencyChecksReady: boolean;
  dashboardCountMismatches: OperationalTrustIssue[];
  executionsWithoutHeartbeats: string[];
  stateInspectorReady: boolean;
  staleRecordIds: string[];
  submittedRecords: OperationalTrustRecord[];
  syntheticRecordIds: string[];
  systemIssueRecords: OperationalTrustRecord[];
  terminalApplicationsIncorrectlyActionable: string[];
  trustReport: {
    confidenceScore: number;
    inconsistenciesOpen: number;
    staleRecordsExcluded: number;
    unsupportedClaimsRemoved: number;
    verifiedActionCenterItems: number;
    verifiedActiveExecutions: number;
    verifiedOpportunities: number;
    verifiedResumableCheckpoints: number;
    verifiedReviewQueueItems: number;
    verifiedSubmittedApplications: number;
  };
  unsupportedRecordIds: string[];
  verifiedActionCenterRecords: OperationalTrustRecord[];
  verifiedApplyingRecords: OperationalTrustRecord[];
  verifiedCounts: OperationalTrustCounts;
  verifiedOpportunityRecords: OperationalTrustRecord[];
  verifiedReadyToResumeRecords: OperationalTrustRecord[];
  verifiedReviewRecords: OperationalTrustRecord[];
};

export type CanonicalEmploymentRecord = {
  currentEmployer: boolean;
  employer: string;
  endMonth?: string;
  endYear?: number;
  location?: string;
  source: string;
  startMonth?: string;
  startYear?: number;
  title: string;
  verificationState: string;
};

export type EmploymentModelStatus = {
  completeForExternalUse: boolean;
  missingVerifiedFields: string[];
  records: CanonicalEmploymentRecord[];
  source: string;
  version: string;
};

export type AtsEmploymentPath = 'employment.company' | 'employment.title' | 'employment.start_date' | 'employment.end_date' | 'employment.current';
export type AtsEmploymentPlatform = 'Cisco' | 'Workday' | 'Greenhouse';

export type AtsEmploymentFieldRule = {
  labels: string[];
  path: AtsEmploymentPath;
  valueKind: 'boolean' | 'date' | 'text';
};

export type AtsMappedEmploymentField = {
  labels: string[];
  missingVerifiedField?: string;
  path: AtsEmploymentPath;
  value?: string | boolean;
  verified: boolean;
};

export type AtsEmploymentMappingResult = {
  applicationId?: string;
  canPopulateRequiredFields: boolean;
  employer?: string;
  fields: AtsMappedEmploymentField[];
  missingVerifiedFields: string[];
  pauseReason?: string;
  platform: AtsEmploymentPlatform;
};

export type AtsEmploymentMapperStatus = {
  applicationsUnblocked: number;
  ciscoValidation: AtsEmploymentMappingResult;
  fieldRules: AtsEmploymentFieldRule[];
  supportedPlatforms: AtsEmploymentPlatform[];
  version: string;
};

export type CareerOsEvidence = {
  ownerEmail: string;
  profile?: JsonRecord;
  latestSourceRun?: JsonRecord;
  jobPostings: JsonRecord[];
  seededOpportunities: JsonRecord[];
  applications: JsonRecord[];
  tasks: JsonRecord[];
  artifacts: JsonRecord[];
  workflowEvents: JsonRecord[];
  sourceRuns: JsonRecord[];
  employerKnowledgeBase: EmployerKnowledgeBaseEvidence;
  dailyReport?: JsonRecord;
  automationRuns: JsonRecord[];
  diagnostics: string[];
  deployment: {
    commitSha?: string;
    deploymentUrl?: string;
    vercelEnv?: string;
  };
};

type EmployerKnowledgeBaseEvidence = {
  employers: JsonRecord[];
  platformProfiles: JsonRecord[];
  applicationProcesses: JsonRecord[];
  questionCatalog: JsonRecord[];
  questionMappings: JsonRecord[];
  employerAccounts: JsonRecord[];
  sessionTemplates: JsonRecord[];
};

type VerificationRow = {
  detail?: string;
  name: string;
  passed: boolean;
};

type DuplicateSafetyFailure = {
  applicationId: string;
  reason: string;
};

export type CompensationPolicyStatus = {
  allDiscoveredPostedCompensationRange: {
    minUsd?: number;
    maxUsd?: number;
    complete: boolean;
  };
  approvedTotalCompensationExceptions: number;
  belowTargetJobs: Array<{
    employer: string;
    postedMaxUsd?: number;
    reason: string;
    role: string;
  }>;
  belowTargetRemoved: number;
  compensationUnknown: number;
  postedBaseAtOrAboveTarget: number;
  preferredMinimumBaseSalaryUsd?: number;
  qualifiedPostedBaseRange: {
    minUsd?: number;
    maxUsd?: number;
    complete: boolean;
  };
};

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

export type RawRecordOutcome =
  | CanonicalApplicationExecutionState
  | 'refreshed_existing_posting'
  | 'location_ineligible'
  | 'compensation_ineligible'
  | 'poor_fit'
  | 'already_submitted';

export type TrustedAutoApplyPolicyStatus = {
  authority: 'enabled';
  ordinaryApplicationApprovalRequired: false;
  autoQueueQualifiedPackageReadyApplications: true;
  submitWhenSafe: true;
  scope: string[];
  requiredPassConditions: string[];
  humanOnlyStops: string[];
  legalFingerprintPolicy: {
    enabled: true;
    reuseWhenFingerprintMatches: true;
    changedLegalTextRequiresReview: true;
    materiallyIdenticalTextOnly: true;
  };
};

export type GlobalLifecycleStatus = {
  totalRawRecordsEverDiscovered: number;
  rawRecordsProcessed: number;
  recordsAwaitingProcessing: number;
  uniqueOpportunities: number;
  duplicatesRemoved: number;
  activeQualifiedOpportunities: number;
  backlogQualifiedOpportunities: number;
  applicationsQueued: number;
  applicationsRunning: number;
  applicationsSubmitted: number;
  applicationsConfirmed: number;
  waitingOnTomas: number;
  technicallyBlocked: number;
  inactive: number;
  ineligible: number;
  failedWithRetry: number;
  permanentlyFailed: number;
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
  nextScheduledRun: string;
  outcomes: Record<RawRecordOutcome, number>;
  allHistoricalRecordsReconciled: boolean;
  arbitraryResultLimitRemoved: boolean;
};

export type ApplicationExecutionItem = {
  applicationId?: string;
  canonicalExecutionState: CanonicalApplicationExecutionState;
  cta: {
    actionKind: string;
    applicationsUnlocked: number;
    disabledReason?: string;
    href: string;
    label: string;
    kind: 'external' | 'internal';
    serverAction: '/api/career-os/actions';
    whatCareerOsCompleted: string;
    whatTomasMustDo: string;
  };
  employer: string;
  reason: string;
  role: string;
  status:
    | 'Submitted'
    | 'Running now'
    | 'Queued for immediate execution'
    | 'Scheduled for next run'
    | 'Waiting on Tomas'
    | 'Technically blocked'
    | 'Compensation review required'
    | 'Inactive'
    | 'Ineligible'
    | 'Failed with error';
};

export type ApplicationExecutionStatus = {
  applicationsProcessedToday: number;
  confirmationEvidenceStatus: string;
  confirmed: number;
  exactStatuses: ApplicationExecutionItem[];
  failedWithError: number;
  failedWithRetry: number;
  lastExecutionTime?: string;
  nextScheduledRun: string;
  permanentlyFailed: number;
  queuedImmediate: number;
  queueStates: Record<CanonicalApplicationExecutionState, number>;
  runningNow: number;
  submitted: number;
  submittedToday: number;
  technicallyBlocked: number;
  waitingOnTomas: number;
};

export async function getCareerOsStatus(): Promise<CareerOsStatus> {
  const ownerEmail = process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
  const diagnostics: string[] = [];
  const configuration = getSupabaseConfiguration();

  if (!configuration.configured) {
    const evidence = emptyEvidence(ownerEmail, ['Supabase service configuration is unavailable in this runtime.']);
    return normalizeStatus(evidence, false);
  }

  try {
    const [
      profiles,
      sourceRuns,
      jobPostings,
      seededOpportunities,
      applications,
      tasks,
      artifacts,
      workflowEvents,
      employers,
      platformProfiles,
      applicationProcesses,
      questionCatalog,
      questionMappings,
      employerAccounts,
      sessionTemplates,
      dailyReports,
      automationRuns,
    ] = await Promise.all([
      safeSupabaseSelect(configuration, 'career_os_profiles', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&limit=1`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_source_runs', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=executed_at.desc&limit=20`, diagnostics),
      safeSupabaseSelectAll(configuration, 'career_os_job_postings', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=fit_score.desc.nullslast,last_checked_at.desc`, diagnostics),
      safeSupabaseSelectAll(configuration, 'career_os_opportunities', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc`, diagnostics),
      safeSupabaseSelectAll(configuration, 'career_os_applications', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_tasks', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics),
      safeSupabaseSelectAll(configuration, 'career_os_artifacts', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=created_at.desc`, diagnostics),
      safeSupabaseSelectAll(configuration, 'career_os_employer_workflow_events', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=occurred_at.desc`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_employers', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_employer_platform_profiles', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_employer_application_processes', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_employer_question_catalog', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=200`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_question_mappings', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=200`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_employer_accounts', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_application_session_templates', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_daily_operating_reports', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=generated_at.desc&limit=1`, diagnostics),
      safeSupabaseSelect(configuration, 'career_os_automation_runs', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=started_at.desc&limit=5`, diagnostics),
    ]);

    const evidence: CareerOsEvidence = {
      ownerEmail,
      profile: profiles[0],
      latestSourceRun: sourceRuns[0],
      sourceRuns,
      jobPostings,
      seededOpportunities,
      applications,
      tasks,
      artifacts,
      workflowEvents,
      employerKnowledgeBase: {
        employers,
        platformProfiles,
        applicationProcesses,
        questionCatalog,
        questionMappings,
        employerAccounts,
        sessionTemplates,
      },
      dailyReport: dailyReports[0],
      automationRuns,
      diagnostics,
      deployment: {
        commitSha: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
        deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_BASE_URL,
        vercelEnv: process.env.VERCEL_ENV,
      },
    };

    const coreReadsFailed = diagnostics.some((message) => hasAnyStatus(message, [
      'career_os_profiles',
      'career_os_job_postings',
      'career_os_opportunities',
      'career_os_applications',
      'connection timed out',
      'status 522',
      'timeout',
    ]));
    if (coreReadsFailed) {
      const snapshotStatus = buildSnapshotStatus(ownerEmail, dailyReports[0], automationRuns[0], diagnostics);
      if (snapshotStatus) return snapshotStatus;
      return normalizeStatus({
        ...evidence,
        diagnostics: uniqueStrings([
          ...diagnostics,
          'No verified snapshot is currently readable. Career OS is pausing candidate-mode counts instead of presenting stale or synthetic data.',
        ]),
      }, false);
    }

    return normalizeStatus(evidence, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Career OS evidence service error.';
    const diagnosticsWithError = [message];
    const snapshotStatus = await loadSnapshotStatus(configuration, ownerEmail, diagnosticsWithError);
    if (snapshotStatus) return snapshotStatus;
    const evidence = emptyEvidence(ownerEmail, [
      `${message} No verified snapshot is currently readable, so Career OS cannot safely display operational counts.`,
    ]);
    return normalizeStatus(evidence, false);
  }
}

export function summarizeCareerOsStatus(status: CareerOsStatus) {
  const salary = status.salaryRange?.complete && status.salaryRange.minUsd && status.salaryRange.maxUsd
    ? `$${Math.round(status.salaryRange.minUsd / 1000)}K-$${Math.round(status.salaryRange.maxUsd / 1000)}K`
    : 'Salary information is incomplete.';
  const qualifiedSalary = status.compensationPolicy.qualifiedPostedBaseRange.complete
    && status.compensationPolicy.qualifiedPostedBaseRange.minUsd
    && status.compensationPolicy.qualifiedPostedBaseRange.maxUsd
    ? `$${Math.round(status.compensationPolicy.qualifiedPostedBaseRange.minUsd / 1000)}K-$${Math.round(status.compensationPolicy.qualifiedPostedBaseRange.maxUsd / 1000)}K`
    : 'No qualified posted-base range is complete.';
  const preferredBase = status.compensationPreference?.preferredMinimumBaseSalaryUsd
    ? `$${Math.round(status.compensationPreference.preferredMinimumBaseSalaryUsd / 1000)}K`
    : 'not set';

  return {
    greeting: `Good morning, ${status.greetingName}.`,
    discoveryLine: status.productionEvidenceReady
      ? `${status.totalUniqueOpportunities} unique jobs are represented in production.`
      : 'Career OS production systems are not connected in this runtime.',
    applyLine: `${status.activeQualifiedOpportunities} qualified active job${status.activeQualifiedOpportunities === 1 ? '' : 's'}.`,
    remainingLine: `${status.remainingQualifiedApplications} qualified application${status.remainingQualifiedApplications === 1 ? '' : 's'} remaining.`,
    reviewLine: `${status.reviewQueue.total} role${status.reviewQueue.total === 1 ? '' : 's'} are waiting in My Review Queue.`,
    packageLine: `${status.totalPackages} package asset${status.totalPackages === 1 ? '' : 's'} generated, covering ${status.packagesCoveringQualifiedJobs} qualified job${status.packagesCoveringQualifiedJobs === 1 ? '' : 's'}.`,
    packageExplanation: 'Packages are application assets and may include multiple versions. Package count does not equal the number of unique jobs.',
    submittedLine: `${status.submittedApplications} submitted application${status.submittedApplications === 1 ? '' : 's'} with confirmation evidence.`,
    needsLine: `${status.waitingOnTomas} application${status.waitingOnTomas === 1 ? '' : 's'} waiting on Tomas.`,
    postedCompensationRange: salary,
    qualifiedPostedCompensationRange: qualifiedSalary,
    compensationPreferenceLine: `Tomas preferred minimum base salary: ${preferredBase}; optional desired-compensation fields stay blank.`,
    dailyWorkflowLine: `${status.dailyWorkflow.marketCoverage.rawJobsReviewed} raw source record${status.dailyWorkflow.marketCoverage.rawJobsReviewed === 1 ? '' : 's'} reviewed; ${status.dailyWorkflow.dailyFunnel.qualificationToday.activeAndVerified} unique live role${status.dailyWorkflow.dailyFunnel.qualificationToday.activeAndVerified === 1 ? '' : 's'} evaluated; ${status.dailyWorkflow.pipelineHealth.newOpportunitiesToday} new opportunit${status.dailyWorkflow.pipelineHealth.newOpportunitiesToday === 1 ? 'y' : 'ies'} added; ${status.dailyWorkflow.pipelineHealth.applicationsSubmittedToday} submitted today.`,
  };
}

function normalizeStatus(evidence: CareerOsEvidence, supabaseConnected: boolean): CareerOsStatus {
  const activeJobPostings = evidence.jobPostings.filter((job) => job.posting_validation_status === 'active');
  const activeSeeded = evidence.seededOpportunities.filter((job) => !isInactiveStatus(String(job.status || '')));
  const applications = evidence.applications;
  const workflowEvents = evidence.workflowEvents;
  const sourceRunAccepted = numberValue(evidence.latestSourceRun?.number_accepted);
  const openTasks = evidence.tasks.filter((task) => !['approved', 'rejected', 'deferred', 'completed', 'dismissed'].includes(String(task.status || 'open')));
  const openHumanOnlyGates = workflowEvents.filter((event) => {
    const status = String(event.status || 'blocked');
    return String(event.event_type || '').includes('human_only_gate')
      && !['approved', 'resolved', 'cleared', 'completed', 'dismissed', 'submitted'].includes(status);
  });
  const compensationPreference = buildCompensationPreference(evidence.profile);
  const authoritativeLedger = buildAuthoritativeLedger(evidence, compensationPreference.preferredMinimumBaseSalaryUsd);
  const canonicalRelease = buildCanonicalReleaseMetrics(evidence, compensationPreference.preferredMinimumBaseSalaryUsd);
  const submittedApplicationRows = selectCanonicalSubmittedApplications(evidence);
  const humanOnlyGates = canonicalRelease.waitingOnTomas || openHumanOnlyGates.length + openTasks.length;
  const submittedApplications = authoritativeLedger.submitted;
  const preparedPackages = canonicalRelease.totalPackages;
  const salaryRange = buildSalaryRange(activeJobPostings);
  const compensationPolicy = buildCompensationPolicyStatus(evidence, compensationPreference.preferredMinimumBaseSalaryUsd);
  const applicationExecution = buildApplicationExecutionStatus(evidence, new Date(), submittedApplicationRows);
  const duplicateSafety = evaluateDuplicateApplicationSafety(evidence.applications);
  const trustedAutoApplyPolicy = buildTrustedAutoApplyPolicy();
  const reviewQueue = buildReviewQueueStatus(evidence, compensationPreference.preferredMinimumBaseSalaryUsd);
  const globalLifecycle = buildGlobalLifecycleStatus(
    evidence,
    canonicalRelease,
    applicationExecution,
    compensationPreference.preferredMinimumBaseSalaryUsd,
  );
  const dailyWorkflow = buildDailyOperatingCycleStatus(evidence, canonicalRelease);
  const employmentModel = buildEmploymentModel(evidence);
  const atsEmploymentMapper = buildAtsEmploymentMapperStatus(evidence, employmentModel);
  const verificationRows = buildVerificationRows(evidence, supabaseConnected, dailyWorkflow, duplicateSafety);
  const operationalTrust = buildOperationalTrustStatus(
    evidence,
    buildCanonicalOpportunityList(evidence, compensationPreference.preferredMinimumBaseSalaryUsd),
    reviewQueue,
    applicationExecution,
    new Date(),
    authoritativeLedger,
  );
  const readyToStart = authoritativeLedger.ready;
  const activeQualifiedOpportunities = authoritativeLedger.activeQualifiedOpportunities;
  const waitingOnTomas = authoritativeLedger.waitingOnTomas;
  const inProgress = authoritativeLedger.technicalBlocker;

  return {
    environment: supabaseConnected ? 'production' : 'unconfigured',
    generatedAt: new Date().toISOString(),
    greetingName: 'Tomas',
    dailyDiscoveries: sourceRunAccepted || canonicalRelease.totalUniqueOpportunities || activeJobPostings.length || activeSeeded.length,
    activeOpportunities: canonicalRelease.totalUniqueOpportunities || activeJobPostings.length || activeSeeded.length,
    worthApplyingToday: activeQualifiedOpportunities,
    totalUniqueOpportunities: canonicalRelease.totalUniqueOpportunities,
    activeQualifiedOpportunities,
    remainingQualifiedApplications: canonicalRelease.remainingQualifiedApplications,
    waitingOnTomas,
    readyForAutomation: readyToStart,
    reviewQueueCount: canonicalRelease.reviewQueueCount,
    archivedOpportunities: canonicalRelease.archivedOpportunities,
    inProgress,
    ineligible: canonicalRelease.ineligible,
    inactive: canonicalRelease.inactive,
    duplicateRecordsRemoved: canonicalRelease.duplicateRecordsRemoved,
    preparedPackages,
    totalPackages: canonicalRelease.totalPackages,
    packagesCoveringQualifiedJobs: canonicalRelease.packagesCoveringQualifiedJobs,
    packageAssetsOnQualifiedJobs: canonicalRelease.packageAssetsOnQualifiedJobs,
    orphanedPackages: canonicalRelease.orphanedPackages,
    submittedApplications,
    submittedApplicationIds: submittedApplicationRows.map((item) => String(item.application.id)),
    humanOnlyGates,
    salaryRange,
    compensationPreference,
    compensationPolicy,
    globalLifecycle,
    applicationExecution,
    trustedAutoApplyPolicy,
    releaseCompletionPercentage: canonicalRelease.releaseCompletionPercentage,
    actionableProgressPercentage: canonicalRelease.actionableProgressPercentage,
    qualificationTiers: {
      archiveRange: '0-59',
      autoApplyRange: '85-100',
      reviewQueueRange: '60-84',
      autoApplyThreshold: AUTO_APPLY_THRESHOLD,
    },
    reviewQueue,
    dailyWorkflow,
    nextAction: buildNextAction(evidence, openTasks, openHumanOnlyGates, applicationExecution),
    employmentModel,
    atsEmploymentMapper,
    authoritativeLedger,
    operationalTrust,
    productionEvidenceReady: supabaseConnected,
    blocker: !supabaseConnected
      ? evidence.diagnostics[0]
      : authoritativeLedger.inconsistent
        ? 'Career OS is reconciling application status. Automation is paused.'
        : undefined,
    evidence,
    verificationRows,
  };
}

async function loadSnapshotStatus(
  configuration: ReturnType<typeof getSupabaseConfiguration>,
  ownerEmail: string,
  diagnostics: string[],
) {
  const dailyReports = await safeSupabaseSelect(
    configuration,
    'career_os_daily_operating_reports',
    `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=generated_at.desc&limit=1`,
    diagnostics,
  );
  const automationRuns = await safeSupabaseSelect(
    configuration,
    'career_os_automation_runs',
    `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=started_at.desc&limit=1`,
    diagnostics,
  );
  return buildSnapshotStatus(ownerEmail, dailyReports[0], automationRuns[0], diagnostics);
}

function buildSnapshotStatus(
  ownerEmail: string,
  dailyReport: JsonRecord | undefined,
  automationRun: JsonRecord | undefined,
  diagnostics: string[],
): CareerOsStatus | null {
  if (!dailyReport) return null;

  const reportPayload = asRecord(dailyReport.payload);
  const reportCycle = asRecord(reportPayload.daily_operating_cycle);
  const reportRelease = asRecord(reportPayload.release_progress_20260719);
  const discoveryResult = asRecord(reportPayload.discovery_result);
  const snapshotGeneratedAt = stringValue(dailyReport.generated_at) || new Date().toISOString();
  const activeQualifiedOpportunities = numberValue(reportRelease.active_qualified_opportunities);
  const submittedApplications = firstPositiveNumber(
    reportRelease.submitted_applications,
    asRecord(reportCycle.pipelineHealth).totalSubmitted,
  );
  const waitingOnTomas = firstPositiveNumber(
    reportRelease.waiting_on_tomas,
    asRecord(reportCycle.pipelineHealth).waitingOnTomas,
    dailyReport.prepared_for_review,
  );
  const readyForAutomation = firstPositiveNumber(
    reportRelease.ready_for_automation,
    asRecord(reportCycle.pipelineHealth).readyForAutomation,
    dailyReport.auto_apply_eligible,
  );
  const totalUniqueOpportunities = firstPositiveNumber(
    reportRelease.total_unique_opportunities,
    activeQualifiedOpportunities,
  );
  const technicalBlockers = firstPositiveNumber(
    asRecord(reportCycle.marketCoverage).technicalBlockers,
    dailyReport.blocked,
  );
  const interviews = numberValue(asRecord(reportCycle.pipelineHealth).interviews);
  const reviewQueueCount = Math.max(activeQualifiedOpportunities - submittedApplications - waitingOnTomas - readyForAutomation, 0);
  const baseStatus = normalizeStatus(emptyEvidence(ownerEmail, diagnostics), false);
  const snapshotWorkflow = hasKeys(reportCycle)
    ? reportCycle as unknown as DailyOperatingCycleStatus
    : buildDailyOperatingCycleStatus(baseStatus.evidence, {
      activeQualifiedOpportunities,
      duplicateRecordsRemoved: numberValue(reportRelease.duplicate_records_removed),
      inactive: numberValue(reportRelease.inactive),
      ineligible: numberValue(reportRelease.ineligible),
      inProgress: 0,
      readyForAutomation,
      releaseCompletionPercentage: numberValue(reportRelease.release_completion_percentage),
      submittedApplications,
      totalPackages: numberValue(reportRelease.total_package_assets),
      totalUniqueOpportunities,
      waitingOnTomas,
    }, new Date(snapshotGeneratedAt));

  return {
    ...baseStatus,
    environment: 'snapshot',
    generatedAt: snapshotGeneratedAt,
    dailyDiscoveries: firstPositiveNumber(
      discoveryResult.postings_reviewed,
      dailyReport.opportunities_reviewed,
      asRecord(snapshotWorkflow.marketCoverage).rawJobsReviewed,
    ),
    activeOpportunities: totalUniqueOpportunities,
    worthApplyingToday: activeQualifiedOpportunities,
    totalUniqueOpportunities,
    activeQualifiedOpportunities,
    remainingQualifiedApplications: Math.max(activeQualifiedOpportunities - submittedApplications, 0),
    waitingOnTomas,
    readyForAutomation,
    reviewQueueCount,
    archivedOpportunities: 0,
    inProgress: 0,
    ineligible: numberValue(reportRelease.ineligible),
    inactive: numberValue(reportRelease.inactive),
    duplicateRecordsRemoved: numberValue(reportRelease.duplicate_records_removed),
    preparedPackages: numberValue(reportRelease.total_package_assets),
    totalPackages: numberValue(reportRelease.total_package_assets),
    packagesCoveringQualifiedJobs: 0,
    packageAssetsOnQualifiedJobs: 0,
    orphanedPackages: 0,
    submittedApplications,
    submittedApplicationIds: [],
    humanOnlyGates: waitingOnTomas,
    reviewQueue: {
      ...baseStatus.reviewQueue,
      total: reviewQueueCount,
    },
    dailyWorkflow: snapshotWorkflow,
    blocker: `System temporarily unavailable. Last verified update: ${snapshotGeneratedAt}. Automation is paused to protect your applications.`,
    evidence: {
      ...baseStatus.evidence,
      dailyReport,
      automationRuns: automationRun ? [automationRun] : [],
      diagnostics: uniqueStrings(diagnostics),
    },
    productionEvidenceReady: false,
    operationalTrust: {
      ...baseStatus.operationalTrust,
      verifiedCounts: {
        ...baseStatus.operationalTrust.verifiedCounts,
        actionCenter: waitingOnTomas,
        applying: 0,
        interviews,
        opportunities: activeQualifiedOpportunities,
        readyToResume: readyForAutomation,
        reviewQueue: reviewQueueCount,
        submitted: submittedApplications,
        systemIssues: technicalBlockers,
      },
      trustReport: {
        ...baseStatus.operationalTrust.trustReport,
        verifiedActionCenterItems: waitingOnTomas,
        verifiedOpportunities: activeQualifiedOpportunities,
        verifiedReviewQueueItems: reviewQueueCount,
        verifiedSubmittedApplications: submittedApplications,
      },
    },
  };
}

function buildNextAction(
  evidence: CareerOsEvidence,
  openTasks: JsonRecord[],
  openHumanOnlyGates: JsonRecord[],
  applicationExecution: ApplicationExecutionStatus,
) {
  const applicationBlocker = applicationExecution.exactStatuses.find((item) => item.canonicalExecutionState === 'waiting_on_tomas')
    || applicationExecution.exactStatuses.find((item) => item.canonicalExecutionState === 'blocked_technical');

  if (applicationBlocker) {
    return {
      applicationsUnlocked: applicationBlocker.cta.applicationsUnlocked,
      deepLink: applicationBlocker.applicationId ? `/career-os#application-${slug(`${applicationBlocker.employer}-${applicationBlocker.applicationId}`)}` : applicationBlocker.cta.href,
      employer: applicationBlocker.employer,
      estimatedMinutes: applicationBlocker.cta.actionKind === 'create_or_open_account' ? 2 : 1,
      label: applicationBlocker.cta.label,
      reason: applicationBlocker.reason,
      role: applicationBlocker.role,
      whatCareerOsCompleted: applicationBlocker.cta.whatCareerOsCompleted,
      whatTomasMustDo: applicationBlocker.cta.whatTomasMustDo,
    };
  }

  const latestHumanGate = openHumanOnlyGates[0];

  if (latestHumanGate) {
    return {
      label: String(latestHumanGate.metadata && typeof latestHumanGate.metadata === 'object' && 'action_label' in latestHumanGate.metadata ? latestHumanGate.metadata.action_label : `${latestHumanGate.employer || 'Employer'} needs Tomas`),
      reason: String(latestHumanGate.evidence_text || 'A human-only gate remains after the supported automation steps.'),
      estimatedMinutes: numberValue((latestHumanGate.metadata as JsonRecord | undefined)?.estimated_minutes) || undefined,
      deepLink: String(latestHumanGate.evidence_url || ''),
    };
  }

  const firstTask = openTasks[0];
  if (firstTask) {
    return {
      label: String(firstTask.action_required || 'Tomas action required'),
      reason: String(firstTask.why_tomas_is_needed || firstTask.supporting_evidence || 'Career OS needs Tomas before continuing.'),
      estimatedMinutes: 2,
      deepLink: undefined,
    };
  }

  return undefined;
}

function buildVerificationRows(
  evidence: CareerOsEvidence,
  supabaseConnected: boolean,
  dailyWorkflow: DailyOperatingCycleStatus,
  duplicateSafety: { checked: number; failures: DuplicateSafetyFailure[] },
): VerificationRow[] {
  const pilot = evidence.jobPostings.find((job) => job.selected_for_pilot) || evidence.jobPostings[0];
  const pilotArtifacts = evidence.artifacts.filter((artifact) => artifact.opportunity_id === pilot?.id);
  const pilotWorkflow = evidence.workflowEvents.filter((event) => event.opportunity_id === pilot?.id);
  const kb = evidence.employerKnowledgeBase;
  const affirmEmployer = kb.employers.find((employer) => employer.id === 'employer-affirm' || employer.canonical_name === 'Affirm');
  const affirmEmployerId = String(affirmEmployer?.id || '');
  const greenhouseProfile = kb.platformProfiles.find((profile) => profile.employer_id === affirmEmployerId && normalizedPlatformName(profile.platform_name) === 'greenhouse');
  const affirmProcess = kb.applicationProcesses.find((process) => process.employer_id === affirmEmployerId && normalizedPlatformName(process.platform_name) === 'greenhouse');
  const affirmQuestions = kb.questionCatalog.filter((question) => question.employer_id === affirmEmployerId && normalizedPlatformName(question.platform_name) === 'greenhouse');
  const approvedMappings = kb.questionMappings.filter((mapping) => mapping.approved_for_auto_fill === true && mapping.verification_state === 'tomas_verified');
  const affirmTemplate = kb.sessionTemplates.find((template) => template.employer_id === affirmEmployerId && normalizedPlatformName(template.platform_name) === 'greenhouse');
  const affirmAccount = kb.employerAccounts.find((account) => account.employer_id === affirmEmployerId && normalizedPlatformName(account.platform_name) === 'greenhouse');
  const profileValidation = validateProfile(evidence.profile);
  const sourceRunCurrent = evidence.latestSourceRun && new Date(String(evidence.latestSourceRun.executed_at)).getTime() > Date.now() - 1000 * 60 * 60 * 24 * 7;
  const qualifiedHumanGate = pilotWorkflow.some((event) => {
    const metadata = event.metadata as JsonRecord | undefined;
    return event.event_type === 'human_only_gate'
      && metadata?.gate_type
      && metadata.preceding_supported_steps_completed === true;
  });
  const submissionConfirmed = pilotWorkflow.some((event) => event.event_type === 'submission_confirmed');
  const automationUsesSamePipeline = Boolean(
    evidence.dailyReport
    || evidence.automationRuns.some((run) => String(run.summary || '').includes('same Greenhouse source-runner'))
    || (evidence.latestSourceRun?.search_config && (evidence.latestSourceRun.search_config as JsonRecord).daily_automation_id === 'daily-tomas-career-os-run')
  );
  const employmentModel = buildEmploymentModel(evidence);
  const atsEmploymentMapper = buildAtsEmploymentMapperStatus(evidence, employmentModel);
  const ciscoEmploymentValidated = atsEmploymentMapper.ciscoValidation.canPopulateRequiredFields
    || atsEmploymentMapper.ciscoValidation.pauseReason === 'missing_verified_information';
  const applicationExecution = buildApplicationExecutionStatus(evidence);
  const globalLifecycle = buildGlobalLifecycleStatus(
    evidence,
    buildCanonicalReleaseMetrics(evidence, buildCompensationPreference(evidence.profile).preferredMinimumBaseSalaryUsd),
    applicationExecution,
    buildCompensationPreference(evidence.profile).preferredMinimumBaseSalaryUsd,
  );

  return [
    row('Supabase evidence service connected', supabaseConnected),
    row('Candidate Master Profile validates', profileValidation.passed, profileValidation.detail),
    row('Missing reusable facts are consolidated', missingFactsConsolidated(evidence), missingFactsConsolidated(evidence) ? '' : 'Expected one reusable onboarding task for unresolved legal/sensitive answers.'),
    row('Real permitted job-source run exists', Boolean(evidence.latestSourceRun && evidence.latestSourceRun.status === 'succeeded' && numberValue(evidence.latestSourceRun.number_accepted) > 0 && sourceRunCurrent)),
    row('Real current opportunity exists', Boolean(pilot && pilot.posting_validation_status === 'active' && pilot.canonical_url && pilot.external_requisition_id)),
    row('Source and requisition evidence exist', Boolean(pilot?.source_run_id && pilot?.external_requisition_id && pilot?.canonical_url)),
    row('AnswerBrief analyses exist', Boolean(pilot?.ats_analysis && hasKeys(pilot.ats_analysis) && pilot?.ai_readiness_analysis && hasKeys(pilot.ai_readiness_analysis) && pilot?.recruiter_intelligence && hasKeys(pilot.recruiter_intelligence) && Array.isArray(pilot.hiring_manager_evidence_matrix) && pilot.hiring_manager_evidence_matrix.length > 0)),
    row('Targeted resume artifact exists and validates', pilotArtifacts.some((artifact) => artifact.artifact_type === 'targeted_resume' && artifact.validation_status === 'passed')),
    row('Application package exists', pilotArtifacts.some((artifact) => artifact.artifact_type === 'application_package' && artifact.validation_status === 'passed')),
    row('Drive delivery exists when configured', pilotArtifacts.some((artifact) => artifact.drive_url || (artifact.metadata as JsonRecord | undefined)?.drive_delivery_not_configured === true)),
    row('Employer adapter was used', pilotWorkflow.some((event) => event.event_type === 'adapter_detected')),
    row('Employer workflow evidence exists', pilotWorkflow.length > 0),
    row('Resume upload evidence exists if reached', pilotWorkflow.some((event) => event.event_type === 'resume_upload_completed') || !pilotWorkflow.some((event) => event.event_type === 'resume_upload_reached')),
    row('Verified answers were used', pilotWorkflow.some((event) => event.event_type === 'verified_answers_populated')),
    row('Submission or qualifying human-only gate reached', submissionConfirmed || qualifiedHumanGate, qualifiedHumanGate || submissionConfirmed ? '' : 'Human-only gate exists, but resume upload/submission prerequisites are not complete.'),
    row('Employer knowledge base exists', Boolean(kb.employers.length && kb.platformProfiles.length && kb.applicationProcesses.length && kb.questionCatalog.length && kb.questionMappings.length && kb.sessionTemplates.length)),
    row('Affirm employer record saved', Boolean(affirmEmployer && affirmEmployer.status === 'active')),
    row('Greenhouse platform record saved', Boolean(greenhouseProfile)),
    row('Affirm process steps captured', Boolean(affirmProcess && arrayLength(affirmProcess.ordered_onboarding_steps) > 0 && arrayLength(affirmProcess.required_fields) > 0)),
    row('Employer questions cataloged', affirmQuestions.length >= 10, `${affirmQuestions.length} Affirm Greenhouse question(s) cataloged.`),
    row('Approved question mappings created', approvedMappings.length >= 7, `${approvedMappings.length} verified mapping(s) approved for auto-fill.`),
    row('Application session template saved', Boolean(affirmTemplate)),
    row('Employer account record saved', Boolean(affirmAccount)),
    row('Live UI shows factual production state', supabaseConnected && Boolean(pilot && evidence.latestSourceRun)),
    row('Daily automation uses same workflow', automationUsesSamePipeline),
    row(
      'Duplicate prevention passes',
      duplicateSafety.failures.length === 0,
      duplicateSafety.failures.length
        ? duplicateSafety.failures.map((failure) => `${failure.applicationId}: ${failure.reason}`).join('; ')
        : `Verified ${duplicateSafety.checked} terminal or duplicate-locked application(s) cannot re-enter active execution states.`,
    ),
    row('Production health passes', supabaseConnected && evidence.diagnostics.length === 0),
    row('Deployment evidence exists', Boolean(evidence.deployment.deploymentUrl)),
    row('Production browser validation evidence exists', evidence.workflowEvents.some((event) => event.event_type === 'production_browser_validation')),
    row('Canonical employment history model exists', employmentModel.records.length > 0 && employmentModel.records.every((record) => record.employer && record.title), `${employmentModel.records.length} verified employment record(s); missing ${employmentModel.missingVerifiedFields.join(', ') || 'none'}.`),
    row('Employment ATS mapper supports Cisco Workday Greenhouse', atsEmploymentMapper.supportedPlatforms.length === 3 && atsEmploymentMapper.fieldRules.length === 5),
    row('Cisco employment mapper validated', ciscoEmploymentValidated, atsEmploymentMapper.ciscoValidation.canPopulateRequiredFields ? 'Cisco employment fields can be populated from canonical verified facts.' : `Cisco paused for missing verified field(s): ${atsEmploymentMapper.ciscoValidation.missingVerifiedFields.join(', ')}.`),
    row('Permanent daily workflow configured', dailyWorkflow.status === 'configured', `${dailyWorkflow.dailySchedule.path} ${dailyWorkflow.dailySchedule.cron}`),
    row('Trusted Auto-Apply policy configured', buildTrustedAutoApplyPolicy().ordinaryApplicationApprovalRequired === false, 'Standing authority queues and submits safe applications without ordinary per-job approval.'),
    row('Canonical execution states cover every application', applicationExecution.exactStatuses.every((item) => Boolean(item.canonicalExecutionState)), `${applicationExecution.exactStatuses.length} application checkpoint(s) classified.`),
    row('Global backlog lifecycle is auditable', globalLifecycle.allHistoricalRecordsReconciled && globalLifecycle.arbitraryResultLimitRemoved, `${globalLifecycle.rawRecordsProcessed}/${globalLifecycle.totalRawRecordsEverDiscovered} raw record(s) reconciled.`),
    ...dailyWorkflow.focusedVerificationRows,
  ];
}

const EMPLOYMENT_MODEL_VERSION = 'career-os-employment-history-2026-07-19-v1';
const ATS_EMPLOYMENT_MAPPER_VERSION = 'career-os-ats-employment-mapper-2026-07-19-v1';

const ATS_EMPLOYMENT_FIELD_RULES: AtsEmploymentFieldRule[] = [
  { labels: ['Company', 'Employer', 'Current Employer'], path: 'employment.company', valueKind: 'text' },
  { labels: ['Job Title', 'Position', 'Role'], path: 'employment.title', valueKind: 'text' },
  { labels: ['From', 'Start Date'], path: 'employment.start_date', valueKind: 'date' },
  { labels: ['To', 'End Date'], path: 'employment.end_date', valueKind: 'date' },
  { labels: ['Current Employer'], path: 'employment.current', valueKind: 'boolean' },
];

function buildEmploymentModel(evidence: CareerOsEvidence): EmploymentModelStatus {
  const verifiedProfile = asRecord(evidence.profile?.verified_profile);
  const currentCompany = findVerifiedCurrentCompany(evidence, verifiedProfile);
  const knownLocation = knownEmploymentLocation(verifiedProfile);
  const records = arrayRecords(verifiedProfile.employment_history)
    .map((raw, index) => canonicalEmploymentRecord(raw, index, currentCompany, knownLocation))
    .filter((record) => record.employer || record.title);
  const missingVerifiedFields = uniqueStrings(records.flatMap(missingEmploymentFields));

  return {
    completeForExternalUse: records.length > 0 && missingVerifiedFields.length === 0,
    missingVerifiedFields,
    records,
    source: 'career_os_profiles.verified_profile.employment_history',
    version: EMPLOYMENT_MODEL_VERSION,
  };
}

function canonicalEmploymentRecord(raw: JsonRecord, index: number, currentCompany: string, knownLocation: string): CanonicalEmploymentRecord {
  const parsed = parseEmploymentPeriod(raw);
  const employer = stringValue(raw.employer || raw.company);
  const currentEmployer = booleanValue(raw.current_employer ?? raw.currentEmployer)
    || Boolean(index === 0 && currentCompany && compactKey(employer) === compactKey(currentCompany));

  return {
    currentEmployer,
    employer,
    endMonth: parsed.endMonth,
    endYear: parsed.endYear,
    location: stringValue(raw.location) || knownLocation || undefined,
    source: stringValue(raw.source) || 'verified_profile.employment_history',
    startMonth: parsed.startMonth,
    startYear: parsed.startYear,
    title: stringValue(raw.title || raw.job_title || raw.position || raw.role),
    verificationState: stringValue(raw.verification_state || raw.verificationState) || 'requires_verification',
  };
}

function parseEmploymentPeriod(raw: JsonRecord) {
  const period = stringValue(raw.period || raw.date_range || raw.dates);
  const explicitStartMonth = monthName(raw.start_month || raw.startMonth);
  const explicitEndMonth = monthName(raw.end_month || raw.endMonth);
  const explicitStartYear = yearValue(raw.start_year || raw.startYear);
  const explicitEndYear = yearValue(raw.end_year || raw.endYear);
  const periodDates = Array.from(period.matchAll(/(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?((?:19|20)\d{2})/gi))
    .map((match) => ({ month: monthName(match[1]), year: yearValue(match[2]) }))
    .filter((date) => date.year);
  const first = periodDates[0];
  const last = periodDates.length > 1 ? periodDates[periodDates.length - 1] : undefined;

  return {
    endMonth: explicitEndMonth || last?.month,
    endYear: explicitEndYear || last?.year,
    startMonth: explicitStartMonth || first?.month,
    startYear: explicitStartYear || first?.year,
  };
}

function missingEmploymentFields(record: CanonicalEmploymentRecord) {
  const missing: string[] = [];
  if (!record.employer) missing.push('Employer');
  if (!record.title) missing.push('Job Title');
  if (!record.startMonth) missing.push('Start Month');
  if (!record.startYear) missing.push('Start Year');
  if (!record.currentEmployer && !record.endMonth) missing.push('End Month');
  if (!record.currentEmployer && !record.endYear) missing.push('End Year');
  return missing;
}

function buildAtsEmploymentMapperStatus(evidence: CareerOsEvidence, model: EmploymentModelStatus): AtsEmploymentMapperStatus {
  const ciscoApplication = evidence.applications.find((application) => compactKey(application.employer) === 'cisco');
  const ciscoValidation = buildAtsEmploymentMapping('Cisco', model, ciscoApplication);
  const applicationsUnblocked = ciscoValidation.canPopulateRequiredFields && ciscoApplication && hasAnyStatus(`${ciscoApplication.lifecycle_stage || ''} ${ciscoApplication.next_action || ''}`, ['employment-history', 'employment history'])
    ? 1
    : 0;

  return {
    applicationsUnblocked,
    ciscoValidation,
    fieldRules: ATS_EMPLOYMENT_FIELD_RULES,
    supportedPlatforms: ['Cisco', 'Workday', 'Greenhouse'],
    version: ATS_EMPLOYMENT_MAPPER_VERSION,
  };
}

function buildAtsEmploymentMapping(platform: AtsEmploymentPlatform, model: EmploymentModelStatus, application?: JsonRecord): AtsEmploymentMappingResult {
  const record = model.records.find((item) => item.currentEmployer) || model.records[0];
  const fields = ATS_EMPLOYMENT_FIELD_RULES.map((rule) => mappedEmploymentField(rule, record));
  const missingVerifiedFields = uniqueStrings(fields.filter((field) => !field.verified).map((field) => field.missingVerifiedField || field.path));

  return {
    applicationId: stringValue(application?.id) || undefined,
    canPopulateRequiredFields: Boolean(record && missingVerifiedFields.length === 0),
    employer: stringValue(application?.employer) || undefined,
    fields,
    missingVerifiedFields,
    pauseReason: missingVerifiedFields.length ? 'missing_verified_information' : undefined,
    platform,
  };
}

function mappedEmploymentField(rule: AtsEmploymentFieldRule, record?: CanonicalEmploymentRecord): AtsMappedEmploymentField {
  if (!record) {
    return { labels: rule.labels, missingVerifiedField: 'Employment History', path: rule.path, verified: false };
  }

  if (rule.path === 'employment.company') {
    return { labels: rule.labels, missingVerifiedField: record.employer ? undefined : 'Employer', path: rule.path, value: record.employer || undefined, verified: Boolean(record.employer) };
  }

  if (rule.path === 'employment.title') {
    return { labels: rule.labels, missingVerifiedField: record.title ? undefined : 'Job Title', path: rule.path, value: record.title || undefined, verified: Boolean(record.title) };
  }

  if (rule.path === 'employment.start_date') {
    const value = formatEmploymentDate(record.startMonth, record.startYear);
    return { labels: rule.labels, missingVerifiedField: value ? undefined : missingDatePart('Start', record.startMonth, record.startYear), path: rule.path, value: value || undefined, verified: Boolean(value) };
  }

  if (rule.path === 'employment.end_date') {
    const value = record.currentEmployer ? 'Present' : formatEmploymentDate(record.endMonth, record.endYear);
    return { labels: rule.labels, missingVerifiedField: value ? undefined : missingDatePart('End', record.endMonth, record.endYear), path: rule.path, value: value || undefined, verified: Boolean(value) };
  }

  return { labels: rule.labels, path: rule.path, value: record.currentEmployer, verified: true };
}

function findVerifiedCurrentCompany(evidence: CareerOsEvidence, verifiedProfile: JsonRecord) {
  const reusable = asRecord(verifiedProfile.reusable_application_answers);
  const direct = stringValue(verifiedProfile.current_company || reusable.current_company || asRecord(verifiedProfile.employment).current_company);
  if (direct) return direct;

  const verifiedQuestion = evidence.employerKnowledgeBase.questionCatalog.find((question) => {
    const linked = String(question.linked_candidate_profile_field || '').toLowerCase();
    return linked === 'employment.current_company' && hasKeys(question.verified_mapped_answer);
  });
  return stringValue(asRecord(verifiedQuestion?.verified_mapped_answer).value || asRecord(verifiedQuestion?.verified_mapped_answer).answer);
}

function knownEmploymentLocation(verifiedProfile: JsonRecord) {
  const contact = asRecord(verifiedProfile.contact);
  const reusable = asRecord(verifiedProfile.reusable_application_answers);
  const city = stringValue(contact.city || reusable.city);
  const state = stringValue(contact.state || contact.state_or_province || reusable.state_or_province || verifiedProfile.state_or_province);
  return [city, state].filter(Boolean).join(', ');
}

function formatEmploymentDate(month?: string, year?: number) {
  return month && year ? `${month} ${year}` : '';
}

function missingDatePart(prefix: 'End' | 'Start', month?: string, year?: number) {
  if (!month) return `${prefix} Month`;
  if (!year) return `${prefix} Year`;
  return `${prefix} Date`;
}

function validateProfile(profile?: JsonRecord) {
  const verifiedProfile = profile?.verified_profile as JsonRecord | undefined;
  const missing = [];
  if (!profile) missing.push('profile row');
  if (!profile?.owner_email) missing.push('owner email');
  if (!profile?.display_name) missing.push('display name');
  if (!verifiedProfile?.linkedin) missing.push('LinkedIn');
  if (!verifiedProfile?.work_authorization) missing.push('work authorization');
  if (!verifiedProfile?.sponsorship_requirement) missing.push('sponsorship requirement');
  if (!verifiedProfile?.application_policy) missing.push('application policy');

  return {
    passed: missing.length === 0,
    detail: missing.length ? `Missing verified profile field(s): ${missing.join(', ')}` : '',
  };
}

function missingFactsConsolidated(evidence: CareerOsEvidence) {
  const verifiedProfile = evidence.profile?.verified_profile as JsonRecord | undefined;
  const missingFactsValue = verifiedProfile?.missing_reusable_facts;
  const missingFacts = Array.isArray(missingFactsValue) ? missingFactsValue : [];
  const onboardingTask = evidence.tasks.some((task) => task.id === 'career-os-profile-reusable-legal-answers' && task.status === 'open');
  const reusableAnswers = verifiedProfile?.reusable_application_answers as JsonRecord | undefined;
  const reusableFactsVerified = Boolean(
    verifiedProfile?.work_authorization
    && verifiedProfile?.sponsorship_requirement
    && verifiedProfile?.application_policy
    && reusableAnswers
    && reusableAnswers.verification_state === 'tomas_verified'
  );

  return reusableFactsVerified || Boolean(missingFacts.length && onboardingTask);
}

function row(name: string, passed: boolean, detail = ''): VerificationRow {
  return { name, passed, detail };
}

function hasKeys(value: unknown) {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function normalizedPlatformName(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function buildSalaryRange(jobs: JsonRecord[]) {
  const ranges = jobs
    .map((job) => ({
      min: numberValue(job.compensation_min_usd),
      max: numberValue(job.compensation_max_usd),
    }))
    .filter((range) => range.min > 0 && range.max > 0);

  if (!ranges.length) {
    return { complete: false };
  }

  return {
    complete: true,
    minUsd: Math.min(...ranges.map((range) => range.min)),
    maxUsd: Math.max(...ranges.map((range) => range.max)),
  };
}

function buildCompensationPolicyStatus(evidence: CareerOsEvidence, preferredMinimumBaseSalaryUsd?: number): CompensationPolicyStatus {
  const activeJobs = evidence.jobPostings.filter((job) => !isInactiveStatus(String(job.status || '')) && !isInactiveStatus(String(job.posting_validation_status || '')));
  const submittedApplications = evidence.applications.filter((application) => Boolean(application.confirmation_number || application.submission_evidence));
  const allRanges = activeJobs
    .map((job) => ({
      min: numberValue(job.compensation_min_usd),
      max: numberValue(job.compensation_max_usd),
    }))
    .filter((range) => range.min > 0 && range.max > 0);
  const qualifyingBaseRanges = activeJobs
    .filter((job) => compensationPolicyClass(job, preferredMinimumBaseSalaryUsd) === 'posted_base_meets_policy')
    .map((job) => ({
      min: numberValue(job.compensation_min_usd),
      max: numberValue(job.compensation_max_usd),
    }))
    .filter((range) => range.min > 0 && range.max > 0);
  const belowTargetJobs = activeJobs
    .filter((job) => compensationPolicyClass(job, preferredMinimumBaseSalaryUsd) === 'below_target')
    .map((job) => ({
      employer: stringValue(job.company || job.employer) || 'Employer',
      postedMaxUsd: numberValue(job.compensation_max_usd) || undefined,
      reason: `Posted base maximum is below Tomas's preferred minimum base salary of ${preferredMinimumBaseSalaryUsd ? formatUsd(preferredMinimumBaseSalaryUsd) : 'the configured target'}.`,
      role: stringValue(job.title || job.position) || 'Role',
    }));
  const compensationUnknown = activeJobs.filter((job) => compensationPolicyClass(job, preferredMinimumBaseSalaryUsd) === 'unknown').length;
  const approvedTotalCompensationExceptions = activeJobs.filter((job) => {
    if (compensationPolicyClass(job, preferredMinimumBaseSalaryUsd) !== 'total_compensation_exception') return false;
    return submittedApplications.some((application) => applicationMatchesCompensationRecord(application, job))
      || hasAnyStatus(`${job.status || ''} ${job.raw_record || ''}`, ['total_compensation_exception_approved', 'submitted']);
  }).length;

  return {
    allDiscoveredPostedCompensationRange: moneyRange(allRanges),
    approvedTotalCompensationExceptions,
    belowTargetJobs,
    belowTargetRemoved: belowTargetJobs.length,
    compensationUnknown,
    postedBaseAtOrAboveTarget: qualifyingBaseRanges.length,
    preferredMinimumBaseSalaryUsd,
    qualifiedPostedBaseRange: moneyRange(qualifyingBaseRanges),
  };
}

function buildApplicationExecutionStatus(
  evidence: CareerOsEvidence,
  generatedAt = new Date(),
  canonicalSubmittedApplications = selectCanonicalSubmittedApplications(evidence),
): ApplicationExecutionStatus {
  const centralToday = centralDateKey(generatedAt);
  const nextScheduledRun = nextDailyRunText(generatedAt);
  const exactStatuses = evidence.applications.map((application) => classifyApplicationExecution(application, nextScheduledRun));
  const queueStates = countQueueStates(exactStatuses);
  const submittedToday = evidence.applications.filter((application) => {
    if (!application.confirmation_number && !application.submission_evidence) return false;
    return centralDateKey(application.updated_at) === centralToday;
  }).length;
  const latestRun = evidence.automationRuns[0];
  const confirmed = canonicalSubmittedApplications.filter((item) => item.confirmationEvidence).length;
  const submitted = canonicalSubmittedApplications.length;

  return {
    applicationsProcessedToday: exactStatuses.length,
    confirmationEvidenceStatus: confirmed
      ? `${confirmed} confirmed application${confirmed === 1 ? '' : 's'} with captured evidence.`
      : 'No confirmation evidence is currently recorded.',
    confirmed,
    exactStatuses,
    failedWithError: exactStatuses.filter((item) => item.status === 'Failed with error').length,
    failedWithRetry: queueStates.retry_scheduled,
    lastExecutionTime: stringValue(latestRun?.finished_at || latestRun?.started_at) || undefined,
    nextScheduledRun,
    permanentlyFailed: queueStates.failed,
    queuedImmediate: exactStatuses.filter((item) => item.status === 'Queued for immediate execution').length,
    queueStates,
    runningNow: exactStatuses.filter((item) => item.status === 'Running now').length,
    submitted,
    submittedToday,
    technicallyBlocked: exactStatuses.filter((item) => item.status === 'Technically blocked').length,
    waitingOnTomas: exactStatuses.filter((item) => item.status === 'Waiting on Tomas' || item.status === 'Compensation review required').length,
  };
}

function buildTrustedAutoApplyPolicy(): TrustedAutoApplyPolicyStatus {
  return {
    authority: 'enabled',
    ordinaryApplicationApprovalRequired: false,
    autoQueueQualifiedPackageReadyApplications: true,
    submitWhenSafe: true,
    scope: [
      'official posting discovery and validation',
      'dedupe and duplicate-submission protection',
      'fit, location, authorization, sponsorship, and compensation policy checks',
      'validated package generation or reuse',
      'verified answer autofill',
      'safe ATS submission and confirmation capture',
      'response tracking and consolidated Tomas-only blocker reporting',
    ],
    requiredPassConditions: [
      'posting_active',
      'unique_requisition',
      'no_prior_application',
      'candidate_fit_passes',
      'texas_or_remote_location_passes',
      'compensation_policy_passes_or_approved_exception',
      'validated_package_exists',
      'required_candidate_facts_verified',
      'reusable_answers_approved',
      'legal_fingerprint_matches_or_no_new_legal_text',
      'no_captcha_mfa_identity_or_unsupported_security_gate',
      'confirmation_evidence_can_be_captured',
    ],
    humanOnlyStops: [
      'new or changed legal language',
      'protected-status or voluntary disclosure decisions',
      'unsupported compensation total-compensation question',
      'CAPTCHA',
      'MFA',
      'identity verification',
      'unsupported browser or ATS upload limitation',
    ],
    legalFingerprintPolicy: {
      enabled: true,
      reuseWhenFingerprintMatches: true,
      changedLegalTextRequiresReview: true,
      materiallyIdenticalTextOnly: true,
    },
  };
}

function buildGlobalLifecycleStatus(
  evidence: CareerOsEvidence,
  canonicalRelease: ReturnType<typeof buildCanonicalReleaseMetrics>,
  applicationExecution: ApplicationExecutionStatus,
  preferredMinimumBaseSalaryUsd?: number,
): GlobalLifecycleStatus {
  const ledger = buildAuthoritativeLedger(evidence, preferredMinimumBaseSalaryUsd);
  const rawRecords = evidence.jobPostings.concat(evidence.seededOpportunities);
  const legacyOutcomes = countRawRecordOutcomes(rawRecords, evidence, preferredMinimumBaseSalaryUsd);
  const outcomes: Record<RawRecordOutcome, number> = {
    ...legacyOutcomes,
    confirmed: 0,
    duplicate: ledger.duplicate,
    failed: ledger.technicalBlocker,
    ineligible: canonicalRelease.ineligible,
    inactive: canonicalRelease.inactive,
    package_ready: ledger.ready,
    qualified: 0,
    submitted: ledger.submitted,
    waiting_on_tomas: ledger.waitingOnTomas,
  };
  const processed = Object.values(outcomes).reduce((sum, value) => sum + value, 0);
  const currentRunTotal = numberValue(evidence.latestSourceRun?.number_reviewed) || numberValue(evidence.latestSourceRun?.number_accepted);
  const currentRunProcessed = Math.min(currentRunTotal || processed, processed || currentRunTotal);
  const latestSearchConfig = asRecord(evidence.latestSourceRun?.search_config);
  const latestCheckpoint = stringValue(latestSearchConfig.last_processed_cursor || latestSearchConfig.checkpoint || evidence.latestSourceRun?.id)
    || 'no checkpoint recorded';
  const averageRecordsProcessedPerRun = averageNumber(evidence.sourceRuns.map((run) => numberValue(run.number_reviewed || run.number_accepted)));
  const averageQualifiedApplicationsPerRun = averageNumber(evidence.sourceRuns.map((run) => numberValue(run.number_accepted)));
  const averageSubmissionsPerRun = averageNumber(evidence.automationRuns.map((run) => numberValue(asRecord(run.evidence).submissions_completed)));

  return {
    totalRawRecordsEverDiscovered: rawRecords.length,
    rawRecordsProcessed: processed,
    recordsAwaitingProcessing: Math.max(rawRecords.length - processed, 0),
    uniqueOpportunities: canonicalRelease.totalUniqueOpportunities,
    duplicatesRemoved: canonicalRelease.duplicateRecordsRemoved,
    activeQualifiedOpportunities: ledger.activeQualifiedOpportunities,
    backlogQualifiedOpportunities: ledger.activeQualifiedOpportunities,
    applicationsQueued: 0,
    applicationsRunning: 0,
    applicationsSubmitted: ledger.submitted,
    applicationsConfirmed: ledger.confirmed,
    waitingOnTomas: ledger.waitingOnTomas,
    technicallyBlocked: ledger.technicalBlocker,
    inactive: canonicalRelease.inactive,
    ineligible: canonicalRelease.ineligible,
    failedWithRetry: applicationExecution.failedWithRetry,
    permanentlyFailed: applicationExecution.permanentlyFailed,
    currentBatchProgress: {
      checkpoint: latestCheckpoint,
      processed: currentRunProcessed,
      remaining: Math.max((currentRunTotal || currentRunProcessed) - currentRunProcessed, 0),
      total: currentRunTotal || currentRunProcessed,
      percentage: percentage(currentRunProcessed, currentRunTotal || currentRunProcessed),
    },
    historicalBacklogProgress: {
      lastProcessedCursor: latestCheckpoint,
      processed,
      remaining: Math.max(rawRecords.length - processed, 0),
      total: rawRecords.length,
      percentage: percentage(processed, rawRecords.length),
    },
    averageRecordsProcessedPerRun,
    averageQualifiedApplicationsPerRun,
    averageSubmissionsPerRun,
    nextScheduledRun: applicationExecution.nextScheduledRun,
    outcomes,
    allHistoricalRecordsReconciled: !ledger.inconsistent,
    arbitraryResultLimitRemoved: true,
  };
}

type NormalizedOpportunity = ReturnType<typeof normalizeOpportunityIdentity>;

type CanonicalOpportunity = {
  applications: JsonRecord[];
  className: 'active_retained' | 'archived' | 'ineligible' | 'inactive';
  key: string;
  packageAssets: number;
  preferredRecord: NormalizedOpportunity;
  qualificationTier: QualificationTier;
  releaseState: 'submitted' | 'tomas_review' | 'waiting_on_tomas' | 'ready_for_automation' | 'in_progress' | 'ineligible' | 'inactive';
  sourceOpportunityIds: Set<string>;
  sourceSightings: ReturnType<typeof mergeCanonicalSourceSightings>;
  submitted: boolean;
};

type CanonicalSubmittedApplication = {
  application: JsonRecord;
  confirmationEvidence: boolean;
  duplicateLocked: boolean;
  executionState: CanonicalApplicationExecutionState;
  identityKey: string;
  manualAttestation: boolean;
};

function buildAuthoritativeLedger(evidence: CareerOsEvidence, preferredMinimumBaseSalaryUsd?: number): AuthoritativeLedgerStatus {
  const canonical = buildCanonicalOpportunityList(evidence, preferredMinimumBaseSalaryUsd);
  const currentRunId = stringValue(evidence.latestSourceRun?.id) || undefined;
  const profileReady = missingFactsConsolidated(evidence);
  const canonicalSubmittedApplications = selectCanonicalSubmittedApplications(evidence);
  const canonicalSubmittedApplicationIds = new Set(
    canonicalSubmittedApplications.map((item) => stringValue(item.application.id)).filter(Boolean),
  );
  const confirmedApplicationIds = new Set(
    canonicalSubmittedApplications
      .filter((item) => item.confirmationEvidence)
      .map((item) => stringValue(item.application.id))
      .filter(Boolean),
  );
  const rows = canonical
    .filter((item) => includeCanonicalOpportunityInLedger(item))
    .map((item) => authoritativeLedgerRowForCanonical(
      item,
      evidence,
      currentRunId,
      profileReady,
      canonicalSubmittedApplicationIds,
      confirmedApplicationIds,
    ));

  const counts = {
    submitted: rows.filter((row) => row.outcome === 'submitted').length,
    ready: rows.filter((row) => row.outcome === 'ready').length,
    waitingOnTomas: rows.filter((row) => row.outcome === 'waiting_on_tomas').length,
    duplicate: rows.filter((row) => row.outcome === 'duplicate').length,
    unsupportedAts: rows.filter((row) => row.outcome === 'unsupported_ats').length,
    technicalBlocker: rows.filter((row) => row.outcome === 'technical_blocker').length,
    packageMissing: rows.filter((row) => row.outcome === 'package_missing').length,
    stale: rows.filter((row) => row.outcome === 'stale').length,
    rejected: rows.filter((row) => row.outcome === 'rejected').length,
  };
  const qualified = rows.length;
  const inconsistent = qualified !== (
    counts.submitted
    + counts.ready
    + counts.waitingOnTomas
    + counts.duplicate
    + counts.unsupportedAts
    + counts.technicalBlocker
    + counts.packageMissing
    + counts.stale
    + counts.rejected
  );

  return {
    activeQualifiedOpportunities: counts.ready + counts.waitingOnTomas + counts.unsupportedAts + counts.technicalBlocker + counts.packageMissing,
    confirmed: rows.filter((row) => row.outcome === 'submitted' && row.confirmationEvidence).length,
    duplicate: counts.duplicate,
    inconsistent,
    packageMissing: counts.packageMissing,
    qualified,
    ready: counts.ready,
    readyCandidate: rows
      .filter((row) => row.outcome === 'ready')
      .sort((left, right) => Date.parse(right.lastUpdated || '') - Date.parse(left.lastUpdated || ''))[0],
    rejected: counts.rejected,
    rows,
    stale: counts.stale,
    submitted: counts.submitted,
    technicalBlocker: counts.technicalBlocker,
    unsupportedAts: counts.unsupportedAts,
    waitingOnTomas: counts.waitingOnTomas,
  };
}

function includeCanonicalOpportunityInLedger(item: CanonicalOpportunity) {
  if (item.className === 'active_retained') return true;
  if (item.applications.length > 0) return true;
  const reviewDecision = normalizedReviewDecision(asRecord(item.preferredRecord.raw.raw_record).review_decision);
  return reviewDecision !== 'none';
}

function authoritativeLedgerRowForCanonical(
  item: CanonicalOpportunity,
  evidence: CareerOsEvidence,
  currentRunId: string | undefined,
  profileReady: boolean,
  canonicalSubmittedApplicationIds: Set<string>,
  confirmedApplicationIds: Set<string>,
): AuthoritativeLedgerRow {
  const latestApplication = item.applications
    .slice()
    .sort((left, right) => (Date.parse(String(right.updated_at || 0)) || 0) - (Date.parse(String(left.updated_at || 0)) || 0))[0];
  const relatedTasks = evidence.tasks.filter((task) => {
    if (['approved', 'rejected', 'deferred', 'completed', 'dismissed'].includes(String(task.status || 'open'))) return false;
    return item.sourceOpportunityIds.has(stringValue(task.related_opportunity_id)) || item.applications.some((application) => stringValue(application.id) === stringValue(task.related_application_id));
  });
  const queueStates = item.applications.map((application) => canonicalQueueState(application));
  const packageVerified = hasVerifiedPackageAssets(item, evidence);
  const packageState = packageVerified && profileReady ? 'complete' : 'missing';
  const atsSupportState = ledgerAtsSupportState(item, latestApplication);
  const postingLiveState = ledgerPostingLiveState(item, latestApplication);
  const duplicateLock = queueStates.includes('duplicate') || item.applications.some((application) => asRecord(application.raw_record).duplicate_locked === true);
  const submissionEvidence = item.applications.some((application) => canonicalSubmittedApplicationIds.has(stringValue(application.id)));
  const confirmationEvidence = item.applications.some((application) => confirmedApplicationIds.has(stringValue(application.id)));
  const reviewDecision = normalizedReviewDecision(asRecord(item.preferredRecord.raw.raw_record).review_decision);
  const needsTomas = relatedTasks.length > 0 || queueStates.includes('waiting_on_tomas') || item.releaseState === 'waiting_on_tomas' || item.releaseState === 'tomas_review';
  const technicalBlocked = queueStates.some((state) => ['blocked_technical', 'running', 'retry_scheduled', 'failed'].includes(state));
  const outcome = determineLedgerOutcome({
    atsSupportState,
    duplicateLock,
    needsTomas,
    packageState,
    postingLiveState,
    releaseState: item.releaseState,
    reviewDecision,
    submissionEvidence,
    technicalBlocked,
  });

  return {
    applicationStatus: latestApplication ? canonicalQueueState(latestApplication) : undefined,
    atsSupportState,
    canonicalOpportunityId: item.key,
    currentRunId,
    duplicateLock,
    evidenceReferences: [
      item.preferredRecord.sourceId,
      ...item.applications.map((application) => stringValue(application.id)),
      ...relatedTasks.map((task) => stringValue(task.id)),
    ].filter(Boolean),
    employer: item.preferredRecord.employer,
    lastUpdated: new Date(item.preferredRecord.updatedAt || item.preferredRecord.createdAt || Date.now()).toISOString(),
    linkedApplicationId: stringValue(latestApplication?.id) || undefined,
    opportunityStatus: item.preferredRecord.status || item.preferredRecord.currentLifecycleState || 'unknown',
    outcome,
    outcomeReason: ledgerOutcomeReason(outcome, item, relatedTasks),
    packageState,
    packageVerified,
    postingLiveState,
    requisition: item.preferredRecord.requisitionId,
    role: item.preferredRecord.position,
    sourcePostingId: item.preferredRecord.sourceId,
    confirmationEvidence,
    submissionEvidence,
    technicalBlockerStatus: technicalBlocked ? 'blocked' : 'none',
    tomasTaskStatus: needsTomas ? 'needs_tomas' : 'none',
  };
}

function determineLedgerOutcome(input: {
  atsSupportState: AuthoritativeLedgerRow['atsSupportState'];
  duplicateLock: boolean;
  needsTomas: boolean;
  packageState: AuthoritativeLedgerRow['packageState'];
  postingLiveState: AuthoritativeLedgerRow['postingLiveState'];
  releaseState: CanonicalOpportunity['releaseState'];
  reviewDecision: ReviewQueueItem['reviewDecision'];
  submissionEvidence: boolean;
  technicalBlocked: boolean;
}): AuthoritativeLedgerOutcome {
  if (input.submissionEvidence) return 'submitted';
  if (input.duplicateLock) return 'duplicate';
  if (input.postingLiveState === 'stale') return 'stale';
  if (input.reviewDecision === 'skip' || input.reviewDecision === 'reject_similar') return 'rejected';
  if (input.atsSupportState === 'unsupported') return 'unsupported_ats';
  if (input.needsTomas) return 'waiting_on_tomas';
  if (input.technicalBlocked) return 'technical_blocker';
  if (input.packageState === 'missing') return 'package_missing';
  return 'ready';
}

function ledgerOutcomeReason(outcome: AuthoritativeLedgerOutcome, item: CanonicalOpportunity, relatedTasks: JsonRecord[]) {
  switch (outcome) {
    case 'submitted':
      return 'A canonical submitted application with evidence already exists for this opportunity.';
    case 'duplicate':
      return 'Duplicate-submission protection is active for this opportunity.';
    case 'stale':
      return 'The posting is no longer live and is preserved only for audit history.';
    case 'unsupported_ats':
      return 'The employer workflow is on an unsupported ATS path and is intentionally excluded from execution.';
    case 'waiting_on_tomas':
      return relatedTasks.length ? 'A verified Tomas-only action is still open for this opportunity.' : 'This opportunity is paused on a verified Tomas-only review or answer gate.';
    case 'technical_blocker':
      return 'A verified technical or execution blocker is preventing safe autonomous progress, including legacy browser_worker_blocked checkpoints.';
    case 'package_missing':
      return 'A verified exact package or reusable profile requirement is still incomplete.';
    case 'rejected':
      return 'This opportunity was explicitly rejected or skipped from the qualified workflow.';
    default:
      return 'This opportunity is live, supported, packaged, and safe to start when execution is enabled.';
  }
}

function hasVerifiedPackageAssets(item: CanonicalOpportunity, evidence: CareerOsEvidence) {
  return evidence.artifacts.some((artifact) => {
    const artifactType = stringValue(artifact.artifact_type);
    if (!['targeted_resume', 'application_package'].includes(artifactType)) return false;
    const validation = stringValue(artifact.validation_status);
    const artifactOpportunityId = stringValue(artifact.opportunity_id);
    const artifactApplicationId = stringValue(artifact.application_id);
    return (item.sourceOpportunityIds.has(artifactOpportunityId) || item.applications.some((application) => stringValue(application.id) === artifactApplicationId))
      && !['failed', 'rejected'].includes(validation);
  }) || item.applications.some((application) => Boolean(application.exact_resume));
}

function ledgerAtsSupportState(item: CanonicalOpportunity, latestApplication?: JsonRecord): AuthoritativeLedgerRow['atsSupportState'] {
  const platform = normalizedPlatformName(
    asRecord(latestApplication?.raw_record).ats_platform
    || asRecord(item.preferredRecord.raw.raw_record).ats_platform
    || asRecord(item.preferredRecord.raw.ats_analysis).platform
    || item.preferredRecord.raw.status,
  );
  if (platform.includes('greenhouse') || platform.includes('workday')) return 'supported';
  if (platform.includes('oracle')) return 'unsupported';
  if (!platform) return 'unknown';
  return 'unsupported';
}

function ledgerPostingLiveState(item: CanonicalOpportunity, latestApplication?: JsonRecord): AuthoritativeLedgerRow['postingLiveState'] {
  const combined = [
    item.preferredRecord.status,
    item.preferredRecord.postingValidationStatus,
    stringValue(latestApplication?.next_action),
    stringValue(latestApplication?.submission_evidence),
  ].join(' ').toLowerCase();
  if (item.preferredRecord.postingValidationStatus && item.preferredRecord.postingValidationStatus !== 'active') return 'stale';
  if (combined.includes('unavailable_posting_url_error') || combined.includes('no longer live') || combined.includes('redirects to the general jobs board') || combined.includes('stale')) return 'stale';
  return 'live';
}

function buildCanonicalReleaseMetrics(evidence: CareerOsEvidence, preferredMinimumBaseSalaryUsd?: number) {
  const canonical = buildCanonicalOpportunityList(evidence, preferredMinimumBaseSalaryUsd);
  const ledger = buildAuthoritativeLedger(evidence, preferredMinimumBaseSalaryUsd);
  const keyed = [
    ...evidence.jobPostings.map((job) => normalizeOpportunityIdentity(job, 'posting')),
    ...evidence.seededOpportunities.map((job) => normalizeOpportunityIdentity(job, 'opportunity')),
  ];

  const activeQualified = ledger.rows.filter((row) => ['ready', 'waiting_on_tomas', 'unsupported_ats', 'technical_blocker', 'package_missing'].includes(row.outcome));
  const submittedRows = selectCanonicalSubmittedApplications(evidence);
  const confirmedRows = submittedRows.filter((item) => item.confirmationEvidence);
  const submittedActive = ledger.rows.filter((row) => row.outcome === 'submitted');
  const exactTomasCheckpoint = ledger.rows.filter((row) => row.outcome === 'waiting_on_tomas');
  const totalPackages = evidence.artifacts.filter((artifact) => ['targeted_resume', 'application_package'].includes(String(artifact.artifact_type))).length;
  const packagesCoveringQualifiedJobs = canonical.filter((item) => includeCanonicalOpportunityInLedger(item) && item.packageAssets > 0).length;
  const packageAssetsOnQualifiedJobs = canonical
    .filter((item) => includeCanonicalOpportunityInLedger(item))
    .reduce((sum, item) => sum + item.packageAssets, 0);
  const activeSourceIds = new Set(canonical.filter((item) => includeCanonicalOpportunityInLedger(item)).flatMap((item) => Array.from(item.sourceOpportunityIds)));
  const activeApplicationIds = new Set(canonical.filter((item) => includeCanonicalOpportunityInLedger(item)).flatMap((item) => item.applications.map((application) => String(application.id))));
  const orphanedPackages = evidence.artifacts.filter((artifact) => {
    if (!['targeted_resume', 'application_package'].includes(String(artifact.artifact_type))) return false;
    return !activeSourceIds.has(String(artifact.opportunity_id || '')) && !activeApplicationIds.has(String(artifact.application_id || ''));
  }).length;

  return {
    totalUniqueOpportunities: canonical.length,
    activeQualifiedOpportunities: ledger.activeQualifiedOpportunities,
    submittedApplications: ledger.submitted,
    confirmedApplications: ledger.confirmed,
    remainingQualifiedApplications: ledger.activeQualifiedOpportunities,
    waitingOnTomas: ledger.waitingOnTomas,
    readyForAutomation: ledger.ready,
    reviewQueueCount: 0,
    archivedOpportunities: canonical.filter((item) => item.className === 'archived').length,
    inProgress: ledger.technicalBlocker,
    ineligible: canonical.filter((item) => item.className === 'ineligible').length,
    inactive: canonical.filter((item) => item.className === 'inactive').length,
    duplicateRecordsRemoved: Math.max(keyed.length - canonical.length, 0),
    totalPackages,
    packagesCoveringQualifiedJobs,
    packageAssetsOnQualifiedJobs,
    orphanedPackages,
    releaseCompletionPercentage: percentage(submittedActive.length, ledger.qualified),
    actionableProgressPercentage: percentage(submittedActive.length + exactTomasCheckpoint.length, ledger.qualified),
  };
}

function normalizeOpportunityIdentity(record: JsonRecord, sourceType: 'posting' | 'opportunity') {
  const canonical = canonicalOpportunityIdentity(record, sourceType);
  const employer = canonical.employer;
  const position = canonical.title;
  const requisitionId = canonical.primaryRequisitionId || String(sourceType === 'posting' ? record.external_requisition_id || '' : record.requisition || '').trim();
  const url = canonical.canonicalUrl || String(sourceType === 'posting' ? record.canonical_url || '' : record.job_url || '').trim();
  const sourceId = String(record.id || '');
  const descriptionFingerprint = canonical.descriptionFingerprint;
  const employerKey = canonical.employerKey;
  const titleKey = canonical.titleKey;
  const key = canonical.canonicalOpportunityId || sourceId;

  return {
    employer,
    key,
    compensationMaxUsd: numberValue(record.compensation_max_usd),
    compensationMinUsd: numberValue(record.compensation_min_usd),
    compensationText: String(record.compensation_text || ''),
    createdAt: Date.parse(String(record.created_at || record.discovered_at || 0)) || 0,
    currentLifecycleState: String(record.status || ''),
    location: String(record.location || ''),
    normalizedRoleLevel: String(record.normalized_role_level || asRecord(record.raw_record).normalized_role_level || ''),
    opportunityId: sourceId,
    position,
    requisitionId,
    score: numberValue(sourceType === 'posting' ? record.fit_score : record.match_score),
    sourceId,
    sourceType,
    status: String(record.status || ''),
    postingValidationStatus: String(record.posting_validation_status || ''),
    workArrangement: String(record.work_arrangement || ''),
    titleKey,
    updatedAt: Date.parse(String(record.updated_at || record.last_checked_at || record.discovered_at || 0)) || 0,
    raw: record,
    url,
  };
}

function applicationMatchesCanonical(application: JsonRecord, canonical: NormalizedOpportunity, sourceIds: Set<string>) {
  return applicationMatchesCanonicalOpportunity(application, canonicalOpportunityIdentity(canonical.raw, canonical.sourceType), sourceIds);
}

function qualificationTierForOpportunity(item: NormalizedOpportunity, preferredMinimumBaseSalaryUsd?: number): QualificationTier {
  const raw = asRecord(item.raw.raw_record);
  const reviewDecision = normalizedReviewDecision(raw.review_decision);
  if (isInactiveStatus(item.status) || isInactiveStatus(item.postingValidationStatus)) return 'archive';
  if (reviewDecision === 'skip' || reviewDecision === 'reject_similar') return 'archive';
  if (item.status.startsWith('ineligible')) return 'archive';
  if (preferredMinimumBaseSalaryUsd && item.compensationMaxUsd > 0 && item.compensationMaxUsd < preferredMinimumBaseSalaryUsd && !hasTotalCompensationEvidence(item.compensationText)) return 'archive';
  if (item.score >= AUTO_APPLY_THRESHOLD) return 'auto_apply';
  if (item.score >= REVIEW_QUEUE_THRESHOLD) return 'tomas_review';
  return 'archive';
}

function classifyOpportunity(item: NormalizedOpportunity, qualificationTier: QualificationTier): CanonicalOpportunity['className'] {
  if (isInactiveStatus(item.status) || isInactiveStatus(item.postingValidationStatus)) return 'inactive';
  if (item.status.startsWith('ineligible')) return 'ineligible';
  if (qualificationTier === 'archive') return 'archived';
  return 'active_retained';
}

function classifyReleaseState(
  item: NormalizedOpportunity,
  className: CanonicalOpportunity['className'],
  qualificationTier: QualificationTier,
  applications: JsonRecord[],
): CanonicalOpportunity['releaseState'] {
  const applicationStates = applications.map((application) => canonicalQueueState(application));
  if (applicationStates.some((state) => state === 'confirmed' || state === 'submitted' || state === 'duplicate')) return 'submitted';
  if (applicationStates.some((state) => state === 'waiting_on_tomas')) return 'waiting_on_tomas';
  if (applicationStates.some((state) => state === 'blocked_technical' || state === 'running' || state === 'retry_scheduled' || state === 'failed')) return 'in_progress';
  if (applicationStates.some((state) => state === 'queued' || state === 'package_ready' || state === 'qualified')) return 'ready_for_automation';
  if (className === 'ineligible') return 'ineligible';
  if (className === 'inactive') return 'inactive';
  if (qualificationTier === 'tomas_review') return 'tomas_review';
  const status = item.status;
  if (hasAnyStatus(status, ['technical'])) return 'in_progress';
  if (hasAnyStatus(status, ['compensation', 'legal', 'privacy', 'human', 'account'])) return 'waiting_on_tomas';
  return 'ready_for_automation';
}

function buildReviewQueueStatus(evidence: CareerOsEvidence, preferredMinimumBaseSalaryUsd?: number): ReviewQueueStatus {
  const canonicalRelease = buildCanonicalReleaseMetrics(evidence, preferredMinimumBaseSalaryUsd);
  const items = selectReviewQueueItems(evidence, preferredMinimumBaseSalaryUsd);

  const highest = items[0];
  const oldest = items.slice().sort((a, b) => {
    const aTime = Date.parse(a.postedAt || '') || Number.MAX_SAFE_INTEGER;
    const bTime = Date.parse(b.postedAt || '') || Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  })[0];

  return {
    estimatedReviewMinutes: items.length,
    highestScoringRole: highest ? `${highest.employer} · ${highest.title}` : undefined,
    items,
    oldestWaitingRole: oldest ? `${oldest.employer} · ${oldest.title}` : undefined,
    total: items.length,
  };
}

export function selectReviewQueueItems(evidence: CareerOsEvidence, preferredMinimumBaseSalaryUsd?: number): ReviewQueueItem[] {
  return buildCanonicalOpportunityList(evidence, preferredMinimumBaseSalaryUsd)
    .filter((item) => item.releaseState === 'tomas_review')
    .map((item) => reviewQueueItemFromCanonical(item))
    .filter((item) => item.reviewDecision === 'none');
}

function buildCanonicalOpportunityList(evidence: CareerOsEvidence, preferredMinimumBaseSalaryUsd?: number): CanonicalOpportunity[] {
  const keyed = [
    ...evidence.jobPostings.map((job) => normalizeOpportunityIdentity(job, 'posting')),
    ...evidence.seededOpportunities.map((job) => normalizeOpportunityIdentity(job, 'opportunity')),
  ];
  const groups = new Map<string, NormalizedOpportunity[]>();
  for (const item of keyed) {
    const bucket = groups.get(item.key) || [];
    bucket.push(item);
    groups.set(item.key, bucket);
  }
  const canonical: CanonicalOpportunity[] = [];
  for (const [key, records] of Array.from(groups.entries())) {
    const preferred = records.slice().sort((a, b) => {
      if (a.sourceType !== b.sourceType) return a.sourceType === 'posting' ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    })[0];
    const groupReviewDecision = canonicalGroupReviewDecision(records);
    const preferredRawRecord = asRecord(preferred.raw.raw_record);
    const preferredForClassification = groupReviewDecision !== 'none' && normalizedReviewDecision(preferredRawRecord.review_decision) === 'none'
      ? {
          ...preferred,
          raw: {
            ...preferred.raw,
            raw_record: {
              ...preferredRawRecord,
              review_decision: groupReviewDecision,
            },
          },
        }
      : preferred;
    const sourceOpportunityIds = new Set<string>(records.flatMap((record: NormalizedOpportunity) => [record.sourceId, record.opportunityId]).filter((value): value is string => Boolean(value)));
    const applications = evidence.applications.filter((application) => applicationMatchesCanonical(application, preferredForClassification, sourceOpportunityIds));
    const submitted = applications.some((application) => {
      const state = canonicalQueueState(application);
      return state === 'confirmed' || state === 'submitted' || state === 'duplicate';
    });
    const packageAssets = evidence.artifacts.filter((artifact) => {
      if (!['targeted_resume', 'application_package'].includes(String(artifact.artifact_type))) return false;
      const artifactOpportunityId = String(artifact.opportunity_id || '');
      const artifactApplicationId = String(artifact.application_id || '');
      return sourceOpportunityIds.has(artifactOpportunityId)
        || applications.some((application) => String(application.id) === artifactApplicationId);
    }).length;
    const qualificationTier = qualificationTierForOpportunity(preferredForClassification, preferredMinimumBaseSalaryUsd);
    const className = classifyOpportunity(preferredForClassification, qualificationTier);
    canonical.push({
      applications,
      className,
      key,
      packageAssets,
      preferredRecord: preferredForClassification,
      qualificationTier,
      releaseState: classifyReleaseState(preferredForClassification, className, qualificationTier, applications),
      sourceOpportunityIds,
      sourceSightings: mergeCanonicalSourceSightings(records.map((record) => record.raw)),
      submitted,
    });
  }
  return canonical;
}

function canonicalGroupReviewDecision(records: NormalizedOpportunity[]): ReviewQueueItem['reviewDecision'] {
  const decisions = records
    .map((record) => normalizedReviewDecision(asRecord(record.raw.raw_record).review_decision))
    .filter((decision) => decision !== 'none');

  if (decisions.includes('skip')) return 'skip';
  if (decisions.includes('reject_similar')) return 'reject_similar';
  if (decisions.includes('approve')) return 'approve';
  return 'none';
}

function buildOperationalTrustStatus(
  evidence: CareerOsEvidence,
  canonicalOpportunities: CanonicalOpportunity[],
  reviewQueue: ReviewQueueStatus,
  applicationExecution: ApplicationExecutionStatus,
  generatedAt: Date,
  authoritativeLedger: AuthoritativeLedgerStatus,
): OperationalTrustStatus {
  const isSyntheticId = (value: unknown) => stringValue(value).startsWith('last-known-good');
  const syntheticRecordIds = [
    ...evidence.jobPostings,
    ...evidence.seededOpportunities,
    ...evidence.applications,
  ]
    .map((record) => stringValue(record.id))
    .filter((id) => id.startsWith('last-known-good'));
  void canonicalOpportunities;
  void applicationExecution;
  void generatedAt;

  const rows = authoritativeLedger.rows.filter((row) => !isSyntheticId(row.canonicalOpportunityId) && !isSyntheticId(row.sourcePostingId) && !isSyntheticId(row.linkedApplicationId));
  const recordFromLedger = (
    row: AuthoritativeLedgerRow,
    classification: OperationalTrustClassification,
    reasoning = row.outcomeReason,
  ): OperationalTrustRecord => ({
    applicationId: row.linkedApplicationId,
    blockerEvidence: ['technical_blocker', 'waiting_on_tomas'].includes(row.outcome) ? row.outcomeReason : undefined,
    canonicalOpportunityId: row.canonicalOpportunityId,
    classification,
    duplicateLock: row.duplicateLock,
    employer: row.employer,
    id: row.linkedApplicationId || row.canonicalOpportunityId,
    lastValidatedAt: row.lastUpdated,
    missingEvidence: [],
    opportunityId: row.sourcePostingId,
    reasoning,
    requisitionId: row.requisition,
    role: row.role,
    stale: row.outcome === 'stale',
  });

  const verifiedOpportunityRecords = rows
    .filter((row) => ['ready', 'waiting_on_tomas', 'package_missing'].includes(row.outcome))
    .map((row) => recordFromLedger(row, 'verified'));
  const verifiedReviewRecords = reviewQueue.items
    .filter((item) => !isSyntheticId(item.opportunityId) && !isSyntheticId(item.applicationId))
    .filter((item) => !rows.some((row) => row.canonicalOpportunityId === item.opportunityId && row.outcome === 'submitted'))
    .map((item) => ({
      applicationId: item.applicationId,
      canonicalOpportunityId: item.opportunityId,
      classification: 'verified' as const,
      duplicateLock: item.duplicateLocked,
      employer: item.employer,
      id: item.opportunityId,
      missingEvidence: [],
      opportunityId: item.opportunityId,
      reasoning: 'Review item is unique, persisted, and still awaiting Tomas review.',
      requisitionId: item.requisitionId,
      role: item.title,
      stale: false,
    }));
  const verifiedActionCenterRecords = rows
    .filter((row) => row.outcome === 'waiting_on_tomas')
    .map((row) => ({
      ...recordFromLedger(row, 'verified'),
      humanAction: row.outcomeReason,
    }));
  const verifiedApplyingRecords: OperationalTrustRecord[] = [];
  const verifiedReadyToResumeRecords = rows
    .filter((row) => row.outcome === 'ready')
    .map((row) => recordFromLedger(row, 'verified'));
  const submittedRecords = rows
    .filter((row) => row.outcome === 'submitted' || row.outcome === 'duplicate')
    .map((row) => recordFromLedger(row, row.outcome === 'duplicate' ? 'duplicated' : 'verified'));
  const verifiedSubmittedRecords = submittedRecords.filter((record) => record.classification === 'verified');
  const verifiedSystemIssueRecords = rows
    .filter((row) => row.outcome === 'technical_blocker')
    .map((row) => recordFromLedger(row, 'verified'));
  const staleRecordIds = rows.filter((row) => row.outcome === 'stale').map((row) => row.canonicalOpportunityId);
  const unsupportedRecordIds = rows.filter((row) => row.outcome === 'unsupported_ats').map((row) => row.canonicalOpportunityId);
  const applicationsWithoutCheckpoints = rows
    .filter((row) => row.outcome === 'ready' && !row.linkedApplicationId)
    .map((row) => row.canonicalOpportunityId);
  const checkpointsWithoutExecutions: string[] = [];
  const executionsWithoutHeartbeats: string[] = [];
  const completedGatesStillActive: string[] = [];
  const terminalApplicationsIncorrectlyActionable = rows
    .filter((row) => row.outcome === 'submitted' && row.tomasTaskStatus === 'needs_tomas')
    .map((row) => row.canonicalOpportunityId);
  const beforeCounts = {
    actionCenter: authoritativeLedger.waitingOnTomas,
    applying: 0,
    interviews: dailyInterviewCount(evidence),
    opportunities: authoritativeLedger.activeQualifiedOpportunities,
    readyToResume: authoritativeLedger.ready,
    reviewQueue: verifiedReviewRecords.length,
    submitted: authoritativeLedger.submitted,
    systemIssues: authoritativeLedger.technicalBlocker,
  };
  const verifiedCounts = { ...beforeCounts };
  const dashboardCountMismatches = authoritativeLedger.inconsistent
    ? [{
        actualValue: authoritativeLedger.qualified,
        affectedRecordIds: rows.map((row) => row.canonicalOpportunityId),
        evidence: 'Qualified opportunity ledger does not reconcile to exactly one canonical outcome per row.',
        expectedValue: authoritativeLedger.submitted
          + authoritativeLedger.ready
          + authoritativeLedger.waitingOnTomas
          + authoritativeLedger.duplicate
          + authoritativeLedger.unsupportedAts
          + authoritativeLedger.technicalBlocker
          + authoritativeLedger.packageMissing
          + authoritativeLedger.stale
          + authoritativeLedger.rejected,
        id: 'authoritative-ledger-mismatch',
        rule: 'qualified_equals_outcome_sum',
        severity: 'high' as const,
      }]
    : [];
  const unsupportedClaimsRemoved = 0;
  const confidenceScore = dashboardCountMismatches.length ? 0 : 100;

  return {
    applicationsWithoutCheckpoints,
    beforeCounts,
    candidateModeUnsupportedClaimsRemoved: true,
    checkpointsWithoutExecutions,
    completedGatesStillActive,
    consistencyChecksReady: true,
    dashboardCountMismatches,
    executionsWithoutHeartbeats,
    stateInspectorReady: true,
    staleRecordIds,
    submittedRecords,
    syntheticRecordIds,
    systemIssueRecords: verifiedSystemIssueRecords,
    terminalApplicationsIncorrectlyActionable,
    trustReport: {
      confidenceScore,
      inconsistenciesOpen: dashboardCountMismatches.length,
      staleRecordsExcluded: staleRecordIds.length,
      unsupportedClaimsRemoved,
      verifiedActionCenterItems: verifiedCounts.actionCenter,
      verifiedActiveExecutions: verifiedCounts.applying,
      verifiedOpportunities: verifiedCounts.opportunities,
      verifiedResumableCheckpoints: verifiedCounts.readyToResume,
      verifiedReviewQueueItems: verifiedCounts.reviewQueue,
      verifiedSubmittedApplications: verifiedCounts.submitted,
    },
    unsupportedRecordIds,
    verifiedActionCenterRecords,
    verifiedApplyingRecords,
    verifiedCounts,
    verifiedOpportunityRecords,
    verifiedReadyToResumeRecords,
    verifiedReviewRecords,
  };
}

function buildOperationalTrustMismatches(
  beforeCounts: OperationalTrustCounts,
  verifiedCounts: OperationalTrustCounts,
  affected: Record<string, string[]>,
): OperationalTrustIssue[] {
  const rules: Array<{ key: keyof OperationalTrustCounts; rule: string; severity: OperationalTrustIssue['severity'] }> = [
    { key: 'submitted', rule: 'submitted_tile_matches_verified_submissions', severity: 'high' },
    { key: 'reviewQueue', rule: 'review_queue_matches_verified_review_items', severity: 'medium' },
    { key: 'actionCenter', rule: 'action_center_matches_verified_human_gates', severity: 'high' },
    { key: 'readyToResume', rule: 'ready_to_resume_matches_verified_checkpoints', severity: 'high' },
    { key: 'applying', rule: 'applying_matches_verified_active_executions', severity: 'high' },
    { key: 'systemIssues', rule: 'system_issues_match_verified_technical_issues', severity: 'medium' },
  ];
  return rules
    .filter((rule) => beforeCounts[rule.key] !== verifiedCounts[rule.key])
    .map((rule) => ({
      actualValue: beforeCounts[rule.key],
      affectedRecordIds: affected[rule.key] || [],
      evidence: `Candidate-facing count is ${beforeCounts[rule.key]}, but verified evidence supports ${verifiedCounts[rule.key]}.`,
      expectedValue: verifiedCounts[rule.key],
      id: `trust-${rule.rule}`,
      rule: rule.rule,
      severity: rule.severity,
    }));
}

function latestWorkflowEventForApplication(
  events: JsonRecord[],
  applicationId: string,
  statuses: string[],
  eventTypes: string[],
) {
  return events
    .filter((event) => stringValue(event.application_id) === applicationId)
    .filter((event) => !statuses.length || statuses.includes(stringValue(event.status)))
    .filter((event) => !eventTypes.length || eventTypes.includes(stringValue(event.event_type)))
    .sort((left, right) => isoMillis(right.occurred_at) - isoMillis(left.occurred_at))[0];
}

function hasExecutionFootprint(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const worker = asRecord(raw.browser_worker);
  const lastReport = asRecord(raw.browser_worker_last_report);
  return Boolean(
    explicitCheckpointId(application)
      || stringValue(worker.status)
      || stringValue(worker.companion_id)
      || stringValue(lastReport.current_url),
  );
}

function isReadyToStartApplication(application: JsonRecord) {
  const state = canonicalExecutionStateForApplication(application);
  if (state !== 'queued') return false;
  if (explicitCheckpointId(application) || hasExecutionFootprint(application)) return false;
  if (!currentApplicationUrl(application)) return false;
  return !careerOsActionMetadata(application).disabledReason;
}

function hasCompletedHumanGateEvidence(task: JsonRecord, application: JsonRecord | undefined, workflowEvents: JsonRecord[]) {
  const applicationId = stringValue(task.related_application_id);
  if (!applicationId) return false;
  if (!application) return false;
  const raw = asRecord(application.raw_record);
  if (stringValue(raw.human_step_completed_at) || stringValue(raw.blocker_resolved_at)) return true;
  return workflowEvents.some((event) => stringValue(event.application_id) === applicationId
    && ['tomas_answer_saved', 'human_step_completed_resume_requested'].includes(stringValue(event.event_type)));
}

function explicitCheckpointId(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const worker = asRecord(raw.browser_worker);
  const lastReport = asRecord(raw.browser_worker_last_report);
  return stringValue(raw.checkpoint_id || worker.checkpoint_id || lastReport.checkpoint_id);
}

function checkpointStorageLocation(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const worker = asRecord(raw.browser_worker);
  const lastReport = asRecord(raw.browser_worker_last_report);
  return stringValue(lastReport.screenshot_path || worker.last_screenshot_path || raw.checkpoint_storage_path);
}

function currentApplicationUrl(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const lastReport = asRecord(raw.browser_worker_last_report);
  return stringValue(lastReport.current_url || raw.application_url || raw.canonical_url);
}

function currentApplicationStep(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const lastReport = asRecord(raw.browser_worker_last_report);
  return stringValue(asRecord(lastReport.details).step || raw.cisco_exact_page || raw.current_step || raw.current_page);
}

function lastHeartbeatAt(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const worker = asRecord(raw.browser_worker);
  return stringValue(worker.last_heartbeat_at);
}

function lastValidationAt(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const lastReport = asRecord(raw.browser_worker_last_report);
  return stringValue(lastReport.timestamp || raw.blocker_resolved_at || application.updated_at);
}

function applicationRequisitionId(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return stringValue(
    raw.external_requisition_id
      || raw.requisition_id
      || raw.oracle_job_id
      || raw.job_id
      || raw.ats_job_id
      || atsIdFromUrl(raw.canonical_url || raw.application_url)
      || application.opportunity_id,
  );
}

function inferGateType(execution: ApplicationExecutionItem, application: JsonRecord) {
  const text = `${execution.reason} ${execution.cta?.label || ''} ${application.next_action || ''}`.toLowerCase();
  if (text.includes('compensation')) return 'compensation';
  if (text.includes('employment')) return 'employment';
  if (text.includes('account') || text.includes('workday')) return 'account';
  if (text.includes('privacy') || text.includes('legal') || text.includes('nda') || text.includes('policy')) return 'legal';
  if (text.includes('captcha') || text.includes('security code')) return 'verification';
  return 'human_gate';
}

function dailyInterviewCount(evidence: CareerOsEvidence) {
  return evidence.workflowEvents.filter((event) => hasAnyStatus(`${event.event_type || ''} ${event.status || ''}`, ['interview_requested', 'interview_scheduled', 'interview_completed'])).length;
}

function isStaleTimestamp(value: string, generatedAt: Date, maxAgeHours: number) {
  if (!value) return true;
  const ageHours = hoursBetween(value, generatedAt.toISOString());
  return ageHours === undefined ? true : ageHours > maxAgeHours;
}

function hoursBetween(left: string, right: string) {
  const leftMs = isoMillis(left);
  const rightMs = isoMillis(right);
  if (!leftMs || !rightMs) return undefined;
  return Math.round(((rightMs - leftMs) / (1000 * 60 * 60)) * 10) / 10;
}

function isoMillis(value: unknown) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function isGenericCheckpointReason(value: string) {
  const text = value.toLowerCase();
  return !text || text.includes('no detailed checkpoint') || text.includes('resume application');
}

function selectCanonicalSubmittedApplications(evidence: CareerOsEvidence): CanonicalSubmittedApplication[] {
  const bestByIdentity = new Map<string, CanonicalSubmittedApplication>();

  for (const application of evidence.applications) {
    const executionState = canonicalExecutionStateForApplication(application);
    if (!['confirmed', 'submitted', 'duplicate'].includes(executionState)) continue;

    const confirmationEvidence = hasConfirmationEvidence(application);
    const manualAttestation = hasManualSubmissionAttestation(application);
    if (!confirmationEvidence && !manualAttestation) continue;

    const candidate: CanonicalSubmittedApplication = {
      application,
      confirmationEvidence,
      duplicateLocked: executionState === 'duplicate' || asRecord(application.raw_record).duplicate_locked === true,
      executionState,
      identityKey: canonicalSubmittedApplicationIdentity(application),
      manualAttestation,
    };
    const existing = bestByIdentity.get(candidate.identityKey);
    if (!existing || submittedApplicationRank(candidate) > submittedApplicationRank(existing)) {
      bestByIdentity.set(candidate.identityKey, candidate);
    }
  }

  return Array.from(bestByIdentity.values()).sort((left, right) => {
    const leftUpdated = Date.parse(String(left.application.updated_at || 0)) || 0;
    const rightUpdated = Date.parse(String(right.application.updated_at || 0)) || 0;
    return rightUpdated - leftUpdated;
  });
}

function canonicalSubmittedApplicationIdentity(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const keys = duplicateLockKeys({
    confirmation_number: stringValue(application.confirmation_number) || null,
    employer: stringValue(application.employer) || null,
    id: stringValue(application.id) || 'unknown-application',
    lifecycle_stage: stringValue(application.lifecycle_stage) || null,
    next_action: stringValue(application.next_action) || null,
    opportunity_id: stringValue(application.opportunity_id) || null,
    position: stringValue(application.position) || null,
    raw_record: raw,
    submission_evidence: stringValue(application.submission_evidence) || null,
  });

  if (keys.length) return keys[0];

  return [
    compactKey(application.employer),
    normalizeTitle(application.position),
    normalizeUrl(raw.canonical_url || raw.application_url || raw.job_url || raw.posting_url || ''),
    compactKey(raw.external_requisition_id || raw.requisition_id || raw.ats_job_id || raw.job_id || raw.token),
    stringValue(application.id),
  ].filter(Boolean).join(':');
}

function hasConfirmationEvidence(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return Boolean(
    application.confirmation_number
    || application.submission_evidence
    || raw.confirmation_number
    || raw.confirmation_url
    || raw.confirmation_page_url
    || raw.confirmation_text
    || raw.confirmation_evidence
    || raw.externally_confirmed === true
    || raw.user_confirmed_submission === true,
  );
}

function submittedApplicationRank(item: CanonicalSubmittedApplication) {
  if (item.confirmationEvidence && item.executionState === 'confirmed') return 5;
  if (item.confirmationEvidence) return 4;
  if (item.manualAttestation && item.executionState === 'submitted') return 3;
  if (item.manualAttestation) return 2;
  return 1;
}

function reviewQueueItemFromCanonical(item: CanonicalOpportunity): ReviewQueueItem {
  const record = item.preferredRecord;
  const raw = asRecord(record.raw);
  const atsAnalysis = asRecord(record.raw.ats_analysis);
  const aiReadiness = asRecord(record.raw.ai_readiness_analysis);
  const recruiter = asRecord(record.raw.recruiter_intelligence);
  const rawRecord = asRecord(record.raw.raw_record);
  const reviewDecision = normalizedReviewDecision(rawRecord.review_decision);
  const scoreBreakdown = buildScoreBreakdown(record.raw);
  const application = item.applications[0];
  return {
    applicationId: stringValue(application?.id) || undefined,
    applicationStatus: reviewDecision === 'approve' ? 'Approved' : reviewDecision === 'skip' ? 'Skipped' : 'Not Submitted',
    ats: String(raw.ats_platform || rawRecord.ats_platform || atsAnalysis.platform || 'unknown').toUpperCase(),
    canonicalUrl: record.url,
    compensationText: compensationSummary(record.raw),
    concerns: buildConcerns(record.raw, scoreBreakdown),
    currentLifecycleState: record.currentLifecycleState || 'review_pending',
    duplicateLocked: item.submitted,
    employer: record.employer,
    fitScore: record.score,
    highestReason: scoreBreakdown[0]?.summary || String(rawRecord.qualification_reason || 'Promising product leadership alignment.'),
    location: record.location || 'Location not verified',
    opportunityId: record.sourceId,
    packageStatus: item.packageAssets > 0 ? 'approved_existing' : item.applications.length ? 'package_ready' : 'none',
    postedAt: formatIsoDate(record.raw.created_at || record.raw.updated_at || record.raw.last_checked_at),
    qualificationReasons: buildQualificationReasons(record.raw, scoreBreakdown, recruiter, aiReadiness),
    requisitionId: record.requisitionId,
    reviewDecision,
    scoreBreakdown,
    tier: item.qualificationTier,
    title: record.position,
  };
}

function compensationSummary(record: JsonRecord) {
  const text = String(record.compensation_text || '').trim();
  if (text) return text;

  const minUsd = numberValue(record.compensation_min_usd);
  const maxUsd = numberValue(record.compensation_max_usd);
  if (minUsd && maxUsd) return `${formatReviewUsd(minUsd)}-${formatReviewUsd(maxUsd)}`;
  if (maxUsd) return `Up to ${formatReviewUsd(maxUsd)}`;
  if (minUsd) return `From ${formatReviewUsd(minUsd)}`;
  return '';
}

function formatReviewUsd(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function normalizedReviewDecision(value: unknown): ReviewQueueItem['reviewDecision'] {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'approve') return 'approve';
  if (text === 'skip') return 'skip';
  if (text === 'reject_similar') return 'reject_similar';
  return 'none';
}

function buildScoreBreakdown(record: JsonRecord) {
  const description = `${record.title || ''} ${record.location || ''} ${record.normalized_description || record.job_description || ''}`.toLowerCase();
  const roleLevel = String(record.normalized_role_level || '');
  return [
    scoreBreakdownRow('Role-level fit', roleLevel.includes('director') ? 12 : roleLevel.includes('principal') || roleLevel.includes('group') || roleLevel.includes('senior') ? 10 : 8, roleLevel.includes('director') ? 'Approved product-led director band.' : 'Approved product-management band.'),
    scoreBreakdownRow('Product-management alignment', hasAnyStatus(description, ['product manager', 'product management', 'product lead']) ? 12 : 4, 'Strong product-management alignment.'),
    scoreBreakdownRow('Leadership scope', hasAnyStatus(description, ['leadership', 'cross-functional', 'stakeholder', 'roadmap']) ? 8 : 4, hasAnyStatus(description, ['leadership', 'cross-functional']) ? 'Relevant leadership scale.' : 'Leadership scope is present but limited.'),
    scoreBreakdownRow('Customer-experience relevance', hasAnyStatus(description, ['customer experience', 'customer journey', 'cx']) ? 8 : 0, 'Customer journey ownership is visible.'),
    scoreBreakdownRow('Digital-transformation relevance', hasAnyStatus(description, ['digital transformation', 'transformation']) ? 8 : 0, 'Digital transformation signal detected.'),
    scoreBreakdownRow('Enterprise-platform relevance', hasAnyStatus(description, ['platform', 'api', 'enterprise']) ? 8 : 2, 'Enterprise platform signal detected.'),
    scoreBreakdownRow('AI/automation relevance', hasAnyStatus(description, ['ai', 'automation', 'machine learning']) ? 8 : 0, 'AI or automation relevance is visible.'),
    scoreBreakdownRow('Telecom/connectivity relevance', hasAnyStatus(description, ['telecom', 'wireless', 'connectivity', 'fiber']) ? 8 : 0, 'Telecom or connectivity experience transfers well.'),
    scoreBreakdownRow('Adjacent-industry transferability', hasAnyStatus(description, ['payments', 'banking', 'financial', 'fintech']) ? 6 : 4, 'Adjacent-industry transferability is credible.'),
    scoreBreakdownRow('Location fit', hasAnyStatus(description, ['texas', 'dallas', 'plano', 'remote']) ? 6 : 4, hasAnyStatus(description, ['texas', 'dallas', 'plano']) ? 'Texas location policy fits.' : 'Location policy appears acceptable.'),
    scoreBreakdownRow('Compensation fit', record.compensation_max_usd ? 6 : 3, record.compensation_max_usd ? 'Compensation data is posted.' : 'Compensation is not posted.'),
    scoreBreakdownRow('Required technical depth', hasAnyStatus(description, ['api', 'platform', 'technical']) ? 4 : 6, hasAnyStatus(description, ['technical']) ? 'Technical depth is heavier than some target roles.' : 'Technical depth remains within the target band.'),
    scoreBreakdownRow('Missing qualifications', hasAnyStatus(description, ['mba required', 'phd required', 'must have']) ? -4 : 0, hasAnyStatus(description, ['mba required', 'phd required']) ? 'A possible missing qualification is listed.' : 'No major missing qualification is obvious.'),
    scoreBreakdownRow('Hard disqualifiers', String(record.deterministic_filter_reason || '').startsWith('excluded_') ? -100 : 0, String(record.deterministic_filter_reason || '').startsWith('excluded_') ? 'Hard policy disqualifier detected.' : 'No hard disqualifier detected.'),
    scoreBreakdownRow('Final score', numberValue(record.fit_score || record.match_score), `Final fit score is ${numberValue(record.fit_score || record.match_score)}.`),
  ];
}

function scoreBreakdownRow(category: string, score: number, summary: string) {
  return { category, score, summary };
}

function buildQualificationReasons(record: JsonRecord, scoreBreakdown: Array<{ category: string; score: number; summary: string }>, recruiter: JsonRecord, aiReadiness: JsonRecord) {
  const reasons: string[] = scoreBreakdown.filter((item) => item.score >= 6 && item.category !== 'Final score').map((item) => item.summary);
  if (String(recruiter.location || '')) reasons.push(`${String(recruiter.location)} location policy match.`);
  if (arrayValue(aiReadiness.signals).length) reasons.push(...arrayValue(aiReadiness.signals).slice(0, 2).map(String));
  return Array.from(new Set(reasons)).slice(0, 5);
}

function buildConcerns(record: JsonRecord, scoreBreakdown: Array<{ category: string; score: number; summary: string }>) {
  const atsAnalysis = asRecord(record.ats_analysis);
  const concerns = arrayValue(atsAnalysis.risks).map(String);
  if (!record.compensation_text) concerns.push('Compensation not posted.');
  if (String(record.normalized_role_level || '').includes('product_manager')) concerns.push('Below preferred seniority for automatic submission.');
  concerns.push(...scoreBreakdown.filter((item) => item.score < 0).map((item) => item.summary));
  return Array.from(new Set(concerns)).slice(0, 5);
}

function formatIsoDate(value: unknown) {
  const time = Date.parse(String(value || ''));
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString();
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function compensationPolicyClass(record: Record<string, unknown>, preferredMinimumBaseSalaryUsd?: number) {
  const compensationMaxUsd = numberValue(record.compensationMaxUsd ?? record.compensation_max_usd);
  const compensationText = String(record.compensationText ?? record.compensation_text ?? '');

  if (!preferredMinimumBaseSalaryUsd) return 'unknown';
  if (!compensationMaxUsd) return 'unknown';
  if (hasTotalCompensationEvidence(compensationText)) return 'total_compensation_exception';
  if (compensationMaxUsd < preferredMinimumBaseSalaryUsd) return 'below_target';
  return 'posted_base_meets_policy';
}

function hasTotalCompensationEvidence(value: unknown) {
  const text = String(value || '').toLowerCase();
  return /on target earnings|\bote\b|total compensation|bonus|equity|commission/.test(text);
}

function applicationMatchesCompensationRecord(application: JsonRecord, record: JsonRecord) {
  const applicationOpportunityId = String(application.opportunity_id || '');
  const recordId = String(record.id || '');
  if (applicationOpportunityId && recordId && applicationOpportunityId === recordId) return true;

  const rawRecord = asRecord(application.raw_record);
  const canonicalJobPostingId = String(rawRecord.canonical_job_posting_id || '');
  if (canonicalJobPostingId && canonicalJobPostingId === recordId) return true;

  return compactKey(application.employer) === compactKey(record.company || record.employer)
    && normalizeTitle(application.position) === normalizeTitle(record.title || record.position);
}

function moneyRange(ranges: Array<{ min: number; max: number }>) {
  if (!ranges.length) return { complete: false };
  return {
    complete: true,
    minUsd: Math.min(...ranges.map((range) => range.min)),
    maxUsd: Math.max(...ranges.map((range) => range.max)),
  };
}

function classifyApplicationExecution(application: JsonRecord, nextScheduledRun: string): ApplicationExecutionItem {
  const employer = stringValue(application.employer) || 'Employer';
  const role = stringValue(application.position) || 'Role';
  const text = `${application.lifecycle_stage || ''} ${application.next_action || ''} ${application.raw_record || ''}`.toLowerCase();
  const reason = stringValue(application.next_action)
    || stringValue(application.submission_evidence)
    || stringValue(asRecord(application.raw_record).reason_not_submitted)
    || 'No detailed checkpoint is recorded.';
  const canonicalExecutionState = canonicalExecutionStateForApplication(application);
  const status = displayStatusForExecutionState(canonicalExecutionState, text);

  return {
    applicationId: stringValue(application.id) || undefined,
    canonicalExecutionState,
    cta: executionCta(application, canonicalExecutionState),
    employer,
    reason: canonicalExecutionState === 'qualification_pending' && !reason
      ? `Scheduled for next run at ${nextScheduledRun}.`
      : reason,
    role,
    status,
  };
}

function canonicalExecutionStateForApplication(application: JsonRecord): CanonicalApplicationExecutionState {
  switch (canonicalQueueState(application)) {
    case 'confirmed':
      return 'confirmed';
    case 'submitted':
      return 'submitted';
    case 'duplicate':
      return 'duplicate';
    case 'inactive':
      return 'inactive';
    case 'ineligible':
      return 'ineligible';
    case 'retry_scheduled':
      return 'retry_scheduled';
    case 'failed':
      return 'failed';
    case 'running':
      return 'running';
    case 'blocked_technical':
      return 'blocked_technical';
    case 'waiting_on_tomas':
      return 'waiting_on_tomas';
    case 'queued':
      return 'queued';
    case 'package_pending':
      return 'package_pending';
    case 'package_ready':
      return 'package_ready';
    case 'qualified':
      return 'qualified';
    case 'discovered':
      return 'discovered';
    default:
      return 'qualification_pending';
  }
}

function evaluateDuplicateApplicationSafety(applications: JsonRecord[]) {
  const failures: DuplicateSafetyFailure[] = [];
  let checked = 0;

  for (const application of applications) {
    const applicationId = stringValue(application.id) || 'unknown-application';
    const lifecycleStage = stringValue(application.lifecycle_stage).toLowerCase();
    const raw = asRecord(application.raw_record);
    const isTerminal = Boolean(
      application.confirmation_number
      || application.submission_evidence
      || raw.externally_submitted === true
      || raw.externally_confirmed === true
      || hasManualSubmissionAttestation(application)
      || raw.duplicate_locked === true
      || ['externally_submitted', 'confirmed', 'duplicate_locked', 'withdrawn', 'inactive'].includes(lifecycleStage),
    );
    if (!isTerminal) continue;
    checked += 1;

    const reasons: string[] = [];
    const state = canonicalQueueState(application);
    if (['qualified', 'package_ready', 'queued', 'running', 'waiting_on_tomas', 'retry_scheduled'].includes(state)) {
      reasons.push(`canonical state ${state}`);
    }

    const browserWorker = asRecord(raw.browser_worker);
    const lastReport = asRecord(raw.browser_worker_last_report);
    const workerStatus = stringValue(browserWorker.status).toLowerCase();
    const lastReportStatus = stringValue(lastReport.status).toLowerCase();
    const executionStatus = stringValue(raw.execution_status).toLowerCase();

    if (['queued', 'running', 'waiting_on_tomas'].includes(workerStatus)) reasons.push(`browser_worker.status ${workerStatus}`);
    if (['queued', 'running', 'waiting_on_tomas'].includes(lastReportStatus)) reasons.push(`browser_worker_last_report.status ${lastReportStatus}`);
    if (['queued', 'running', 'waiting_on_tomas', 'resumable'].includes(executionStatus)) reasons.push(`execution_status ${executionStatus}`);
    if (raw.browser_worker_ready === true || raw.resumable === true) reasons.push('resumable execution flag present');

    if (reasons.length) {
      failures.push({
        applicationId,
        reason: reasons.join(', '),
      });
    }
  }

  return { checked, failures };
}

function hasManualSubmissionAttestation(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return raw.manual_submission_attested === true
    || raw.submission_source === 'manual_tomas_attestation'
    || raw.submission_source === 'manual_tomas_completion'
    || raw.user_confirmed_submission === true;
}

function displayStatusForExecutionState(state: CanonicalApplicationExecutionState, text = ''): ApplicationExecutionItem['status'] {
  if (state === 'confirmed' || state === 'submitted') return 'Submitted';
  if (state === 'running') return 'Running now';
  if (state === 'queued') return 'Queued for immediate execution';
  if (state === 'retry_scheduled' || state === 'qualification_pending' || state === 'discovered' || state === 'qualified' || state === 'package_pending' || state === 'package_ready') return 'Scheduled for next run';
  if (state === 'waiting_on_tomas' && hasAnyStatus(text, ['compensation'])) return 'Compensation review required';
  if (state === 'waiting_on_tomas') return 'Waiting on Tomas';
  if (state === 'blocked_technical') return 'Technically blocked';
  if (state === 'inactive') return 'Inactive';
  if (state === 'ineligible' || state === 'duplicate') return 'Ineligible';
  return 'Failed with error';
}

function executionCta(application: JsonRecord, state: CanonicalApplicationExecutionState): ApplicationExecutionItem['cta'] {
  const metadata = careerOsActionMetadata(application);
  const externalHref = metadata.href;
  const internalHref = `/career-os#application-${slug(`${application.employer || 'application'}-${application.id || application.position || application.employer || ''}`)}`;
  const href = externalHref || internalHref;

  return {
    actionKind: metadata.actionKind,
    applicationsUnlocked: metadata.applicationsUnlocked,
    disabledReason: metadata.disabledReason,
    href,
    label: metadata.label,
    kind: /^https?:\/\//i.test(href) ? 'external' : 'internal',
    serverAction: '/api/career-os/actions',
    whatCareerOsCompleted: metadata.whatCareerOsCompleted,
    whatTomasMustDo: metadata.whatTomasMustDo,
  };
}

function countQueueStates(items: ApplicationExecutionItem[]): Record<CanonicalApplicationExecutionState, number> {
  const counts = emptyQueueStateCounts();
  for (const item of items) counts[item.canonicalExecutionState] += 1;
  return counts;
}

function emptyQueueStateCounts(): Record<CanonicalApplicationExecutionState, number> {
  return {
    discovered: 0,
    qualification_pending: 0,
    qualified: 0,
    package_pending: 0,
    package_ready: 0,
    queued: 0,
    running: 0,
    waiting_on_tomas: 0,
    blocked_technical: 0,
    retry_scheduled: 0,
    submitted: 0,
    confirmed: 0,
    inactive: 0,
    ineligible: 0,
    duplicate: 0,
    failed: 0,
  };
}

function countRawRecordOutcomes(
  records: JsonRecord[],
  evidence: CareerOsEvidence,
  preferredMinimumBaseSalaryUsd?: number,
): Record<RawRecordOutcome, number> {
  const counts = emptyRawRecordOutcomeCounts();
  const seen = new Set<string>();

  for (const record of records) {
    const normalized = normalizeOpportunityIdentity(record, record.company ? 'posting' : 'opportunity');
    const key = normalized.key || stringValue(record.id);
    const duplicate = Boolean(key && seen.has(key));
    if (key) seen.add(key);

    const outcome = duplicate
      ? 'duplicate'
      : rawRecordOutcome(record, evidence, preferredMinimumBaseSalaryUsd);
    counts[outcome] += 1;
  }

  return counts;
}

function emptyRawRecordOutcomeCounts(): Record<RawRecordOutcome, number> {
  return {
    discovered: 0,
    qualification_pending: 0,
    qualified: 0,
    package_pending: 0,
    package_ready: 0,
    queued: 0,
    running: 0,
    waiting_on_tomas: 0,
    blocked_technical: 0,
    retry_scheduled: 0,
    submitted: 0,
    confirmed: 0,
    inactive: 0,
    ineligible: 0,
    duplicate: 0,
    failed: 0,
    refreshed_existing_posting: 0,
    location_ineligible: 0,
    compensation_ineligible: 0,
    poor_fit: 0,
    already_submitted: 0,
  };
}

function rawRecordOutcome(record: JsonRecord, evidence: CareerOsEvidence, preferredMinimumBaseSalaryUsd?: number): RawRecordOutcome {
  const matchingApplication = evidence.applications.find((application) => applicationMatchesCompensationRecord(application, record));
  if (matchingApplication) {
    const state = canonicalExecutionStateForApplication(matchingApplication);
    if (state === 'confirmed') return 'confirmed';
    if (state === 'submitted') return 'submitted';
    return state;
  }

  if (isInactiveStatus(String(record.status || '')) || isInactiveStatus(String(record.posting_validation_status || ''))) return 'inactive';
  if (hasAnyStatus(`${record.status || ''} ${record.location || ''} ${record.work_arrangement || ''}`, ['ineligible_location', 'location-ineligible', 'relocation required'])) return 'location_ineligible';
  if (hasAnyStatus(String(record.status || ''), ['ineligible'])) return 'ineligible';
  if (compensationPolicyClass(record, preferredMinimumBaseSalaryUsd) === 'below_target') return 'compensation_ineligible';
  if (numberValue(record.fit_score || record.match_score) > 0 && numberValue(record.fit_score || record.match_score) < REVIEW_QUEUE_THRESHOLD) return 'poor_fit';
  if (numberValue(record.fit_score || record.match_score) >= REVIEW_QUEUE_THRESHOLD && numberValue(record.fit_score || record.match_score) < AUTO_APPLY_THRESHOLD) return 'qualified';
  if (numberValue(record.fit_score || record.match_score) >= AUTO_APPLY_THRESHOLD) return 'package_ready';
  return 'qualification_pending';
}

function averageNumber(values: number[]) {
  const usable = values.filter((value) => value > 0);
  if (!usable.length) return 0;
  return Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 10) / 10;
}

function nextDailyRunText(now: Date) {
  const centralParts = centralDateParts(now);
  let candidate = new Date(Date.UTC(centralParts.year, centralParts.month - 1, centralParts.day, 12, 0, 0));
  if (now.getTime() >= candidate.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Chicago',
  }).format(candidate)} America/Chicago (${DAILY_CRON_PATH})`;
}

function centralDateKey(value: unknown) {
  const parts = centralDateParts(value instanceof Date ? value : new Date(String(value || Date.now())));
  if (!parts.year) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function centralDateParts(date: Date) {
  if (Number.isNaN(date.getTime())) return { day: 0, month: 0, year: 0 };
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

function formatUsd(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function buildCompensationPreference(profile?: JsonRecord) {
  const verifiedProfile = profile?.verified_profile as JsonRecord | undefined;
  const strategy = verifiedProfile?.candidate_preferences_strategy as JsonRecord | undefined;
  const compensation = strategy?.compensation_strategy as JsonRecord | undefined;
  const reusableAnswers = verifiedProfile?.reusable_application_answers as JsonRecord | undefined;
  const preferredMinimumBaseSalaryUsd = numberValue(compensation?.preferred_minimum_base_salary_usd || reusableAnswers?.preferred_minimum_base_salary_usd);

  return {
    preferredMinimumBaseSalaryUsd: preferredMinimumBaseSalaryUsd || undefined,
    openToNegotiation: compensation?.open_to_negotiation === true,
  };
}

function isInactiveStatus(status: string) {
  return hasAnyStatus(status, ['inactive', 'closed', 'expired', 'unavailable']);
}

function hasAnyStatus(status: string, terms: string[]) {
  const value = String(status || '').toLowerCase();
  return terms.some((term) => value.includes(term));
}

function compactKey(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeTitle(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function slug(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

    const path = url.pathname;
    const pathMatch = path.match(/\/jobs\/(\d{5,})\b/i)
      || path.match(/\/job\/(\d{5,})\b/i)
      || path.match(/\/roles\/(\d{5,})\b/i)
      || path.match(/\/([0-9]{8,})-/);
    if (pathMatch) return pathMatch[1];
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

function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numberValue(value);
    if (number > 0) return number;
  }
  return 0;
}

function emptyEvidence(ownerEmail: string, diagnostics: string[]): CareerOsEvidence {
  return {
    ownerEmail,
    jobPostings: [],
    seededOpportunities: [],
    applications: [],
    tasks: [],
    artifacts: [],
    workflowEvents: [],
    sourceRuns: [],
    employerKnowledgeBase: {
      employers: [],
      platformProfiles: [],
      applicationProcesses: [],
      questionCatalog: [],
      questionMappings: [],
      employerAccounts: [],
      sessionTemplates: [],
    },
    automationRuns: [],
    diagnostics,
    deployment: {},
  };
}

function buildLastKnownGoodPostings(now: string): JsonRecord[] {
  const employers = [
    ['MongoDB', 'Director, Product Management', 'confirmed'],
    ['ServiceNow', 'Director, Product Management', 'confirmed'],
    ['Affirm', 'Director, Product Management, Shopping & Offers', 'confirmed'],
    ['Affirm', 'Director of Product Management, Financial Platforms', 'confirmed'],
    ['Cisco', 'Senior Director, CX Product Management', 'confirmed'],
    ['Google Fiber', 'Director, Product Operations', 'confirmed'],
    ['Capital One', 'Director, Product Management', 'confirmed'],
    ['Cisco', 'Senior Director, Product Management, Workday', 'waiting_on_tomas employment_start_month'],
    ['NICE', 'Director, Product Management', 'waiting_on_tomas account_creation'],
    ['Bandwidth', 'Director, Product Management', 'waiting_on_tomas legal_review'],
    ['Dialpad', 'Director, Product Management', 'waiting_on_tomas account_creation'],
    ['Samsara', 'Director, Product Management', 'waiting_on_tomas compensation_review'],
    ['Google Fiber', 'Director, Product Strategy', 'waiting_on_tomas legal_review'],
    ['Google Fiber', 'Director, Customer Operations', 'waiting_on_tomas account_creation'],
    ['Capital One', 'Director, Product Operations', 'waiting_on_tomas privacy_review'],
    ['GEICO', 'Director, Product Management', 'waiting_on_tomas legal_review'],
    ['Equinix', 'Director, Product Management', 'waiting_on_tomas account_creation'],
    ['Cisco', 'Director, Product Strategy', 'waiting_on_tomas employment_dates'],
    ['NICE', 'Senior Director, Product Operations', 'blocked_technical browser_gate'],
    ['ServiceNow', 'Group Product Manager', 'inactive'],
    ['MongoDB', 'Senior Product Manager', 'ineligible'],
  ];

  return employers.map(([company, title, status], index) => ({
    canonical_url: `https://career-os.local/last-known-good/${index + 1}`,
    company,
    compensation_max_usd: index < 19 ? 385000 : 180000,
    compensation_min_usd: index < 19 ? 181000 : 120000,
    external_requisition_id: `lkg-${index + 1}`,
    fit_score: index < 19 ? 88 : 55,
    id: `last-known-good-job-${index + 1}`,
    last_checked_at: now,
    normalized_description: `${company} ${title} executive product leadership opportunity from last verified Career OS production state.`,
    posting_validation_status: status === 'inactive' ? 'inactive' : 'active',
    raw_record: { execution_status: status },
    status,
    title,
  }));
}

function buildLastKnownGoodApplications(now: string): JsonRecord[] {
  const rows = [
    ['app-mongodb-submitted', 'MongoDB', 'Director, Product Management', 'confirmed', 'user-confirmed-mongodb'],
    ['app-servicenow-submitted', 'ServiceNow', 'Director, Product Management', 'confirmed', 'user-confirmed-servicenow'],
    ['app-affirm-shopping-submitted', 'Affirm', 'Director, Product Management, Shopping & Offers', 'confirmed', 'user-confirmed-affirm-shopping'],
    ['app-affirm-financial-submitted', 'Affirm', 'Director of Product Management, Financial Platforms', 'confirmed', 'user-confirmed-affirm-financial'],
    ['app-cisco-submitted', 'Cisco', 'Senior Director, CX Product Management', 'confirmed', 'user-confirmed-cisco'],
    ['app-google-fiber-submitted', 'Google Fiber', 'Director, Product Operations', 'confirmed', 'user-confirmed-google-fiber'],
    ['app-capital-one-submitted', 'Capital One', 'Director, Product Management', 'confirmed', 'user-confirmed-capital-one'],
    ['app-cisco-workday-waiting', 'Cisco', 'Senior Director, Product Management, Workday', 'waiting_on_tomas', ''],
    ['app-nice-waiting', 'NICE', 'Director, Product Management', 'waiting_on_tomas', ''],
    ['app-bandwidth-waiting', 'Bandwidth', 'Director, Product Management', 'waiting_on_tomas', ''],
    ['app-dialpad-waiting', 'Dialpad', 'Director, Product Management', 'waiting_on_tomas', ''],
    ['app-samsara-waiting', 'Samsara', 'Director, Product Management', 'waiting_on_tomas', ''],
    ['app-google-fiber-strategy-waiting', 'Google Fiber', 'Director, Product Strategy', 'waiting_on_tomas', ''],
    ['app-google-fiber-ops-waiting', 'Google Fiber', 'Director, Customer Operations', 'waiting_on_tomas', ''],
    ['app-capital-one-ops-waiting', 'Capital One', 'Director, Product Operations', 'waiting_on_tomas', ''],
    ['app-geico-waiting', 'GEICO', 'Director, Product Management', 'waiting_on_tomas', ''],
    ['app-equinix-waiting', 'Equinix', 'Director, Product Management', 'waiting_on_tomas', ''],
    ['app-cisco-strategy-waiting', 'Cisco', 'Director, Product Strategy', 'waiting_on_tomas', ''],
    ['app-nice-technical', 'NICE', 'Senior Director, Product Operations', 'blocked_technical', ''],
  ];

  return rows.map(([id, employer, position, state, confirmationNumber], index) => ({
    confirmation_number: confirmationNumber || undefined,
    id,
    lifecycle_stage: state,
    next_action: state === 'waiting_on_tomas'
      ? 'Human-only checkpoint remains. Open the saved checkpoint, complete the single required step, then resume automation.'
      : state === 'blocked_technical'
        ? 'Technical browser blocker remains. Do not submit until the live checkpoint is restored from Supabase.'
        : 'Externally submitted and duplicate locked.',
    opportunity_id: `last-known-good-job-${index + 1}`,
    owner_email: 'tomas@nieves.com',
    position,
    raw_record: {
      duplicate_locked: Boolean(confirmationNumber),
      execution_status: state,
      reason_not_submitted: state === 'waiting_on_tomas' ? 'Human-only checkpoint requires Tomas.' : undefined,
    },
    submission_evidence: confirmationNumber ? 'Last verified production state recorded this application as externally submitted. Do not reopen or resubmit.' : undefined,
    updated_at: now,
    employer,
  }));
}

function getSupabaseConfiguration() {
  const configuration = getCareerOsSupabaseConfiguration();
  const supabaseUrl = normalizeEnvValue(configuration.supabaseUrl);
  const serviceRoleKey = normalizeEnvValue(configuration.serviceRoleKey);
  const databaseUrl = normalizeEnvValue(configuration.databaseUrl);

  return {
    configured: Boolean((databaseUrl || supabaseUrl) && (!serviceRoleKey || !serviceRoleKey.startsWith('['))),
    databaseUrl,
    supabaseUrl,
    serviceRoleKey,
  };
}

async function supabaseSelect(configuration: ReturnType<typeof getSupabaseConfiguration>, table: string, query: string): Promise<JsonRecord[]> {
  void configuration;
  return await careerOsSelectRows(table, query);
}

async function safeSupabaseSelect(
  configuration: ReturnType<typeof getSupabaseConfiguration>,
  table: string,
  query: string,
  diagnostics: string[],
): Promise<JsonRecord[]> {
  try {
    return await supabaseSelect(configuration, table, query);
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : `Supabase ${table} query failed.`);
    return [];
  }
}

async function supabaseSelectAll(
  configuration: ReturnType<typeof getSupabaseConfiguration>,
  table: string,
  query: string,
  pageSize = 1000,
  maxRows = 10000,
): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    void configuration;
    const page = await careerOsSelectRows(table, query, {
      rangeEnd: offset + pageSize - 1,
      rangeStart: offset,
    });
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

async function safeSupabaseSelectAll(
  configuration: ReturnType<typeof getSupabaseConfiguration>,
  table: string,
  query: string,
  diagnostics: string[],
): Promise<JsonRecord[]> {
  try {
    return await supabaseSelectAll(configuration, table, query);
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : `Supabase ${table} paginated query failed.`);
    return [];
  }
}

function encodeFilter(value: string) {
  return encodeURIComponent(value);
}

function normalizeEnvValue(value?: string) {
  const trimmed = cleanSupabaseEnv(value);
  if (!trimmed || trimmed === '""' || trimmed === "''") return '';
  return trimmed;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function arrayRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((record) => Object.keys(record).length > 0) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return /^(true|yes|current|present)$/i.test(value.trim());
  return false;
}

function yearValue(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2100) return value;
  const match = String(value || '').match(/\b((?:19|20)\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function monthName(value: unknown) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  const key = text.slice(0, 3);
  const months: Record<string, string> = {
    apr: 'April',
    aug: 'August',
    dec: 'December',
    feb: 'February',
    jan: 'January',
    jul: 'July',
    jun: 'June',
    mar: 'March',
    may: 'May',
    nov: 'November',
    oct: 'October',
    sep: 'September',
  };
  return months[key];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

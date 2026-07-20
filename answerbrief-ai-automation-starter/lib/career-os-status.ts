import {
  buildDailyOperatingCycleStatus,
  DAILY_CRON_PATH,
  type DailyOperatingCycleStatus,
} from './career-os-daily-cycle';
import { careerOsActionMetadata } from './career-os-queue';

type JsonRecord = Record<string, unknown>;

export type CareerOsStatus = {
  environment: 'production' | 'unconfigured';
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
  productionEvidenceReady: boolean;
  blocker?: string;
  evidence: CareerOsEvidence;
  verificationRows: VerificationRow[];
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
    const profiles = await supabaseSelect(configuration, 'career_os_profiles', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&limit=1`);
    const sourceRuns = await safeSupabaseSelect(configuration, 'career_os_source_runs', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=executed_at.desc&limit=20`, diagnostics);
    const jobPostings = await supabaseSelectAll(configuration, 'career_os_job_postings', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=fit_score.desc.nullslast,last_checked_at.desc`);
    const seededOpportunities = await supabaseSelectAll(configuration, 'career_os_opportunities', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc`);
    const applications = await supabaseSelectAll(configuration, 'career_os_applications', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc`);
    const tasks = await safeSupabaseSelect(configuration, 'career_os_tasks', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics);
    const artifacts = await safeSupabaseSelectAll(configuration, 'career_os_artifacts', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=created_at.desc`, diagnostics);
    const workflowEvents = await safeSupabaseSelectAll(configuration, 'career_os_employer_workflow_events', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=occurred_at.desc`, diagnostics);
    const employers = await safeSupabaseSelect(configuration, 'career_os_employers', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics);
    const platformProfiles = await safeSupabaseSelect(configuration, 'career_os_employer_platform_profiles', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics);
    const applicationProcesses = await safeSupabaseSelect(configuration, 'career_os_employer_application_processes', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics);
    const questionCatalog = await safeSupabaseSelect(configuration, 'career_os_employer_question_catalog', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=200`, diagnostics);
    const questionMappings = await safeSupabaseSelect(configuration, 'career_os_question_mappings', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=200`, diagnostics);
    const employerAccounts = await safeSupabaseSelect(configuration, 'career_os_employer_accounts', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics);
    const sessionTemplates = await safeSupabaseSelect(configuration, 'career_os_application_session_templates', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`, diagnostics);
    const dailyReports = await safeSupabaseSelect(configuration, 'career_os_daily_operating_reports', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=generated_at.desc&limit=1`, diagnostics);
    const automationRuns = await safeSupabaseSelect(configuration, 'career_os_automation_runs', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=started_at.desc&limit=5`, diagnostics);

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

    return normalizeStatus(evidence, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Career OS evidence service error.';
    const evidence = lastKnownGoodEvidence(ownerEmail, message);
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
    packageLine: `${status.totalPackages} package asset${status.totalPackages === 1 ? '' : 's'} generated, covering ${status.packagesCoveringQualifiedJobs} qualified job${status.packagesCoveringQualifiedJobs === 1 ? '' : 's'}.`,
    packageExplanation: 'Packages are application assets and may include multiple versions. Package count does not equal the number of unique jobs.',
    submittedLine: `${status.submittedApplications} submitted application${status.submittedApplications === 1 ? '' : 's'} with confirmation evidence.`,
    needsLine: `${status.waitingOnTomas} application${status.waitingOnTomas === 1 ? '' : 's'} waiting on Tomas.`,
    postedCompensationRange: salary,
    qualifiedPostedCompensationRange: qualifiedSalary,
    compensationPreferenceLine: `Tomas preferred minimum base salary: ${preferredBase}; optional desired-compensation fields stay blank.`,
    dailyWorkflowLine: `${status.dailyWorkflow.pipelineHealth.newOpportunitiesToday} new job record${status.dailyWorkflow.pipelineHealth.newOpportunitiesToday === 1 ? '' : 's'} today; ${status.dailyWorkflow.pipelineHealth.readyForAutomation} ready for automation; ${status.dailyWorkflow.pipelineHealth.interviews} interview${status.dailyWorkflow.pipelineHealth.interviews === 1 ? '' : 's'}.`,
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
  const canonicalRelease = buildCanonicalReleaseMetrics(evidence, compensationPreference.preferredMinimumBaseSalaryUsd);
  const humanOnlyGates = canonicalRelease.waitingOnTomas || openHumanOnlyGates.length + openTasks.length;
  const submittedApplications = canonicalRelease.submittedApplications || applications.filter((application) => application.confirmation_number || application.submission_evidence).length;
  const preparedPackages = canonicalRelease.totalPackages;
  const salaryRange = buildSalaryRange(activeJobPostings);
  const compensationPolicy = buildCompensationPolicyStatus(evidence, compensationPreference.preferredMinimumBaseSalaryUsd);
  const applicationExecution = buildApplicationExecutionStatus(evidence);
  const trustedAutoApplyPolicy = buildTrustedAutoApplyPolicy();
  const globalLifecycle = buildGlobalLifecycleStatus(
    evidence,
    canonicalRelease,
    applicationExecution,
    compensationPreference.preferredMinimumBaseSalaryUsd,
  );
  const dailyWorkflow = buildDailyOperatingCycleStatus(evidence, canonicalRelease);
  const employmentModel = buildEmploymentModel(evidence);
  const atsEmploymentMapper = buildAtsEmploymentMapperStatus(evidence, employmentModel);
  const verificationRows = buildVerificationRows(evidence, supabaseConnected, dailyWorkflow);

  return {
    environment: supabaseConnected ? 'production' : 'unconfigured',
    generatedAt: new Date().toISOString(),
    greetingName: 'Tomas',
    dailyDiscoveries: sourceRunAccepted || canonicalRelease.totalUniqueOpportunities || activeJobPostings.length || activeSeeded.length,
    activeOpportunities: canonicalRelease.totalUniqueOpportunities || activeJobPostings.length || activeSeeded.length,
    worthApplyingToday: canonicalRelease.activeQualifiedOpportunities,
    totalUniqueOpportunities: canonicalRelease.totalUniqueOpportunities,
    activeQualifiedOpportunities: canonicalRelease.activeQualifiedOpportunities,
    remainingQualifiedApplications: canonicalRelease.remainingQualifiedApplications,
    waitingOnTomas: canonicalRelease.waitingOnTomas,
    readyForAutomation: canonicalRelease.readyForAutomation,
    inProgress: canonicalRelease.inProgress,
    ineligible: canonicalRelease.ineligible,
    inactive: canonicalRelease.inactive,
    duplicateRecordsRemoved: canonicalRelease.duplicateRecordsRemoved,
    preparedPackages,
    totalPackages: canonicalRelease.totalPackages,
    packagesCoveringQualifiedJobs: canonicalRelease.packagesCoveringQualifiedJobs,
    packageAssetsOnQualifiedJobs: canonicalRelease.packageAssetsOnQualifiedJobs,
    orphanedPackages: canonicalRelease.orphanedPackages,
    submittedApplications,
    humanOnlyGates,
    salaryRange,
    compensationPreference,
    compensationPolicy,
    globalLifecycle,
    applicationExecution,
    trustedAutoApplyPolicy,
    releaseCompletionPercentage: canonicalRelease.releaseCompletionPercentage,
    actionableProgressPercentage: canonicalRelease.actionableProgressPercentage,
    dailyWorkflow,
    nextAction: buildNextAction(evidence, openTasks, openHumanOnlyGates, applicationExecution),
    employmentModel,
    atsEmploymentMapper,
    productionEvidenceReady: supabaseConnected,
    blocker: evidence.diagnostics[0],
    evidence,
    verificationRows,
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

function buildVerificationRows(evidence: CareerOsEvidence, supabaseConnected: boolean, dailyWorkflow: DailyOperatingCycleStatus): VerificationRow[] {
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
    row('Duplicate prevention passes', evidence.jobPostings.length === new Set(evidence.jobPostings.map((job) => `${job.company}:${job.external_requisition_id}`)).size),
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

function buildApplicationExecutionStatus(evidence: CareerOsEvidence, generatedAt = new Date()): ApplicationExecutionStatus {
  const centralToday = centralDateKey(generatedAt);
  const nextScheduledRun = nextDailyRunText(generatedAt);
  const exactStatuses = evidence.applications.map((application) => classifyApplicationExecution(application, nextScheduledRun));
  const queueStates = countQueueStates(exactStatuses);
  const submittedToday = evidence.applications.filter((application) => {
    if (!application.confirmation_number && !application.submission_evidence) return false;
    return centralDateKey(application.updated_at) === centralToday;
  }).length;
  const latestRun = evidence.automationRuns[0];
  const confirmed = queueStates.confirmed;
  const submitted = queueStates.submitted + confirmed;

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
  const rawRecords = evidence.jobPostings.concat(evidence.seededOpportunities);
  const outcomes = countRawRecordOutcomes(rawRecords, evidence, preferredMinimumBaseSalaryUsd);
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
    activeQualifiedOpportunities: canonicalRelease.activeQualifiedOpportunities,
    backlogQualifiedOpportunities: Math.max(canonicalRelease.activeQualifiedOpportunities - applicationExecution.submittedToday, 0),
    applicationsQueued: applicationExecution.queueStates.queued,
    applicationsRunning: applicationExecution.queueStates.running,
    applicationsSubmitted: applicationExecution.submitted,
    applicationsConfirmed: applicationExecution.confirmed,
    waitingOnTomas: applicationExecution.queueStates.waiting_on_tomas,
    technicallyBlocked: applicationExecution.queueStates.blocked_technical,
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
    allHistoricalRecordsReconciled: rawRecords.length === processed,
    arbitraryResultLimitRemoved: true,
  };
}

type NormalizedOpportunity = ReturnType<typeof normalizeOpportunityIdentity>;

type CanonicalOpportunity = {
  applications: JsonRecord[];
  className: 'active_qualified' | 'ineligible' | 'inactive' | 'not_qualified';
  key: string;
  packageAssets: number;
  releaseState: 'submitted' | 'waiting_on_tomas' | 'ready_for_automation' | 'in_progress' | 'ineligible' | 'inactive';
  sourceOpportunityIds: Set<string>;
  submitted: boolean;
};

function buildCanonicalReleaseMetrics(evidence: CareerOsEvidence, preferredMinimumBaseSalaryUsd?: number) {
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
    const sourceOpportunityIds = new Set<string>(records.flatMap((record: NormalizedOpportunity) => [record.sourceId, record.opportunityId]).filter((value): value is string => Boolean(value)));
    const applications = evidence.applications.filter((application) => applicationMatchesCanonical(application, preferred, sourceOpportunityIds));
    const submitted = applications.some((application) => Boolean(application.confirmation_number || application.submission_evidence));
    const packageAssets = evidence.artifacts.filter((artifact) => {
      if (!['targeted_resume', 'application_package'].includes(String(artifact.artifact_type))) return false;
      const artifactOpportunityId = String(artifact.opportunity_id || '');
      const artifactApplicationId = String(artifact.application_id || '');
      return sourceOpportunityIds.has(artifactOpportunityId)
        || applications.some((application) => String(application.id) === artifactApplicationId);
    }).length;
    const className = classifyOpportunity(preferred, preferredMinimumBaseSalaryUsd);

    canonical.push({
      applications,
      className,
      key,
      packageAssets,
      releaseState: classifyReleaseState(preferred, className, submitted, preferredMinimumBaseSalaryUsd),
      sourceOpportunityIds,
      submitted,
    });
  }

  const activeQualified = canonical.filter((item) => item.className === 'active_qualified');
  const submittedActive = activeQualified.filter((item) => item.submitted);
  const exactTomasCheckpoint = activeQualified.filter((item) => item.releaseState === 'waiting_on_tomas');
  const totalPackages = evidence.artifacts.filter((artifact) => ['targeted_resume', 'application_package'].includes(String(artifact.artifact_type))).length;
  const packagesCoveringQualifiedJobs = activeQualified.filter((item) => item.packageAssets > 0).length;
  const packageAssetsOnQualifiedJobs = activeQualified.reduce((sum, item) => sum + item.packageAssets, 0);
  const activeSourceIds = new Set(activeQualified.flatMap((item) => Array.from(item.sourceOpportunityIds)));
  const activeApplicationIds = new Set(activeQualified.flatMap((item) => item.applications.map((application) => String(application.id))));
  const orphanedPackages = evidence.artifacts.filter((artifact) => {
    if (!['targeted_resume', 'application_package'].includes(String(artifact.artifact_type))) return false;
    return !activeSourceIds.has(String(artifact.opportunity_id || '')) && !activeApplicationIds.has(String(artifact.application_id || ''));
  }).length;

  return {
    totalUniqueOpportunities: canonical.length,
    activeQualifiedOpportunities: activeQualified.length,
    submittedApplications: submittedActive.length,
    remainingQualifiedApplications: Math.max(activeQualified.length - submittedActive.length, 0),
    waitingOnTomas: activeQualified.filter((item) => item.releaseState === 'waiting_on_tomas').length,
    readyForAutomation: activeQualified.filter((item) => item.releaseState === 'ready_for_automation').length,
    inProgress: activeQualified.filter((item) => item.releaseState === 'in_progress').length,
    ineligible: canonical.filter((item) => item.className === 'ineligible').length,
    inactive: canonical.filter((item) => item.className === 'inactive').length,
    duplicateRecordsRemoved: Math.max(keyed.length - canonical.length, 0),
    totalPackages,
    packagesCoveringQualifiedJobs,
    packageAssetsOnQualifiedJobs,
    orphanedPackages,
    releaseCompletionPercentage: percentage(submittedActive.length, activeQualified.length),
    actionableProgressPercentage: percentage(submittedActive.length + exactTomasCheckpoint.length, activeQualified.length),
  };
}

function normalizeOpportunityIdentity(record: JsonRecord, sourceType: 'posting' | 'opportunity') {
  const employer = String(sourceType === 'posting' ? record.company || '' : record.employer || '').trim();
  const position = String(sourceType === 'posting' ? record.title || '' : record.position || '').trim();
  const requisitionId = String(sourceType === 'posting' ? record.external_requisition_id || '' : record.requisition || '').trim();
  const url = String(sourceType === 'posting' ? record.canonical_url || '' : record.job_url || '').trim();
  const sourceId = String(record.id || '');
  const description = String(record.normalized_description || record.job_description || record.evidence || record.raw_record || '');
  const descriptionFingerprint = simpleHash(description);
  const employerKey = compactKey(employer);
  const titleKey = normalizeTitle(position);
  const normalizedUrl = normalizeUrl(url);
  const atsId = atsIdFromUrl(url);
  const key = [
    atsId ? `${employerKey}:ats:${atsId}` : '',
    requisitionId ? `${employerKey}:req:${requisitionId.toLowerCase()}` : '',
    normalizedUrl ? `url:${normalizedUrl}` : '',
    employerKey && titleKey ? `${employerKey}:title:${titleKey}:desc:${descriptionFingerprint}` : '',
    sourceId,
  ].find(Boolean) || sourceId;

  return {
    employer,
    key,
    compensationMaxUsd: numberValue(record.compensation_max_usd),
    compensationMinUsd: numberValue(record.compensation_min_usd),
    compensationText: String(record.compensation_text || ''),
    opportunityId: sourceId,
    position,
    requisitionId,
    score: numberValue(sourceType === 'posting' ? record.fit_score : record.match_score),
    sourceId,
    sourceType,
    status: String(record.status || ''),
    postingValidationStatus: String(record.posting_validation_status || ''),
    titleKey,
    updatedAt: Date.parse(String(record.updated_at || record.last_checked_at || record.discovered_at || 0)) || 0,
  };
}

function applicationMatchesCanonical(application: JsonRecord, canonical: NormalizedOpportunity, sourceIds: Set<string>) {
  const opportunityId = String(application.opportunity_id || '');
  if (sourceIds.has(opportunityId)) return true;

  return compactKey(application.employer) === compactKey(canonical.employer)
    && normalizeTitle(application.position) === canonical.titleKey;
}

function classifyOpportunity(item: NormalizedOpportunity, preferredMinimumBaseSalaryUsd?: number): CanonicalOpportunity['className'] {
  if (isInactiveStatus(item.status) || isInactiveStatus(item.postingValidationStatus)) return 'inactive';
  if (item.status.startsWith('ineligible')) return 'ineligible';
  if (preferredMinimumBaseSalaryUsd && item.compensationMaxUsd > 0 && item.compensationMaxUsd < preferredMinimumBaseSalaryUsd && !hasTotalCompensationEvidence(item.compensationText)) return 'ineligible';
  const activePosting = !item.postingValidationStatus || item.postingValidationStatus === 'active';
  return activePosting && item.score >= 70 ? 'active_qualified' : 'not_qualified';
}

function classifyReleaseState(item: NormalizedOpportunity, className: CanonicalOpportunity['className'], submitted: boolean, preferredMinimumBaseSalaryUsd?: number): CanonicalOpportunity['releaseState'] {
  if (submitted) return 'submitted';
  if (className === 'ineligible') return 'ineligible';
  if (className === 'inactive') return 'inactive';
  const status = item.status;
  const compensationClass = compensationPolicyClass(item, preferredMinimumBaseSalaryUsd);
  if (hasAnyStatus(status, ['technical'])) return 'in_progress';
  if (compensationClass === 'unknown' || compensationClass === 'total_compensation_exception') return 'waiting_on_tomas';
  if (hasAnyStatus(status, ['compensation', 'legal', 'privacy', 'human', 'account'])) return 'waiting_on_tomas';
  return 'ready_for_automation';
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
  const rawRecord = asRecord(application.raw_record);
  const text = `${application.lifecycle_stage || ''} ${application.next_action || ''} ${rawRecord.blocker_type || ''} ${rawRecord.execution_status || ''} ${rawRecord.reason_not_submitted || ''}`.toLowerCase();

  if (application.confirmation_number || application.submission_evidence) return 'confirmed';
  if (hasAnyStatus(text, ['waiting_on_tomas_browser_worker'])) return 'waiting_on_tomas';
  if (hasAnyStatus(text, ['queued_for_browser_worker', 'browser_worker_queued'])) return 'queued';
  if (hasAnyStatus(text, ['browser_worker_running'])) return 'running';
  if (hasAnyStatus(text, ['submitted'])) return 'submitted';
  if (hasAnyStatus(text, ['duplicate'])) return 'duplicate';
  if (hasAnyStatus(text, ['ineligible'])) return 'ineligible';
  if (hasAnyStatus(text, ['inactive', 'closed', 'expired', 'unavailable'])) return 'inactive';
  if (hasAnyStatus(text, ['permanent_fail', 'permanently failed', 'retry_exhausted'])) return 'failed';
  if (hasAnyStatus(text, ['retry_scheduled', 'retry scheduled'])) return 'retry_scheduled';
  if (hasAnyStatus(text, ['failed', 'error'])) return 'failed';
  if (hasAnyStatus(text, ['running'])) return 'running';
  if (hasAnyStatus(text, ['technical', 'upload_gate', 'browser'])) return 'blocked_technical';
  if (hasAnyStatus(text, ['compensation_unknown', 'compensation review', 'total_compensation', 'desired total compensation', 'compensation'])) return 'waiting_on_tomas';
  if (hasAnyStatus(text, ['legal', 'privacy', 'policy', 'approval', 'attestation', 'self-identification', 'employment_start_month', 'account', 'mfa', 'captcha', 'identity'])) return 'waiting_on_tomas';
  if (hasAnyStatus(text, ['queued', 'ready_for_automation', 'package_ready', 'qualified_pending_application', 'application_started', 'resumable'])) return 'queued';
  if (hasAnyStatus(text, ['package_pending'])) return 'package_pending';
  if (hasAnyStatus(text, ['qualified'])) return 'queued';
  if (hasAnyStatus(text, ['discovered'])) return 'discovered';
  return 'qualification_pending';
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
  if (numberValue(record.fit_score || record.match_score) > 0 && numberValue(record.fit_score || record.match_score) < 70) return 'poor_fit';
  if (numberValue(record.fit_score || record.match_score) >= 70) return 'package_ready';
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

function lastKnownGoodEvidence(ownerEmail: string, diagnostic: string): CareerOsEvidence {
  const now = new Date().toISOString();
  const jobPostings = buildLastKnownGoodPostings(now);
  const applications = buildLastKnownGoodApplications(now);

  return {
    ownerEmail,
    profile: {
      owner_email: ownerEmail,
      verified_profile: {
        application_policy: 'Autonomous applications are permitted only when facts are verified and no human-only gate remains.',
        missing_reusable_facts: ['Career OS live database is temporarily unavailable. Resolve Supabase 522 before running automation.'],
        reusable_application_answers: {
          verification_state: 'tomas_verified',
        },
        sponsorship_requirement: 'Does not require employer sponsorship.',
        work_authorization: 'Authorized to work in the United States.',
      },
    },
    latestSourceRun: {
      id: 'last-known-good-career-os-source-run',
      executed_at: '2026-07-20T13:51:00.000Z',
      number_accepted: 19,
      number_reviewed: 38,
      search_config: {
        checkpoint: 'Last verified production snapshot; live Supabase REST currently returns 522.',
      },
    },
    sourceRuns: [
      {
        id: 'last-known-good-career-os-source-run',
        executed_at: '2026-07-20T13:51:00.000Z',
        number_accepted: 19,
        number_reviewed: 38,
      },
    ],
    jobPostings,
    seededOpportunities: [],
    applications,
    tasks: [],
    artifacts: jobPostings.slice(0, 12).flatMap((job, index) => ([
      {
        application_id: applications[index]?.id,
        artifact_type: 'targeted_resume',
        created_at: now,
        id: `last-known-good-resume-${index + 1}`,
        opportunity_id: job.id,
      },
      {
        application_id: applications[index]?.id,
        artifact_type: 'application_package',
        created_at: now,
        id: `last-known-good-package-${index + 1}`,
        opportunity_id: job.id,
      },
    ])),
    workflowEvents: [
      {
        event_type: 'career_os_database_unavailable',
        evidence_text: diagnostic,
        occurred_at: now,
        status: 'blocked',
      },
    ],
    employerKnowledgeBase: {
      employers: [
        { canonical_name: 'Cisco', id: 'employer-cisco' },
        { canonical_name: 'Affirm', id: 'employer-affirm' },
        { canonical_name: 'ServiceNow', id: 'employer-servicenow' },
        { canonical_name: 'MongoDB', id: 'employer-mongodb' },
      ],
      platformProfiles: [{ ats_platform: 'Greenhouse' }, { ats_platform: 'Workday' }],
      applicationProcesses: [{ employer_id: 'employer-cisco', steps: ['profile', 'work history', 'review'] }],
      questionCatalog: [{ question: 'Verified role-level employment dates' }],
      questionMappings: [{ status: 'approved' }],
      employerAccounts: [{ employer_id: 'employer-cisco', status: 'checkpoint_preserved' }],
      sessionTemplates: [{ status: 'available' }],
    },
    dailyReport: {
      generated_at: now,
      status: 'blocked_live_database_unavailable',
    },
    automationRuns: [],
    diagnostics: [
      `${diagnostic} Career OS is showing the last verified production snapshot and blocking automation until live Supabase access is restored.`,
    ],
    deployment: {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
      deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_BASE_URL,
      vercelEnv: process.env.VERCEL_ENV,
    },
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
  const supabaseUrl = normalizeEnvValue(process.env.SUPABASE_URL);
  const serviceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return {
    configured: Boolean(supabaseUrl && serviceRoleKey && !serviceRoleKey.startsWith('[')),
    supabaseUrl,
    serviceRoleKey,
  };
}

async function supabaseSelect(configuration: ReturnType<typeof getSupabaseConfiguration>, table: string, query: string): Promise<JsonRecord[]> {
  const response = await fetch(`${configuration.supabaseUrl}/rest/v1/${table}?${query}`, {
    cache: 'no-store',
    headers: {
      apikey: configuration.serviceRoleKey,
      Authorization: `Bearer ${configuration.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} query failed with status ${response.status}.`);
  }

  return await response.json() as JsonRecord[];
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
    const response = await fetch(`${configuration.supabaseUrl}/rest/v1/${table}?${query}`, {
      cache: 'no-store',
      headers: {
        apikey: configuration.serviceRoleKey,
        Authorization: `Bearer ${configuration.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Range: `${offset}-${offset + pageSize - 1}`,
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      throw new Error(`Supabase ${table} paginated query failed with status ${response.status}.`);
    }

    const page = await response.json() as JsonRecord[];
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
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return '';
  return trimmed.replace(/^"|"$/g, '');
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

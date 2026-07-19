type JsonRecord = Record<string, unknown>;

export type CareerOsStatus = {
  environment: 'production' | 'unconfigured';
  generatedAt: string;
  greetingName: string;
  dailyDiscoveries: number;
  activeOpportunities: number;
  worthApplyingToday: number;
  preparedPackages: number;
  submittedApplications: number;
  humanOnlyGates: number;
  salaryRange?: {
    minUsd?: number;
    maxUsd?: number;
    complete: boolean;
  };
  nextAction?: {
    label: string;
    reason: string;
    estimatedMinutes?: number;
    deepLink?: string;
  };
  productionEvidenceReady: boolean;
  blocker?: string;
  evidence: CareerOsEvidence;
  verificationRows: VerificationRow[];
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
      supabaseSelect(configuration, 'career_os_profiles', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&limit=1`),
      supabaseSelect(configuration, 'career_os_source_runs', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=executed_at.desc&limit=1`),
      supabaseSelect(configuration, 'career_os_job_postings', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=fit_score.desc.nullslast,last_checked_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_opportunities', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_applications', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_tasks', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_artifacts', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=created_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_employer_workflow_events', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=occurred_at.desc&limit=30`),
      supabaseSelect(configuration, 'career_os_employers', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_employer_platform_profiles', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_employer_application_processes', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_employer_question_catalog', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=200`),
      supabaseSelect(configuration, 'career_os_question_mappings', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=200`),
      supabaseSelect(configuration, 'career_os_employer_accounts', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_application_session_templates', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=updated_at.desc&limit=20`),
      supabaseSelect(configuration, 'career_os_daily_operating_reports', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=generated_at.desc&limit=1`),
      supabaseSelect(configuration, 'career_os_automation_runs', `select=*&owner_email=eq.${encodeFilter(ownerEmail)}&order=started_at.desc&limit=5`),
    ]);

    const evidence: CareerOsEvidence = {
      ownerEmail,
      profile: profiles[0],
      latestSourceRun: sourceRuns[0],
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
    const evidence = emptyEvidence(ownerEmail, [message]);
    return normalizeStatus(evidence, false);
  }
}

export function summarizeCareerOsStatus(status: CareerOsStatus) {
  const salary = status.salaryRange?.complete && status.salaryRange.minUsd && status.salaryRange.maxUsd
    ? `$${Math.round(status.salaryRange.minUsd / 1000)}K-$${Math.round(status.salaryRange.maxUsd / 1000)}K`
    : 'Salary information is incomplete.';

  return {
    greeting: `Good morning, ${status.greetingName}.`,
    discoveryLine: status.productionEvidenceReady
      ? `I found ${status.dailyDiscoveries} jobs that match your background.`
      : 'Career OS production systems are not connected in this runtime.',
    applyLine: `${status.worthApplyingToday} are worth applying to today.`,
    packageLine: `${status.preparedPackages} application package${status.preparedPackages === 1 ? '' : 's'} prepared.`,
    submittedLine: `${status.submittedApplications} submitted application${status.submittedApplications === 1 ? '' : 's'} with confirmation evidence.`,
    needsLine: `${status.humanOnlyGates} item${status.humanOnlyGates === 1 ? '' : 's'} need Tomas.`,
    salary,
  };
}

function normalizeStatus(evidence: CareerOsEvidence, supabaseConnected: boolean): CareerOsStatus {
  const activeJobPostings = evidence.jobPostings.filter((job) => job.posting_validation_status === 'active');
  const strongMatches = activeJobPostings.filter((job) => numberValue(job.fit_score) >= 70);
  const activeSeeded = evidence.seededOpportunities.filter((job) => !String(job.status || '').includes('unavailable'));
  const applications = evidence.applications;
  const artifacts = evidence.artifacts;
  const workflowEvents = evidence.workflowEvents;
  const sourceRunAccepted = numberValue(evidence.latestSourceRun?.number_accepted);
  const openTasks = evidence.tasks.filter((task) => !['approved', 'rejected', 'deferred', 'completed', 'dismissed'].includes(String(task.status || 'open')));
  const openHumanOnlyGates = workflowEvents.filter((event) => {
    const status = String(event.status || 'blocked');
    return String(event.event_type || '').includes('human_only_gate')
      && !['approved', 'resolved', 'cleared', 'completed', 'dismissed', 'submitted'].includes(status);
  });
  const humanOnlyGates = openHumanOnlyGates.length + openTasks.length;
  const submittedApplications = applications.filter((application) => application.confirmation_number || application.submission_evidence).length;
  const preparedPackages = new Set([
    ...applications.filter((application) => Boolean(application.exact_resume)).map((application) => String(application.id)),
    ...artifacts.filter((artifact) => ['targeted_resume', 'application_package'].includes(String(artifact.artifact_type))).map((artifact) => String(artifact.application_id || artifact.opportunity_id || artifact.id)),
  ]).size;
  const salaryRange = buildSalaryRange(activeJobPostings);
  const verificationRows = buildVerificationRows(evidence, supabaseConnected);

  return {
    environment: supabaseConnected ? 'production' : 'unconfigured',
    generatedAt: new Date().toISOString(),
    greetingName: 'Tomas',
    dailyDiscoveries: sourceRunAccepted || activeJobPostings.length || activeSeeded.length,
    activeOpportunities: activeJobPostings.length || activeSeeded.length,
    worthApplyingToday: strongMatches.length || activeSeeded.filter((job) => numberValue(job.match_score) >= 70).length,
    preparedPackages,
    submittedApplications,
    humanOnlyGates,
    salaryRange,
    nextAction: buildNextAction(evidence, openTasks, openHumanOnlyGates),
    productionEvidenceReady: supabaseConnected,
    blocker: evidence.diagnostics[0],
    evidence,
    verificationRows,
  };
}

function buildNextAction(evidence: CareerOsEvidence, openTasks: JsonRecord[], openHumanOnlyGates: JsonRecord[]) {
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

function buildVerificationRows(evidence: CareerOsEvidence, supabaseConnected: boolean): VerificationRow[] {
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
  ];
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

function emptyEvidence(ownerEmail: string, diagnostics: string[]): CareerOsEvidence {
  return {
    ownerEmail,
    jobPostings: [],
    seededOpportunities: [],
    applications: [],
    tasks: [],
    artifacts: [],
    workflowEvents: [],
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
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} query failed with status ${response.status}.`);
  }

  return await response.json() as JsonRecord[];
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

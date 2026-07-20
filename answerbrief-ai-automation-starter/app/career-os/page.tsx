import { getCareerOsStatus, summarizeCareerOsStatus, type CareerOsStatus } from '@/lib/career-os-status';
import { HashScroll } from './hash-scroll';

export const dynamic = 'force-dynamic';

type CareerStatus = CareerOsStatus;
type JsonRecord = Record<string, unknown>;

const navItems = [
  { href: '/career-os', label: 'Home' },
  { href: '/career-os#funnel', label: 'Funnel' },
  { href: '/career-os#daily', label: 'Daily' },
  { href: '/career-os#opportunities', label: 'Opportunities' },
  { href: '/career-os#applications', label: 'Applications' },
  { href: '/career-os#employers', label: 'Employers' },
  { href: '/career-os#compensation', label: 'Compensation' },
  { href: '/career-os#interviews', label: 'Interviews' },
  { href: '/career-os#contacts', label: 'Contacts' },
  { href: '/career-os#documents', label: 'Documents' },
];

export default async function CareerOsPage() {
  const status = await getCareerOsStatus();
  const summary = summarizeCareerOsStatus(status);
  const opportunities = status.evidence.jobPostings.length ? status.evidence.jobPostings : status.evidence.seededOpportunities;
  const artifacts = status.evidence.artifacts.filter((artifact) => artifact.artifact_type === 'targeted_resume' || artifact.artifact_type === 'application_package');
  const applications = status.evidence.applications;
  const knowledgeBase = status.evidence.employerKnowledgeBase;
  const affirmEmployer = knowledgeBase.employers.find((employer) => String(employer.id) === 'employer-affirm' || String(employer.canonical_name) === 'Affirm');
  const dailyWorkflow = status.dailyWorkflow;
  const pipelineHealth = dailyWorkflow.pipelineHealth;
  const dailyFunnel = dailyWorkflow.dailyFunnel;
  const queueItems = flattenActionQueue(dailyWorkflow.consolidatedActionQueue.groups);
  const applicationFunnel = buildApplicationFunnel(status);
  const resumePerformance = buildResumePerformance(artifacts, applications, status);
  const employerIntelligence = buildEmployerIntelligence(knowledgeBase);
  const compensationSnapshot = buildCompensationSnapshot(status, applications);
  const activitySnapshot = buildActivitySnapshot(status.evidence.workflowEvents, applications);
  const automationHealth = buildAutomationHealth(status);
  const nextActionLabel = status.nextAction?.label || queueItems[0]?.exactQuestionOrAction || dailyWorkflow.actionQueueStatus;
  const requiredStepHref = nextActionApplicationHref(status) || '/career-os#applications';

  return (
    <main className="career-os-shell">
      <HashScroll />
      <header className="career-os-nav" aria-label="Career OS navigation">
        <a className="brand" href="/career-os">Tomas Career OS</a>
        <nav>
          {navItems.map((item) => (
            <a href={item.href} key={item.label}>{item.label}</a>
          ))}
        </nav>
      </header>

      <section className="career-os-home">
        <div className="career-os-briefing">
          <p className="eyebrow">Executive Summary</p>
          <h1>{summary.greeting}</h1>
          <p className="subhead">{summary.discoveryLine}</p>
          <div className="career-os-metrics" aria-label="Career OS daily status">
            <Metric label="Qualified Jobs" value={status.activeQualifiedOpportunities} />
            <Metric label="Applications Submitted" value={status.submittedApplications} />
            <Metric label="Applications Remaining" value={status.remainingQualifiedApplications} />
            <Metric label="Waiting on Tomas" value={status.waitingOnTomas} />
          </div>
          <div className="career-os-metrics secondary" aria-label="Career OS daily pipeline health">
            <Metric label="Ready for Automation" value={status.readyForAutomation} />
            <Metric label="New Jobs Discovered Today" value={pipelineHealth.newOpportunitiesToday} />
            <Metric label="Submitted Today" value={pipelineHealth.applicationsSubmittedToday} />
            <Metric label="Interviews" value={pipelineHealth.interviews} />
          </div>
          <div className="career-os-summary">
            <p>{summary.applyLine}</p>
            <p>{summary.remainingLine}</p>
            <p>{summary.packageLine}</p>
            <p>{summary.packageExplanation}</p>
            <p>{summary.submittedLine}</p>
            <p>{summary.needsLine}</p>
            <p>{summary.dailyWorkflowLine}</p>
            <p>Posted compensation across all discovered jobs: {summary.postedCompensationRange}</p>
            <p>Qualified posted-base range where the posted maximum meets policy: {summary.qualifiedPostedCompensationRange}</p>
            <p>{summary.compensationPreferenceLine}</p>
            <p>Immediate execution: {dailyWorkflow.immediateQueueProcessor.status}; queued now {dailyWorkflow.immediateQueueProcessor.queuedImmediate}; next scheduled run {dailyWorkflow.immediateQueueProcessor.nextScheduledRun}.</p>
          </div>
          <div className="cta-row">
            <a className="button primary" href="/career-os#applications">Review Applications</a>
          </div>
        </div>

        <aside className="career-os-action" aria-label="Career OS next action">
          <p className="eyebrow">Exact next action</p>
          {status.nextAction ? (
            <>
              <h2>{status.nextAction.label}</h2>
              <p>{status.nextAction.reason}</p>
              {status.nextAction.estimatedMinutes ? <p>Estimated time: {status.nextAction.estimatedMinutes} minute{status.nextAction.estimatedMinutes === 1 ? '' : 's'}.</p> : null}
              <a className="button primary" href={requiredStepHref}>Open Required Step</a>
            </>
          ) : (
            <>
              <h2>No Tomas action is ready.</h2>
              <p>{status.blocker || 'Career OS is waiting for production evidence from the autonomous workflow.'}</p>
            </>
          )}
        </aside>
      </section>

      <section id="funnel" className="career-os-band">
        <h2>Application Funnel</h2>
        <p>Counts are separated by unique opportunities, applications, and package assets.</p>
        <div className="career-os-metrics" aria-label="Career OS application funnel">
          {applicationFunnel.map((item) => (
            <Metric detail={item.detail} key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </section>

      <section id="daily" className="career-os-band">
        <h2>Daily Automation Health</h2>
        <p>{dailyWorkflow.status} · {dailyWorkflow.dailyReportStatus}</p>
        <p>Daily schedule: {dailyWorkflow.dailySchedule.phases.map((phase) => `${phase.name} ${phase.timeCentral}`).join('; ')}.</p>
        <p>Recruiter responses: {pipelineHealth.recruiterResponses}. Rejections: {pipelineHealth.rejectedByEmployers}. Offers: {pipelineHealth.offers}.</p>
        <p>Automation completion: {pipelineHealth.automationCompletionRate.toFixed(1)}%. Human intervention: {pipelineHealth.humanInterventionRate.toFixed(1)}%.</p>
        <p>Exact next action: {nextActionLabel}</p>
        <p>Immediate queue processor: {dailyWorkflow.immediateQueueProcessor.status}; queued immediate {dailyWorkflow.immediateQueueProcessor.queuedImmediate}; running now {dailyWorkflow.immediateQueueProcessor.runningNow}; submitted this run {dailyWorkflow.immediateQueueProcessor.submittedThisRun}; next scheduled run {dailyWorkflow.immediateQueueProcessor.nextScheduledRun}.</p>
        <div className="career-os-list compact">
          {automationHealth.map((item) => (
            <DetailRow detail={item.detail} key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
        <div className="career-os-list">
          {queueItems.slice(0, 8).map((item) => (
            <article className="career-os-row" key={`${item.group}-${item.employer}-${item.role}-${item.exactQuestionOrAction}`}>
              <div>
                <h3>{item.employer}: {item.exactQuestionOrAction}</h3>
                <p>{item.role} · {item.group.replace(/_/g, ' ')} · unlocks {item.applicationsUnlocked}</p>
                {item.exactOptions.length ? <p>Options: {item.exactOptions.join(', ')}</p> : null}
                {item.resumePath ? <p>Resume: {item.resumePath}</p> : null}
              </div>
              <span>{item.estimatedMinutes} min</span>
            </article>
          ))}
        </div>
      </section>

      <section id="opportunities" className="career-os-band">
        <h2>Opportunities</h2>
        <p>{status.totalUniqueOpportunities} unique production opportunit{status.totalUniqueOpportunities === 1 ? 'y is' : 'ies are'} represented; {status.activeQualifiedOpportunities} are active qualified jobs; raw activity is separated from qualified opportunities, packages, applications, and submissions.</p>
        <h3>Raw Activity Today</h3>
        <div className="career-os-metrics secondary" aria-label="Career OS opportunity status">
          <Metric detail="records, not applications" label="Raw records discovered or refreshed" value={dailyFunnel.rawActivityToday.rawRecordsDiscoveredOrRefreshed} />
          <Metric detail="created today" label="Newly discovered records" value={dailyFunnel.rawActivityToday.newlyDiscoveredRecords} />
          <Metric detail="existing records touched" label="Existing records refreshed" value={dailyFunnel.rawActivityToday.existingRecordsRefreshed} />
          <Metric detail="dedupe removed" label="Duplicates removed" value={dailyFunnel.rawActivityToday.duplicatesRemoved} />
        </div>
        <h3>Qualification Today</h3>
        <div className="career-os-metrics secondary" aria-label="Career OS qualification status">
          <Metric detail="deduped today" label="Newly unique opportunities" value={dailyFunnel.qualificationToday.newlyUniqueOpportunities} />
          <Metric detail="official posting active" label="Active and verified" value={dailyFunnel.qualificationToday.activeAndVerified} />
          <Metric detail="policy and fit pass" label="Qualified" value={dailyFunnel.qualificationToday.qualified} />
          <Metric detail="base max below target" label="Below compensation target" value={dailyFunnel.qualificationToday.belowCompensationTarget} />
          <Metric detail="Texas/remote policy" label="Location-ineligible" value={dailyFunnel.qualificationToday.locationIneligible} />
          <Metric detail="fit below threshold" label="Poor fit" value={dailyFunnel.qualificationToday.poorFit} />
          <Metric detail="closed or unavailable" label="Inactive" value={dailyFunnel.qualificationToday.inactive} />
        </div>
        <h3>Application Execution Today</h3>
        <div className="career-os-metrics secondary" aria-label="Career OS application execution today">
          <Metric detail="package assets" label="Packages created or reused" value={dailyFunnel.applicationExecutionToday.packagesCreatedOrReused} />
          <Metric detail="safe queue" label="Queued for immediate execution" value={dailyFunnel.applicationExecutionToday.queuedForAutomation} />
          <Metric detail="active workers" label="Running now" value={dailyFunnel.applicationExecutionToday.runningNow} />
          <Metric detail="confirmation evidence" label="Submitted today" value={dailyFunnel.applicationExecutionToday.submittedToday} />
          <Metric detail="human-only gates" label="Waiting on Tomas" value={dailyFunnel.applicationExecutionToday.waitingOnTomas} />
          <Metric detail="browser/adapter blockers" label="Technically blocked" value={dailyFunnel.applicationExecutionToday.technicallyBlocked} />
          <Metric detail="retry capped" label="Failed with error" value={dailyFunnel.applicationExecutionToday.failedWithError} />
        </div>
        <div className="career-os-list">
          {opportunities.slice(0, 5).map((opportunity) => (
            <article className="career-os-row" key={String(opportunity.id)}>
              <div>
                <h3>{String(opportunity.title || opportunity.position)}</h3>
                <p>{String(opportunity.company || opportunity.employer)} · {String(opportunity.location || 'Location not verified')}</p>
              </div>
              <strong>{Number(opportunity.fit_score || opportunity.match_score || 0)}%</strong>
            </article>
          ))}
        </div>
      </section>

      <section id="applications" className="career-os-band">
        <h2>Applications</h2>
        <p>{status.submittedApplications} submission{status.submittedApplications === 1 ? '' : 's'} confirmed, {status.remainingQualifiedApplications} qualified application{status.remainingQualifiedApplications === 1 ? '' : 's'} remaining, and {status.totalPackages} package asset{status.totalPackages === 1 ? '' : 's'} generated.</p>
        <p>Release completion: {status.releaseCompletionPercentage.toFixed(1)}%. Actionable progress: {status.actionableProgressPercentage.toFixed(1)}%.</p>
        <div className="career-os-metrics secondary" aria-label="Career OS application status">
          <Metric detail="today" label="Submitted Today" value={pipelineHealth.applicationsSubmittedToday} />
          <Metric detail="all confirmed" label="Total Submitted" value={status.submittedApplications} />
          <Metric detail="safe queue" label="Ready for Automation" value={status.readyForAutomation} />
          <Metric detail="human-only gates" label="Waiting on Tomas" value={status.waitingOnTomas} />
        </div>
        <div className="career-os-list">
          {applications.map((application) => (
            <article className="career-os-row" id={applicationAnchorId(application)} key={String(application.id)}>
              <div>
                <h3>{String(application.position)}</h3>
                <p>{String(application.employer)} · {String(application.lifecycle_stage || 'status unavailable')}</p>
                {application.next_action ? <p>{String(application.next_action)}</p> : null}
                <p>{applicationExecutionLabel(status, application)}</p>
              </div>
              <span>{applicationExecutionStatus(status, application)}</span>
            </article>
          ))}
        </div>
      </section>

      <section id="employers" className="career-os-band">
        <h2>Employer Intelligence</h2>
        <p>{knowledgeBase.employers.length} employer process{knowledgeBase.employers.length === 1 ? '' : 'es'}, {knowledgeBase.questionCatalog.length} question{knowledgeBase.questionCatalog.length === 1 ? '' : 's'}, and {knowledgeBase.questionMappings.length} approved mapping{knowledgeBase.questionMappings.length === 1 ? '' : 's'} are available for reuse.</p>
        <div className="career-os-metrics secondary" aria-label="Career OS employer intelligence">
          {employerIntelligence.map((item) => (
            <Metric detail={item.detail} key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
        <div className="career-os-list">
          {affirmEmployer ? (
            <article className="career-os-row">
              <div>
                <h3>{String(affirmEmployer.canonical_name)}</h3>
                <p>{String(affirmEmployer.ats_platform)} · {String(affirmEmployer.status)} · last verified {formatDate(affirmEmployer.last_verified_at)}</p>
              </div>
              <span>{knowledgeBase.sessionTemplates.length} template{knowledgeBase.sessionTemplates.length === 1 ? '' : 's'}</span>
            </article>
          ) : null}
        </div>
      </section>

      <section id="compensation" className="career-os-band">
        <h2>Compensation and Offers</h2>
        <h3>Your Compensation Policy</h3>
        <p>{dailyWorkflow.compensationPolicyStatus}. Base and total compensation are not interchangeable.</p>
        <h3>Qualified Job Compensation</h3>
        <div className="career-os-list compact">
          {compensationSnapshot.map((item) => (
            <DetailRow detail={item.detail} key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
        <h3>Below-Target Jobs</h3>
        <div className="career-os-list">
          {status.compensationPolicy.belowTargetJobs.length ? status.compensationPolicy.belowTargetJobs.map((job) => (
            <article className="career-os-row" key={`${job.employer}-${job.role}`}>
              <div>
                <h3>{job.employer}: {job.role}</h3>
                <p>{job.reason}</p>
              </div>
              <span>{job.postedMaxUsd ? formatMoney(job.postedMaxUsd) : 'below target'}</span>
            </article>
          )) : (
            <article className="career-os-row">
              <div>
                <h3>No unsupported below-target jobs retained.</h3>
                <p>Sub-$250K posted-base roles require verified total-compensation exception evidence before review.</p>
              </div>
              <span>0</span>
            </article>
          )}
        </div>
      </section>

      <section id="interviews" className="career-os-band">
        <h2>Interviews</h2>
        <p>{pipelineHealth.interviews} interview{pipelineHealth.interviews === 1 ? '' : 's'} recorded from connected production evidence. Application-to-interview conversion is {pipelineHealth.applicationToInterviewConversionRate.toFixed(1)}%.</p>
      </section>

      <section id="contacts" className="career-os-band">
        <h2>Recruiter Activity and Follow-ups</h2>
        <p>{pipelineHealth.recruiterResponses} recruiter response{pipelineHealth.recruiterResponses === 1 ? '' : 's'} and {activitySnapshot.followUps} follow-up{activitySnapshot.followUps === 1 ? '' : 's'} are recorded in production evidence.</p>
        <div className="career-os-list compact">
          {activitySnapshot.rows.map((item) => (
            <DetailRow detail={item.detail} key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </section>

      <section id="documents" className="career-os-band">
        <h2>Resume Performance</h2>
        <p>{resumePerformance.validatedResumes} validated targeted resume{resumePerformance.validatedResumes === 1 ? '' : 's'} and {resumePerformance.packageAssets} package asset{resumePerformance.packageAssets === 1 ? '' : 's'} are tied to the current pipeline.</p>
        <div className="career-os-list compact">
          {resumePerformance.rows.map((item) => (
            <DetailRow detail={item.detail} key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
        <div className="career-os-list">
          {artifacts.slice(0, 5).map((artifact) => (
            <article className="career-os-row" key={String(artifact.id)}>
              <div>
                <h3>{String(artifact.filename)}</h3>
                <p>{String(artifact.artifact_type)} · {String(artifact.validation_status)}</p>
              </div>
              {artifact.drive_url || artifact.storage_url ? <a className="text-link" href={String(artifact.drive_url || artifact.storage_url)}>Open</a> : <span>Stored</span>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ detail, label, value }: { detail?: string; label: string; value: number }) {
  return (
    <div className="career-os-metric">
      <strong>{value}</strong>
      <span>{label}</span>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function DetailRow({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <article className="career-os-row">
      <div>
        <h3>{label}</h3>
        {detail ? <p>{detail}</p> : null}
      </div>
      <span>{value}</span>
    </article>
  );
}

function formatDate(value: unknown) {
  if (!value) return 'not recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(String(value)));
}

function flattenActionQueue(groups: {
  accountMfaCaptchaIdentity: JsonRecord[];
  compensationDecisions: JsonRecord[];
  factualQuestions: JsonRecord[];
  legalPolicyApprovals: JsonRecord[];
  oneClickOrBrowserActions: JsonRecord[];
}) {
  return [
    ...groups.oneClickOrBrowserActions,
    ...groups.factualQuestions,
    ...groups.legalPolicyApprovals,
    ...groups.compensationDecisions,
    ...groups.accountMfaCaptchaIdentity,
  ].map((item) => ({
    applicationsUnlocked: Number(item.applicationsUnlocked || 0),
    employer: String(item.employer || 'Employer'),
    estimatedMinutes: Number(item.estimatedMinutes || 1),
    exactOptions: Array.isArray(item.exactOptions) ? item.exactOptions.map(String) : [],
    exactQuestionOrAction: String(item.exactQuestionOrAction || 'Tomas action required'),
    group: String(item.group || 'factual_questions'),
    resumePath: item.resumePath ? String(item.resumePath) : '',
    role: String(item.role || 'Role'),
  }));
}

function buildApplicationFunnel(status: CareerStatus) {
  return [
    { detail: 'deduped roles', label: 'Unique Opportunities', value: status.totalUniqueOpportunities },
    { detail: 'active qualified jobs', label: 'Qualified', value: status.activeQualifiedOpportunities },
    { detail: `${status.packageAssetsOnQualifiedJobs} package assets`, label: 'Package Coverage', value: status.packagesCoveringQualifiedJobs },
    { detail: 'supported automation queue', label: 'Ready', value: status.readyForAutomation },
    { detail: 'human-only gates', label: 'Waiting', value: status.waitingOnTomas },
    { detail: 'technical or active work', label: 'In Progress', value: status.inProgress },
    { detail: 'confirmation evidence', label: 'Submitted', value: status.submittedApplications },
    { detail: 'closed or incompatible', label: 'Inactive/Ineligible', value: status.inactive + status.ineligible },
  ];
}

function buildResumePerformance(artifacts: JsonRecord[], applications: JsonRecord[], status: CareerStatus) {
  const targetedResumes = artifacts.filter((artifact) => String(artifact.artifact_type) === 'targeted_resume');
  const packageAssets = artifacts.filter((artifact) => String(artifact.artifact_type) === 'application_package').length;
  const validatedResumes = targetedResumes.filter((artifact) => String(artifact.validation_status) === 'passed').length;
  const submittedWithResume = applications.filter((application) => Boolean(application.submission_evidence || application.confirmation_number) && Boolean(application.exact_resume)).length;

  return {
    packageAssets,
    rows: [
      { detail: 'validated artifact count', label: 'Targeted resumes', value: String(validatedResumes) },
      { detail: 'qualified jobs with packages', label: 'Package coverage', value: `${status.packagesCoveringQualifiedJobs}/${status.activeQualifiedOpportunities}` },
      { detail: 'submitted applications with an exact resume path', label: 'Resume-backed submissions', value: String(submittedWithResume) },
      { detail: 'package assets are not job or application counts', label: 'Package assets', value: String(status.totalPackages) },
    ],
    validatedResumes,
  };
}

function buildEmployerIntelligence(knowledgeBase: CareerStatus['evidence']['employerKnowledgeBase']) {
  return [
    { detail: 'saved employer records', label: 'Employers', value: knowledgeBase.employers.length },
    { detail: 'ATS/platform profiles', label: 'Platforms', value: knowledgeBase.platformProfiles.length },
    { detail: 'application process maps', label: 'Processes', value: knowledgeBase.applicationProcesses.length },
    { detail: 'cataloged form questions', label: 'Questions', value: knowledgeBase.questionCatalog.length },
    { detail: 'Tomas-verified autofill mappings', label: 'Mappings', value: knowledgeBase.questionMappings.length },
    { detail: 'reusable session templates', label: 'Templates', value: knowledgeBase.sessionTemplates.length },
  ];
}

function buildCompensationSnapshot(status: CareerStatus, applications: JsonRecord[]) {
  const preferredBase = status.compensationPreference?.preferredMinimumBaseSalaryUsd;
  const offers = status.dailyWorkflow.pipelineHealth.offers;
  const offerApplications = applications.filter((application) => hasAnyText(application.lifecycle_stage, ['offer'])).length;
  const qualifiedRange = status.compensationPolicy.qualifiedPostedBaseRange;
  const allRange = status.compensationPolicy.allDiscoveredPostedCompensationRange;

  return [
    { detail: 'Tomas-approved base-salary strategy', label: 'Preferred base minimum', value: preferredBase ? formatMoney(preferredBase) : 'not set' },
    { detail: 'posted base ranges where max meets or exceeds policy', label: 'Posted base range across jobs meeting policy', value: moneyRangeText(qualifiedRange) },
    { detail: 'all parsed postings, not all are qualified', label: 'Posted compensation across all discovered jobs', value: moneyRangeText(allRange) },
    { detail: 'jobs with posted base max at or above $250K', label: 'Posted base at or above target', value: String(status.compensationPolicy.postedBaseAtOrAboveTarget) },
    { detail: 'approved total-compensation exception evidence', label: 'Approved total-compensation exceptions', value: String(status.compensationPolicy.approvedTotalCompensationExceptions) },
    { detail: 'requires compensation review before submission', label: 'Compensation unknown', value: String(status.compensationPolicy.compensationUnknown) },
    { detail: 'removed from qualified automation unless exception evidence exists', label: 'Below-target removed', value: String(status.compensationPolicy.belowTargetRemoved) },
    { detail: 'offer status in production evidence', label: 'Offers', value: String(Math.max(offers, offerApplications)) },
    { detail: 'Bandwidth remains paused for total-comp target', label: 'Total-comp fields', value: 'pause' },
  ];
}

function buildActivitySnapshot(workflowEvents: JsonRecord[], applications: JsonRecord[]) {
  const followUpApplications = applications.filter((application) => hasAnyText(application.next_action, ['follow', 'reply', 'schedule']));
  const followUpEvents = workflowEvents.filter((event) => hasAnyText(`${event.event_type || ''} ${event.status || ''} ${event.evidence_text || ''}`, ['follow', 'reply', 'schedule']));
  const recruiterResponses = workflowEvents.filter((event) => hasAnyText(`${event.event_type || ''} ${event.status || ''}`, ['recruiter_response', 'recruiter review', 'employer_response']));
  const recentWorkflowEvents = workflowEvents.slice(0, 5);

  return {
    followUps: followUpApplications.length + followUpEvents.length,
    rows: [
      { detail: 'connected workflow events', label: 'Recruiter responses', value: String(recruiterResponses.length) },
      { detail: 'application or workflow follow-up signals', label: 'Follow-ups', value: String(followUpApplications.length + followUpEvents.length) },
      { detail: 'latest persisted workflow records', label: 'Recent activity records', value: String(recentWorkflowEvents.length) },
    ],
  };
}

function buildAutomationHealth(status: CareerStatus) {
  const passedRows = status.verificationRows.filter((row) => row.passed).length;
  const failedRows = status.verificationRows.length - passedRows;
  const latestRun = status.evidence.automationRuns[0];

  return [
    { detail: 'scheduled route', label: 'Cron', value: status.dailyWorkflow.dailySchedule.cron },
    { detail: 'exact next scheduled run', label: 'Next run', value: status.dailyWorkflow.immediateQueueProcessor.nextScheduledRun },
    { detail: 'immediate queue processor', label: 'Queue', value: status.dailyWorkflow.immediateQueueProcessor.status },
    { detail: 'production daily cycle', label: 'Workflow', value: status.dailyWorkflow.status },
    { detail: 'mission verification rows', label: 'Verification', value: `${passedRows}/${status.verificationRows.length} pass` },
    { detail: 'failed rows in current status payload', label: 'Failures', value: String(failedRows) },
    { detail: 'latest automation run type', label: 'Latest run', value: String(latestRun?.run_type || 'not recorded') },
  ];
}

function applicationExecutionStatus(status: CareerStatus, application: JsonRecord) {
  return matchingApplicationExecution(status, application)?.status || (application.submission_evidence ? 'Submitted' : 'Scheduled for next run');
}

function applicationExecutionLabel(status: CareerStatus, application: JsonRecord) {
  const execution = matchingApplicationExecution(status, application);
  if (!execution) return `Scheduled for next run at ${status.applicationExecution.nextScheduledRun}.`;
  if (execution.status === 'Scheduled for next run') return `Scheduled for next run at ${status.applicationExecution.nextScheduledRun}.`;
  return `${execution.status}: ${execution.reason}`;
}

function matchingApplicationExecution(status: CareerStatus, application: JsonRecord) {
  return status.applicationExecution.exactStatuses.find((item) => (
    item.employer.toLowerCase() === String(application.employer || '').toLowerCase()
      && item.role.toLowerCase() === String(application.position || '').toLowerCase()
  ));
}

function nextActionApplicationHref(status: CareerStatus) {
  const label = `${status.nextAction?.label || ''} ${status.nextAction?.reason || ''}`;
  const application = status.evidence.applications.find((item) => label.toLowerCase().includes(String(item.employer || '').toLowerCase()))
    || status.evidence.applications.find((item) => !item.submission_evidence && !item.confirmation_number);
  return application ? `/career-os#${applicationAnchorId(application)}` : '';
}

function applicationAnchorId(application: JsonRecord) {
  const employer = String(application.employer || 'application');
  const id = String(application.id || application.position || employer);
  return `application-${slug(`${employer}-${id}`)}`;
}

function moneyRangeText(range: { complete: boolean; minUsd?: number; maxUsd?: number }) {
  if (!range.complete || !range.minUsd || !range.maxUsd) {
    return 'incomplete';
  }
  return `${formatMoney(range.minUsd)}-${formatMoney(range.maxUsd)}`;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function hasAnyText(value: unknown, terms: string[]) {
  const text = String(value || '').toLowerCase();
  return terms.some((term) => text.includes(term));
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

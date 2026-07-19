import { getCareerOsStatus, summarizeCareerOsStatus } from '@/lib/career-os-status';

export const dynamic = 'force-dynamic';

type CareerStatus = Awaited<ReturnType<typeof getCareerOsStatus>>;
type JsonRecord = Record<string, unknown>;

const navItems = [
  { href: '/career-os', label: 'Home' },
  { href: '#funnel', label: 'Funnel' },
  { href: '#daily', label: 'Daily' },
  { href: '#opportunities', label: 'Opportunities' },
  { href: '#applications', label: 'Applications' },
  { href: '#employers', label: 'Employers' },
  { href: '#compensation', label: 'Compensation' },
  { href: '#interviews', label: 'Interviews' },
  { href: '#contacts', label: 'Contacts' },
  { href: '#documents', label: 'Documents' },
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
  const queueItems = flattenActionQueue(dailyWorkflow.consolidatedActionQueue.groups);
  const applicationFunnel = buildApplicationFunnel(status);
  const resumePerformance = buildResumePerformance(artifacts, applications, status);
  const employerIntelligence = buildEmployerIntelligence(knowledgeBase);
  const compensationSnapshot = buildCompensationSnapshot(status, opportunities, applications);
  const activitySnapshot = buildActivitySnapshot(status.evidence.workflowEvents, applications);
  const automationHealth = buildAutomationHealth(status);
  const nextActionLabel = status.nextAction?.label || queueItems[0]?.exactQuestionOrAction || dailyWorkflow.actionQueueStatus;

  return (
    <main className="career-os-shell">
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
            <Metric label="New Jobs Today" value={pipelineHealth.newOpportunitiesToday} />
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
            <p>Posted compensation across matched jobs: {summary.postedCompensationRange}</p>
            <p>{summary.compensationPreferenceLine}</p>
          </div>
          <div className="cta-row">
            <a className="button primary" href="#applications">Review Applications</a>
          </div>
        </div>

        <aside className="career-os-action" aria-label="Career OS next action">
          <p className="eyebrow">Exact next action</p>
          {status.nextAction ? (
            <>
              <h2>{status.nextAction.label}</h2>
              <p>{status.nextAction.reason}</p>
              {status.nextAction.estimatedMinutes ? <p>Estimated time: {status.nextAction.estimatedMinutes} minute{status.nextAction.estimatedMinutes === 1 ? '' : 's'}.</p> : null}
              {status.nextAction.deepLink ? <a className="button primary" href={status.nextAction.deepLink}>Open Required Step</a> : null}
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
        <p>{status.totalUniqueOpportunities} unique production opportunit{status.totalUniqueOpportunities === 1 ? 'y is' : 'ies are'} represented; {status.activeQualifiedOpportunities} are active qualified jobs; {pipelineHealth.newOpportunitiesToday} job record{pipelineHealth.newOpportunitiesToday === 1 ? '' : 's'} were newly discovered or refreshed today.</p>
        <div className="career-os-metrics secondary" aria-label="Career OS opportunity status">
          <Metric detail="canonical roles" label="Unique Opportunities" value={status.totalUniqueOpportunities} />
          <Metric detail="today" label="New Jobs Discovered" value={pipelineHealth.newOpportunitiesToday} />
          <Metric detail="location or policy" label="Ineligible" value={status.ineligible} />
          <Metric detail="closed or unavailable" label="Inactive" value={status.inactive} />
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
          {applications.slice(0, 5).map((application) => (
            <article className="career-os-row" key={String(application.id)}>
              <div>
                <h3>{String(application.position)}</h3>
                <p>{String(application.employer)} · {String(application.lifecycle_stage || 'status unavailable')}</p>
              </div>
              <span>{application.submission_evidence ? 'Submitted' : 'Not submitted'}</span>
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
        <p>{dailyWorkflow.compensationPolicyStatus}.</p>
        <div className="career-os-list compact">
          {compensationSnapshot.map((item) => (
            <DetailRow detail={item.detail} key={item.label} label={item.label} value={item.value} />
          ))}
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

function buildCompensationSnapshot(status: CareerStatus, opportunities: JsonRecord[], applications: JsonRecord[]) {
  const preferredBase = status.compensationPreference?.preferredMinimumBaseSalaryUsd;
  const postedCompensationCount = opportunities.filter((opportunity) => Number(opportunity.compensation_min_usd || 0) > 0 || Number(opportunity.compensation_max_usd || 0) > 0).length;
  const belowPreferredBase = preferredBase
    ? opportunities.filter((opportunity) => {
      const max = Number(opportunity.compensation_max_usd || 0);
      return max > 0 && max < preferredBase;
    }).length
    : 0;
  const offers = status.dailyWorkflow.pipelineHealth.offers;
  const offerApplications = applications.filter((application) => hasAnyText(application.lifecycle_stage, ['offer'])).length;

  return [
    { detail: 'posted compensation across matched jobs', label: 'Published range', value: compensationRangeText(status) },
    { detail: 'Tomas-approved base-salary strategy', label: 'Preferred base minimum', value: preferredBase ? formatMoney(preferredBase) : 'not set' },
    { detail: 'roles with parsed compensation fields', label: 'Matched jobs with posted comp', value: String(postedCompensationCount) },
    { detail: 'review, not automatic rejection', label: 'Below-base posted max', value: String(belowPreferredBase) },
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
    { detail: 'production daily cycle', label: 'Workflow', value: status.dailyWorkflow.status },
    { detail: 'mission verification rows', label: 'Verification', value: `${passedRows}/${status.verificationRows.length} pass` },
    { detail: 'failed rows in current status payload', label: 'Failures', value: String(failedRows) },
    { detail: 'latest automation run type', label: 'Latest run', value: String(latestRun?.run_type || 'not recorded') },
  ];
}

function compensationRangeText(status: CareerStatus) {
  if (!status.salaryRange?.complete || !status.salaryRange.minUsd || !status.salaryRange.maxUsd) {
    return 'incomplete';
  }
  return `${formatMoney(status.salaryRange.minUsd)}-${formatMoney(status.salaryRange.maxUsd)}`;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function hasAnyText(value: unknown, terms: string[]) {
  const text = String(value || '').toLowerCase();
  return terms.some((term) => text.includes(term));
}

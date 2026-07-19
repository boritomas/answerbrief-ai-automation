import { getCareerOsStatus, summarizeCareerOsStatus } from '@/lib/career-os-status';

export const dynamic = 'force-dynamic';

const navItems = ['Home', 'Daily', 'Opportunities', 'Applications', 'Knowledge', 'Interviews', 'Contacts', 'Documents'];

export default async function CareerOsPage() {
  const status = await getCareerOsStatus();
  const summary = summarizeCareerOsStatus(status);
  const opportunities = status.evidence.jobPostings.length ? status.evidence.jobPostings : status.evidence.seededOpportunities;
  const artifacts = status.evidence.artifacts.filter((artifact) => artifact.artifact_type === 'targeted_resume' || artifact.artifact_type === 'application_package');
  const knowledgeBase = status.evidence.employerKnowledgeBase;
  const affirmEmployer = knowledgeBase.employers.find((employer) => String(employer.id) === 'employer-affirm' || String(employer.canonical_name) === 'Affirm');
  const dailyWorkflow = status.dailyWorkflow;
  const queueItems = flattenActionQueue(dailyWorkflow.consolidatedActionQueue.groups);

  return (
    <main className="career-os-shell">
      <header className="career-os-nav" aria-label="Career OS navigation">
        <a className="brand" href="/career-os">Tomas Career OS</a>
        <nav>
          {navItems.map((item) => (
            <a href={item === 'Home' ? '/career-os' : `#${item.toLowerCase()}`} key={item}>{item}</a>
          ))}
        </nav>
      </header>

      <section className="career-os-home">
        <div className="career-os-briefing">
          <p className="eyebrow">Executive assistant home</p>
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
            <Metric label="New Jobs Today" value={dailyWorkflow.pipelineHealth.newOpportunitiesToday} />
            <Metric label="Submitted Today" value={dailyWorkflow.pipelineHealth.applicationsSubmittedToday} />
            <Metric label="Interviews" value={dailyWorkflow.pipelineHealth.interviews} />
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
          <p className="eyebrow">Next action</p>
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

      <section id="daily" className="career-os-band">
        <h2>Daily Pipeline Health</h2>
        <p>{dailyWorkflow.status} · {dailyWorkflow.dailyReportStatus}</p>
        <p>Daily schedule: {dailyWorkflow.dailySchedule.phases.map((phase) => `${phase.name} ${phase.timeCentral}`).join('; ')}.</p>
        <p>Recruiter responses: {dailyWorkflow.pipelineHealth.recruiterResponses}. Rejections: {dailyWorkflow.pipelineHealth.rejectedByEmployers}. Offers: {dailyWorkflow.pipelineHealth.offers}.</p>
        <p>Automation completion: {dailyWorkflow.pipelineHealth.automationCompletionRate.toFixed(1)}%. Human intervention: {dailyWorkflow.pipelineHealth.humanInterventionRate.toFixed(1)}%.</p>
        <p>Next exact action: {status.nextAction?.label || dailyWorkflow.actionQueueStatus}</p>
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
        <p>{status.totalUniqueOpportunities} unique production opportunit{status.totalUniqueOpportunities === 1 ? 'y is' : 'ies are'} represented; {status.activeQualifiedOpportunities} are active qualified jobs.</p>
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
        <div className="career-os-list">
          {status.evidence.applications.slice(0, 5).map((application) => (
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

      <section id="knowledge" className="career-os-band">
        <h2>Knowledge Base</h2>
        <p>{knowledgeBase.employers.length} employer process{knowledgeBase.employers.length === 1 ? '' : 'es'}, {knowledgeBase.questionCatalog.length} question{knowledgeBase.questionCatalog.length === 1 ? '' : 's'}, and {knowledgeBase.questionMappings.length} approved mapping{knowledgeBase.questionMappings.length === 1 ? '' : 's'} are available for reuse.</p>
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

      <section id="interviews" className="career-os-band">
        <h2>Interviews</h2>
        <p>Interview packages appear here only after a connected production application reaches the interview stage.</p>
      </section>

      <section id="contacts" className="career-os-band">
        <h2>Contacts</h2>
        <p>Recruiter and networking activity appears here when connected sources provide factual production events.</p>
      </section>

      <section id="documents" className="career-os-band">
        <h2>Documents</h2>
        <p>Targeted resumes and application packages appear here only when the artifact exists and validates.</p>
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="career-os-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatDate(value: unknown) {
  if (!value) return 'not recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(String(value)));
}

function flattenActionQueue(groups: {
  accountMfaCaptchaIdentity: Array<Record<string, unknown>>;
  compensationDecisions: Array<Record<string, unknown>>;
  factualQuestions: Array<Record<string, unknown>>;
  legalPolicyApprovals: Array<Record<string, unknown>>;
  oneClickOrBrowserActions: Array<Record<string, unknown>>;
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

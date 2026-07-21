import { getCareerOsStatus, summarizeCareerOsStatus, type CareerOsStatus } from '@/lib/career-os-status';
import { createCareerOsActionToken } from '@/lib/career-os-queue';
import { buildCandidateProfile, type CandidateProfile } from '@/lib/career-os-candidate-profile';
import { ApplicationActionControl, RunNowControl } from './action-controls';
import { HashScroll } from './hash-scroll';

export const dynamic = 'force-dynamic';

type CareerStatus = CareerOsStatus;
type JsonRecord = Record<string, unknown>;
type ActionCenterVariant = 'account' | 'captcha' | 'employment' | 'legal' | 'missing_fact' | 'technical' | 'terminal';
type ActionCenterField = {
  key: string;
  label: string;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  type: 'boolean' | 'currency' | 'month' | 'number' | 'select' | 'text' | 'year';
  value?: string;
};
type ActionCenterCard = {
  application: JsonRecord;
  ats: string;
  completedSteps: string[];
  confirmationDate?: string;
  confirmationHref?: string;
  employer: string;
  estimatedTime: string;
  fields: ActionCenterField[];
  legalApprovalFingerprint?: string;
  legalApprovalSourceUrl?: string;
  legalApprovalText?: string;
  legalApprovalTitle?: string;
  nextStep: string;
  primaryLabel: string;
  reason: string;
  requiredAction: string;
  requisitionId: string;
  role: string;
  statusLabel: 'Confirmed' | 'Duplicate Locked' | 'In Progress' | 'Inactive' | 'Not Submitted' | 'Submitted' | 'Waiting on You';
  supportingLinks: Array<{ href: string; label: string }>;
  variant: ActionCenterVariant;
};

const navItems = [
  { href: '/career-os', label: 'Home' },
  { href: '/career-os#funnel', label: 'Funnel' },
  { href: '/career-os#daily', label: 'Daily' },
  { href: '/career-os#opportunities', label: 'Opportunities' },
  { href: '/career-os#applications', label: 'My Action Center' },
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
  const marketCoverage = dailyWorkflow.marketCoverage;
  const globalLifecycle = status.globalLifecycle;
  const trustedAutoApplyPolicy = status.trustedAutoApplyPolicy;
  const queueItems = flattenActionQueue(dailyWorkflow.consolidatedActionQueue.groups);
  const applicationFunnel = buildApplicationFunnel(status);
  const actionCenterCards = buildActionCenterCards(status);
  const primaryActionCard = actionCenterCards.find((card) => !['terminal', 'technical'].includes(card.variant)) || actionCenterCards[0];
  const resumePerformance = buildResumePerformance(artifacts, applications, status);
  const employerIntelligence = buildEmployerIntelligence(knowledgeBase);
  const compensationSnapshot = buildCompensationSnapshot(status, applications);
  const activitySnapshot = buildActivitySnapshot(status.evidence.workflowEvents, applications);
  const automationHealth = buildAutomationHealth(status);
  const nextActionLabel = primaryActionCard?.primaryLabel || status.nextAction?.label || queueItems[0]?.exactQuestionOrAction || dailyWorkflow.actionQueueStatus;
  const requiredStepHref = primaryActionCard?.supportingLinks[0]?.href || nextActionApplicationHref(status) || '/career-os#applications';
  const nextApplication = primaryActionCard?.application || nextActionApplication(status);
  const nextApplicationCta = primaryActionCard ? actionCenterCardToCta(primaryActionCard) : nextApplication ? applicationExecutionCta(status, nextApplication) : null;
  const actionTokenExpiresAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
  const pageActionToken = createCareerOsActionToken({
    action: 'career_os_page',
    expiresAt: actionTokenExpiresAt,
    ownerEmail: status.evidence.ownerEmail,
  });

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

      {status.environment !== 'production' ? (
        <section className="career-os-alert" role="status">
          <strong>Live Career OS database is temporarily unavailable.</strong>
          <span>{status.blocker || 'Showing the last verified production snapshot. Automation is blocked until live Supabase access is restored.'}</span>
        </section>
      ) : null}

      <section className="career-os-home">
        <div className="career-os-briefing">
          <p className="eyebrow">Executive Summary</p>
          <h1>{summary.greeting}</h1>
          <p className="subhead">{summary.discoveryLine}</p>
          <div className="career-os-metrics" aria-label="Career OS daily status">
            <Metric href="/career-os#opportunities" label="Unique Opportunities" value={status.totalUniqueOpportunities} />
            <Metric href="/career-os#opportunities" label="Qualified Jobs" value={status.activeQualifiedOpportunities} />
            <Metric href="/career-os#applications" label="Applications Remaining" value={status.remainingQualifiedApplications} />
            <Metric href="/career-os#applications" label="Applications Submitted" value={status.submittedApplications} />
          </div>
          <div className="career-os-metrics secondary" aria-label="Career OS execution status">
            <Metric href="/career-os#applications" label="Queued" value={globalLifecycle.applicationsQueued} />
            <Metric href="/career-os#applications" label="Running" value={globalLifecycle.applicationsRunning} />
            <Metric href="/career-os#applications" label="Waiting on You" value={status.waitingOnTomas} />
            <Metric href="/career-os#applications" label="Technical Blockers" value={globalLifecycle.technicallyBlocked} />
          </div>
          <div className="career-os-metrics secondary" aria-label="Career OS daily pipeline health">
            <Metric href="/career-os#daily" label="Raw Records Ever" value={globalLifecycle.totalRawRecordsEverDiscovered} />
            <Metric href="/career-os#opportunities" label="New Jobs Discovered Today" value={pipelineHealth.newOpportunitiesToday} />
            <Metric href="/career-os#applications" label="Submitted Today" value={pipelineHealth.applicationsSubmittedToday} />
            <Metric href="/career-os#interviews" label="Interviews" value={pipelineHealth.interviews} />
          </div>
          <div className="career-os-summary">
            <p>{summary.applyLine}</p>
            <p>{summary.remainingLine}</p>
            <p>{summary.packageLine}</p>
            <p>{summary.packageExplanation}</p>
            <p>{summary.submittedLine}</p>
          <p>{summary.needsLine.replace(/Waiting on Tomas/gi, 'Waiting on You').replace(/applications waiting on Tomas/gi, 'applications waiting on you')}</p>
            <p>{summary.dailyWorkflowLine}</p>
            <p>Posted compensation across all discovered jobs: {summary.postedCompensationRange}</p>
            <p>Qualified posted-base range where the posted maximum meets policy: {summary.qualifiedPostedCompensationRange}</p>
            <p>{summary.compensationPreferenceLine}</p>
            <p>Immediate execution: {dailyWorkflow.immediateQueueProcessor.status}; queued now {dailyWorkflow.immediateQueueProcessor.queuedImmediate}; next scheduled run {dailyWorkflow.immediateQueueProcessor.nextScheduledRun}.</p>
            <p>Autonomous operating status: {trustedAutoApplyPolicy.authority}; ordinary per-application approval required: {trustedAutoApplyPolicy.ordinaryApplicationApprovalRequired ? 'yes' : 'no'}.</p>
          </div>
          <div className="cta-row">
            <a className="button primary" href="/career-os#applications">Review Applications</a>
            <a className="button secondary" href="/career-os#daily">Show All</a>
          </div>
        </div>

        <aside className="career-os-action" aria-label="Career OS next action">
          <p className="eyebrow">My Action Center</p>
          {primaryActionCard ? (
            <>
              <h2>{primaryActionCard.primaryLabel}</h2>
              <p>{primaryActionCard.employer} · {primaryActionCard.role}</p>
              <p>Status: {primaryActionCard.statusLabel}</p>
              <p>Why Career OS paused: {primaryActionCard.reason}</p>
              <p>Your required action: {primaryActionCard.requiredAction}</p>
              <p>Estimated time: {primaryActionCard.estimatedTime}</p>
              {nextApplication && nextApplicationCta ? (
                <ApplicationActionControl
                  actionToken={pageActionToken}
                  actionTokenExpiresAt={actionTokenExpiresAt}
                  actionKind={nextApplicationCta.actionKind}
                  applicationId={String(nextApplication.id)}
                  disabledReason={nextApplicationCta.disabledReason}
                  href={nextApplicationCta.href || requiredStepHref}
                  fields={primaryActionCard.fields}
                  intro={primaryActionCard.nextStep}
                  label={nextApplicationCta.label}
                  legalApprovalFingerprint={primaryActionCard.legalApprovalFingerprint}
                  legalApprovalSourceUrl={primaryActionCard.legalApprovalSourceUrl}
                  legalApprovalText={primaryActionCard.legalApprovalText}
                  legalApprovalTitle={primaryActionCard.legalApprovalTitle}
                  variant={primaryActionCard.variant}
                  whatTomasMustDo={nextApplicationCta.whatTomasMustDo}
                />
              ) : (
                <a className="button primary" href={requiredStepHref}>{primaryActionCard.primaryLabel}</a>
              )}
            </>
          ) : (
            <>
              <h2>No Action Is Waiting on You</h2>
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
            <Metric detail={item.detail} href={item.href} key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </section>

      <section id="daily" className="career-os-band">
        <h2>Daily Automation Health</h2>
        <p>{dailyWorkflow.status} · {dailyWorkflow.dailyReportStatus}</p>
        <p>Autonomous operating status: {dailyWorkflow.autonomousOperatingStatus}.</p>
        <p>Trusted Auto-Apply: {dailyWorkflow.trustedAutoApplyPolicy.authority}; ordinary application approval required: {dailyWorkflow.trustedAutoApplyPolicy.ordinaryApplicationApprovalRequired ? 'yes' : 'no'}; legal fingerprints reuse only when materially identical.</p>
        <p>Daily schedule: {dailyWorkflow.dailySchedule.phases.map((phase) => `${phase.name} ${phase.timeCentral}`).join('; ')}.</p>
        <p>Market search: {marketCoverage.rawJobsReviewed} raw job{marketCoverage.rawJobsReviewed === 1 ? '' : 's'} reviewed across {marketCoverage.employersSearched} employer source{marketCoverage.employersSearched === 1 ? '' : 's'}; {marketCoverage.qualifiedMatches} qualified match{marketCoverage.qualifiedMatches === 1 ? '' : 'es'} found.</p>
        <p>Recruiter responses: {pipelineHealth.recruiterResponses}. Rejections: {pipelineHealth.rejectedByEmployers}. Offers: {pipelineHealth.offers}.</p>
        <p>Automation completion: {pipelineHealth.automationCompletionRate.toFixed(1)}%. Human intervention: {pipelineHealth.humanInterventionRate.toFixed(1)}%.</p>
        <p>Exact next action: {nextActionLabel}</p>
        <p>Immediate queue processor: {dailyWorkflow.immediateQueueProcessor.status}; queued immediate {dailyWorkflow.immediateQueueProcessor.queuedImmediate}; running now {dailyWorkflow.immediateQueueProcessor.runningNow}; submitted this run {dailyWorkflow.immediateQueueProcessor.submittedThisRun}; next scheduled run {dailyWorkflow.immediateQueueProcessor.nextScheduledRun}.</p>
        <RunNowControl actionToken={pageActionToken} actionTokenExpiresAt={actionTokenExpiresAt} ownerEmail={status.evidence.ownerEmail} />
        <h3>Complete Market Search Coverage</h3>
        <div className="career-os-metrics secondary" aria-label="Career OS market search coverage">
          <Metric detail={marketCoverage.discoveryMode.replace(/_/g, ' ')} href="/career-os#employers" label="Employers Searched" value={marketCoverage.employersSearched} />
          <Metric detail={`${marketCoverage.supportedOfficialSources} supported sources`} href="/career-os#employers" label="Career Sites Checked" value={marketCoverage.officialCareerSitesChecked} />
          <Metric detail="official source records" href="/career-os#opportunity-list" label="Raw Jobs Reviewed" value={marketCoverage.rawJobsReviewed} />
          <Metric detail="deduped this cycle" href="/career-os#opportunity-list" label="Newly Unique Jobs" value={dailyFunnel.qualificationToday.newlyUniqueOpportunities} />
          <Metric detail="profile and policy match" href="/career-os#application-list" label="Qualified Matches" value={marketCoverage.qualifiedMatches} />
          <Metric detail="confirmation evidence" href="/career-os#submitted-applications" label="Applications Submitted" value={marketCoverage.applicationsSubmitted} />
          <Metric detail="legal/factual/account/security/comp" href="/career-os#waiting-applications" label="Waiting on You" value={marketCoverage.applicationsWaitingOnTomas} />
          <Metric detail="source or browser adapter" href="/career-os#technical-applications" label="Technical Blockers" value={marketCoverage.technicalBlockers} />
        </div>
        <div className="career-os-list compact">
          <DetailRow detail={`${marketCoverage.unsupportedSourceCandidates} employer candidates need additional ATS adapters before they can be automatically checked.`} label="Unsupported official-source candidates" value={String(marketCoverage.unsupportedSourceCandidates)} />
          <DetailRow detail="Failed sources are isolated so the remaining supported employers keep processing." label="Employer sources failed" value={String(marketCoverage.employerSourcesFailed)} />
        </div>
        <div className="career-os-list">
          {marketCoverage.topTelecomEmployersWithNewMatches.length ? marketCoverage.topTelecomEmployersWithNewMatches.map((item) => (
            <article className="career-os-row" key={`${item.employer}-top-telecom`}>
              <div>
                <h3>{item.employer}</h3>
                <p>Top telecom/connectivity employer with current matching roles.</p>
              </div>
              <span>{item.matches}</span>
            </article>
          )) : (
            <article className="career-os-row">
              <div>
                <h3>No telecom match cluster is available yet.</h3>
                <p>The next daily run will repopulate this from the global supported source plan.</p>
              </div>
              <span>0</span>
            </article>
          )}
        </div>
        {marketCoverage.sourceFailures.length ? (
          <div className="career-os-list">
            {marketCoverage.sourceFailures.map((failure) => (
              <article className="career-os-row" key={`${failure.employer}-${failure.source}`}>
                <div>
                  <h3>{failure.employer}: source failed</h3>
                  <p>{failure.source} · {failure.reason}</p>
                </div>
                <span>retry</span>
              </article>
            ))}
          </div>
        ) : null}
        <h3>Global Lifecycle Counts</h3>
        <div className="career-os-metrics secondary" aria-label="Career OS global lifecycle counts">
          <Metric detail="all discovery history" href="/career-os#opportunity-list" label="Total raw records ever discovered" value={globalLifecycle.totalRawRecordsEverDiscovered} />
          <Metric detail="canonical outcome assigned" href="/career-os#opportunity-list" label="Raw records processed" value={globalLifecycle.rawRecordsProcessed} />
          <Metric detail="pending checkpoint work" href="/career-os#waiting-applications" label="Records awaiting processing" value={globalLifecycle.recordsAwaitingProcessing} />
          <Metric detail="deduped opportunities" href="/career-os#opportunity-list" label="Unique opportunities" value={globalLifecycle.uniqueOpportunities} />
          <Metric detail="historical duplicates" href="/career-os#application-list" label="Duplicates removed" value={globalLifecycle.duplicatesRemoved} />
          <Metric detail="current backlog" href="/career-os#application-list" label="Backlog qualified opportunities" value={globalLifecycle.backlogQualifiedOpportunities} />
          <Metric detail="retry scheduled" href="/career-os#application-list" label="Failed with retry" value={globalLifecycle.failedWithRetry} />
          <Metric detail="retry exhausted" href="/career-os#application-list" label="Permanently failed" value={globalLifecycle.permanentlyFailed} />
        </div>
        <div className="career-os-list compact">
          <DetailRow detail={`Processed ${globalLifecycle.currentBatchProgress.processed}/${globalLifecycle.currentBatchProgress.total}; ${globalLifecycle.currentBatchProgress.remaining} remaining.`} label="Current batch progress" value={`${globalLifecycle.currentBatchProgress.percentage.toFixed(1)}%`} />
          <DetailRow detail={`Processed ${globalLifecycle.historicalBacklogProgress.processed}/${globalLifecycle.historicalBacklogProgress.total}; cursor ${globalLifecycle.historicalBacklogProgress.lastProcessedCursor}.`} label="Historical backlog progress" value={`${globalLifecycle.historicalBacklogProgress.percentage.toFixed(1)}%`} />
          <DetailRow detail="derived from persisted source and automation runs" label="Average records per run" value={globalLifecycle.averageRecordsProcessedPerRun.toFixed(1)} />
          <DetailRow detail="derived from accepted source-run/application evidence" label="Average qualified applications per run" value={globalLifecycle.averageQualifiedApplicationsPerRun.toFixed(1)} />
          <DetailRow detail="derived from automation-run confirmation evidence" label="Average submissions per run" value={globalLifecycle.averageSubmissionsPerRun.toFixed(1)} />
        </div>
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
              {(() => {
                const application = actionQueueApplication(applications, item);
                if (!application) return <a className="button secondary" href="/career-os#applications">Review Applications</a>;
                const cta = applicationExecutionCta(status, application);
                return (
                  <ApplicationActionControl
                    actionToken={pageActionToken}
                    actionTokenExpiresAt={actionTokenExpiresAt}
                    actionKind={cta.actionKind}
                    applicationId={String(application.id)}
                    disabledReason={cta.disabledReason}
                    href={cta.href}
                    label={cta.label}
                    whatTomasMustDo={cta.whatTomasMustDo}
                  />
                );
              })()}
            </article>
          ))}
        </div>
      </section>

      <section id="opportunities" className="career-os-band">
        <h2>Opportunities</h2>
        <p>{status.totalUniqueOpportunities} unique production opportunit{status.totalUniqueOpportunities === 1 ? 'y is' : 'ies are'} represented; {status.activeQualifiedOpportunities} are active qualified jobs; raw activity is separated from qualified opportunities, packages, applications, and submissions.</p>
        <h3>Raw Activity Today</h3>
        <div className="career-os-metrics secondary" aria-label="Career OS opportunity status">
          <Metric detail="records, not applications" href="/career-os#opportunity-list" label="Raw records discovered or refreshed" value={dailyFunnel.rawActivityToday.rawRecordsDiscoveredOrRefreshed} />
          <Metric detail="created today" href="/career-os#opportunity-list" label="Newly discovered records" value={dailyFunnel.rawActivityToday.newlyDiscoveredRecords} />
          <Metric detail="existing records touched" href="/career-os#opportunity-list" label="Existing records refreshed" value={dailyFunnel.rawActivityToday.existingRecordsRefreshed} />
          <Metric detail="dedupe removed" href="/career-os#application-list" label="Duplicates removed" value={dailyFunnel.rawActivityToday.duplicatesRemoved} />
        </div>
        <h3>Qualification Today</h3>
        <div className="career-os-metrics secondary" aria-label="Career OS qualification status">
          <Metric detail="deduped today" href="/career-os#opportunity-list" label="Newly unique opportunities" value={dailyFunnel.qualificationToday.newlyUniqueOpportunities} />
          <Metric detail="official posting active" href="/career-os#opportunity-list" label="Active and verified" value={dailyFunnel.qualificationToday.activeAndVerified} />
          <Metric detail="policy and fit pass" href="/career-os#application-list" label="Qualified" value={dailyFunnel.qualificationToday.qualified} />
          <Metric detail="base max below target" href="/career-os#compensation" label="Below compensation target" value={dailyFunnel.qualificationToday.belowCompensationTarget} />
          <Metric detail="Texas/remote policy" href="/career-os#opportunity-list" label="Location-ineligible" value={dailyFunnel.qualificationToday.locationIneligible} />
          <Metric detail="fit below threshold" href="/career-os#opportunity-list" label="Poor fit" value={dailyFunnel.qualificationToday.poorFit} />
          <Metric detail="closed or unavailable" href="/career-os#opportunity-list" label="Inactive" value={dailyFunnel.qualificationToday.inactive} />
        </div>
        <h3>Application Execution Today</h3>
        <div className="career-os-metrics secondary" aria-label="Career OS application execution today">
          <Metric detail="package assets" href="/career-os#documents" label="Packages created or reused" value={dailyFunnel.applicationExecutionToday.packagesCreatedOrReused} />
          <Metric detail="safe queue" href="/career-os#application-list" label="Queued for immediate execution" value={dailyFunnel.applicationExecutionToday.queuedForAutomation} />
          <Metric detail="active workers" href="/career-os#application-list" label="Running now" value={dailyFunnel.applicationExecutionToday.runningNow} />
          <Metric detail="confirmation evidence" href="/career-os#submitted-applications" label="Submitted today" value={dailyFunnel.applicationExecutionToday.submittedToday} />
          <Metric detail="human-only gates" href="/career-os#waiting-applications" label="Waiting on You" value={dailyFunnel.applicationExecutionToday.waitingOnTomas} />
          <Metric detail="browser/adapter blockers" href="/career-os#technical-applications" label="Technically blocked" value={dailyFunnel.applicationExecutionToday.technicallyBlocked} />
          <Metric detail="retry capped" href="/career-os#application-list" label="Failed with error" value={dailyFunnel.applicationExecutionToday.failedWithError} />
        </div>
        <div className="career-os-list" id="opportunity-list">
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
        <h2>My Action Center</h2>
        <p>{status.waitingOnTomas} active action{status.waitingOnTomas === 1 ? '' : 's'} need your review. Career OS will automatically resume each saved checkpoint after the required action is verified.</p>
        <p>Release completion: {status.releaseCompletionPercentage.toFixed(1)}%. Actionable progress: {status.actionableProgressPercentage.toFixed(1)}%.</p>
        <div className="career-os-metrics secondary" aria-label="Career OS application status">
          <Metric detail="today" href="/career-os#submitted-applications" label="Submitted Today" value={pipelineHealth.applicationsSubmittedToday} />
          <Metric detail="all confirmed" href="/career-os#submitted-applications" label="Total Submitted" value={status.submittedApplications} />
          <Metric detail="safe pre-queue readiness" href="/career-os#application-list" label="Ready for Automation" value={status.readyForAutomation} />
          <Metric detail="safe queue" href="/career-os#application-list" label="Applications Queued" value={status.applicationExecution.queueStates.queued} />
          <Metric detail="active worker" href="/career-os#application-list" label="Applications Running" value={status.applicationExecution.queueStates.running} />
          <Metric detail="human-only gates" href="/career-os#waiting-applications" label="Waiting on You" value={status.waitingOnTomas} />
          <Metric detail="browser/adapter" href="/career-os#technical-applications" label="Technically Blocked" value={status.applicationExecution.queueStates.blocked_technical} />
        </div>
        <div className="career-os-subnav" aria-label="Application filters">
          <a className="button secondary" href="#waiting-applications">My Action Center</a>
          <a className="button secondary" href="#technical-applications">Technical Blockers</a>
          <a className="button secondary" href="#submitted-applications">Submitted</a>
          <a className="button secondary" href="#documents">Documents</a>
        </div>
        <div className="career-os-list compact">
          <DetailRow detail="Human-only gates that require one clear action before automation can continue." id="waiting-applications" label="My Action Center queue" value={String(status.waitingOnTomas)} />
          <DetailRow detail="Browser, upload, CAPTCHA, MFA, or ATS adapter blockers. These are not auto-submitted." id="technical-applications" label="Technical blocker queue" value={String(status.applicationExecution.queueStates.blocked_technical)} />
          <DetailRow detail="Applications with confirmation evidence. These are duplicate-locked and will not be reopened." id="submitted-applications" label="Submitted and locked" value={String(status.submittedApplications)} />
          <DetailRow detail="Validated resumes and package assets used by applications." label="Document package coverage" value={`${status.packagesCoveringQualifiedJobs}/${status.activeQualifiedOpportunities}`} />
        </div>
        <div className="career-os-action-center" id="application-list">
          {actionCenterCards.filter((card) => card.variant !== 'terminal').map((card) => {
            const cta = actionCenterCardToCta(card);
            return (
              <article className="career-os-action-card" id={applicationAnchorId(card.application)} key={String(card.application.id)}>
                <div className="career-os-status-pill">{card.statusLabel}</div>
                <section>
                  <p className="career-os-card-label">Employer and Role</p>
                  <h3>{card.employer}</h3>
                  <p>{card.role}</p>
                  <p>{card.ats} · Requisition {card.requisitionId}</p>
                </section>
                <section>
                  <p className="career-os-card-label">Submission Status</p>
                  <p>{card.statusLabel}{card.confirmationDate ? ` · ${card.confirmationDate}` : ''}</p>
                </section>
                <section>
                  <p className="career-os-card-label">Why Career OS Paused</p>
                  <p>{card.reason}</p>
                </section>
                <section>
                  <p className="career-os-card-label">Your Required Action</p>
                  <p>{card.requiredAction}</p>
                </section>
                <section>
                  <p className="career-os-card-label">What Career OS Already Completed</p>
                  <ul className="career-os-bullets">
                    {card.completedSteps.map((step) => <li key={step}>{step}</li>)}
                  </ul>
                </section>
                <section>
                  <p className="career-os-card-label">What Happens Next</p>
                  <p>{card.nextStep}</p>
                </section>
                <section>
                  <p className="career-os-card-label">Estimated Time</p>
                  <p>{card.estimatedTime}</p>
                </section>
                <ApplicationActionControl
                  actionToken={pageActionToken}
                  actionTokenExpiresAt={actionTokenExpiresAt}
                  actionKind={cta.actionKind}
                  applicationId={String(card.application.id)}
                  disabledReason={cta.disabledReason}
                  fields={card.fields}
                  href={cta.href}
                  intro={card.nextStep}
                  label={card.primaryLabel}
                  legalApprovalFingerprint={card.legalApprovalFingerprint}
                  legalApprovalSourceUrl={card.legalApprovalSourceUrl}
                  legalApprovalText={card.legalApprovalText}
                  legalApprovalTitle={card.legalApprovalTitle}
                  variant={card.variant}
                  whatTomasMustDo={card.requiredAction}
                />
                <div className="career-os-link-row">
                  {card.supportingLinks.map((link) => (
                    <a className="text-link" href={link.href} key={`${card.application.id}-${link.label}`}>{link.label}</a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
        <div className="career-os-list" id="submitted-applications">
          {actionCenterCards.filter((card) => card.variant === 'terminal').map((card) => (
            <article className="career-os-row" key={String(card.application.id)}>
              <div>
                <h3>{card.employer}: {card.role}</h3>
                <p>{card.statusLabel}{card.confirmationDate ? ` · ${card.confirmationDate}` : ''}</p>
                <p>{card.reason}</p>
              </div>
              {card.confirmationHref ? <a className="text-link" href={card.confirmationHref}>View Confirmation</a> : <span>{card.statusLabel}</span>}
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

function Metric({ detail, href, label, value }: { detail?: string; href?: string; label: string; value: number }) {
  const content = (
    <>
      <strong>{value}</strong>
      <span>{label}</span>
      {detail ? <small>{detail}</small> : null}
      <em>{href ? 'Open' : 'Status'}</em>
    </>
  );

  if (href) {
    return (
      <a className="career-os-metric" href={href}>
        {content}
      </a>
    );
  }

  return (
    <div className="career-os-metric">
      {content}
    </div>
  );
}

function DetailRow({ detail, id, label, value }: { detail?: string; id?: string; label: string; value: string }) {
  return (
    <article className="career-os-row" id={id}>
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

function buildActionCenterCards(status: CareerStatus): ActionCenterCard[] {
  return status.applicationExecution.exactStatuses
    .flatMap((execution) => {
      const application = status.evidence.applications.find((item) => String(item.id) === execution.applicationId);
      if (!application) return [];
      const candidate = buildCandidateProfile(
        asRecord(status.evidence.profile).verified_profile,
        asRecord(status.evidence.profile),
        asRecord(application.application_answers),
      );
      const variant = actionCenterVariant(execution, application);
      const supportingLinks = buildSupportingLinks(application, execution);
      return [{
        application,
        ats: actionCenterAts(application),
        completedSteps: completedStepsForCard(application, execution),
        confirmationDate: application.confirmation_number || application.submission_evidence ? formatDate(application.updated_at) : undefined,
        confirmationHref: execution.cta?.actionKind === 'view_confirmation' ? execution.cta.href : supportingLinks.find((item) => /confirmation/i.test(item.label))?.href,
        employer: execution.employer,
        estimatedTime: estimatedTimeForVariant(variant),
        fields: fieldsForCard(variant, candidate, execution, application),
        legalApprovalFingerprint: variant === 'legal' ? `${execution.employer}:${execution.role}:${simpleHash(execution.reason)}` : undefined,
        legalApprovalSourceUrl: supportingLinks[0]?.href,
        legalApprovalText: legalApprovalTextForCard(execution, application),
        legalApprovalTitle: variant === 'legal' ? execution.cta.label : undefined,
        nextStep: whatHappensNext(variant),
        primaryLabel: primaryLabelForVariant(variant, execution),
        reason: plainReason(execution.reason),
        requiredAction: plainRequiredAction(variant, execution),
        requisitionId: actionCenterRequisitionId(application),
        role: execution.role,
        statusLabel: actionCenterStatusLabel(execution.canonicalExecutionState),
        supportingLinks,
        variant,
      }];
    })
    .sort((left, right) => actionCenterCardSort(left) - actionCenterCardSort(right));
}

function actionCenterVariant(execution: CareerStatus['applicationExecution']['exactStatuses'][number], application: JsonRecord): ActionCenterVariant {
  if (['confirmed', 'submitted', 'duplicate', 'inactive', 'ineligible'].includes(execution.canonicalExecutionState)) return 'terminal';
  if (execution.canonicalExecutionState === 'blocked_technical') return 'technical';
  if (execution.cta.actionKind === 'open_security_step') return 'captcha';
  if (execution.cta.actionKind === 'create_or_open_account') return 'account';
  if (execution.cta.actionKind === 'review_legal') return 'legal';
  if (execution.cta.actionKind === 'answer_question' && /employment|from month|to month|employment history/i.test(`${execution.reason} ${execution.cta.label}`)) return 'employment';
  if (execution.cta.actionKind === 'enter_compensation' || execution.cta.actionKind === 'answer_question') return 'missing_fact';
  if (hasAnyText(`${application.next_action || ''} ${execution.reason}`, ['captcha', 'verify you are human', 'security code'])) return 'captcha';
  return 'account';
}

function actionCenterStatusLabel(state: string): ActionCenterCard['statusLabel'] {
  if (state === 'confirmed') return 'Confirmed';
  if (state === 'submitted') return 'Submitted';
  if (state === 'duplicate') return 'Duplicate Locked';
  if (state === 'inactive' || state === 'ineligible') return 'Inactive';
  if (state === 'queued' || state === 'running' || state === 'blocked_technical') return 'In Progress';
  return 'Waiting on You';
}

function actionCenterCardSort(card: ActionCenterCard) {
  return ['employment', 'account', 'legal', 'captcha', 'missing_fact', 'technical', 'terminal'].indexOf(card.variant);
}

function actionCenterAts(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return String(raw.ats_platform || raw.platform || 'ATS').replace(/_/g, ' ');
}

function actionCenterRequisitionId(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return String(
    raw.external_requisition_id
    || raw.requisition_id
    || raw.ats_job_id
    || raw.job_id
    || atsIdFromUrl(raw.canonical_url || raw.application_url)
    || application.opportunity_id
    || 'Not available',
  );
}

function completedStepsForCard(application: JsonRecord, execution: CareerStatus['applicationExecution']['exactStatuses'][number]) {
  const raw = asRecord(application.raw_record);
  const steps = [
    'Opened employer application',
    raw.approved_resume_local_path ? 'Uploaded or prepared the approved resume' : 'Prepared the approved resume package',
    'Completed contact information',
  ];
  if (/sponsorship|authorization/i.test(execution.reason)) steps.push('Completed sponsorship questions');
  if (/employment/i.test(execution.reason)) steps.push('Preserved the employment-history checkpoint');
  if (execution.cta.actionKind === 'create_or_open_account') steps.push('Reached the employer account step');
  if (execution.cta.actionKind === 'review_legal') steps.push('Reached the legal or privacy approval step');
  if (execution.canonicalExecutionState === 'blocked_technical') steps.push('Preserved the technical checkpoint');
  return Array.from(new Set([execution.cta.whatCareerOsCompleted, ...steps].filter(Boolean) as string[]));
}

function buildSupportingLinks(application: JsonRecord, execution: CareerStatus['applicationExecution']['exactStatuses'][number]) {
  const raw = asRecord(application.raw_record);
  const links = [];
  const employerHref = String(raw.confirmation_url || raw.application_url || raw.canonical_url || execution.cta.href || '').trim();
  if (employerHref) links.push({ href: employerHref, label: execution.cta.actionKind === 'view_confirmation' ? 'View Confirmation' : 'View Job Posting' });
  const screenshotPath = String(asRecord(raw.browser_worker_last_report).screenshot_path || asRecord(raw.browser_worker).last_screenshot_path || '').trim();
  if (screenshotPath) links.push({ href: screenshotPath, label: 'View Saved Checkpoint' });
  return links;
}

function fieldsForCard(
  variant: ActionCenterVariant,
  candidate: CandidateProfile,
  execution: CareerStatus['applicationExecution']['exactStatuses'][number],
  application: JsonRecord,
): ActionCenterField[] {
  if (variant === 'employment') {
    const employment = candidate.primaryEmployment;
    return [
      { key: 'employer', label: 'Employer', required: true, type: 'text', value: employment?.employer || candidate.currentCompany || 'Verizon' },
      { key: 'jobTitle', label: 'Job Title', required: true, type: 'text', value: employment?.title || '' },
      { key: 'startMonth', label: 'Start Month', required: /from month/i.test(execution.reason), type: 'month', value: employment?.startMonth || '' },
      { key: 'startYear', label: 'Start Year', required: /from year|from month/i.test(execution.reason), type: 'year', value: employment?.startYear ? String(employment.startYear) : '' },
      { key: 'endMonth', label: 'End Month', required: /to month/i.test(execution.reason), type: 'month', value: employment?.endMonth || '' },
      { key: 'endYear', label: 'End Year', required: /to year|to month/i.test(execution.reason), type: 'year', value: employment?.endYear ? String(employment.endYear) : '' },
      { key: 'currentEmployer', label: 'Currently employed here', required: true, type: 'boolean', value: employment?.currentEmployer ? 'Yes' : 'No' },
    ];
  }
  if (variant !== 'missing_fact') return [];
  const question = `${execution.cta.label} ${execution.reason}`.toLowerCase();
  if (question.includes('compensation')) {
    return [{ key: 'desiredCompensation', label: 'Desired Total Compensation', required: true, type: 'currency', value: '' }];
  }
  if (question.includes('authorization') || question.includes('relocation') || question.includes('previously employed')) {
    return [{ key: 'answer', label: execution.cta.label, required: true, type: 'boolean', value: '' }];
  }
  return [{ key: 'answer', label: execution.cta.label, required: true, type: 'text', value: '' }];
}

function legalApprovalTextForCard(execution: CareerStatus['applicationExecution']['exactStatuses'][number], application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const details = asRecord(asRecord(raw.browser_worker_last_report).details);
  return String(details.legal_text || details.approval_text || execution.reason || application.next_action || '').trim();
}

function whatHappensNext(variant: ActionCenterVariant) {
  if (variant === 'employment') return 'Career OS will resume the saved Workday checkpoint, enter the saved employment details, and verify that the employer form accepts them.';
  if (variant === 'account') return 'Career OS will detect that the employer account step advanced, reopen the saved checkpoint, and continue the application automatically.';
  if (variant === 'legal') return 'Career OS will store this approval with an exact fingerprint, reopen the employer checkpoint, and continue only for matching text.';
  if (variant === 'captcha') return 'Career OS will verify that the visible challenge is gone or the page advanced, then continue the application automatically.';
  if (variant === 'missing_fact') return 'Career OS will save this verified answer, resume the exact application, and verify that the employer form accepts it.';
  if (variant === 'technical') return 'Career OS will keep this out of your action queue until the technical defect is repaired and a safe retry is available.';
  return 'Career OS will keep this requisition locked and will not reopen or resubmit it.';
}

function estimatedTimeForVariant(variant: ActionCenterVariant) {
  if (variant === 'employment') return '2 minutes';
  if (variant === 'account' || variant === 'legal') return '3–5 minutes';
  if (variant === 'captcha') return 'Less than 1 minute';
  if (variant === 'missing_fact') return 'Less than 1 minute';
  return 'Less than 1 minute';
}

function primaryLabelForVariant(variant: ActionCenterVariant, execution: CareerStatus['applicationExecution']['exactStatuses'][number]) {
  if (variant === 'employment') return 'Save Employment Details and Resume';
  if (variant === 'legal') return 'Approve and Resume';
  if (variant === 'captcha') return 'Open Verification Checkpoint';
  if (variant === 'missing_fact') return 'Save Answer and Resume';
  if (variant === 'technical') return 'View Technical Details';
  if (variant === 'terminal') return 'View Confirmation';
  return execution.cta.label || 'Open Employer Workday';
}

function plainReason(reason: string) {
  return reason
    .replace(/waiting_on_tomas_browser_worker|blocked_legal_and_factual_approval_required|blocked_workday_account_required/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function plainRequiredAction(
  variant: ActionCenterVariant,
  execution: CareerStatus['applicationExecution']['exactStatuses'][number],
) {
  if (variant === 'employment') return 'Review the missing employment details below, save them, and let Career OS resume the saved Workday checkpoint.';
  if (variant === 'account') return execution.cta.whatTomasMustDo.replace(/^Tomas must\s*/i, '').replace(/\.$/, '') + '.';
  if (variant === 'legal') return 'Review the exact employer text below, confirm that you approve it, and let Career OS resume the application.';
  if (variant === 'captcha') return 'Open the saved checkpoint, complete the visible verification step, then return so Career OS can check again.';
  if (variant === 'missing_fact') return execution.cta.whatTomasMustDo.replace(/^Tomas must\s*/i, '').replace(/\.$/, '') + '.';
  if (variant === 'technical') return 'No action is required from you right now. Career OS must repair the technical issue before retrying.';
  return 'Review the confirmation evidence for this submitted application.';
}

function actionCenterCardToCta(card: ActionCenterCard) {
  const executionCta = {
    actionKind: card.variant === 'employment' || card.variant === 'missing_fact' || card.variant === 'legal'
      ? 'answer_question'
      : card.variant === 'terminal'
        ? 'view_confirmation'
        : card.variant === 'technical'
          ? 'view_technical_blocker'
          : card.variant === 'captcha'
            ? 'open_security_step'
            : 'create_or_open_account',
    applicationsUnlocked: 1,
    disabledReason: card.variant === 'technical' ? 'Career OS is handling this technical issue.' : '',
    href: card.supportingLinks[0]?.href || `/career-os#${applicationAnchorId(card.application)}`,
    label: card.primaryLabel,
    whatTomasMustDo: card.requiredAction,
  };
  return executionCta;
}

function buildApplicationFunnel(status: CareerStatus) {
  return [
    { detail: 'deduped roles', href: '/career-os#opportunity-list', label: 'Unique Opportunities', value: status.totalUniqueOpportunities },
    { detail: 'active qualified jobs', href: '/career-os#application-list', label: 'Qualified', value: status.activeQualifiedOpportunities },
    { detail: `${status.packageAssetsOnQualifiedJobs} package assets`, href: '/career-os#documents', label: 'Package Coverage', value: status.packagesCoveringQualifiedJobs },
    { detail: 'supported automation queue', href: '/career-os#application-list', label: 'Queued', value: status.applicationExecution.queueStates.queued },
    { detail: 'active ATS execution', href: '/career-os#application-list', label: 'Running', value: status.applicationExecution.queueStates.running },
    { detail: 'human-only gates', href: '/career-os#waiting-applications', label: 'Waiting', value: status.waitingOnTomas },
    { detail: 'technical or active work', href: '/career-os#technical-applications', label: 'In Progress', value: status.inProgress },
    { detail: 'confirmation evidence', href: '/career-os#submitted-applications', label: 'Confirmed', value: status.applicationExecution.queueStates.confirmed },
    { detail: 'closed or incompatible', href: '/career-os#application-list', label: 'Inactive/Ineligible', value: status.inactive + status.ineligible },
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
    { detail: 'complete-result-set processing', label: 'Backlog', value: `${status.globalLifecycle.historicalBacklogProgress.percentage.toFixed(1)}%` },
    { detail: 'per-application canonical states', label: 'Processed apps', value: String(status.applicationExecution.applicationsProcessedToday) },
    { detail: 'mission verification rows', label: 'Verification', value: `${passedRows}/${status.verificationRows.length} pass` },
    { detail: 'failed rows in current status payload', label: 'Failures', value: String(failedRows) },
    { detail: 'latest automation run type', label: 'Latest run', value: String(latestRun?.run_type || 'not recorded') },
  ];
}

function applicationExecutionLabel(status: CareerStatus, application: JsonRecord) {
  const execution = matchingApplicationExecution(status, application);
  if (!execution) return `Scheduled for next run at ${status.applicationExecution.nextScheduledRun}.`;
  if (execution.status === 'Scheduled for next run') return `Scheduled for next run at ${status.applicationExecution.nextScheduledRun}.`;
  return `${execution.status}: ${execution.reason}`;
}

function applicationCanonicalExecutionState(status: CareerStatus, application: JsonRecord) {
  return matchingApplicationExecution(status, application)?.canonicalExecutionState || 'qualification_pending';
}

function applicationExecutionCta(status: CareerStatus, application: JsonRecord) {
  const execution = matchingApplicationExecution(status, application);
  if (execution?.cta?.actionKind === 'upload_resume' && !/^https?:\/\//i.test(execution.cta.href || '')) {
    return {
      ...execution.cta,
      href: '/career-os#documents',
      label: 'Open Resume Package',
      whatTomasMustDo: 'Open the prepared resume/package section, use the exact validated resume for the employer checkpoint, then click Done - Resume Automation.',
    };
  }
  return execution?.cta || {
    actionKind: 'continue_application',
    applicationsUnlocked: 1,
    disabledReason: '',
    href: `/career-os#${applicationAnchorId(application)}`,
    kind: 'internal' as const,
    label: 'Review record',
    serverAction: '/api/career-os/actions' as const,
    whatCareerOsCompleted: 'Career OS preserved this application checkpoint.',
    whatTomasMustDo: 'Review the checkpoint, then resume automation if no legal, factual, security, or browser blocker remains.',
  };
}

function actionQueueApplication(applications: JsonRecord[], item: ReturnType<typeof flattenActionQueue>[number]) {
  const employer = item.employer.toLowerCase();
  const role = item.role.toLowerCase();
  const activeApplications = applications.filter((application) => (
    !application.confirmation_number
      && !application.submission_evidence
      && applicationHasActiveAction(applicationCanonicalStateFromRaw(application))
  ));

  return activeApplications.find((application) => (
    String(application.employer || '').toLowerCase() === employer
      && String(application.position || '').toLowerCase() === role
  ))
    || activeApplications.find((application) => (
      employer !== 'employer'
        && String(application.employer || '').toLowerCase() === employer
    ));
}

function matchingApplicationExecution(status: CareerStatus, application: JsonRecord) {
  return status.applicationExecution.exactStatuses.find((item) => (
    item.employer.toLowerCase() === String(application.employer || '').toLowerCase()
      && item.role.toLowerCase() === String(application.position || '').toLowerCase()
  ));
}

function nextActionApplicationHref(status: CareerStatus) {
  const application = nextActionApplication(status);
  return application ? `/career-os#${applicationAnchorId(application)}` : '';
}

function nextActionApplication(status: CareerStatus) {
  const employer = String(status.nextAction?.employer || '').toLowerCase();
  const role = String(status.nextAction?.role || '').toLowerCase();
  const label = `${status.nextAction?.label || ''} ${status.nextAction?.reason || ''}`.toLowerCase();

  return status.evidence.applications.find((item) => (
    employer
      && String(item.employer || '').toLowerCase() === employer
      && (!role || String(item.position || '').toLowerCase() === role)
  ))
    || status.evidence.applications.find((item) => label.includes(String(item.employer || '').toLowerCase()))
    || status.evidence.applications.find((item) => !item.submission_evidence && !item.confirmation_number);
}

function applicationAnchorId(application: JsonRecord) {
  const employer = String(application.employer || 'application');
  const id = String(application.id || application.position || employer);
  return `application-${slug(`${employer}-${id}`)}`;
}

function applicationHasActiveAction(state: string) {
  return !['confirmed', 'submitted', 'duplicate', 'inactive', 'ineligible', 'failed'].includes(state);
}

function applicationTerminalLabel(state: string) {
  if (state === 'confirmed' || state === 'submitted') return 'Submitted';
  if (state === 'duplicate') return 'Duplicate locked';
  if (state === 'ineligible') return 'Ineligible';
  if (state === 'inactive') return 'Inactive';
  if (state === 'failed') return 'Failed';
  return 'No action';
}

function applicationCanonicalStateFromRaw(application: JsonRecord) {
  const text = `${application.lifecycle_stage || ''} ${application.next_action || ''} ${JSON.stringify(application.raw_record || {})}`.toLowerCase();
  if (application.confirmation_number || application.submission_evidence) return 'confirmed';
  if (text.includes('duplicate')) return 'duplicate';
  if (text.includes('ineligible')) return 'ineligible';
  if (/(inactive|closed|expired|unavailable)/.test(text)) return 'inactive';
  if (text.includes('failed')) return 'failed';
  return 'actionable';
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

function atsIdFromUrl(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.searchParams.get('gh_jid')
      || url.searchParams.get('token')
      || url.pathname.match(/\/(?:jobs|job|roles)\/(\d{5,})\b/i)?.[1]
      || '';
  } catch {
    return text.match(/[?&](?:gh_jid|token)=(\d{5,})/i)?.[1] || '';
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function simpleHash(value: unknown) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return String(hash);
}

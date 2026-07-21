import { getCareerOsStatus } from '@/lib/career-os-status';
import { createCareerOsActionToken } from '@/lib/career-os-queue';
import { RunNowControl } from '../action-controls';
import { HashScroll } from '../hash-scroll';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

export default async function CareerOsAdminPage() {
  const status = await getCareerOsStatus();
  const dailyWorkflow = status.dailyWorkflow;
  const marketCoverage = dailyWorkflow.marketCoverage;
  const globalLifecycle = status.globalLifecycle;
  const knowledgeBase = status.evidence.employerKnowledgeBase;
  const artifacts = status.evidence.artifacts.filter((artifact) => artifact.artifact_type === 'targeted_resume' || artifact.artifact_type === 'application_package');
  const actionTokenExpiresAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
  const pageActionToken = createCareerOsActionToken({
    action: 'career_os_admin_page',
    expiresAt: actionTokenExpiresAt,
    ownerEmail: status.evidence.ownerEmail,
  });
  const navItems = [
    { href: '/career-os', label: 'Home' },
    { href: '/career-os#review-queue', label: 'My Review Queue' },
    { href: '/career-os#action-center', label: 'My Action Center' },
    { href: '/career-os#applications', label: 'Applications' },
    { href: '/career-os/admin', label: 'Admin' },
  ];

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
          <p className="eyebrow">Admin</p>
          <h1>Operational Detail</h1>
          <p className="subhead">The candidate experience stays focused on decisions and applications. This view keeps the operational metrics available when you need them.</p>
          <div className="career-os-metrics" aria-label="Career OS admin summary">
            <Metric href="#daily" label="New Jobs Discovered Today" value={dailyWorkflow.pipelineHealth.newOpportunitiesToday} />
            <Metric href="#funnel" label="Ready for Automation" value={status.readyForAutomation} />
            <Metric href="#system-health" label="Technical Blockers" value={status.applicationExecution.queueStates.blocked_technical} />
            <Metric href="#documents" label="Package Coverage" value={status.packagesCoveringQualifiedJobs} />
          </div>
        </div>
        <aside className="career-os-action">
          <p className="eyebrow">Daily Automation Health</p>
          <h2>{dailyWorkflow.status}</h2>
          <p>{dailyWorkflow.dailyReportStatus}</p>
          <p>Autonomous operating status: {dailyWorkflow.autonomousOperatingStatus}.</p>
          <p>Next scheduled run: {dailyWorkflow.immediateQueueProcessor.nextScheduledRun}.</p>
          <RunNowControl actionToken={pageActionToken} actionTokenExpiresAt={actionTokenExpiresAt} ownerEmail={status.evidence.ownerEmail} />
        </aside>
      </section>

      <section className="career-os-band" id="daily">
        <h2>Daily Automation Health</h2>
        <div className="career-os-metrics secondary">
          <Metric detail="All production history" label="Raw Records Ever" value={globalLifecycle.totalRawRecordsEverDiscovered} />
          <Metric detail="This daily cycle" label="New Jobs Discovered Today" value={dailyWorkflow.pipelineHealth.newOpportunitiesToday} />
          <Metric detail="This daily cycle" label="Submitted Today" value={dailyWorkflow.pipelineHealth.applicationsSubmittedToday} />
          <Metric detail="Confirmed live replies" label="Recruiter Responses" value={dailyWorkflow.pipelineHealth.recruiterResponses} />
        </div>
        <div className="career-os-list compact">
          <DetailRow detail="Production cron path." label="Daily Run Path" value={dailyWorkflow.dailySchedule.cron} />
          <DetailRow detail="Immediate execution status." label="Queue Processor" value={dailyWorkflow.immediateQueueProcessor.status} />
          <DetailRow detail="Applications currently claimed." label="Running Now" value={String(dailyWorkflow.immediateQueueProcessor.runningNow)} />
          <DetailRow detail="Applications submitted in the current run." label="Submitted This Run" value={String(dailyWorkflow.immediateQueueProcessor.submittedThisRun)} />
        </div>
      </section>

      <section className="career-os-band" id="funnel">
        <h2>Funnel</h2>
        <div className="career-os-metrics secondary">
          <Metric detail="Deduped opportunities" label="Unique Opportunities" value={status.totalUniqueOpportunities} />
          <Metric detail="Policy and fit match" label="Qualified Jobs" value={status.activeQualifiedOpportunities} />
          <Metric detail="Awaiting Tomas review" label="Review Queue" value={status.reviewQueue.total} />
          <Metric detail="Human-only gates" label="Waiting on Tomas" value={status.waitingOnTomas} />
          <Metric detail="Safe queue" label="Queued" value={status.applicationExecution.queueStates.queued} />
          <Metric detail="Active browser work" label="Running" value={status.applicationExecution.queueStates.running} />
          <Metric detail="Confirmation evidence" label="Submitted" value={status.submittedApplications} />
          <Metric detail="Closed or incompatible" label="Inactive/Ineligible" value={status.inactive + status.ineligible} />
        </div>
      </section>

      <section className="career-os-band">
        <h2>Discovery and Coverage</h2>
        <div className="career-os-metrics secondary">
          <Metric detail="Supported employer sources" label="Employers Searched" value={marketCoverage.employersSearched} />
          <Metric detail="Official sources checked" label="Career Sites Checked" value={marketCoverage.officialCareerSitesChecked} />
          <Metric detail="Official source records" label="Raw Jobs Reviewed" value={marketCoverage.rawJobsReviewed} />
          <Metric detail="Profile and policy match" label="Qualified Matches" value={marketCoverage.qualifiedMatches} />
        </div>
        <div className="career-os-list compact">
          <DetailRow detail="Not yet supported for automation." label="Unsupported Sources" value={String(marketCoverage.unsupportedSourceCandidates)} />
          <DetailRow detail="Failed sources are isolated from the rest of the run." label="Source Failures" value={String(marketCoverage.employerSourcesFailed)} />
          <DetailRow detail="Historical duplicate records removed from active pipeline counts." label="Duplicates Removed" value={String(globalLifecycle.duplicatesRemoved)} />
          <DetailRow detail="Qualified opportunity backlog across all active records." label="Backlog Qualified Opportunities" value={String(globalLifecycle.backlogQualifiedOpportunities)} />
        </div>
      </section>

      <section className="career-os-band" id="system-health">
        <h2>System Health</h2>
        <div className="career-os-list compact">
          <DetailRow detail="Applications waiting for technical recovery." label="Technical Blockers" value={String(status.applicationExecution.queueStates.blocked_technical)} />
          <DetailRow detail="Applications already safe to continue automatically." label="Ready for Automation" value={String(status.readyForAutomation)} />
          <DetailRow detail="Queued browser-worker states." label="Queued" value={String(status.applicationExecution.queueStates.queued)} />
          <DetailRow detail="Active browser-worker states." label="Running" value={String(status.applicationExecution.queueStates.running)} />
          <DetailRow detail="Exact statuses produced by the canonical execution classifier." label="Applications Processed Today" value={String(status.applicationExecution.applicationsProcessedToday)} />
          <DetailRow detail="Last verified production status timestamp." label="Generated At" value={status.generatedAt} />
        </div>
      </section>

      <section className="career-os-band">
        <h2>Employers and Knowledge Base</h2>
        <div className="career-os-metrics secondary">
          <Metric detail="Employer process records" label="Employers" value={knowledgeBase.employers.length} />
          <Metric detail="Platform profiles" label="Platforms" value={knowledgeBase.platformProfiles.length} />
          <Metric detail="Application process records" label="Processes" value={knowledgeBase.applicationProcesses.length} />
          <Metric detail="Saved employer form questions" label="Questions" value={knowledgeBase.questionCatalog.length} />
        </div>
        <div className="career-os-list compact">
          <DetailRow detail="Tomas-verified mappings only." label="Question Mappings" value={String(knowledgeBase.questionMappings.length)} />
          <DetailRow detail="Reusable browser-session templates." label="Session Templates" value={String(knowledgeBase.sessionTemplates.length)} />
          <DetailRow detail="Known employer accounts." label="Employer Accounts" value={String(knowledgeBase.employerAccounts.length)} />
          <DetailRow detail="Top-level onboarding facts stay in production." label="Production Evidence" value={status.productionEvidenceReady ? 'ready' : 'incomplete'} />
        </div>
      </section>

      <section className="career-os-band">
        <h2>Compensation and Contacts</h2>
        <div className="career-os-list compact">
          <DetailRow detail="Preferred minimum base salary remains separate from employer market data." label="Preferred Base Minimum" value={status.compensationPreference?.preferredMinimumBaseSalaryUsd ? formatMoney(status.compensationPreference.preferredMinimumBaseSalaryUsd) : 'not set'} />
          <DetailRow detail="Qualified postings whose posted maximum meets policy." label="Qualified Posted Base Range" value={moneyRangeText(status.compensationPolicy.qualifiedPostedBaseRange)} />
          <DetailRow detail="All discovered postings with parsed compensation." label="All Posted Compensation" value={moneyRangeText(status.compensationPolicy.allDiscoveredPostedCompensationRange)} />
          <DetailRow detail="Recruiter responses in the live production record." label="Recruiter Responses" value={String(dailyWorkflow.pipelineHealth.recruiterResponses)} />
        </div>
      </section>

      <section className="career-os-band" id="documents">
        <h2>Documents</h2>
        <div className="career-os-list compact">
          <DetailRow detail="Targeted resume and application-package artifacts." label="Package Assets" value={String(artifacts.length)} />
          <DetailRow detail="Qualified jobs covered by at least one approved package." label="Package Coverage" value={`${status.packagesCoveringQualifiedJobs}/${status.activeQualifiedOpportunities}`} />
          <DetailRow detail="Total saved package assets in production." label="Total Packages" value={String(status.totalPackages)} />
          <DetailRow detail="Package assets on active qualified jobs." label="Assets on Qualified Jobs" value={String(status.packageAssetsOnQualifiedJobs)} />
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
    return <a className="career-os-metric" href={href}>{content}</a>;
  }

  return <div className="career-os-metric">{content}</div>;
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

function moneyRangeText(range: { complete: boolean; maxUsd?: number; minUsd?: number }) {
  if (!range.complete || !range.minUsd || !range.maxUsd) return 'incomplete';
  return `${formatMoney(range.minUsd)}-${formatMoney(range.maxUsd)}`;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

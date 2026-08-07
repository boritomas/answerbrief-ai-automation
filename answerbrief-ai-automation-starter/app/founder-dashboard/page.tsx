import { createCareerOsActionToken } from '@/lib/career-os-queue';
import { browserWorkerHealth } from '@/lib/career-os-browser-worker';
import { getCareerOsStatus } from '@/lib/career-os-status';
import { FounderRunControls } from './founder-run-controls';
import { QualifiedRoleControls } from './qualified-role-controls';
import styles from './founder-dashboard.module.css';

export const dynamic = 'force-dynamic';

type Metric = { label: string; value: string | number; note: string };
type PipelineStage = { label: string; value: number };
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

export default async function FounderDashboardPage() {
  const status = await getCareerOsStatus();
  const workerHealth = await browserWorkerHealth(status.evidence.ownerEmail).catch(() => null);
  const trust = status.operationalTrust;
  const counts = trust.verifiedCounts;
  const workflow = status.dailyWorkflow;
  const pipelineHealth = workflow.pipelineHealth;
  const execution = status.applicationExecution;
  const queueStates = execution.queueStates;
  const actionTokenExpiresAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
  const runNowToken = createCareerOsActionToken({
    action: 'run_now',
    expiresAt: actionTokenExpiresAt,
    ownerEmail: status.evidence.ownerEmail,
  });
  const refreshDiscoveryToken = createCareerOsActionToken({
    action: 'refresh_discovery',
    expiresAt: actionTokenExpiresAt,
    ownerEmail: status.evidence.ownerEmail,
  });
  const reviewOpportunityToken = createCareerOsActionToken({
    action: 'review_opportunity',
    expiresAt: actionTokenExpiresAt,
    ownerEmail: status.evidence.ownerEmail,
  });

  const qualifiedRoles = status.evidence.jobPostings
    .map((posting) => asRecord(posting))
    .filter((posting) => {
      const raw = asRecord(posting.raw_record);
      const fitScore = Number(posting.fit_score || 0);
      const postingStatus = String(posting.status || '').toLowerCase();
      const reviewDecision = String(raw.review_decision || '').toLowerCase();
      return fitScore >= 85
        && !['approve', 'approved', 'reject_similar', 'skip', 'hidden'].includes(reviewDecision)
        && !['inactive', 'ineligible', 'poor_fit', 'duplicate'].some((value) => postingStatus.includes(value));
    })
    .sort((left, right) => Number(right.fit_score || 0) - Number(left.fit_score || 0))
    .map((posting) => {
      const raw = asRecord(posting.raw_record);
      return {
        id: String(posting.id || ''),
        company: String(posting.company || 'Employer'),
        title: String(posting.title || 'Role'),
        location: String(posting.location || 'Location not published'),
        fitScore: Number(posting.fit_score || 0),
        applicationUrl: String(posting.canonical_url || posting.job_url || raw.canonical_url || ''),
      };
    })
    .filter((role) => Boolean(role.id));

  const approvedOrQueued = queueStates.queued + queueStates.package_ready;
  const activeApplications = counts.reviewQueue + counts.actionCenter + counts.readyToResume + counts.applying;
  const workerState = workflow.immediateQueueProcessor.runningNow > 0
    ? 'Running'
    : counts.systemIssues > 0
      ? 'Blocked'
      : 'Idle';
  const workerProgress = queueStates.running > 0
    ? `${execution.applicationsProcessedToday} processed today; ${queueStates.running} running`
    : `${execution.applicationsProcessedToday} processed today`;

  const metrics: Metric[] = [
    { label: 'Applications submitted', value: counts.submitted, note: 'Verified submitted applications' },
    { label: 'Active applications', value: activeApplications, note: 'Verified review, action, resume, and applying states' },
    { label: 'Recruiter responses', value: pipelineHealth.recruiterResponses, note: 'Confirmed recruiter responses in production' },
    { label: 'Interviews scheduled', value: counts.interviews, note: 'Verified interview evidence' },
    { label: 'Offers', value: 0, note: 'No verified offer record connected yet' },
  ];

  const pipeline: PipelineStage[] = [
    { label: 'Discovered', value: workflow.marketCoverage.rawJobsReviewed },
    { label: 'Qualified', value: workflow.marketCoverage.qualifiedMatches },
    { label: 'Review Queue', value: counts.reviewQueue },
    { label: 'Action Center', value: counts.actionCenter },
    { label: 'Applying', value: counts.applying },
    { label: 'Submitted', value: counts.submitted },
    { label: 'Interview', value: counts.interviews },
    { label: 'Closed', value: 0 },
  ];

  const workerDetails = [
    ['Worker state', workerState],
    ['Queue processor', workflow.immediateQueueProcessor.status],
    ['Running now', String(workflow.immediateQueueProcessor.runningNow)],
    ['Queued', String(queueStates.queued)],
    ['Retry scheduled', String(queueStates.retry_scheduled)],
    ['Waiting on Tomas', String(counts.actionCenter)],
    ['Technical blockers', String(counts.systemIssues)],
    ['Progress', workerProgress],
    ['Last verified refresh', status.generatedAt],
  ];

  const intelligence = [
    ['Current resume version', status.evidence.artifacts.some((artifact) => artifact.artifact_type === 'targeted_resume') ? 'Targeted resume available' : 'No verified targeted resume'],
    ['ATS score', 'Use per-role package evidence'],
    ['Resume health', 'Use verified package evidence'],
    ['AI readiness', status.productionEvidenceReady ? 'Production evidence ready' : 'Evidence incomplete'],
    ['Last status refresh', status.generatedAt],
  ];

  const priorities = [
    counts.actionCenter > 0 ? `Resolve ${counts.actionCenter} verified action-center item${counts.actionCenter === 1 ? '' : 's'}` : 'No verified human-action items',
    counts.readyToResume > 0 ? `Resume ${counts.readyToResume} verified application checkpoint${counts.readyToResume === 1 ? '' : 's'}` : 'No verified resumable checkpoints',
    qualifiedRoles.length > 0 ? `Approve one of ${qualifiedRoles.length} highest-fit qualified roles below` : 'Continue sourcing and submitting qualified roles',
  ];

  const activity = [
    { label: 'Last autonomous run', value: workflow.status, detail: workflow.dailyReportStatus },
    { label: 'Queue processor', value: workflow.immediateQueueProcessor.status, detail: `${workflow.immediateQueueProcessor.runningNow} running now; ${workflow.immediateQueueProcessor.submittedThisRun} submitted this run` },
    { label: 'Next scheduled run', value: workflow.immediateQueueProcessor.nextScheduledRun, detail: `Generated ${status.generatedAt}` },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Founder validation</p>
          <h1>Founder Success Dashboard</h1>
          <p className={styles.subtitle}>Live, verified Career OS production data for Tomas&apos;s executive job search.</p>
        </div>
        <a className={styles.homeLink} href="/career-os">Open Career OS</a>
      </header>

      <section className={styles.panel} aria-label="Career OS production controls">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Production controls</p>
            <h2>Run Career OS</h2>
            <p>Refresh official job sources, queue eligible applications, and refresh verified status from one place.</p>
          </div>
          <span className={styles.badge}>{workflow.immediateQueueProcessor.status}</span>
        </div>
        <FounderRunControls
          approvedCount={approvedOrQueued}
          eligibleCount={workerHealth?.eligible}
          ownerEmail={status.evidence.ownerEmail}
          refreshDiscoveryToken={refreshDiscoveryToken}
          runNowToken={runNowToken}
          tokenExpiresAt={actionTokenExpiresAt}
        />
      </section>

      <section className={styles.panel} aria-label="Qualified roles ready for founder approval">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Production unlock</p>
            <h2>Approve qualified roles</h2>
            <p>Select every role you want, approve them together, then submit manually or start the approved automation queue.</p>
          </div>
          <span className={styles.badge}>{qualifiedRoles.length} qualified</span>
        </div>
        <QualifiedRoleControls
          actionToken={reviewOpportunityToken}
          ownerEmail={status.evidence.ownerEmail}
          roles={qualifiedRoles}
          tokenExpiresAt={actionTokenExpiresAt}
        />
      </section>

      <section className={styles.panel} aria-label="Browser worker status">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Browser worker</p>
            <h2>Live execution status</h2>
            <p>Verified queue, progress, blocker, and refresh information from the Career OS runtime.</p>
          </div>
          <span className={styles.badge}>{workerState}</span>
        </div>
        <dl className={styles.intelligenceList}>
          {workerDetails.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        <p><a className={styles.homeLink} href="/career-os#applications">View current applications and checkpoints</a></p>
      </section>

      <section className={styles.metricGrid} aria-label="Founder success metrics">
        {metrics.map((metric) => (
          <article className={styles.metricCard} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></article>
        ))}
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Application pipeline</p><h2>Current verified funnel</h2></div>
          <span className={styles.badge}>Live production data</span>
        </div>
        <div className={styles.pipeline}>{pipeline.map((stage) => <article className={styles.stage} key={stage.label}><strong>{stage.value}</strong><span>{stage.label}</span></article>)}</div>
      </section>

      <section className={styles.twoColumn}>
        <article className={styles.panel}>
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Resume intelligence</p><h2>Current application package</h2></div></div>
          <dl className={styles.intelligenceList}>{intelligence.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </article>
        <article className={styles.panel}>
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Daily focus</p><h2>Next actions</h2></div></div>
          <ul className={styles.priorityList}>{priorities.map((priority) => <li key={priority}><span aria-hidden="true">-</span>{priority}</li>)}</ul>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Activity</p><h2>Production status</h2></div></div>
        <dl className={styles.intelligenceList}>{activity.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd><small>{item.detail}</small></div>)}</dl>
      </section>
    </main>
  );
}

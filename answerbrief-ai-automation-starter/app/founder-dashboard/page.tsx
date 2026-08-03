import { createCareerOsActionToken } from '@/lib/career-os-queue';
import { getCareerOsStatus } from '@/lib/career-os-status';
import { FounderRunControls } from './founder-run-controls';
import styles from './founder-dashboard.module.css';

export const dynamic = 'force-dynamic';

export default async function FounderSuccessDashboard() {
  const status = await getCareerOsStatus();
  const trust = status.operationalTrust;
  const exec = status.applicationExecution;
  const queueStates = exec.queueStates;
  const actionTokenExpiresAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
  const runNowToken = createCareerOsActionToken({ action: 'run_now', expiresAt: actionTokenExpiresAt, ownerEmail: status.evidence.ownerEmail });
  const refreshDiscoveryToken = createCareerOsActionToken({ action: 'refresh_discovery', expiresAt: actionTokenExpiresAt, ownerEmail: status.evidence.ownerEmail });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Career OS — Founder Success Dashboard</p>
          <h1>Production Status</h1>
          <p className={styles.subtitle}>Live production data — all counts sourced from verified application records.</p>
        </div>
        <a className={styles.homeLink} href="/career-os">Career OS home</a>
      </header>

      <section className={styles.metricGrid} aria-label="Application pipeline">
        <article className={styles.metricCard}><span>Applications submitted</span><strong>{trust.verifiedCounts.submitted}</strong><small>Verified submitted applications</small></article>
        <article className={styles.metricCard}><span>Active applications</span><strong>{trust.verifiedCounts.applying}</strong><small>Currently processing</small></article>
        <article className={styles.metricCard}><span>Action center</span><strong>{trust.verifiedCounts.actionCenter}</strong><small>Needs your attention</small></article>
        <article className={styles.metricCard}><span>Recruiter responses</span><strong>{trust.verifiedCounts.reviewQueue}</strong><small>Verified interview evidence</small></article>
        <article className={styles.metricCard}><span>Interviews scheduled</span><strong>{trust.verifiedCounts.interviews}</strong><small>Confirmed interview slots</small></article>
      </section>

      <section className={styles.panel} aria-label="Browser worker">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Live execution status</p>
            <h2>Run Career OS</h2>
            <p>Browser worker — {exec.applicationsProcessedToday} application{exec.applicationsProcessedToday === 1 ? '' : 's'} processed today.</p>
          </div>
        </div>

        <dl className={styles.statGrid}>
          <div><dt>Worker state</dt><dd>{exec.runningNow > 0 ? 'Running now' : 'Idle'}</dd></div>
          <div><dt>Retry scheduled</dt><dd>{queueStates.retry_scheduled ?? 0}</dd></div>
          <div><dt>Technical blockers</dt><dd>{exec.technicallyBlocked}</dd></div>
          <div><dt>Waiting on Tomas</dt><dd>{exec.waitingOnTomas}</dd></div>
        </dl>

        <FounderRunControls
          ownerEmail={status.evidence.ownerEmail}
          runNowToken={runNowToken}
          refreshDiscoveryToken={refreshDiscoveryToken}
          tokenExpiresAt={actionTokenExpiresAt}
        />
        <p><a className={styles.homeLink} href="/career-os#applications">View current applications and checkpoints</a></p>
      </section>

      <section className={styles.panel} aria-label="Daily focus">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Resume intelligence</p>
            <h2>Daily focus</h2>
            <p>{status.dailyWorkflow.immediateQueueProcessor.nextScheduledRun || 'Scheduled daily workflow configured.'}</p>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-label="Offer pipeline">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Offer tracking</p>
            <h2>Verified outcomes</h2>
          </div>
        </div>
        {trust.verifiedCounts.submitted > 0
          ? <p>{trust.verifiedCounts.submitted} verified submitted applications on record.</p>
          : <p>No verified offer record connected yet.</p>}
      </section>
    </main>
  );
}


import { createCareerOsActionToken } from '@/lib/career-os-queue';
import { getCareerOsStatus } from '@/lib/career-os-status';
import { FounderRunControls } from './founder-run-controls';
import { QualifiedRoleControls } from './qualified-role-controls';
import styles from './founder-dashboard.module.css';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

export default async function FounderDashboardPage() {
  const status = await getCareerOsStatus();
  const ownerEmail = status.evidence.ownerEmail;
  const counts = status.operationalTrust.verifiedCounts;
  const queueStates = status.applicationExecution.queueStates;
  const actionTokenExpiresAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
  const runNowToken = createCareerOsActionToken({ action: 'run_now', expiresAt: actionTokenExpiresAt, ownerEmail });
  const reviewOpportunityToken = createCareerOsActionToken({ action: 'review_opportunity', expiresAt: actionTokenExpiresAt, ownerEmail });

  const qualifiedRoles = status.evidence.jobPostings
    .map((posting) => asRecord(posting))
    .filter((posting) => {
      const raw = asRecord(posting.raw_record);
      const fitScore = Number(posting.fit_score || 0);
      const postingStatus = String(posting.status || '').toLowerCase();
      const reviewDecision = String(raw.review_decision || '').toLowerCase();
      return fitScore >= 85
        && !['approved', 'reject_similar', 'skip', 'hidden'].includes(reviewDecision)
        && !['inactive', 'ineligible', 'poor_fit', 'duplicate'].some((value) => postingStatus.includes(value));
    })
    .sort((left, right) => Number(right.fit_score || 0) - Number(left.fit_score || 0))
    .map((posting) => ({
      id: String(posting.id || ''),
      company: String(posting.company || 'Employer'),
      title: String(posting.title || 'Role'),
      location: String(posting.location || 'Location not published'),
      fitScore: Number(posting.fit_score || 0),
      applicationUrl: String(posting.canonical_url || posting.job_url || asRecord(posting.raw_record).canonical_url || ''),
    }))
    .filter((role) => Boolean(role.id));

  const queued = queueStates.queued + queueStates.package_ready;
  const running = queueStates.running;
  const submitted = counts.submitted;
  const blocked = counts.actionCenter + counts.systemIssues;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Career OS application center</p>
          <h1>Apply to Your Qualified Roles</h1>
          <p className={styles.subtitle}>Select every role you want, approve them together, then submit manually or start the approved automation queue.</p>
        </div>
        <a className={styles.homeLink} href="/career-os">Full Career OS</a>
      </header>

      <section className={styles.metricGrid} aria-label="Application status">
        <article className={styles.metricCard}><span>Qualified now</span><strong>{qualifiedRoles.length}</strong><small>Fit score 85 or higher</small></article>
        <article className={styles.metricCard}><span>Approved / queued</span><strong>{queued}</strong><small>Ready for application processing</small></article>
        <article className={styles.metricCard}><span>Running</span><strong>{running}</strong><small>Currently being processed</small></article>
        <article className={styles.metricCard}><span>Submitted</span><strong>{submitted}</strong><small>Submission evidence recorded</small></article>
        <article className={styles.metricCard}><span>Needs your help</span><strong>{blocked}</strong><small>MFA, CAPTCHA, legal, or missing facts</small></article>
      </section>

      <section className={styles.panel} aria-label="Qualified roles">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Step 1</p>
            <h2>Select and approve qualified roles</h2>
            <p>Select all qualified roles or choose only the ones you want. Approval adds them to your application queue.</p>
          </div>
          <span className={styles.badge}>{qualifiedRoles.length} qualified</span>
        </div>
        <QualifiedRoleControls
          actionToken={reviewOpportunityToken}
          ownerEmail={ownerEmail}
          roles={qualifiedRoles}
          tokenExpiresAt={actionTokenExpiresAt}
        />
      </section>

      <section className={styles.panel} aria-label="Approved queue controls">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Step 2</p>
            <h2>Process your approved queue</h2>
            <p>Start all currently eligible approved applications. Career OS will stop only when a role needs your direct input.</p>
          </div>
          <span className={styles.badge}>{queued} ready</span>
        </div>
        <FounderRunControls
          approvedCount={queued}
          ownerEmail={ownerEmail}
          runNowToken={runNowToken}
          tokenExpiresAt={actionTokenExpiresAt}
        />
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Step 3</p>
            <h2>Track progress</h2>
            <p>Refresh this page when you want updated counts, or open the full application checkpoint view.</p>
          </div>
        </div>
        <p><a className={styles.homeLink} href="/career-os#applications">Open applications and checkpoints</a></p>
      </section>
    </main>
  );
}

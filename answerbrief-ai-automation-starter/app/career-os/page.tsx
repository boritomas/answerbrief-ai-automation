import { getCareerOsStatus, summarizeCareerOsStatus, type CareerOsStatus } from '@/lib/career-os-status';
import { createCareerOsActionToken } from '@/lib/career-os-queue';
import { buildCandidateProfile, type CandidateProfile } from '@/lib/career-os-candidate-profile';
import { ApplicationActionControl, ReviewQueueActionControl } from './action-controls';
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
type TaskGroupType =
  | 'Employment Details'
  | 'Employer Account or Sign-In'
  | 'Legal or Privacy Approval'
  | 'Compensation Answer'
  | 'Missing Candidate Information'
  | 'Identity or MFA'
  | 'Other Verified Human Action';
type TaskGroup = {
  actionLabel: string;
  affectedApplicationIds: string[];
  affectedCanonicalOpportunityIds: string[];
  cards: ActionCenterCard[];
  currentStatus: string;
  employerLabel: string;
  employers: string[];
  estimatedTime: string;
  evidenceItems: Array<{
    applicationId: string;
    checkpointSaved: boolean;
    currentUrl?: string;
    gateId?: string;
    lastValidatedAt?: string;
    role: string;
    screenshotHref?: string;
  }>;
  evidenceStatus: string;
  expectedResult: string;
  exactAction: string;
  href: string;
  id: string;
  primaryCard: ActionCenterCard;
  sortRank: number;
  taskType: TaskGroupType;
  title: string;
  unlockCount: number;
  verifiedIndicators: string[];
 };

export default async function CareerOsPage() {
  const status = await getCareerOsStatus();
  const trust = status.operationalTrust;
  const artifacts = status.evidence.artifacts.filter((artifact) => artifact.artifact_type === 'targeted_resume' || artifact.artifact_type === 'application_package');
  const applications = status.evidence.applications;
  const dailyWorkflow = status.dailyWorkflow;
  const pipelineHealth = dailyWorkflow.pipelineHealth;
  const allActionCenterCards = buildActionCenterCards(status);
  const verifiedActionCenterIds = new Set(trust.verifiedActionCenterRecords.map((record) => String(record.applicationId || '')));
  const verifiedSubmittedIds = new Set(trust.submittedRecords.filter((record) => record.classification === 'verified').map((record) => String(record.applicationId || '')));
  const actionCenterCards = allActionCenterCards.filter((card) => verifiedActionCenterIds.has(String(card.application.id)));
  const pendingActionCards = actionCenterCards.filter((card) => card.variant !== 'terminal');
  const taskGroups = buildTaskGroups(pendingActionCards, trust.verifiedActionCenterRecords);
  const taskSummary = summarizeTaskGroups(taskGroups);
  const submittedCards = allActionCenterCards.filter((card) => verifiedSubmittedIds.has(String(card.application.id)));
  const resumePerformance = buildResumePerformance(artifacts, applications, status);
  const activitySnapshot = buildActivitySnapshot(status.evidence.workflowEvents, applications);
  const candidateSummary = buildCandidateSummary(status);
  const priorities = buildTodayPriorities(status, taskGroups);
  const recentActivity = buildRecentActivity(status, submittedCards);
  const candidatePipeline = buildCandidatePipeline(status);
  const systemNotice = buildSystemNotice(status);
  const opportunitySnapshot = buildCandidateOpportunitySnapshot(status);
  const navItems = [
    { href: '/career-os', label: 'Home' },
    { href: '/career-os#opportunities', label: 'Opportunities' },
    { href: '/career-os#review-queue', label: 'My Review Queue', count: trust.verifiedCounts.reviewQueue },
    { href: '/career-os#action-center', label: 'Today’s Tasks', count: taskGroups.length },
    { href: '/career-os#applications', label: 'Applications', count: trust.verifiedCounts.submitted },
    { href: '/career-os#interviews', label: 'Interviews', count: trust.verifiedCounts.interviews },
    { href: '/career-os#documents', label: 'Documents' },
    { href: '/career-os/admin', label: 'Admin' },
  ];
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
            <a href={item.href} key={item.label}>
              <span>{item.label}</span>
              {typeof item.count === 'number' ? <strong className="career-os-nav-badge">{item.count}</strong> : null}
            </a>
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
          <p className="eyebrow">Candidate Mode</p>
          <h1>Good morning, Tomas.</h1>
          <p className="subhead">{candidateSummary.summaryLine}</p>
          <div className="career-os-metrics" aria-label="Morning Summary">
            <Metric href="/career-os#applications" label="Applications Submitted" value={trust.verifiedCounts.submitted} />
            <Metric href="/career-os#review-queue" label="Opportunities to Review" value={trust.verifiedCounts.reviewQueue} />
            <Metric href="/career-os#action-center" label="Actions Required" value={trust.verifiedCounts.actionCenter} />
            <Metric href="/career-os#interviews" label="Interviews" value={trust.verifiedCounts.interviews} />
          </div>
          <div className="career-os-summary">
            <p>{candidateSummary.detailLine}</p>
            <p>{candidateSummary.nextLine}</p>
          </div>
          <div className="cta-row">
            <a className="button secondary" href="/career-os#review-queue">Open My Review Queue</a>
            <a className="button primary" href="/career-os#action-center">Open Today&apos;s Tasks</a>
            <a className="button secondary" href="/career-os/admin">Open Admin</a>
          </div>
        </div>

        <aside className="career-os-action" aria-label="Career OS next action">
          <p className="eyebrow">Today&apos;s Priorities</p>
          {priorities.length ? (
            <div className="career-os-priority-list">
              {priorities.map((item) => (
                <article className="career-os-priority-card" key={item.key}>
                  <p className="career-os-card-label">{item.type}</p>
                  <h2>{item.title}</h2>
                  <p>{item.subtitle}</p>
                  <p><strong>Why it matters:</strong> {item.reason}</p>
                  <p><strong>Estimated time:</strong> {item.estimatedTime}</p>
                  <a className="button primary" href={item.href}>{item.actionLabel}</a>
                </article>
              ))}
            </div>
          ) : (
            <>
              <h2>No decision is waiting on you.</h2>
              <p>Career OS will keep applying automatically and surface a new item here if it needs your help.</p>
            </>
          )}
        </aside>
      </section>

      <section className="career-os-band">
        <div className="career-os-section-grid">
          <section className="career-os-panel">
            <h2>Today&apos;s Priorities</h2>
            <p>No more than five items are shown here. Review decisions appear first, then application steps, then interview or recruiter follow-up.</p>
            <div className="career-os-list">
              {priorities.map((item) => (
                <article className="career-os-row" key={`${item.key}-summary`}>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.subtitle}</p>
                    <p>{item.reason}</p>
                  </div>
                  <a className="text-link" href={item.href}>{item.actionLabel}</a>
                </article>
              ))}
            </div>
          </section>
          <section className="career-os-panel">
            <h2>Recent Activity</h2>
            <p>Plain-language updates from the live application pipeline.</p>
            <div className="career-os-list">
              {recentActivity.map((item) => (
                <article className="career-os-row" key={item.label}>
                  <div>
                    <h3>{item.label}</h3>
                    <p>{item.detail}</p>
                  </div>
                  <span>{item.value}</span>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="career-os-band">
        <div className="career-os-section-grid">
          <section className="career-os-panel" id="opportunities">
            <h2>Pipeline</h2>
            <p>Only the stages that matter for your search are shown here.</p>
            <div className="career-os-metrics secondary" aria-label="Career OS candidate pipeline">
              {candidatePipeline.map((item) => (
                <Metric detail={item.detail} href={item.href} key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </section>
          {systemNotice ? (
            <section className="career-os-panel" aria-label="System Notice">
              <h2>System Notice</h2>
              <p>{systemNotice}</p>
            </section>
          ) : null}
        </div>
      </section>

      <section id="review-queue" className="career-os-band">
        <h2>My Review Queue</h2>
        <div className="career-os-review-summary">
          <p>{trust.verifiedCounts.reviewQueue} opportunit{trust.verifiedCounts.reviewQueue === 1 ? 'y needs' : 'ies need'} your decision.</p>
          <p>Estimated review time: {status.reviewQueue.estimatedReviewMinutes} minute{status.reviewQueue.estimatedReviewMinutes === 1 ? '' : 's'}.</p>
          <p>Highest fit: {status.reviewQueue.items[0]?.fitScore || 0}{status.reviewQueue.highestScoringRole ? ` · ${status.reviewQueue.highestScoringRole}` : ''}</p>
        </div>
        <div className="career-os-action-center" id="review-queue-list">
          {status.reviewQueue.items.map((item) => (
            <article className="career-os-action-card career-os-review-card" id={`review-opportunity-${item.opportunityId}`} key={item.opportunityId}>
              <div className="career-os-card-header career-os-review-header">
                <div className="career-os-review-identity">
                  <p className="career-os-review-employer">{item.employer}</p>
                  <h3>{item.title}</h3>
                  <p className="career-os-review-location">{item.location}</p>
                </div>
                <div className="career-os-status-pill">Needs Your Review</div>
              </div>
              <div className="career-os-review-meta" aria-label="Review queue role details">
                <span>Requisition {item.requisitionId || 'not published'}</span>
                <span>Fit {item.fitScore}</span>
                <span>{item.postedAt ? `Posted ${formatDate(item.postedAt)}` : 'Posting date not published'}</span>
                <span>{item.compensationText || 'Compensation not posted'}</span>
              </div>
              <div className="career-os-card-grid career-os-review-grid">
                <section>
                  <h4>Why It May Fit</h4>
                  <ul className="career-os-bullets">
                    {item.qualificationReasons.slice(0, 3).map((reason) => <li key={`${item.opportunityId}-${reason}`}>{reason}</li>)}
                  </ul>
                </section>
                <section>
                  <h4>Potential Concerns</h4>
                  <ul className="career-os-bullets">
                    {(item.concerns.length ? item.concerns : ['No major concern is recorded yet.']).slice(0, 3).map((concern) => <li key={`${item.opportunityId}-${concern}`}>{concern}</li>)}
                  </ul>
                </section>
              </div>
              <ReviewQueueActionControl
                actionToken={pageActionToken}
                actionTokenExpiresAt={actionTokenExpiresAt}
                employer={item.employer}
                opportunityId={item.opportunityId}
                title={item.title}
              />
              <div className="career-os-link-row career-os-review-links">
                {item.canonicalUrl ? <a className="text-link" href={item.canonicalUrl}>View Posting</a> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="action-center" className="career-os-band">
        <h2>Today&apos;s Tasks</h2>
        <p>{taskGroups.length} task{taskGroups.length === 1 ? '' : 's'} affect {taskSummary.affectedApplications} application{taskSummary.affectedApplications === 1 ? '' : 's'}. Completing them can unblock the affected applications for the next verified automation run.</p>
        <div className="career-os-metrics secondary" aria-label="Career OS action center status">
          <Metric detail="Distinct verified human tasks" href="/career-os#action-center-list" label="Tasks" value={taskGroups.length} />
          <Metric detail="Unique applications with unresolved verified human gates" href="/career-os#action-center-list" label="Applications Affected" value={taskSummary.affectedApplications} />
          <Metric detail={taskSummary.estimatedLabel} href="/career-os#action-center-list" label="Estimated Minutes" value={taskSummary.displayMinutes} />
          <Metric detail="Only unresolved verified technical issues" href="/career-os#system-issues" label="System Issues" value={trust.verifiedCounts.systemIssues} />
        </div>
        <div className="career-os-action-center" id="action-center-list">
          {taskGroups.map((group) => {
            const cta = actionCenterCardToCta(group.primaryCard);
            return (
              <article className="career-os-action-card" id={`task-group-${group.id}`} key={group.id}>
                <div className="career-os-card-header">
                  <div>
                    <p className="career-os-card-label">{group.taskType}</p>
                    <h3>{group.title}</h3>
                    <p>{group.employerLabel}</p>
                  </div>
                  <div className="career-os-status-pill">{group.cards.length === 1 ? group.primaryCard.statusLabel : `${group.cards.length} Applications`}</div>
                </div>
                <div className="career-os-card-grid">
                  <section>
                    <p className="career-os-card-label">Exact Action</p>
                    <p>{group.exactAction}</p>
                    <p><strong>Estimated Time:</strong> {group.estimatedTime}</p>
                  </section>
                  <section>
                    <p className="career-os-card-label">Affected Roles</p>
                    <ul className="career-os-bullets">
                      {group.cards.map((card) => (
                        <li key={`${group.id}-${card.application.id}`}>{card.employer} · {card.role}</li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <p className="career-os-card-label">Verified Indicators</p>
                    <ul className="career-os-bullets">
                      {group.verifiedIndicators.map((step) => <li key={`${group.id}-${step}`}>{step}</li>)}
                    </ul>
                  </section>
                  <section>
                    <p className="career-os-card-label">Current Status</p>
                    <p>{group.currentStatus}</p>
                    <p>{group.expectedResult}</p>
                  </section>
                  <section>
                    <p className="career-os-card-label">Impact</p>
                    <p>{group.unlockCount} application{group.unlockCount === 1 ? '' : 's'} unlocked</p>
                    <p>{group.evidenceStatus}</p>
                  </section>
                </div>
                <ApplicationActionControl
                  actionToken={pageActionToken}
                  actionTokenExpiresAt={actionTokenExpiresAt}
                  actionKind={cta.actionKind}
                  applicationId={String(group.primaryCard.application.id)}
                  disabledReason={cta.disabledReason}
                  fields={group.primaryCard.fields}
                  href={cta.href}
                  intro={group.expectedResult}
                  label={group.actionLabel}
                  legalApprovalFingerprint={group.primaryCard.legalApprovalFingerprint}
                  legalApprovalSourceUrl={group.primaryCard.legalApprovalSourceUrl}
                  legalApprovalText={group.primaryCard.legalApprovalText}
                  legalApprovalTitle={group.primaryCard.legalApprovalTitle}
                  variant={group.primaryCard.variant}
                  whatTomasMustDo={group.exactAction}
                />
                <details>
                  <summary>Evidence</summary>
                  <div className="career-os-link-row">
                    {group.evidenceItems.map((item) => (
                      <div key={`${group.id}-${item.applicationId}`}>
                        <p><strong>{item.role}</strong></p>
                        <p>Application {item.applicationId}</p>
                        <p>Gate ID: {item.gateId || 'not recorded'}</p>
                        <p>Last validated: {item.lastValidatedAt ? formatDateTime(item.lastValidatedAt) : 'not recorded'}</p>
                        <p>Checkpoint saved: {item.checkpointSaved ? 'Yes' : 'No'}</p>
                        {item.currentUrl ? <p><a className="text-link" href={item.currentUrl}>Open employer page</a></p> : null}
                        {item.screenshotHref ? <p><a className="text-link" href={item.screenshotHref}>Open screenshot evidence</a></p> : null}
                      </div>
                    ))}
                  </div>
                </details>
                <div className="career-os-link-row">
                  {group.primaryCard.supportingLinks.map((link) => (
                    <a className="text-link" href={link.href} key={`${group.primaryCard.application.id}-${link.label}`}>{link.label}</a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="ready-to-resume" className="career-os-band">
        <h2>Ready to Resume</h2>
        <p>Only checkpoints with explicit persisted resume evidence appear here.</p>
        <div className="career-os-list compact">
          {trust.verifiedReadyToResumeRecords.length ? trust.verifiedReadyToResumeRecords.map((record) => (
            <DetailRow
              detail={`${record.employer} · ${record.role} · checkpoint ${record.checkpointId || 'not recorded'} · last validated ${record.lastValidatedAt ? formatDateTime(record.lastValidatedAt) : 'not recorded'}`}
              key={record.id}
              label={record.requisitionId || record.employer}
              value={record.currentStep || 'Ready'}
            />
          )) : <DetailRow detail="No persisted resumable checkpoints are currently verified in production." label="Verified resumable checkpoints" value="0" />}
        </div>
      </section>

      <section id="opportunities-list" className="career-os-band">
        <h2>Opportunities</h2>
        <p>{trust.verifiedCounts.opportunities} verified active opportunities currently match your policy and role band.</p>
        <div className="career-os-list" id="opportunity-list">
          {opportunitySnapshot.map((opportunity) => (
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
        <p>Submitted applications stay locked here so Career OS does not reopen them.</p>
        <div className="career-os-list" id="submitted-applications">
          {trust.submittedRecords.filter((record) => record.classification === 'verified').map((record) => {
            const card = submittedCards.find((item) => String(item.application.id) === String(record.applicationId));
            return (
            <article className="career-os-row" key={record.id}>
              <div>
                <h3>{record.employer}: {record.role}</h3>
                <p>Requisition {record.requisitionId || 'not published'} · Application {record.applicationId || 'not recorded'}</p>
                <p>{record.confirmationType || 'confirmation evidence'} · {record.confirmationTimestamp ? formatDateTime(record.confirmationTimestamp) : 'timestamp not recorded'} · Duplicate lock {record.duplicateLock ? 'active' : 'missing'}</p>
              </div>
              {card?.confirmationHref ? <a className="text-link" href={card.confirmationHref}>View Confirmation</a> : <span>Evidence recorded</span>}
            </article>
            );
          })}
        </div>
      </section>

      <section id="active-executions" className="career-os-band">
        <h2>Applying</h2>
        <p>Only executions with a current worker heartbeat remain visible here.</p>
        <div className="career-os-list compact">
          {trust.verifiedApplyingRecords.length ? trust.verifiedApplyingRecords.map((record) => (
            <DetailRow
              detail={`${record.employer} · ${record.role} · worker heartbeat ${record.lastHeartbeatAt ? formatDateTime(record.lastHeartbeatAt) : 'not recorded'} · ${record.currentUrl || 'no url'}`}
              key={record.id}
              label={record.requisitionId || record.employer}
              value={record.currentStep || 'Running'}
            />
          )) : <DetailRow detail="No active executions currently have a recent verified heartbeat." label="Verified active executions" value="0" />}
        </div>
      </section>

      <section id="interviews" className="career-os-band">
        <h2>Interviews</h2>
        <p>{trust.verifiedCounts.interviews} verified interview{trust.verifiedCounts.interviews === 1 ? '' : 's'} and {pipelineHealth.recruiterResponses} recruiter response{pipelineHealth.recruiterResponses === 1 ? '' : 's'} are currently recorded.</p>
        <div className="career-os-list compact">
          <DetailRow detail="Recruiter replies or employer responses recorded in production." label="Recruiter Responses" value={String(pipelineHealth.recruiterResponses)} />
          <DetailRow detail="Application-to-interview conversion from the live pipeline." label="Conversion Rate" value={`${pipelineHealth.applicationToInterviewConversionRate.toFixed(1)}%`} />
          <DetailRow detail="Open follow-up items connected to applications or recruiter replies." label="Follow-ups" value={String(activitySnapshot.followUps)} />
        </div>
      </section>

      <section id="system-issues" className="career-os-band">
        <h2>System Issues</h2>
        <p>Only unresolved technical issues with persisted evidence appear here.</p>
        <div className="career-os-list compact">
          {trust.systemIssueRecords.length ? trust.systemIssueRecords.map((record) => (
            <DetailRow
              detail={`${record.employer} · ${record.role} · ${record.blockerEvidence || 'Technical issue'} · last checked ${record.lastValidatedAt ? formatDateTime(record.lastValidatedAt) : 'not recorded'}`}
              key={record.id}
              label={record.requisitionId || record.employer}
              value={record.gateId || 'issue-recorded'}
            />
          )) : <DetailRow detail="No verified unresolved technical issues are currently affecting Candidate Mode." label="Verified system issues" value="0" />}
        </div>
      </section>

      <section id="documents" className="career-os-band">
        <h2>Documents</h2>
        <p>{resumePerformance.validatedResumes} approved resume{resumePerformance.validatedResumes === 1 ? '' : 's'} and {resumePerformance.packageAssets} saved package asset{resumePerformance.packageAssets === 1 ? '' : 's'} support the current pipeline.</p>
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

function buildCandidateSummary(status: CareerStatus) {
  const trust = status.operationalTrust;
  const newJobs = status.dailyWorkflow.pipelineHealth.newOpportunitiesToday;
  const submittedToday = status.dailyWorkflow.pipelineHealth.applicationsSubmittedToday;
  const reviewCount = trust.verifiedCounts.reviewQueue;
  const actionCount = trust.verifiedCounts.actionCenter;
  const qualifiedCount = trust.verifiedCounts.opportunities;

  return {
    detailLine: `Career OS found ${newJobs} new job${newJobs === 1 ? '' : 's'}, submitted ${submittedToday} application${submittedToday === 1 ? '' : 's'} today, and needs your input on ${reviewCount} opportunit${reviewCount === 1 ? 'y' : 'ies'} and ${actionCount} application step${actionCount === 1 ? '' : 's'}.`,
    nextLine: reviewCount
      ? 'Your next best move is to clear the review queue so strong matches can move into application processing.'
      : actionCount
        ? 'Your next best move is to complete the open action-center steps so Career OS can resume the saved applications.'
        : 'No decision is blocking Career OS right now. The system will keep processing qualified roles automatically.',
    summaryLine: `${qualifiedCount} verified active opportunit${qualifiedCount === 1 ? 'y is' : 'ies are'} live today.`,
  };
}

function buildTodayPriorities(status: CareerStatus, taskGroups: TaskGroup[]) {
  const priorities: Array<{
    actionLabel: string;
    estimatedTime: string;
    href: string;
    key: string;
    reason: string;
    subtitle: string;
    title: string;
    type: string;
  }> = [];

  for (const item of status.reviewQueue.items.slice(0, 2)) {
    priorities.push({
      actionLabel: 'Review Opportunity',
      estimatedTime: 'Less than 1 minute',
      href: `/career-os#review-opportunity-${item.opportunityId}`,
      key: `review-${item.opportunityId}`,
      reason: `${item.fitScore} fit score and still waiting for your decision.`,
      subtitle: `${item.employer} · Requisition ${item.requisitionId || 'not published'}`,
      title: item.title,
      type: 'Review Queue',
    });
  }

  for (const group of taskGroups.slice(0, 2)) {
    priorities.push({
      actionLabel: group.actionLabel,
      estimatedTime: group.estimatedTime,
      href: `/career-os#task-group-${group.id}`,
      key: `task-${group.id}`,
      reason: priorityReasonForTaskGroup(group),
      subtitle: group.employerLabel,
      title: group.title,
      type: 'Today’s Tasks',
    });
  }

  if (status.dailyWorkflow.pipelineHealth.interviews > 0) {
    priorities.push({
      actionLabel: 'Open Interviews',
      estimatedTime: '2 minutes',
      href: '/career-os#interviews',
      key: 'interviews',
      reason: 'An interview or interview follow-up is already recorded in the live pipeline.',
      subtitle: `${status.dailyWorkflow.pipelineHealth.interviews} interview${status.dailyWorkflow.pipelineHealth.interviews === 1 ? '' : 's'} recorded`,
      title: 'Interview Follow-Up',
      type: 'Interviews',
    });
  } else if (status.dailyWorkflow.pipelineHealth.recruiterResponses > 0) {
    priorities.push({
      actionLabel: 'Open Interviews',
      estimatedTime: '2 minutes',
      href: '/career-os#interviews',
      key: 'recruiter-response',
      reason: 'A recruiter or employer response is waiting in the live record.',
      subtitle: `${status.dailyWorkflow.pipelineHealth.recruiterResponses} recruiter response${status.dailyWorkflow.pipelineHealth.recruiterResponses === 1 ? '' : 's'} recorded`,
      title: 'Recruiter Follow-Up',
      type: 'Follow-Up',
    });
  }

  return priorities.slice(0, 5);
}

function buildTaskGroups(cards: ActionCenterCard[], trustRecords: CareerStatus['operationalTrust']['verifiedActionCenterRecords']): TaskGroup[] {
  const trustRecordByApplicationId = new Map(
    trustRecords.map((record) => [String(record.applicationId || ''), record] as const),
  );
  const grouped = new Map<string, { cards: ActionCenterCard[]; primaryCard: ActionCenterCard }>();

  for (const card of cards) {
    const trustRecord = trustRecordByApplicationId.get(String(card.application.id));
    const key = taskGroupingKey(card, trustRecord);
    const existing = grouped.get(key);
    if (existing) {
      existing.cards.push(card);
    } else {
      grouped.set(key, { cards: [card], primaryCard: card });
    }
  }

  return Array.from(grouped.entries())
    .map(([id, group]) => buildTaskGroup(id, group.cards, group.primaryCard, trustRecordByApplicationId))
    .sort((left, right) => left.sortRank - right.sortRank || left.title.localeCompare(right.title));
}

function buildTaskGroup(
  id: string,
  cards: ActionCenterCard[],
  primaryCard: ActionCenterCard,
  trustRecordByApplicationId: Map<string, CareerStatus['operationalTrust']['verifiedActionCenterRecords'][number]>,
): TaskGroup {
  const uniqueApplicationIds = Array.from(new Set(cards.map((card) => String(card.application.id))));
  const uniqueOpportunityIds = Array.from(new Set(cards.map((card) => String(card.application.opportunity_id || '')).filter(Boolean)));
  const taskType = taskGroupType(primaryCard);
  const effort = cards
    .map((card) => parseEstimatedTime(card.estimatedTime))
    .reduce((acc, item) => ({
      max: acc.max + item.max,
      min: acc.min + item.min,
    }), { min: 0, max: 0 });
  const unlockCount = Math.max(
    uniqueApplicationIds.length,
    ...cards.map((card) => applicationUnlockCount(card)),
  );
  const employers = Array.from(new Set(cards.map((card) => card.employer)));
  const employerLabel = employers.length === 1 ? employers[0] : employers.join(', ');
  const indicators = buildVerifiedIndicators(cards, trustRecordByApplicationId);
  const evidenceItems = cards.map((card) => {
    const trustRecord = trustRecordByApplicationId.get(String(card.application.id));
    const screenshotHref = card.supportingLinks.find((link) => /checkpoint|screenshot/i.test(link.label))?.href;
    return {
      applicationId: String(card.application.id),
      checkpointSaved: Boolean(trustRecord?.checkpointId && trustRecord?.checkpointStorageLocation),
      currentUrl: trustRecord?.currentUrl,
      gateId: trustRecord?.gateId,
      lastValidatedAt: trustRecord?.lastValidatedAt,
      role: card.role,
      screenshotHref,
    };
  });
  return {
    actionLabel: primaryCard.primaryLabel,
    affectedApplicationIds: uniqueApplicationIds,
    affectedCanonicalOpportunityIds: uniqueOpportunityIds,
    cards,
    currentStatus: taskCurrentStatus(primaryCard, cards, trustRecordByApplicationId),
    employerLabel,
    employers,
    estimatedTime: formatMinuteRange(effort.min, effort.max),
    evidenceItems,
    evidenceStatus: evidenceStatusText(cards, trustRecordByApplicationId),
    exactAction: sharedExactAction(cards),
    expectedResult: taskExpectedResult(primaryCard, cards, trustRecordByApplicationId),
    href: primaryCard.supportingLinks[0]?.href || `/career-os#${applicationAnchorId(primaryCard.application)}`,
    id,
    primaryCard,
    sortRank: taskSortRank(primaryCard, unlockCount, effort.max, trustRecordByApplicationId),
    taskType,
    title: taskTitle(primaryCard, cards, unlockCount),
    unlockCount,
    verifiedIndicators: indicators,
  };
}

function summarizeTaskGroups(taskGroups: TaskGroup[]) {
  const uniqueApplications = new Set(taskGroups.flatMap((group) => group.affectedApplicationIds));
  const totals = taskGroups.reduce((acc, group) => {
    const [min, max] = parseMinuteRange(group.estimatedTime);
    return { min: acc.min + min, max: acc.max + max };
  }, { min: 0, max: 0 });
  const displayMinutes = Math.max(1, totals.max);
  return {
    affectedApplications: uniqueApplications.size,
    displayMinutes,
    estimatedLabel: formatMinuteRange(totals.min, totals.max),
  };
}

function taskGroupingKey(
  card: ActionCenterCard,
  trustRecord?: CareerStatus['operationalTrust']['verifiedActionCenterRecords'][number],
) {
  const type = taskGroupType(card);
  const action = normalizeKey(sharedExactAction([card]));
  const domain = normalizeKey(urlDomain(trustRecord?.currentUrl || card.supportingLinks[0]?.href || ''));
  const employer = normalizeKey(card.employer);
  const legalFingerprint = normalizeKey(card.legalApprovalFingerprint || '');
  const appId = normalizeKey(String(card.application.id));

  if (card.variant === 'account' || card.variant === 'captcha') {
    return [type, employer, domain || 'no-domain', action].join(':');
  }
  if (card.variant === 'legal' && legalFingerprint) {
    return [type, employer, legalFingerprint].join(':');
  }
  return [type, appId].join(':');
}

function taskGroupType(card: ActionCenterCard): TaskGroupType {
  if (card.variant === 'employment') return 'Employment Details';
  if (card.variant === 'account') return 'Employer Account or Sign-In';
  if (card.variant === 'legal') return 'Legal or Privacy Approval';
  if (card.variant === 'captcha') return /mfa|identity|security/i.test(card.requiredAction) ? 'Identity or MFA' : 'Other Verified Human Action';
  if (card.variant === 'missing_fact' && /compensation/i.test(`${card.primaryLabel} ${card.requiredAction}`)) return 'Compensation Answer';
  if (card.variant === 'missing_fact') return 'Missing Candidate Information';
  return 'Other Verified Human Action';
}

function taskTitle(primaryCard: ActionCenterCard, cards: ActionCenterCard[], unlockCount: number) {
  if (cards.length > 1 && taskGroupType(primaryCard) === 'Employer Account or Sign-In') {
    return `${primaryCard.employer} Account`;
  }
  if (taskGroupType(primaryCard) === 'Compensation Answer') return 'Compensation Approval';
  if (taskGroupType(primaryCard) === 'Employment Details') return 'Employment History Verification';
  if (unlockCount > 1 && taskGroupType(primaryCard) === 'Missing Candidate Information') return 'Reusable Candidate Answer';
  return primaryCard.primaryLabel;
}

function sharedExactAction(cards: ActionCenterCard[]) {
  const unique = Array.from(new Set(cards.map((card) => plainRequiredAction(card.variant, {
    canonicalExecutionState: 'waiting_on_tomas',
    cta: { actionKind: 'continue_application', whatTomasMustDo: card.requiredAction, label: card.primaryLabel } as never,
    employer: card.employer,
    reason: card.reason,
    role: card.role,
  } as never))));
  return unique.length === 1 ? unique[0] : cards[0].requiredAction;
}

function buildVerifiedIndicators(
  cards: ActionCenterCard[],
  trustRecordByApplicationId: Map<string, CareerStatus['operationalTrust']['verifiedActionCenterRecords'][number]>,
) {
  const indicators = new Set<string>();
  indicators.add('Resume prepared');
  if (cards.every((card) => Boolean(card.supportingLinks[0]?.href))) indicators.add('Application opened');
  if (cards.some((card) => {
    const record = trustRecordByApplicationId.get(String(card.application.id));
    return Boolean(record?.checkpointId && record?.checkpointStorageLocation);
  })) {
    indicators.add('Checkpoint saved');
  }
  if (cards.some((card) => {
    const raw = asRecord(card.application.raw_record);
    return Boolean(asRecord(raw.browser_worker_last_report).screenshot_path || asRecord(raw.browser_worker).last_screenshot_path);
  })) {
    indicators.add('Screenshot evidence captured');
  }
  return Array.from(indicators);
}

function taskExpectedResult(
  primaryCard: ActionCenterCard,
  cards: ActionCenterCard[],
  trustRecordByApplicationId: Map<string, CareerStatus['operationalTrust']['verifiedActionCenterRecords'][number]>,
) {
  const everyCardHasCheckpoint = cards.every((card) => {
    const trustRecord = trustRecordByApplicationId.get(String(card.application.id));
    return Boolean(trustRecord?.checkpointId && trustRecord?.checkpointStorageLocation);
  });
  if (everyCardHasCheckpoint && primaryCard.variant === 'account') return 'Automation resumes after the employer account step is verified on the saved checkpoint.';
  if (everyCardHasCheckpoint && primaryCard.variant === 'captcha') return 'Automation resumes after the visible security step clears on the saved checkpoint.';
  if (primaryCard.variant === 'employment' || primaryCard.variant === 'missing_fact' || primaryCard.variant === 'legal') {
    return 'Answer saved. Application queued for a fresh supported run; automation continuation is not yet verified.';
  }
  return primaryCard.nextStep;
}

function evidenceStatusText(
  cards: ActionCenterCard[],
  trustRecordByApplicationId: Map<string, CareerStatus['operationalTrust']['verifiedActionCenterRecords'][number]>,
) {
  const checkpoints = cards.filter((card) => {
    const trustRecord = trustRecordByApplicationId.get(String(card.application.id));
    return Boolean(trustRecord?.checkpointId && trustRecord?.checkpointStorageLocation);
  }).length;
  if (checkpoints === cards.length) return 'Every affected application has verified checkpoint evidence.';
  if (checkpoints > 0) return `${checkpoints} of ${cards.length} affected applications have verified checkpoint evidence.`;
  return 'No verified resumable checkpoint is currently recorded for this task.';
}

function taskCurrentStatus(
  primaryCard: ActionCenterCard,
  cards: ActionCenterCard[],
  trustRecordByApplicationId: Map<string, CareerStatus['operationalTrust']['verifiedActionCenterRecords'][number]>,
) {
  const oldestGate = cards
    .map((card) => trustRecordByApplicationId.get(String(card.application.id))?.lastValidatedAt || '')
    .filter(Boolean)
    .sort()[0];
  const unlocked = Math.max(cards.length, ...cards.map((card) => applicationUnlockCount(card)));
  const validatedText = oldestGate ? `Oldest verified gate ${formatDateTime(oldestGate)}.` : 'Verified gate is active.';
  if (unlocked > cards.length) return `${validatedText} One completion can unlock ${unlocked} applications.`;
  if (primaryCard.variant === 'account' && cards.length > 1) return `${validatedText} One employer account step covers ${cards.length} applications.`;
  return validatedText;
}

function taskSortRank(
  primaryCard: ActionCenterCard,
  unlockCount: number,
  maxMinutes: number,
  trustRecordByApplicationId: Map<string, CareerStatus['operationalTrust']['verifiedActionCenterRecords'][number]>,
) {
  const base = primaryCard.variant === 'missing_fact' ? 10
    : primaryCard.variant === 'employment' ? 20
      : primaryCard.variant === 'account' ? 30
        : primaryCard.variant === 'legal' ? 40
          : primaryCard.variant === 'captcha' ? 50
            : 60;
  const lastValidatedAt = trustRecordByApplicationId.get(String(primaryCard.application.id))?.lastValidatedAt;
  const agePenalty = lastValidatedAt ? Math.floor((Date.now() - new Date(lastValidatedAt).getTime()) / (1000 * 60 * 60)) : 0;
  return (base * 1000) + (maxMinutes * 100) - (unlockCount * 10) - Math.min(agePenalty, 99);
}

function applicationUnlockCount(card: ActionCenterCard) {
  return /total compensation/i.test(`${card.primaryLabel} ${card.requiredAction}`) ? 4 : 1;
}

function parseEstimatedTime(text: string) {
  if (/less than 1/i.test(text)) return { min: 1, max: 1 };
  const numbers = Array.from(text.matchAll(/\d+/g)).map((match) => Number(match[0]));
  if (numbers.length >= 2) return { min: numbers[0], max: numbers[1] };
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
  return { min: 1, max: 1 };
}

function parseMinuteRange(text: string) {
  const numbers = Array.from(text.matchAll(/\d+/g)).map((match) => Number(match[0]));
  if (numbers.length >= 2) return [numbers[0], numbers[1]] as const;
  if (numbers.length === 1) return [numbers[0], numbers[0]] as const;
  return [1, 1] as const;
}

function formatMinuteRange(min: number, max: number) {
  if (min === max) return `Approximately ${min} minute${min === 1 ? '' : 's'}`;
  return `Approximately ${min}-${max} minutes`;
}

function normalizeKey(value: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function urlDomain(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function priorityReasonForTaskGroup(group: TaskGroup) {
  if (group.taskType === 'Employment Details') return 'This employer needs verified employment facts before the next supported run can continue.';
  if (group.taskType === 'Employer Account or Sign-In') return 'Finishing this employer sign-in or account step can unlock additional application progress.';
  if (group.taskType === 'Legal or Privacy Approval') return 'Career OS needs your approval of the exact employer text before it can continue safely.';
  if (group.taskType === 'Identity or MFA') return 'A visible security or identity step is blocking further automation on this employer workflow.';
  if (group.taskType === 'Compensation Answer') return 'A reusable compensation answer can unblock multiple applications once it is saved.';
  if (group.taskType === 'Missing Candidate Information') return 'One verified candidate answer is still missing before the application can continue.';
  return group.currentStatus;
}

function buildRecentActivity(status: CareerStatus, submittedCards: ActionCenterCard[]) {
  const items = [];
  for (const card of submittedCards.slice(0, 3)) {
    items.push({
      detail: `${card.role} · ${card.confirmationDate || 'confirmation recorded'}`,
      label: `Applied to ${card.employer}`,
      value: 'Confirmed',
    });
  }
  for (const item of status.reviewQueue.items.slice(0, Math.max(0, 5 - items.length))) {
    items.push({
      detail: `${item.title} · Requisition ${item.requisitionId || 'not published'}`,
      label: `${item.employer} is waiting for your decision`,
      value: `Fit ${item.fitScore}`,
    });
  }
  if (!items.length) {
    items.push({
      detail: 'No recent activity is recorded yet.',
      label: 'No new updates',
      value: 'Today',
    });
  }
  return items.slice(0, 5);
}

function buildCandidatePipeline(status: CareerStatus) {
  const trust = status.operationalTrust;
  return [
    { detail: 'Verified active qualified opportunities', href: '/career-os#opportunities', label: 'Opportunities', value: trust.verifiedCounts.opportunities },
    { detail: 'Waiting for your decision', href: '/career-os#review-queue', label: 'Review', value: trust.verifiedCounts.reviewQueue },
    { detail: 'Active execution with current worker heartbeat', href: '/career-os#active-executions', label: 'Applying', value: trust.verifiedCounts.applying },
    { detail: 'Submitted, confirmed, and duplicate-locked', href: '/career-os#applications', label: 'Submitted', value: trust.verifiedCounts.submitted },
    { detail: 'Interview activity recorded', href: '/career-os#interviews', label: 'Interviews', value: trust.verifiedCounts.interviews },
  ];
}

function buildSystemNotice(status: CareerStatus) {
  if (status.environment !== 'production') {
    return status.blocker || 'Career OS is showing the last verified production snapshot until the live database connection is restored.';
  }
  if (status.operationalTrust.verifiedCounts.systemIssues > 0) {
    return `${status.operationalTrust.verifiedCounts.systemIssues} verified system issue${status.operationalTrust.verifiedCounts.systemIssues === 1 ? ' is' : 's are'} still affecting active automation.`;
  }
  if (status.operationalTrust.dashboardCountMismatches.length > 0) {
    return 'Candidate Mode is suppressing unsupported or stale records until they are fully verified in production evidence.';
  }
  return '';
}

function buildCandidateOpportunitySnapshot(status: CareerStatus) {
  const verifiedIds = new Set(
    status.operationalTrust.verifiedOpportunityRecords
      .map((record) => String(record.opportunityId || ''))
      .filter(Boolean),
  );
  const opportunities = status.evidence.jobPostings.length ? status.evidence.jobPostings : status.evidence.seededOpportunities;
  return opportunities
    .filter((opportunity) => verifiedIds.has(String(opportunity.id || '')))
    .slice(0, 6);
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

function formatDateTime(value: unknown) {
  if (!value) return 'not recorded';
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'America/Chicago',
    year: 'numeric',
  }).format(new Date(String(value)));
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
  if (variant === 'employment') return 'Career OS will save the verified employment details and queue the application for the next supported run.';
  if (variant === 'account') return 'Career OS will verify that the account step advanced and continue only when the employer page is safely accessible again.';
  if (variant === 'legal') return 'Career OS will store this approval with an exact fingerprint and continue only when the same employer text is still present.';
  if (variant === 'captcha') return 'Career OS will recheck the employer page after you complete the visible verification step.';
  if (variant === 'missing_fact') return 'Career OS will save this verified answer and use it on the next supported run.';
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
  if (/geico/i.test(execution.employer)) return 'Open GEICO Workday';
  return 'Open Employer Workday';
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

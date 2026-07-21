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

export default async function CareerOsPage() {
  const status = await getCareerOsStatus();
  const opportunities = status.evidence.jobPostings.length ? status.evidence.jobPostings : status.evidence.seededOpportunities;
  const artifacts = status.evidence.artifacts.filter((artifact) => artifact.artifact_type === 'targeted_resume' || artifact.artifact_type === 'application_package');
  const applications = status.evidence.applications;
  const dailyWorkflow = status.dailyWorkflow;
  const pipelineHealth = dailyWorkflow.pipelineHealth;
  const actionCenterCards = buildActionCenterCards(status);
  const pendingActionCards = actionCenterCards.filter((card) => card.variant !== 'terminal');
  const submittedApplicationIds = new Set(status.submittedApplicationIds);
  const submittedCards = actionCenterCards.filter((card) => submittedApplicationIds.has(String(card.application.id)));
  const resumePerformance = buildResumePerformance(artifacts, applications, status);
  const activitySnapshot = buildActivitySnapshot(status.evidence.workflowEvents, applications);
  const candidateSummary = buildCandidateSummary(status);
  const priorities = buildTodayPriorities(status, pendingActionCards);
  const recentActivity = buildRecentActivity(status, submittedCards);
  const candidatePipeline = buildCandidatePipeline(status);
  const systemNotice = buildSystemNotice(status);
  const opportunitySnapshot = buildCandidateOpportunitySnapshot(status, opportunities);
  const navItems = [
    { href: '/career-os', label: 'Home' },
    { href: '/career-os#opportunities', label: 'Opportunities' },
    { href: '/career-os#review-queue', label: 'My Review Queue', count: status.reviewQueue.total },
    { href: '/career-os#action-center', label: 'My Action Center', count: pendingActionCards.length },
    { href: '/career-os#applications', label: 'Applications', count: status.submittedApplications },
    { href: '/career-os#interviews', label: 'Interviews', count: pipelineHealth.interviews },
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
            <Metric href="/career-os#applications" label="Applications Submitted" value={status.submittedApplications} />
            <Metric href="/career-os#review-queue" label="Opportunities to Review" value={status.reviewQueue.total} />
            <Metric href="/career-os#action-center" label="Actions Required" value={pendingActionCards.length} />
            <Metric href="/career-os#interviews" label="Interviews" value={pipelineHealth.interviews} />
          </div>
          <div className="career-os-summary">
            <p>{candidateSummary.detailLine}</p>
            <p>{candidateSummary.nextLine}</p>
          </div>
          <div className="cta-row">
            <a className="button secondary" href="/career-os#review-queue">Open My Review Queue</a>
            <a className="button primary" href="/career-os#action-center">Open My Action Center</a>
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
        <p>{status.reviewQueue.total} opportunit{status.reviewQueue.total === 1 ? 'y needs' : 'ies need'} your decision. Estimated review time: {status.reviewQueue.estimatedReviewMinutes} minute{status.reviewQueue.estimatedReviewMinutes === 1 ? '' : 's'}.</p>
        <div className="career-os-metrics secondary" aria-label="Career OS review queue status">
          <Metric detail="Needs your decision" href="/career-os#review-queue-list" label="Awaiting Review" value={status.reviewQueue.total} />
          <Metric detail="Minutes at two per role" href="/career-os#review-queue-list" label="Estimated Review Time" value={status.reviewQueue.estimatedReviewMinutes} />
          <Metric detail={status.reviewQueue.highestScoringRole || 'No review role queued'} href="/career-os#review-queue-list" label="Highest Fit" value={status.reviewQueue.items[0]?.fitScore || 0} />
          <Metric detail="Same live records as the status API" href="/career-os#review-queue-list" label="Rendered Cards" value={status.reviewQueue.items.length} />
        </div>
        <div className="career-os-action-center" id="review-queue-list">
          {status.reviewQueue.items.map((item) => (
            <article className="career-os-action-card" id={`review-opportunity-${item.opportunityId}`} key={item.opportunityId}>
              <div className="career-os-card-header">
                <div>
                  <p className="career-os-card-label">Employer and Role</p>
                  <h3>{item.employer}</h3>
                  <p>{item.title}</p>
                  <p>{item.location}</p>
                </div>
                <div className="career-os-status-pill">Needs Your Review</div>
              </div>
              <div className="career-os-card-grid">
                <section>
                  <p className="career-os-card-label">Role Details</p>
                  <p>Requisition {item.requisitionId || 'not published'}</p>
                  <p>Fit {item.fitScore}</p>
                  <p>{item.postedAt ? `Posted ${formatDate(item.postedAt)}` : 'Posting date not published'}</p>
                </section>
                <section>
                  <p className="career-os-card-label">Why It May Fit</p>
                  <ul className="career-os-bullets">
                    {item.qualificationReasons.slice(0, 3).map((reason) => <li key={`${item.opportunityId}-${reason}`}>{reason}</li>)}
                  </ul>
                </section>
                <section>
                  <p className="career-os-card-label">Potential Concerns</p>
                  <ul className="career-os-bullets">
                    {(item.concerns.length ? item.concerns : ['No major concern is recorded yet.']).slice(0, 3).map((concern) => <li key={`${item.opportunityId}-${concern}`}>{concern}</li>)}
                  </ul>
                </section>
                <section>
                  <p className="career-os-card-label">Compensation</p>
                  <p>{item.compensationText || 'Compensation not posted'}</p>
                </section>
              </div>
              <ReviewQueueActionControl
                actionToken={pageActionToken}
                actionTokenExpiresAt={actionTokenExpiresAt}
                employer={item.employer}
                opportunityId={item.opportunityId}
                title={item.title}
              />
              <div className="career-os-link-row">
                {item.canonicalUrl ? <a className="text-link" href={item.canonicalUrl}>Open Posting</a> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="action-center" className="career-os-band">
        <h2>My Action Center</h2>
        <p>{pendingActionCards.length} application step{pendingActionCards.length === 1 ? '' : 's'} need your help before Career OS can continue.</p>
        <div className="career-os-metrics secondary" aria-label="Career OS action center status">
          <Metric detail="Needs your help" href="/career-os#action-center-list" label="Action Center" value={pendingActionCards.length} />
          <Metric detail="Ready to continue after your step" href="/career-os#action-center-list" label="Ready to Resume" value={status.readyForAutomation} />
          <Metric detail="Already submitted and locked" href="/career-os#applications" label="Submitted" value={status.submittedApplications} />
          <Metric detail="Only shown when they affect active work" href="/career-os/admin#system-health" label="System Issues" value={status.applicationExecution.queueStates.blocked_technical} />
        </div>
        <div className="career-os-action-center" id="action-center-list">
          {pendingActionCards.map((card) => {
            const cta = actionCenterCardToCta(card);
            return (
              <article className="career-os-action-card" id={applicationAnchorId(card.application)} key={String(card.application.id)}>
                <div className="career-os-card-header">
                  <div>
                    <p className="career-os-card-label">Employer and Role</p>
                    <h3>{card.employer}</h3>
                    <p>{card.role}</p>
                  </div>
                  <div className="career-os-status-pill">{card.statusLabel}</div>
                </div>
                <div className="career-os-card-grid">
                  <section>
                    <p className="career-os-card-label">Status</p>
                    <p>{card.statusLabel}</p>
                    <p>{card.ats} · Requisition {card.requisitionId}</p>
                  </section>
                  <section>
                    <p className="career-os-card-label">What We Need</p>
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
                    <p><strong>Estimated Time:</strong> {card.estimatedTime}</p>
                  </section>
                </div>
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
      </section>

      <section id="opportunities-list" className="career-os-band">
        <h2>Opportunities</h2>
        <p>{status.activeQualifiedOpportunities} active opportunities currently match your policy and role band.</p>
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
          {submittedCards.map((card) => (
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

      <section id="interviews" className="career-os-band">
        <h2>Interviews</h2>
        <p>{pipelineHealth.interviews} interview{pipelineHealth.interviews === 1 ? '' : 's'} and {pipelineHealth.recruiterResponses} recruiter response{pipelineHealth.recruiterResponses === 1 ? '' : 's'} are currently recorded.</p>
        <div className="career-os-list compact">
          <DetailRow detail="Recruiter replies or employer responses recorded in production." label="Recruiter Responses" value={String(pipelineHealth.recruiterResponses)} />
          <DetailRow detail="Application-to-interview conversion from the live pipeline." label="Conversion Rate" value={`${pipelineHealth.applicationToInterviewConversionRate.toFixed(1)}%`} />
          <DetailRow detail="Open follow-up items connected to applications or recruiter replies." label="Follow-ups" value={String(activitySnapshot.followUps)} />
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
  const newJobs = status.dailyWorkflow.pipelineHealth.newOpportunitiesToday;
  const submittedToday = status.dailyWorkflow.pipelineHealth.applicationsSubmittedToday;
  const reviewCount = status.reviewQueue.total;
  const actionCount = buildActionCenterCards(status).filter((card) => card.variant !== 'terminal').length;

  return {
    detailLine: `Career OS found ${newJobs} new job${newJobs === 1 ? '' : 's'}, submitted ${submittedToday} application${submittedToday === 1 ? '' : 's'} today, and needs your input on ${reviewCount} opportunit${reviewCount === 1 ? 'y' : 'ies'} and ${actionCount} application step${actionCount === 1 ? '' : 's'}.`,
    nextLine: reviewCount
      ? 'Your next best move is to clear the review queue so strong matches can move into application processing.'
      : actionCount
        ? 'Your next best move is to complete the open action-center steps so Career OS can resume the saved applications.'
        : 'No decision is blocking Career OS right now. The system will keep processing qualified roles automatically.',
    summaryLine: `${status.activeQualifiedOpportunities} qualified opportunities are live today.`,
  };
}

function buildTodayPriorities(status: CareerStatus, actionCenterCards: ActionCenterCard[]) {
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

  for (const card of actionCenterCards.filter((item) => item.variant !== 'technical').slice(0, 2)) {
    priorities.push({
      actionLabel: card.primaryLabel,
      estimatedTime: card.estimatedTime,
      href: `/career-os#${applicationAnchorId(card.application)}`,
      key: `action-${card.application.id}`,
      reason: priorityReasonForActionCard(card),
      subtitle: card.employer,
      title: card.role,
      type: 'Action Center',
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

  if (status.applicationExecution.queueStates.blocked_technical > 0) {
    priorities.push({
      actionLabel: 'Open Admin',
      estimatedTime: '1 minute',
      href: '/career-os/admin#system-health',
      key: 'system-issue',
      reason: 'A live system issue is affecting an active application.',
      subtitle: `${status.applicationExecution.queueStates.blocked_technical} active issue${status.applicationExecution.queueStates.blocked_technical === 1 ? '' : 's'}`,
      title: 'System Issue',
      type: 'Notice',
    });
  }

  return priorities.slice(0, 5);
}

function priorityReasonForActionCard(card: ActionCenterCard) {
  if (card.variant === 'employment') return 'This employer needs your saved Verizon employment details before the application can continue.';
  if (card.variant === 'account') return 'This employer needs you to finish a sign-in or account step before Career OS can continue.';
  if (card.variant === 'legal') return 'This employer needs your approval of the exact legal text before the application can continue.';
  if (card.variant === 'captcha') return 'This employer needs you to complete a visible verification step before the application can continue.';
  if (card.variant === 'missing_fact') return 'This employer needs one saved answer before the application can continue.';
  if (card.variant === 'technical') return 'Career OS is waiting to retry this application after a system issue is fixed.';
  return card.reason;
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
  return [
    { detail: 'Active qualified opportunities', href: '/career-os#opportunities', label: 'Opportunities', value: status.activeQualifiedOpportunities },
    { detail: 'Waiting for your decision', href: '/career-os#review-queue', label: 'Review', value: status.reviewQueue.total },
    { detail: 'Application steps in progress', href: '/career-os#action-center', label: 'Applying', value: status.inProgress },
    { detail: 'Submitted and locked', href: '/career-os#applications', label: 'Submitted', value: status.submittedApplications },
    { detail: 'Interview activity recorded', href: '/career-os#interviews', label: 'Interviews', value: status.dailyWorkflow.pipelineHealth.interviews },
  ];
}

function buildSystemNotice(status: CareerStatus) {
  if (status.environment !== 'production') {
    return status.blocker || 'Career OS is showing the last verified production snapshot until the live database connection is restored.';
  }
  if (status.applicationExecution.queueStates.blocked_technical > 0) {
    return `${status.applicationExecution.queueStates.blocked_technical} application${status.applicationExecution.queueStates.blocked_technical === 1 ? ' is' : 's are'} paused because Career OS could not continue automatically.`;
  }
  return '';
}

function buildCandidateOpportunitySnapshot(status: CareerStatus, opportunities: JsonRecord[]) {
  const reviewIds = new Set(status.reviewQueue.items.map((item) => item.opportunityId));
  const reviewRows = opportunities.filter((opportunity) => reviewIds.has(String(opportunity.id || '')));
  const fallbackRows = opportunities.filter((opportunity) => !reviewIds.has(String(opportunity.id || '')));
  return [...reviewRows, ...fallbackRows].slice(0, 6);
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

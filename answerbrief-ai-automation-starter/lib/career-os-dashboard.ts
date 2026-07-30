import { canonicalQueueState, careerOsActionMetadata } from './career-os-queue';
import {
  countCanonicalSubmittedApplicationsOnDate,
  selectCanonicalSubmittedApplications,
} from './career-os-submission-metrics';

type Row = Record<string, unknown>;

type BlockerType =
  | 'CAPTCHA'
  | 'MFA'
  | 'email verification'
  | 'missing verified answer'
  | 'legal consent'
  | 'identity verification'
  | 'resume upload'
  | 'unavailable credentials'
  | 'employer-site failure';

export type DashboardActionLink = {
  external?: boolean;
  href: string;
  label: string;
};

export type DashboardMetric = {
  explanation?: string;
  label: string;
  value: string | number;
};

export type DashboardOpportunity = {
  actions: DashboardActionLink[];
  applicationStatusHref?: string;
  company: string;
  compensation: string;
  fit: number;
  freshness: string;
  id: string;
  location: string;
  requisition: string;
  status: string;
  tags: string[];
  title: string;
  why: string;
};

export type DashboardTimelineItem = {
  company: string;
  event: string;
  id: string;
  nextStep: string;
  occurredAt: string;
  state: string;
  title: string;
  tomasMustAct: boolean;
};

export type DashboardBlocker = {
  action: DashboardActionLink;
  company: string;
  id: string;
  reason: string;
  title: string;
  tomasMustDo: string;
  type: BlockerType;
  updatedAt: string;
  whatIsBlocked: string;
};

export type DashboardNextAction = {
  action: string;
  affectedRoles: string[];
  id: string;
  lastAttempt: string;
  outcome: string;
  scheduledTime: string;
  status: string;
};

export type DashboardModel = {
  blockers: DashboardBlocker[];
  lastAutonomousRun: string;
  metrics: DashboardMetric[];
  nextActions: DashboardNextAction[];
  nextScheduledRun: string;
  opportunities: DashboardOpportunity[];
  recruiterUpdates: number;
  submittedToday: number;
  timeline: DashboardTimelineItem[];
  totalSubmitted: number;
  verifiedInterviews: number;
};

export function buildDashboardModel({
  applications,
  automationRuns,
  now = new Date(),
  postings,
  reports,
  workflowEvents,
}: {
  applications: Row[];
  automationRuns: Row[];
  now?: Date;
  postings: Row[];
  reports: Row[];
  workflowEvents: Row[];
}): DashboardModel {
  const report = reports[0] || {};
  const distinctApplications = selectDistinctApplications(applications);
  const eventsByApplication = groupWorkflowEvents(workflowEvents);
  const blockers = distinctApplications
    .map((application) => buildStructuredBlocker(application, eventsByApplication.get(applicationIdentity(application)) || []))
    .filter(Boolean) as DashboardBlocker[];
  const blockersByApplication = new Map(blockers.map((blocker) => [blocker.id, blocker]));
  const timeline = distinctApplications
    .map((application) => buildTimelineItem(application, eventsByApplication.get(applicationIdentity(application)) || [], blockersByApplication.get(applicationIdentity(application))))
    .sort((left, right) => isoMillis(right.occurredAt) - isoMillis(left.occurredAt))
    .slice(0, 12);
  const opportunities = buildDashboardOpportunities(postings, distinctApplications, eventsByApplication, blockersByApplication);
  const submittedToday = countCanonicalSubmittedApplicationsOnDate(applications, now);
  const totalSubmitted = selectCanonicalSubmittedApplications(applications).length;
  const recruiterUpdates = distinctApplications.filter((application) => {
    return hasRecruiterUpdate(application, eventsByApplication.get(applicationIdentity(application)) || []);
  }).length;
  const verifiedInterviews = distinctApplications.filter((application) => {
    return hasVerifiedInterviewEvidence(application, eventsByApplication.get(applicationIdentity(application)) || []);
  }).length;
  const nextScheduledRun = readNextRun(report);
  const nextActions = buildNextActions(distinctApplications, nextScheduledRun);

  return {
    blockers,
    lastAutonomousRun: formatDateTime(
      clean(automationRuns[0]?.finished_at || automationRuns[0]?.started_at || report.generated_at),
    ) || 'No autonomous run recorded yet.',
    metrics: [
      { label: 'Last autonomous run', value: formatDateTime(clean(automationRuns[0]?.finished_at || automationRuns[0]?.started_at || report.generated_at)) || 'Not recorded yet' },
      { label: 'Next scheduled run', value: nextScheduledRun || 'Not scheduled yet' },
      { label: 'Roles reviewed today', value: countRolesReviewedToday(postings, now) },
      { label: 'Packages prepared today', value: countPackagesPreparedToday(distinctApplications, now) },
      {
        explanation: submittedToday === 0
          ? zeroSubmissionExplanation({
              blockers: blockers.length,
              packagesPreparedToday: countPackagesPreparedToday(distinctApplications, now),
              rolesReviewedToday: countRolesReviewedToday(postings, now),
            })
          : undefined,
        label: 'Submitted today',
        value: submittedToday,
      },
      { label: 'Total submitted', value: totalSubmitted },
      { label: 'Recruiter updates', value: recruiterUpdates },
      { label: 'Verified interviews', value: verifiedInterviews },
      { label: 'Unresolved blockers', value: blockers.length },
    ],
    nextActions,
    nextScheduledRun,
    opportunities,
    recruiterUpdates,
    submittedToday,
    timeline,
    totalSubmitted,
    verifiedInterviews,
  };
}

export function buildDashboardOpportunities(
  postings: Row[],
  applications: Row[],
  eventsByApplication: Map<string, Row[]>,
  blockersByApplication: Map<string, DashboardBlocker>,
) {
  const deduped = new Map<string, DashboardOpportunity>();

  for (const row of postings) {
    const raw = asRecord(row.raw_record);
    const company = clean(row.company || row.employer || raw.company || raw.employer) || 'Company not saved';
    const title = clean(row.title || row.position || raw.title) || 'Role not saved';
    const requisition = clean(row.external_requisition_id || raw.requisition_id || raw.job_id);
    const canonicalUrl = clean(row.canonical_url || raw.canonical_url || raw.apply_url || raw.application_url);
    const key = compact(`${company}:${requisition || canonicalUrl || title}`);
    if (deduped.has(key) || isClosedPosting(row)) continue;

    const fit = number(row.fit_score || row.match_score);
    if (fit && fit < 65) continue;

    const text = roleText(row);
    const tags = new Set<string>();
    if (fit >= 85) tags.add('Best match');
    if (hasAny(text, ['ai', 'automation', 'machine learning'])) tags.add('AI leadership');
    if (daysSince(row.created_at || row.last_checked_at || row.updated_at) <= 14) tags.add('Recently posted');
    if (number(row.compensation_max_usd) >= 220000) tags.add('High compensation');

    const matchedApplication = findApplicationForPosting(row, applications);
    const applicationEvents = matchedApplication ? eventsByApplication.get(applicationIdentity(matchedApplication)) || [] : [];
    const blocker = matchedApplication ? blockersByApplication.get(applicationIdentity(matchedApplication)) : undefined;

    deduped.set(key, {
      actions: buildOpportunityActions({
        application: matchedApplication,
        blocker,
        canonicalUrl,
        opportunityId: clean(row.id || key),
      }),
      applicationStatusHref: matchedApplication ? `#application-${applicationIdentity(matchedApplication)}` : undefined,
      company,
      compensation: compensation(row),
      fit,
      freshness: freshness(row.last_checked_at || row.updated_at || row.created_at),
      id: clean(row.id || key),
      location: clean(row.location || raw.location) || 'Location not listed',
      requisition,
      status: opportunityStage(row, matchedApplication, applicationEvents, blocker),
      tags: Array.from(tags).length ? Array.from(tags) : ['Qualified'],
      title,
      why: whyFit(text),
    });
  }

  return Array.from(deduped.values()).sort((left, right) => right.fit - left.fit).slice(0, 18);
}

export function buildStructuredBlocker(application: Row, workflowEvents: Row[]): DashboardBlocker | null {
  const metadata = careerOsActionMetadata(application);
  const type = classifyStructuredBlocker(application, workflowEvents);
  if (!type) return null;

  return {
    action: {
      external: isExternalHref(metadata.href),
      href: metadata.href || `#application-${applicationIdentity(application)}`,
      label: metadata.href ? 'Continue in employer site' : 'Resolve blocker details',
    },
    company: applicationCompany(application),
    id: applicationIdentity(application),
    reason: blockerReason(type, metadata.disabledReason, application),
    title: applicationTitle(application),
    tomasMustDo: metadata.whatTomasMustDo || blockerInstruction(type),
    type,
    updatedAt: clean(application.updated_at || application.created_at || workflowEvents[0]?.occurred_at || new Date().toISOString()),
    whatIsBlocked: `${applicationCompany(application)} · ${applicationTitle(application)} application progress`,
  };
}

export function buildTimelineItem(application: Row, workflowEvents: Row[], blocker?: DashboardBlocker): DashboardTimelineItem {
  const latestEvent = latestWorkflowEvent(workflowEvents);
  const interviewVerified = hasVerifiedInterviewEvidence(application, workflowEvents);
  const exactEvent = workflowEventSummary(latestEvent) || applicationEventSummary(application, blocker, interviewVerified);

  return {
    company: applicationCompany(application),
    event: exactEvent,
    id: applicationIdentity(application),
    nextStep: timelineNextStep(application, blocker, interviewVerified),
    occurredAt: clean(latestEvent?.occurred_at || latestEvent?.created_at || application.updated_at || application.created_at || new Date().toISOString()),
    state: opportunityStage({}, application, workflowEvents, blocker),
    title: applicationTitle(application),
    tomasMustAct: Boolean(blocker),
  };
}

export function buildNextActions(applications: Row[], nextScheduledRun: string) {
  return applications
    .map((application) => buildNextAction(application, nextScheduledRun))
    .filter(Boolean) as DashboardNextAction[];
}

export function buildNextAction(application: Row, nextScheduledRun: string): DashboardNextAction | null {
  const queueState = canonicalQueueState(application);
  if (!['queued', 'running', 'retry_scheduled'].includes(queueState)) return null;

  const raw = asRecord(application.raw_record);
  const lastReport = asRecord(raw.browser_worker_last_report);
  const metadata = careerOsActionMetadata(application);

  return {
    action: metadata.label,
    affectedRoles: [`${applicationCompany(application)} · ${applicationTitle(application)}`],
    id: applicationIdentity(application),
    lastAttempt: formatDateTime(clean(lastReport.timestamp || application.updated_at)) || 'No attempt recorded yet',
    outcome: clean(lastReport.summary || lastReport.status || raw.reason_not_submitted || application.next_action) || 'Waiting for the next worker pass.',
    scheduledTime: formatDateTime(clean(raw.next_retry_at || raw.retry_at || nextScheduledRun)) || 'Not scheduled yet',
    status: nextActionStatus(queueState),
  };
}

export function buildOpportunityActions({
  application,
  blocker,
  canonicalUrl,
  opportunityId,
}: {
  application?: Row;
  blocker?: DashboardBlocker;
  canonicalUrl: string;
  opportunityId: string;
}) {
  const actions: DashboardActionLink[] = [];

  if (canonicalUrl) {
    actions.push({ external: true, href: canonicalUrl, label: 'View role' });
  }

  actions.push({ href: `#fit-analysis-${opportunityId}`, label: 'View fit analysis' });

  if (application) {
    actions.push({ href: `#application-${applicationIdentity(application)}`, label: 'View application status' });
  }

  if (blocker) {
    actions.push({ external: blocker.action.external, href: blocker.action.href || `#blocker-${blocker.id}`, label: 'Resolve blocker' });
  }

  return actions;
}

export function classifyStructuredBlocker(application: Row, workflowEvents: Row[]) {
  const queueState = canonicalQueueState(application);
  if (!['waiting_on_tomas', 'blocked_technical'].includes(queueState) && !hasOpenHumanGateEvent(workflowEvents)) return null;

  const text = blockerText(application, workflowEvents);
  if (text.includes('captcha')) return 'CAPTCHA';
  if (text.includes('email verification') || text.includes('email code') || text.includes('verification code sent by email')) return 'email verification';
  if (text.includes('mfa') || text.includes('otp') || text.includes('security code') || text.includes('authenticator')) return 'MFA';
  if (text.includes('missing answer') || text.includes('verified employment history') || text.includes('employment history facts') || text.includes('requires additional verified answers') || text.includes('missing required fields')) {
    return 'missing verified answer';
  }
  if (text.includes('legal') || text.includes('privacy') || text.includes('terms') || text.includes('consent') || text.includes('nda') || text.includes('attestation') || text.includes('policy')) {
    return 'legal consent';
  }
  if (text.includes('identity') || text.includes('self-identification')) return 'identity verification';
  if (text.includes('resume upload') || text.includes('upload resume') || text.includes('upload cv')) return 'resume upload';
  if (text.includes('account locked') || text.includes('wrong password') || text.includes('password reset') || text.includes('unavailable credentials') || text.includes('waiting_for_account_creation') || text.includes('waiting_for_sign_in') || text.includes('create account') || text.includes('sign in')) {
    return 'unavailable credentials';
  }
  if (queueState === 'blocked_technical' || text.includes('technical blocker') || text.includes('technical failure') || text.includes('file-upload limitation') || text.includes('browser_worker_blocked_technical') || text.includes('stale checkpoint')) {
    return 'employer-site failure';
  }

  return null;
}

export function hasVerifiedInterviewEvidence(application: Row, workflowEvents: Row[]) {
  const raw = asRecord(application.raw_record);
  const lifecycle = clean(application.lifecycle_stage).toLowerCase();
  const nextAction = clean(application.next_action).toLowerCase();

  if (['interview_requested', 'interview_scheduled', 'interview_completed'].some((token) => lifecycle.includes(token) || nextAction.includes(token))) {
    return true;
  }

  if (clean(raw.interview_stage) || clean(raw.interview_record_id) || clean(raw.interview_scheduled_at) || clean(raw.recruiter_invitation_at) || clean(raw.calendar_event_id)) {
    return true;
  }

  return workflowEvents.some((event) => {
    const text = `${event.event_type || ''} ${event.status || ''}`.toLowerCase();
    return hasAny(text, ['interview_requested', 'interview_scheduled', 'interview_completed', 'interview_invitation', 'recruiter_invitation']);
  });
}

export function opportunityStage(posting: Row, application?: Row, workflowEvents: Row[] = [], blocker?: DashboardBlocker) {
  if (isClosedPosting(posting) || isClosedApplication(application)) return 'Closed';
  if (blocker) return 'Human input required';
  if (application && hasVerifiedInterviewEvidence(application, workflowEvents)) return 'Awaiting employer';

  const queueState = application ? canonicalQueueState(application) : undefined;
  if (queueState === 'confirmed' || queueState === 'submitted') {
    return daysSince(application?.updated_at) <= 1 ? 'Submitted' : 'Awaiting employer';
  }
  if (queueState === 'running' || queueState === 'retry_scheduled') return 'Application in progress';
  if (queueState === 'queued' || queueState === 'package_ready') return 'Ready to apply';
  if (queueState === 'package_pending') return 'Package preparation';
  if (queueState === 'qualified') return 'Qualified';
  if (queueState === 'discovered' || queueState === 'qualification_pending') return 'Ready for qualification';

  const raw = asRecord(posting.raw_record);
  const decision = clean(raw.review_decision).toLowerCase();
  if (decision === 'tailor') return 'Package preparation';
  if (decision === 'save' || decision === 'watch') return 'Qualified';
  return 'Ready for qualification';
}

export function zeroSubmissionExplanation({
  blockers,
  packagesPreparedToday,
  rolesReviewedToday,
}: {
  blockers: number;
  packagesPreparedToday: number;
  rolesReviewedToday: number;
}) {
  if (blockers > 0) {
    return `No confirmed submission was recorded today because Career OS is paused on ${blockers} verified human-only blocker${blockers === 1 ? '' : 's'}.`;
  }
  if (packagesPreparedToday > 0) {
    return 'No confirmed submission was recorded today. Career OS spent this cycle preparing application packages so the next autonomous run can apply safely.';
  }
  if (rolesReviewedToday > 0) {
    return 'No confirmed submission was recorded today. Career OS spent this cycle reviewing live roles and qualifying only the strongest matches.';
  }
  return 'No confirmed submission was recorded today because no role has reached a verified submission checkpoint yet.';
}

export function selectDistinctApplications(applications: Row[]) {
  const bestByIdentity = new Map<string, Row>();

  for (const application of applications) {
    const identity = applicationIdentity(application);
    const existing = bestByIdentity.get(identity);
    if (!existing || isoMillis(clean(application.updated_at || application.created_at)) > isoMillis(clean(existing.updated_at || existing.created_at))) {
      bestByIdentity.set(identity, application);
    }
  }

  return Array.from(bestByIdentity.values()).sort((left, right) => {
    return isoMillis(clean(right.updated_at || right.created_at)) - isoMillis(clean(left.updated_at || left.created_at));
  });
}

function applicationCompany(application: Row) {
  return clean(application.employer || asRecord(application.raw_record).company) || 'Employer not saved';
}

function applicationEventSummary(application: Row, blocker: DashboardBlocker | undefined, interviewVerified: boolean) {
  if (blocker) return `${blocker.type} blocker recorded`;
  if (interviewVerified) return 'Verified interview activity recorded';
  const queueState = canonicalQueueState(application);
  if (queueState === 'confirmed' || queueState === 'submitted') return 'Submission confirmed';
  if (queueState === 'running') return 'Application is actively running';
  if (queueState === 'queued') return 'Application returned to the autonomous queue';
  if (queueState === 'package_pending') return 'Package preparation is in progress';
  if (queueState === 'package_ready') return 'Application package is ready';
  if (queueState === 'qualified') return 'Role qualified for application';
  if (queueState === 'inactive' || queueState === 'duplicate' || queueState === 'ineligible') return 'Application closed';
  return 'Qualification review recorded';
}

function applicationIdentity(application: Row) {
  const raw = asRecord(application.raw_record);
  return compact(
    application.id
      || application.opportunity_id
      || `${application.employer}:${application.position}:${raw.external_requisition_id || raw.requisition_id || raw.job_id || raw.canonical_url || raw.application_url}`,
  ) || compact(`${application.employer}:${application.position}:${application.updated_at}`);
}

function applicationTitle(application: Row) {
  return clean(application.position || application.title || asRecord(application.raw_record).title) || 'Role not saved';
}

function asRecord(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

function blockerInstruction(type: BlockerType) {
  if (type === 'CAPTCHA') return 'Complete the employer CAPTCHA, then return so Career OS can resume.';
  if (type === 'MFA') return 'Complete the employer MFA step, then let Career OS continue.';
  if (type === 'email verification') return 'Open the employer email verification step and finish it before resuming.';
  if (type === 'missing verified answer') return 'Provide the verified answer that the ATS requested before resuming.';
  if (type === 'legal consent') return 'Review and approve the exact legal or consent text before Career OS continues.';
  if (type === 'identity verification') return 'Finish the employer identity check before resuming automation.';
  if (type === 'resume upload') return 'Upload the exact resume package the employer requested before continuing.';
  if (type === 'unavailable credentials') return 'Open the employer account checkpoint and resolve the sign-in requirement.';
  return 'Review the employer-site failure details before trying again.';
}

function blockerReason(type: BlockerType, metadataReason: string, application: Row) {
  if (metadataReason) return metadataReason;
  if (type === 'employer-site failure') return 'Career OS stopped because the employer workflow failed after the saved checkpoint.';
  return `Career OS stopped because a ${type} checkpoint cannot be completed autonomously.`;
}

function blockerText(application: Row, workflowEvents: Row[]) {
  const raw = asRecord(application.raw_record);
  return [
    application.lifecycle_stage,
    application.next_action,
    raw.blocker_type,
    raw.execution_status,
    raw.reason_not_submitted,
    JSON.stringify(raw.browser_worker_last_report || {}),
    ...workflowEvents.map((event) => `${event.event_type || ''} ${event.status || ''} ${event.evidence_text || ''}`),
  ].map(clean).join(' ').toLowerCase();
}

function clean(value: unknown) {
  return String(value || '').trim();
}

function compact(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function compensation(row: Row) {
  const min = number(row.compensation_min_usd);
  const max = number(row.compensation_max_usd);
  if (min && max) return `${money(min)}-${money(max)}`;
  if (max) return `Up to ${money(max)}`;
  return clean(row.compensation_text) || 'Compensation not posted';
}

function countPackagesPreparedToday(applications: Row[], now: Date) {
  const today = centralDateKey(now.toISOString());
  return applications.filter((application) => {
    if (!hasPackageEvidence(application)) return false;
    const raw = asRecord(application.raw_record);
    const timestamp = clean(raw.package_prepared_at || raw.resume_generated_at || application.updated_at || application.created_at);
    return centralDateKey(timestamp) === today;
  }).length;
}

function countRolesReviewedToday(postings: Row[], now: Date) {
  const today = centralDateKey(now.toISOString());
  const seen = new Set<string>();
  let count = 0;
  for (const posting of postings) {
    if (isClosedPosting(posting)) continue;
    const raw = asRecord(posting.raw_record);
    const timestamp = clean(raw.review_actioned_at || posting.last_checked_at || posting.updated_at || posting.created_at);
    if (centralDateKey(timestamp) !== today) continue;
    const key = compact(`${posting.company || posting.employer}:${posting.external_requisition_id || raw.requisition_id || raw.job_id || posting.title}`);
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }
  return count;
}

function daysSince(value: unknown) {
  const millis = isoMillis(clean(value));
  if (!millis) return 9999;
  return Math.max(0, Math.floor((Date.now() - millis) / 86400000));
}

function findApplicationForPosting(posting: Row, applications: Row[]) {
  const raw = asRecord(posting.raw_record);
  const postingId = clean(posting.id);
  const requisition = clean(posting.external_requisition_id || raw.requisition_id || raw.job_id);
  const canonicalUrl = normalizeUrl(posting.canonical_url || raw.canonical_url || raw.apply_url || raw.application_url);
  const companyKey = compact(posting.company || posting.employer);
  const titleKey = normalizeTitle(posting.title || posting.position || raw.title);

  return applications.find((application) => {
    const appRaw = asRecord(application.raw_record);
    if (clean(application.opportunity_id) && clean(application.opportunity_id) === postingId) return true;
    const applicationUrl = normalizeUrl(appRaw.canonical_url || appRaw.application_url || appRaw.job_url);
    const applicationReq = clean(appRaw.external_requisition_id || appRaw.requisition_id || appRaw.job_id || application.opportunity_id);
    if (canonicalUrl && canonicalUrl === applicationUrl) return true;
    if (requisition && requisition === applicationReq) return true;
    return compact(application.employer) === companyKey && normalizeTitle(application.position || application.title) === titleKey;
  });
}

function formatDateTime(value: string) {
  const parsed = isoMillis(value);
  if (!parsed) return '';
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(parsed));
}

function freshness(value: unknown) {
  const days = daysSince(value);
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days <= 14) return `Updated ${days} days ago`;
  return `Checked ${days} days ago`;
}

function groupWorkflowEvents(workflowEvents: Row[]) {
  const grouped = new Map<string, Row[]>();
  for (const event of workflowEvents) {
    const identity = compact(event.application_id);
    if (!identity) continue;
    const existing = grouped.get(identity) || [];
    existing.push(event);
    grouped.set(identity, existing.sort((left, right) => isoMillis(clean(right.occurred_at || right.created_at)) - isoMillis(clean(left.occurred_at || left.created_at))));
  }
  return grouped;
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function hasOpenHumanGateEvent(workflowEvents: Row[]) {
  return workflowEvents.some((event) => {
    const eventType = clean(event.event_type).toLowerCase();
    const status = clean(event.status).toLowerCase();
    return eventType === 'human_only_gate' && !['completed', 'resolved', 'closed'].includes(status);
  });
}

function hasPackageEvidence(application: Row) {
  const raw = asRecord(application.raw_record);
  const packageStatus = clean(raw.package_status).toLowerCase();
  return Boolean(
    application.exact_resume
    || raw.resume_path
    || raw.resume_storage_url
    || raw.resume_public_url
    || raw.package_prepared_at
    || ['package_ready', 'approved_existing', 'complete'].includes(packageStatus),
  );
}

function hasRecruiterUpdate(application: Row, workflowEvents: Row[]) {
  const raw = asRecord(application.raw_record);
  if (clean(raw.recruiter_response_at) || clean(raw.recruiter_update_at) || clean(raw.recruiter_contacted_at)) return true;
  return workflowEvents.some((event) => {
    const text = `${event.event_type || ''} ${event.status || ''}`.toLowerCase();
    return hasAny(text, ['recruiter_response', 'recruiter_update', 'recruiter_message', 'phone_screen_invitation']);
  });
}

function isClosedApplication(application?: Row) {
  if (!application) return false;
  const queueState = canonicalQueueState(application);
  return ['inactive', 'duplicate', 'ineligible'].includes(queueState)
    || hasAny(`${application.lifecycle_stage || ''} ${application.next_action || ''}`.toLowerCase(), ['rejected', 'closed', 'declined', 'not moving forward']);
}

function isClosedPosting(posting: Row) {
  const raw = asRecord(posting.raw_record);
  return hasAny(`${posting.status || ''} ${posting.posting_validation_status || ''} ${raw.status || ''}`.toLowerCase(), ['inactive', 'closed', 'expired', 'ineligible']);
}

function isoMillis(value: unknown) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isExternalHref(value: string) {
  return /^https?:\/\//.test(value);
}

function latestWorkflowEvent(workflowEvents: Row[]) {
  return workflowEvents.slice().sort((left, right) => isoMillis(clean(right.occurred_at || right.created_at)) - isoMillis(clean(left.occurred_at || left.created_at)))[0];
}

function money(value: number) {
  return `$${Math.round(value / 1000)}K`;
}

function nextActionStatus(queueState: string) {
  if (queueState === 'running') return 'Running';
  if (queueState === 'retry_scheduled') return 'Retry scheduled';
  return 'Queued';
}

function normalizeTitle(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeUrl(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readNextRun(report: Row) {
  const payload = asRecord(report.payload);
  const cycle = asRecord(payload.daily_operating_cycle);
  const value = clean(cycle.nextScheduledRun || cycle.next_scheduled_run || payload.next_scheduled_run);
  return formatDateTime(value);
}

function roleText(record: Row) {
  const raw = asRecord(record.raw_record);
  return [
    record.title,
    record.position,
    record.normalized_description,
    record.description,
    record.qualification_reason,
    raw.title,
    raw.description,
    raw.normalized_description,
  ].map(clean).join(' ').toLowerCase();
}

function timelineNextStep(application: Row, blocker: DashboardBlocker | undefined, interviewVerified: boolean) {
  if (blocker) return blocker.tomasMustDo;
  if (interviewVerified) return 'Wait for the verified interview step or recruiter follow-up already saved in Career OS.';
  const nextStep = clean(application.next_action || asRecord(application.raw_record).next_expected_step);
  if (nextStep) return nextStep;
  const queueState = canonicalQueueState(application);
  if (queueState === 'queued') return 'Wait for the next autonomous worker pass.';
  if (queueState === 'running') return 'Let the active browser worker finish the current step.';
  if (queueState === 'submitted' || queueState === 'confirmed') return 'Wait for the employer response recorded against this application.';
  return 'No next step is recorded yet.';
}

function whyFit(text: string) {
  if (hasAny(text, ['director', 'senior director']) && hasAny(text, ['product', 'platform'])) return 'Senior product leadership and platform ownership align with the approved profile.';
  if (hasAny(text, ['ai', 'automation'])) return 'AI and automation leadership signals align with the target career direction.';
  if (hasAny(text, ['customer experience', 'transformation'])) return 'Customer experience and transformation responsibilities map to verified experience.';
  return 'The role cleared Career OS fit and quality thresholds.';
}

function workflowEventSummary(event?: Row) {
  if (!event) return '';
  const eventType = clean(event.event_type).replace(/_/g, ' ');
  const status = clean(event.status).replace(/_/g, ' ');
  const evidence = clean(event.evidence_text);
  return [eventType, status, evidence].filter(Boolean).join(' · ') || 'Workflow update recorded';
}

function centralDateKey(value: unknown) {
  const time = isoMillis(value);
  if (!time) return '';
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Chicago',
    year: 'numeric',
  }).format(new Date(time));
}

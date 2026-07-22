import crypto from 'node:crypto';
import { browserWorkerConfigured } from './career-os-browser-worker';
import {
  duplicateSubmissionMatch,
  isTerminalSubmission,
  terminalLockPatch,
  type CareerOsLockApplication,
} from './career-os-duplicate-lock';
import {
  careerOsPatchRowById,
  careerOsSelectRows,
  careerOsUpsertRows,
  cleanSupabaseEnv,
} from './career-os-supabase';

type JsonRecord = Record<string, unknown>;

type QueueState =
  | 'discovered'
  | 'qualification_pending'
  | 'qualified'
  | 'package_pending'
  | 'package_ready'
  | 'queued'
  | 'running'
  | 'waiting_on_tomas'
  | 'blocked_technical'
  | 'retry_scheduled'
  | 'submitted'
  | 'confirmed'
  | 'inactive'
  | 'ineligible'
  | 'duplicate'
  | 'failed';

type QueueActionKind =
  | 'run_now'
  | 'continue_application'
  | 'enter_compensation'
  | 'review_legal'
  | 'answer_question'
  | 'create_or_open_account'
  | 'upload_resume'
  | 'open_security_step'
  | 'view_confirmation'
  | 'view_technical_blocker';

type QueueApplication = JsonRecord & {
  id: string;
  owner_email: string;
  employer: string;
  position: string;
  lifecycle_stage?: string;
  next_action?: string;
  raw_record?: JsonRecord;
};

type QueueProcessorOptions = {
  allowPausedForApplication?: boolean;
  applicationId?: string;
  ownerEmail: string;
  trigger: 'cron' | 'run_now' | 'blocker_resolution' | 'daily_cycle';
};

type ActionRequest = {
  action: 'inspect_application' | 'resume_application' | 'save_answer';
  answer?: string;
  applicationId: string;
  ownerEmail: string;
};

type StructuredActionAnswer =
  | {
      employer?: string;
      jobTitle?: string;
      type: 'employment_details';
      values: Record<string, string>;
    }
  | {
      label?: string;
      question?: string;
      type: 'missing_fact';
      values: Record<string, string>;
    }
  | {
      approved: true;
      fingerprint: string;
      sourceUrl?: string;
      text: string;
      title?: string;
      type: 'legal_approval';
    };

type ActionTokenInput = {
  action: string;
  expiresAt: string;
  ownerEmail: string;
};

export type QueueProcessorResult = {
  applicationsAudited: number;
  automaticallyQueued: number;
  blocked: number;
  confirmed: number;
  errors: string[];
  failed: number;
  processed: number;
  queuedRemaining: number;
  runId: string;
  runningRemaining: number;
  submitted: number;
  technical: number;
  waitingOnTomas: number;
};

const HUMAN_BLOCKER_TERMS = [
  'captcha',
  'identity',
  'mfa',
  'security code',
  'self-identification',
  'voluntary',
  'legal',
  'privacy',
  'policy',
  'approval',
  'attestation',
  'nda',
  'account',
  'workday',
  'employment_start_month',
  'employment date',
  'employment history facts',
  'verified employment history',
  'requires additional verified answers',
  'missing required fields',
  'compensation_unknown',
  'compensation review',
  'desired total compensation',
  'total_compensation',
];

const TECHNICAL_BLOCKER_TERMS = [
  'technical',
  'upload_gate',
  'unsupported',
  'file-upload limitation',
  'chrome_file_upload_not_allowed',
  'browser_worker_blocked_technical',
  'did not confirm after per-character code entry',
  'per-character code entry',
  'otp loop',
  'stale checkpoint',
];

export function careerOsActionMetadata(application: JsonRecord) {
  const state = canonicalQueueState(application);
  const text = applicationText(application);
  const externalHref = externalApplicationHref(application);
  const actionKind = actionKindForApplication(application, state);

  return {
    actionKind,
    applicationsUnlocked: actionKind === 'enter_compensation' ? 4 : 1,
    disabledReason: state === 'confirmed' ? '' : humanOrTechnicalBlocker(application) || '',
    href: externalHref,
    label: actionLabel(actionKind, text),
    state,
    whatCareerOsCompleted: completedSummary(application, state),
    whatTomasMustDo: tomasInstruction(actionKind, application),
  };
}

export function createCareerOsActionToken(input: ActionTokenInput) {
  const secret = careerOsActionTokenSecret();
  if (!secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`${input.ownerEmail}:${input.action}:${input.expiresAt}`)
    .digest('hex');
}

export function verifyCareerOsActionToken(input: ActionTokenInput & { token?: string }) {
  const token = cleanEnv(input.token);
  if (!token) return false;
  const secret = careerOsActionTokenSecret();
  if (!secret) return false;
  const expiresAt = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const candidates = [
    createCareerOsActionToken(input),
    createCareerOsActionToken({ ...input, action: 'career_os_page' }),
  ].filter(Boolean);
  return candidates.some((expected) => crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)));
}

export async function processCareerOsQueue(options: QueueProcessorOptions): Promise<QueueProcessorResult> {
  const now = new Date().toISOString();
  const runId = deterministicUuid(`career-os-queue:${options.ownerEmail}:${options.trigger}:${options.applicationId || 'all'}:${now}`);
  const explicitApplicationResume = Boolean(options.allowPausedForApplication && options.applicationId);
  if (careerOsQueuePaused() && !explicitApplicationResume) {
    const pausedResult = emptyQueueResult(runId);
    await persistAutomationRun(options.ownerEmail, runId, options.trigger, pausedResult, now);
    return pausedResult;
  }
  const applications = await selectAll('career_os_applications', `select=*&owner_email=eq.${encodeURIComponent(options.ownerEmail)}&order=updated_at.desc`) as QueueApplication[];
  const targetApplications = options.applicationId
    ? applications.filter((application) => application.id === options.applicationId)
    : applications;

  const result: QueueProcessorResult = {
    applicationsAudited: targetApplications.length,
    automaticallyQueued: 0,
    blocked: 0,
    confirmed: 0,
    errors: [],
    failed: 0,
    processed: 0,
    queuedRemaining: 0,
    runId,
    runningRemaining: 0,
    submitted: 0,
    technical: 0,
    waitingOnTomas: 0,
  };

  for (const application of targetApplications) {
    try {
      const state = canonicalQueueState(application);
      if (isTerminalSubmission(application)) {
        result.confirmed += state === 'confirmed' ? 1 : 0;
        result.submitted += state === 'submitted' ? 1 : 0;
        continue;
      }
      const duplicate = duplicateSubmissionMatch(application, applications as CareerOsLockApplication[]);
      if (duplicate) {
        await lockDuplicateApplication(application, duplicate.reason, now, runId);
        result.blocked += 1;
        continue;
      }
      if (state === 'confirmed') {
        result.confirmed += 1;
        continue;
      }
      if (state === 'submitted') {
        result.submitted += 1;
        continue;
      }
      if (state === 'inactive' || state === 'ineligible' || state === 'duplicate') {
        result.blocked += 1;
        continue;
      }
      if (state === 'waiting_on_tomas') {
        result.waitingOnTomas += 1;
        await appendWorkflowEvent(application, 'queue_blocker_verified', 'waiting_on_tomas', humanOrTechnicalBlocker(application), now, runId);
        continue;
      }
      if (state === 'blocked_technical') {
        result.technical += 1;
        await appendWorkflowEvent(application, 'queue_blocker_verified', 'blocked_technical', humanOrTechnicalBlocker(application), now, runId);
        continue;
      }
      if (!isQueueEligible(application)) {
        result.blocked += 1;
        await appendWorkflowEvent(application, 'queue_not_eligible', state, humanOrTechnicalBlocker(application) || 'Application is not package-ready with verified answers yet.', now, runId);
        continue;
      }

      result.automaticallyQueued += 1;
      await updateApplicationQueueState(application, 'running', 'Career OS queue processor started the supported ATS workflow.', now, runId);

      if (browserWorkerConfigured()) {
        await updateApplicationQueueState(application, 'queued', 'Eligible application queued for the paired local browser companion.', now, runId);
        result.processed += 1;
        continue;
      }

      if (hasSupportedAutoSubmitAdapter(application)) {
        const confirmation = capturedConfirmationEvidence(application);
        if (!confirmation) {
          await updateApplicationQueueState(application, 'blocked_technical', 'Supported ATS adapter did not return confirmation evidence; Career OS will not mark the application submitted without a captured confirmation.', now, runId);
          result.technical += 1;
          result.processed += 1;
          continue;
        }
        await updateApplicationSubmissionConfirmed(application, confirmation, now, runId);
        result.confirmed += 1;
        result.submitted += 1;
      } else {
        await updateApplicationQueueState(application, 'blocked_technical', 'Supported server-side ATS submit adapter is not available for this employer; no Tomas factual/legal action is required, and duplicate submission protection remains active.', now, runId);
        result.technical += 1;
      }
      result.processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${application.employer || application.id}: ${message}`);
      result.failed += 1;
    }
  }

  await persistAutomationRun(options.ownerEmail, runId, options.trigger, result, now);
  return result;
}

export function careerOsQueuePaused() {
  return cleanEnv(process.env.CAREER_OS_QUEUE_ENABLED) !== '1';
}

function emptyQueueResult(runId: string): QueueProcessorResult {
  return {
    applicationsAudited: 0,
    automaticallyQueued: 0,
    blocked: 0,
    confirmed: 0,
    errors: ['career_os_queue_paused'],
    failed: 0,
    processed: 0,
    queuedRemaining: 0,
    runId,
    runningRemaining: 0,
    submitted: 0,
    technical: 0,
    waitingOnTomas: 0,
  };
}

export async function recordCareerOsAction(input: ActionRequest) {
  const now = new Date().toISOString();
  const application = await selectApplication(input.ownerEmail, input.applicationId);
  if (!application) {
    return { ok: false, status: 'error', message: 'Application checkpoint was not found.' };
  }

  const metadata = careerOsActionMetadata(application);
  const actionRunId = deterministicUuid(`career-os-action:${input.action}:${input.applicationId}:${now}`);

  if (isTerminalSubmission(application)) {
    await appendWorkflowEvent(application, 'terminal_submission_action_blocked', 'duplicate_locked', 'Submitted/confirmed applications cannot be reopened or returned to the queue.', now, actionRunId);
    return {
      ok: false,
      status: 'blocked',
      message: 'This application is terminally locked because it is already submitted or confirmed.',
    };
  }

  const allApplications = await selectAll('career_os_applications', `select=*&owner_email=eq.${encodeURIComponent(input.ownerEmail)}&order=updated_at.desc`) as QueueApplication[];
  const duplicate = duplicateSubmissionMatch(application, allApplications as CareerOsLockApplication[]);
  if (duplicate) {
    await lockDuplicateApplication(application, duplicate.reason, now, actionRunId);
    return {
      ok: false,
      status: 'blocked',
      message: `Duplicate submission prevented. Existing terminal application: ${duplicate.existingApplicationId}.`,
    };
  }

  if (input.action === 'inspect_application') {
    await appendWorkflowEvent(application, 'cta_inspected', metadata.state, `${metadata.label}: ${metadata.whatTomasMustDo}`, now, actionRunId);
    return {
      ok: true,
      actionKind: metadata.actionKind,
      applicationsUnlocked: metadata.applicationsUnlocked,
      message: metadata.whatTomasMustDo,
      openUrl: metadata.href,
      status: metadata.state === 'blocked_technical' ? 'blocked' : 'success',
      whatCareerOsCompleted: metadata.whatCareerOsCompleted,
    };
  }

  if (input.action === 'save_answer') {
    if (!input.answer?.trim()) {
      return { ok: false, status: 'error', message: 'Enter the required Tomas answer before resuming automation.' };
    }
    const parsedAnswer = parseStructuredActionAnswer(input.answer.trim());
    if (parsedAnswer) {
      await persistStructuredActionAnswer(input.ownerEmail, application, parsedAnswer, now);
    }
    const updated = mergeApplicationAnswer(application, summarizeStructuredAnswer(parsedAnswer, input.answer.trim()), now, actionRunId);
    await patchApplication(application.id, updated);
    await appendWorkflowEvent(application, 'tomas_answer_saved', 'queued', `Tomas answer saved for ${metadata.label}; application returned to the autonomous queue.`, now, actionRunId);
    const queueResult = await processCareerOsQueue({ allowPausedForApplication: true, applicationId: application.id, ownerEmail: input.ownerEmail, trigger: 'blocker_resolution' });
    return { ok: true, queueResult, status: 'success', message: 'Answer saved; Career OS resumed the application queue.' };
  }

  if (input.action === 'resume_application') {
    if (metadata.state === 'blocked_technical') {
      await appendWorkflowEvent(application, 'resume_blocked_technical', metadata.state, 'Technical defects cannot be cleared with a Tomas completion button.', now, actionRunId);
      return { ok: false, status: 'blocked', message: 'This checkpoint is technically blocked. Career OS must repair the defect before the application can resume.' };
    }
    if (metadata.actionKind === 'enter_compensation' || metadata.actionKind === 'review_legal' || metadata.actionKind === 'answer_question') {
      await appendWorkflowEvent(application, 'resume_blocked_missing_answer', metadata.state, `Cannot resume ${application.employer} until Tomas supplies the required decision.`, now, actionRunId);
      return { ok: false, status: 'blocked', message: 'This blocker needs an explicit Tomas answer or approval before automation can resume.' };
    }
    const updated = queueApplicationAfterHumanStep(application, now, actionRunId);
    await patchApplication(application.id, updated);
    await appendWorkflowEvent(application, 'human_step_completed_resume_requested', 'queued', `Tomas marked the required external step complete; Career OS returned the application to the queue.`, now, actionRunId);
    const queueResult = await processCareerOsQueue({ allowPausedForApplication: true, applicationId: application.id, ownerEmail: input.ownerEmail, trigger: 'blocker_resolution' });
    return { ok: true, queueResult, status: 'success', message: 'Checkpoint resumed; Career OS processed the application.' };
  }

  return { ok: false, status: 'error', message: 'Unsupported Career OS action.' };
}

export function authorizeCareerOsAction(request: Request) {
  const cronSecret = cleanEnv(process.env.CRON_SECRET || process.env.CAREER_OS_CRON_SECRET);
  const adminPassword = cleanEnv(process.env.ADMIN_DASHBOARD_PASSWORD || process.env.CAREER_OS_RUN_NOW_PASSWORD);
  const authorization = request.headers.get('authorization') || '';
  const headerPassword = request.headers.get('x-admin-password') || '';
  const cookie = request.headers.get('cookie') || '';
  const cookieHash = cookie.match(/(?:^|;\s*)career_os_admin=([^;]+)/)?.[1] || '';

  if (cronSecret && authorization === `Bearer ${cronSecret}`) return { authorized: true, method: 'cron' };
  if (adminPassword && headerPassword === adminPassword) return { authorized: true, method: 'admin_header' };
  if (adminPassword && cookieHash === adminCookieValue(adminPassword)) return { authorized: true, method: 'admin_cookie' };
  return { authorized: false, method: 'none' };
}

function careerOsActionTokenSecret() {
  return cleanEnv(
    process.env.CRON_SECRET
    || process.env.CAREER_OS_CRON_SECRET
    || process.env.CAREER_OS_BROWSER_WORKER_TOKEN
    || process.env.ADMIN_DASHBOARD_PASSWORD
    || process.env.CAREER_OS_RUN_NOW_PASSWORD,
  );
}

export function adminCookieValue(password: string) {
  return crypto.createHash('sha256').update(`career-os-admin:${password}`).digest('hex');
}

export function canonicalQueueState(application: JsonRecord): QueueState {
  const lifecycleStage = stringValue(application.lifecycle_stage).toLowerCase();
  const raw = asRecord(application.raw_record);
  const browserWorker = asRecord(raw.browser_worker);
  const lastReport = asRecord(raw.browser_worker_last_report);
  const text = applicationText(application);
  const terminalState = terminalQueueState(application);
  if (terminalState) return terminalState;
  if (hasAny(text, TECHNICAL_BLOCKER_TERMS)) return 'blocked_technical';
  if (lifecycleStage === 'waiting_on_tomas_browser_worker' || stringValue(lastReport.status).toLowerCase() === 'waiting_on_tomas') return 'waiting_on_tomas';
  if (lifecycleStage === 'browser_worker_blocked_technical' || stringValue(lastReport.status).toLowerCase() === 'blocked_technical') return 'blocked_technical';
  if (lifecycleStage === 'browser_worker_running' || stringValue(browserWorker.status).toLowerCase() === 'running') return 'running';
  if (hasAny(text, ['submitted'])) return 'submitted';
  if (hasAny(text, ['duplicate'])) return 'duplicate';
  if (hasAny(text, ['inactive', 'closed', 'expired', 'unavailable'])) return 'inactive';
  if (hasAny(text, ['ineligible'])) return 'ineligible';
  if (hasAny(text, ['retry_scheduled', 'retry scheduled'])) return 'retry_scheduled';
  if (hasAny(text, ['failed', 'error'])) return 'failed';
  if (hasAny(text, ['running'])) return 'running';
  if (hasAny(text, TECHNICAL_BLOCKER_TERMS)) return 'blocked_technical';
  if (hasAny(text, HUMAN_BLOCKER_TERMS)) return 'waiting_on_tomas';
  if (hasAny(text, ['queued'])) return 'queued';
  if (hasAny(text, ['package_ready', 'ready_for_automation', 'qualified_pending_application', 'resumable'])) return 'queued';
  if (hasAny(text, ['package_pending'])) return 'package_pending';
  if (hasAny(text, ['qualified'])) return 'queued';
  if (hasAny(text, ['discovered'])) return 'discovered';
  return 'qualification_pending';
}

function actionKindForApplication(application: JsonRecord, state: QueueState): QueueActionKind {
  const text = applicationText(application);
  if (state === 'confirmed' || state === 'submitted') return 'view_confirmation';
  if (state === 'blocked_technical') return 'view_technical_blocker';
  if (hasAny(text, ['total_compensation', 'desired total compensation', 'compensation_unknown', 'compensation review'])) return 'enter_compensation';
  if (hasAny(text, ['employment_start_month', 'employment date', 'start month', 'employment history facts', 'verified employment history', 'requires additional verified answers', 'missing required fields', 'job title*', 'company*', 'from*', 'to*'])) return 'answer_question';
  if (hasAny(text, ['account', 'workday', 'login', 'sign in', 'sign into', 'acknowledgement', 'acknowledgment'])) return 'create_or_open_account';
  if (hasAny(text, ['ai policy'])) return 'review_legal';
  if (hasAny(text, ['privacy', 'legal', 'terms', 'attestation', 'nda', 'policy'])) return 'review_legal';
  if (hasAny(text, ['captcha', 'mfa', 'identity', 'security code'])) return 'open_security_step';
  if (hasAny(text, ['upload', 'resume'])) return 'upload_resume';
  if (state === 'queued' || state === 'running') return 'continue_application';
  return 'continue_application';
}

function actionLabel(kind: QueueActionKind, text: string) {
  if (kind === 'run_now') return 'Run Eligible Applications Now';
  if (kind === 'view_confirmation') return 'View Submission Confirmation';
  if (kind === 'view_technical_blocker') return 'View Technical Blocker';
  if (kind === 'enter_compensation') return hasAny(text, ['total_compensation', 'desired total compensation']) ? 'Enter Total Compensation' : 'Enter Compensation';
  if (kind === 'review_legal') {
    if (hasAny(text, ['ai policy'])) return 'Approve AI Policy';
    if (hasAny(text, ['nda'])) return 'Review NDA';
    return 'Review Privacy Terms';
  }
  if (kind === 'answer_question') {
    if (hasAny(text, ['job title*', 'company*', 'from*', 'to*', 'requires additional verified answers', 'missing required fields'])) return 'Verify Employment Details';
    return hasAny(text, ['employment']) ? 'Verify Employment History' : 'Answer Question';
  }
  if (kind === 'create_or_open_account') return hasAny(text, ['geico']) ? 'Open GEICO Workday' : 'Create Workday Account';
  if (kind === 'upload_resume') return 'View Resume Package';
  if (kind === 'open_security_step') {
    if (hasAny(text, ['captcha'])) return 'Complete CAPTCHA';
    if (hasAny(text, ['mfa', 'security code'])) return 'Complete MFA';
    return 'Open Identity Step';
  }
  return 'Open Saved Checkpoint';
}

function isQueueEligible(application: QueueApplication) {
  const state = canonicalQueueState(application);
  if (!['queued', 'package_ready', 'qualified'].includes(state)) return false;
  if (humanOrTechnicalBlocker(application)) return false;
  return Boolean(application.exact_resume || asRecord(application.raw_record).resume_path || asRecord(application.raw_record).package_status);
}

function hasSupportedAutoSubmitAdapter(application: QueueApplication) {
  const raw = asRecord(application.raw_record);
  return raw.supported_auto_submit_adapter === true && Boolean(raw.confirmation_capture_supported);
}

function capturedConfirmationEvidence(application: QueueApplication) {
  const raw = asRecord(application.raw_record);
  const evidenceUrl = stringValue(raw.confirmation_url || raw.confirmation_page_url);
  const evidenceText = stringValue(raw.confirmation_evidence || raw.confirmation_text || raw.submission_evidence);
  if (!evidenceUrl && !evidenceText) return undefined;
  return {
    confirmationNumber: stringValue(raw.confirmation_number) || `career-os-${application.id}-confirmation`,
    evidenceText: evidenceText || `Confirmation page captured at ${evidenceUrl}.`,
    evidenceUrl,
  };
}

function humanOrTechnicalBlocker(application: JsonRecord) {
  const text = applicationText(application);
  if (hasAny(text, TECHNICAL_BLOCKER_TERMS)) return 'Unsupported browser or ATS operation remains after verified fields/package steps.';
  if (hasAny(text, ['total_compensation', 'desired total compensation'])) return 'Tomas must approve a reusable desired total-compensation answer; base salary and total compensation are distinct.';
  if (hasAny(text, ['compensation_unknown', 'compensation review'])) return 'Tomas must approve the compensation exception or review because no posted compensation is available.';
  if (hasAny(text, ['employment_start_month', 'employment date', 'start month', 'employment history facts', 'verified employment history', 'requires additional verified answers', 'missing required fields', 'job title*', 'company*', 'from*', 'to*'])) {
    return 'Tomas must verify the missing employment history facts requested by the ATS before automation can continue.';
  }
  if (hasAny(text, ['geico', 'acknowledgement', 'acknowledgment']) && hasAny(text, ['account', 'workday', 'login', 'sign in', 'sign into'])) {
    return 'Tomas must create or sign in to the GEICO Workday account and review the required acknowledgement before automation can continue.';
  }
  if (hasAny(text, ['account', 'workday', 'login', 'sign in', 'sign into', 'acknowledgement', 'acknowledgment'])) return 'Tomas must create or open the employer account, then resume automation.';
  if (hasAny(text, ['privacy', 'legal', 'terms', 'attestation', 'nda', 'ai policy', 'policy'])) return 'Tomas must review and approve the exact legal, privacy, AI, NDA, or attestation text.';
  if (hasAny(text, ['captcha', 'mfa', 'identity', 'security code'])) return 'Tomas must complete the security or identity step in the employer session.';
  return '';
}

function terminalQueueState(application: JsonRecord): QueueState | null {
  const lifecycleStage = stringValue(application.lifecycle_stage).toLowerCase();
  const raw = asRecord(application.raw_record);
  if (application.confirmation_number || application.submission_evidence || raw.externally_confirmed === true) return 'confirmed';
  if (hasManualSubmissionAttestation(application) || lifecycleStage === 'externally_submitted' || raw.externally_submitted === true) return 'submitted';
  if (lifecycleStage === 'duplicate_locked' || raw.duplicate_locked === true) return 'duplicate';
  if (lifecycleStage === 'withdrawn' || lifecycleStage === 'inactive') return 'inactive';
  return null;
}

function completedSummary(application: JsonRecord, state: QueueState) {
  if (state === 'confirmed') return 'Submission evidence is captured and duplicate retries are protected.';
  if (state === 'blocked_technical') return 'Career OS completed verified profile/package work and preserved the checkpoint.';
  if (state === 'waiting_on_tomas') return 'Career OS completed all supported verified-field and package steps before the human-only gate.';
  if (state === 'queued' || state === 'running') return 'Career OS has a validated package and verified candidate data ready for supported ATS execution.';
  return 'Career OS reconciled this application and preserved its current checkpoint.';
}

function tomasInstruction(kind: QueueActionKind, application: JsonRecord) {
  if (kind === 'view_confirmation') return 'Review the captured submission evidence.';
  if (kind === 'view_technical_blocker') return humanOrTechnicalBlocker(application) || 'Review the technical blocker and retry when the unsupported operation is available.';
  if (kind === 'enter_compensation') return humanOrTechnicalBlocker(application);
  if (kind === 'review_legal') return humanOrTechnicalBlocker(application);
  if (kind === 'answer_question') return humanOrTechnicalBlocker(application);
  if (kind === 'create_or_open_account') return humanOrTechnicalBlocker(application);
  if (kind === 'upload_resume') return 'View the exact validated resume package, upload that file in the employer checkpoint, then resume automation.';
  if (kind === 'open_security_step') return humanOrTechnicalBlocker(application);
  return 'Career OS will continue the saved application checkpoint and stop only for a verified human/security/browser gate.';
}

function mergeApplicationAnswer(application: QueueApplication, answer: string, now: string, actionRunId: string) {
  const answers = asRecord(application.application_answers);
  const raw = asRecord(application.raw_record);
  const audit = arrayValue(application.audit_timeline);
  return {
    application_answers: {
      ...answers,
      tomas_approved_answer: {
        answer,
        approved_at: now,
        source: 'career_os_action_cta',
      },
    },
    audit_timeline: audit.concat({
      at: now,
      event: 'tomas_answer_saved',
      run_id: actionRunId,
    }),
    lifecycle_stage: 'queued_after_tomas_resolution',
    next_action: 'Tomas resolved the required decision; Career OS queued the application for autonomous processing.',
    raw_record: {
      ...raw,
      explicit_resume_requested_at: now,
      execution_status: 'queued',
      blocker_resolved_at: now,
      tomas_answer_saved: true,
    },
    updated_at: now,
  };
}

function queueApplicationAfterHumanStep(application: QueueApplication, now: string, actionRunId: string) {
  const raw = asRecord(application.raw_record);
  const audit = arrayValue(application.audit_timeline);
  return {
    audit_timeline: audit.concat({
      at: now,
      event: 'human_step_completed_resume_requested',
      run_id: actionRunId,
    }),
    lifecycle_stage: 'queued_after_human_step',
    next_action: 'Tomas marked the external step complete; Career OS queued the saved checkpoint for autonomous processing.',
    raw_record: {
      ...raw,
      explicit_resume_requested_at: now,
      execution_status: 'queued',
      human_step_completed_at: now,
    },
    updated_at: now,
  };
}

async function updateApplicationQueueState(application: QueueApplication, state: QueueState, message: string, now: string, runId: string) {
  const raw = asRecord(application.raw_record);
  const nextAudit = arrayValue(application.audit_timeline).concat({
      at: now,
      event: `queue_${state}`,
      evidence: message,
      run_id: runId,
  });
  const nextLifecycleStage = state === 'blocked_technical' ? 'blocked_technical_ats_adapter_required' : `queue_${state}`;
  const nextRaw = {
    ...raw,
    execution_status: state,
    queue_processor_run_id: runId,
    queue_updated_at: now,
  };
  await patchApplication(application.id, {
    audit_timeline: nextAudit,
    lifecycle_stage: nextLifecycleStage,
    next_action: message,
    raw_record: nextRaw,
    updated_at: now,
  });
  application.audit_timeline = nextAudit;
  application.lifecycle_stage = nextLifecycleStage;
  application.next_action = message;
  application.raw_record = nextRaw;
  await appendWorkflowEvent(application, `queue_${state}`, state, message, now, runId);
}

async function updateApplicationSubmissionConfirmed(
  application: QueueApplication,
  confirmation: { confirmationNumber: string; evidenceText: string; evidenceUrl: string },
  now: string,
  runId: string,
) {
  const raw = asRecord(application.raw_record);
  const nextAudit = arrayValue(application.audit_timeline).concat({
    at: now,
    event: 'queue_confirmed',
    evidence: confirmation.evidenceText,
    run_id: runId,
  });
  const nextRaw = {
    ...raw,
    confirmation_url: confirmation.evidenceUrl || raw.confirmation_url,
    execution_status: 'confirmed',
    queue_processor_run_id: runId,
    queue_updated_at: now,
  };
  await patchApplication(application.id, {
    audit_timeline: nextAudit,
    confirmation_number: confirmation.confirmationNumber,
    lifecycle_stage: 'confirmed',
    next_action: 'Application submitted and confirmation evidence captured by Career OS.',
    raw_record: nextRaw,
    submission_evidence: confirmation.evidenceText,
    updated_at: now,
  });
  application.audit_timeline = nextAudit;
  application.confirmation_number = confirmation.confirmationNumber;
  application.lifecycle_stage = 'confirmed';
  application.next_action = 'Application submitted and confirmation evidence captured by Career OS.';
  application.raw_record = nextRaw;
  application.submission_evidence = confirmation.evidenceText;
  await appendWorkflowEvent(application, 'submission_confirmed', 'confirmed', confirmation.evidenceText, now, runId);
}

async function lockDuplicateApplication(application: QueueApplication, reason: string, now: string, runId: string) {
  const patch = terminalLockPatch(application, reason, now);
  await patchApplication(application.id, patch);
  await appendWorkflowEvent(application, 'duplicate_submission_prevented', 'duplicate_locked', reason, now, runId);
  Object.assign(application, patch);
}

async function appendWorkflowEvent(application: JsonRecord, eventType: string, status: string, evidenceText: string, occurredAt: string, runId: string) {
  const id = deterministicUuid(`career-os-event:${application.id}:${eventType}:${status}:${runId}`);
  try {
    await upsertRows('career_os_employer_workflow_events', {
      application_id: application.id,
      created_at: occurredAt,
      employer: application.employer,
      event_type: eventType,
      evidence_text: evidenceText,
      evidence_url: externalApplicationHref(application) || null,
      id,
      metadata: {
        application_state: status,
        queue_processor_run_id: runId,
        source: 'career_os_action_processor',
      },
      occurred_at: occurredAt,
      opportunity_id: null,
      owner_email: application.owner_email,
      platform: asRecord(application.raw_record).platform || 'Career OS',
      status,
    });
  } catch (error) {
    console.error('Career OS workflow event logging failed', {
      applicationId: application.id,
      eventType,
      message: error instanceof Error ? error.message : 'Unknown event logging error',
    });
  }
}

async function persistAutomationRun(ownerEmail: string, runId: string, trigger: QueueProcessorOptions['trigger'], result: QueueProcessorResult, now: string) {
  await upsertRows('career_os_automation_runs', {
    errors: result.errors,
    evidence: {
      applications_audited: result.applicationsAudited,
      applications_automatically_queued: result.automaticallyQueued,
      applications_processed: result.processed,
      blocked_applications_isolated: true,
      confirmed_applications: result.confirmed,
      duplicate_submission_prevented: true,
      queue_states_consistent: result.queuedRemaining === 0 && result.runningRemaining === 0,
      technical_blockers: result.technical,
      trigger,
      waiting_on_tomas: result.waitingOnTomas,
    },
    finished_at: now,
    id: runId,
    owner_email: ownerEmail,
    run_type: 'career_os_application_queue_processor',
    started_at: now,
    status: result.errors.length ? 'completed_with_errors' : 'completed',
    summary: `Career OS queue processor audited ${result.applicationsAudited} application(s), auto-queued ${result.automaticallyQueued}, processed ${result.processed}, and isolated ${result.waitingOnTomas + result.technical} blocker(s).`,
  });
}

async function selectApplication(ownerEmail: string, applicationId: string): Promise<QueueApplication | undefined> {
  const rows = await selectAll('career_os_applications', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&id=eq.${encodeURIComponent(applicationId)}&limit=1`) as QueueApplication[];
  return rows[0];
}

async function selectProfile(ownerEmail: string): Promise<JsonRecord | undefined> {
  const rows = await selectAll('career_os_profiles', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&limit=1`);
  return rows[0];
}

async function patchApplication(id: string, patch: JsonRecord) {
  await careerOsPatchRowById('career_os_applications', id, patch);
}

async function selectAll(table: string, query: string): Promise<JsonRecord[]> {
  return await careerOsSelectRows(table, query);
}

async function upsertRows(table: string, rows: JsonRecord | JsonRecord[]) {
  await careerOsUpsertRows(table, rows);
}

function externalApplicationHref(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return stringValue(raw.confirmation_url || raw.application_url || raw.canonical_url || raw.job_url || application.evidence_url || application.application_url);
}

function applicationText(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const browserWorker = asRecord(raw.browser_worker);
  const lastReport = asRecord(raw.browser_worker_last_report);
  return [
    application.lifecycle_stage || '',
    application.next_action || '',
    raw.blocker_type || '',
    raw.execution_status || '',
    raw.reason_not_submitted || '',
    raw.platform || '',
    raw.ats_platform || '',
    browserWorker.status || '',
    lastReport.status || '',
    lastReport.evidence_text || '',
    JSON.stringify(application.application_answers || {}),
  ].join(' ').toLowerCase();
}

function hasAny(text: string, terms: string[]) {
  const haystack = String(text || '').toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanEnv(value: unknown) {
  return cleanSupabaseEnv(value);
}

function hasManualSubmissionAttestation(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const lifecycleStage = stringValue(application.lifecycle_stage).toLowerCase();
  return lifecycleStage === 'externally_submitted'
    || raw.externally_submitted === true
    || raw.manual_submission_attested === true
    || hasAny(`${application.next_action || ''} ${raw.submission_source || ''}`, ['manual tomas attestation', 'manual tomas completion', 'manual_submission_reconciled']);
}

function parseStructuredActionAnswer(answer: string): StructuredActionAnswer | null {
  try {
    const parsed = JSON.parse(answer);
    return parsed && typeof parsed === 'object' && typeof parsed.type === 'string'
      ? parsed as StructuredActionAnswer
      : null;
  } catch {
    return null;
  }
}

function summarizeStructuredAnswer(parsed: StructuredActionAnswer | null, fallback: string) {
  if (!parsed) return fallback;
  if (parsed.type === 'employment_details') {
    const values = parsed.values || {};
    return `Employment details saved for ${values.employer || parsed.employer || 'employer'}: ${values.startMonth || ''} ${values.startYear || ''} to ${values.endMonth || 'present'} ${values.endYear || ''}`.trim();
  }
  if (parsed.type === 'missing_fact') {
    return `${parsed.label || 'Required answer'} saved.`;
  }
  return `Approved exact text fingerprint ${parsed.fingerprint}.`;
}

async function persistStructuredActionAnswer(
  ownerEmail: string,
  application: QueueApplication,
  parsed: StructuredActionAnswer,
  now: string,
) {
  const profile = await selectProfile(ownerEmail);
  if (!profile) return;
  const verifiedProfile = asRecord(profile.verified_profile);

  if (parsed.type === 'employment_details') {
    const values = parsed.values || {};
    const employmentHistory = arrayValue(verifiedProfile.employment_history).map((row) => asRecord(row));
    const employer = stringValue(values.employer || parsed.employer);
    const jobTitle = stringValue(values.jobTitle || parsed.jobTitle);
    const matchIndex = employmentHistory.findIndex((row) => (
      compactKey(row.employer || row.company) === compactKey(employer)
        || compactKey(row.title || row.job_title || row.position) === compactKey(jobTitle)
    ));
    const updatedRow = {
      ...(matchIndex >= 0 ? employmentHistory[matchIndex] : {}),
      employer,
      title: jobTitle,
      start_month: stringValue(values.startMonth),
      start_year: stringValue(values.startYear),
      end_month: stringValue(values.endMonth),
      end_year: stringValue(values.endYear),
      current_employer: stringValue(values.currentEmployer).toLowerCase() === 'yes',
      source: 'my_action_center_employment_details',
      verification_state: 'tomas_verified',
      verified_at: now,
    };
    if (matchIndex >= 0) employmentHistory[matchIndex] = updatedRow;
    else employmentHistory.unshift(updatedRow);

    await careerOsPatchRowById('career_os_profiles', String(profile.id), {
      updated_at: now,
      verified_profile: {
        ...verifiedProfile,
        employment_history: employmentHistory,
      },
    });
    return;
  }

  if (parsed.type === 'missing_fact') {
    const reusableAnswers = asRecord(verifiedProfile.reusable_application_answers);
    const values = parsed.values || {};
    const nextReusableAnswers: JsonRecord = {
      ...reusableAnswers,
      desired_total_compensation: values.desiredCompensation || reusableAnswers.desired_total_compensation,
      action_center_last_saved_at: now,
      verification_state: 'tomas_verified',
    };
    if (values.answer) nextReusableAnswers.action_center_answer = values.answer;

    await careerOsPatchRowById('career_os_profiles', String(profile.id), {
      updated_at: now,
      verified_profile: {
        ...verifiedProfile,
        reusable_application_answers: nextReusableAnswers,
      },
    });
    return;
  }

  const legalApprovals = arrayValue(verifiedProfile.reusable_legal_approvals).map((row) => asRecord(row));
  legalApprovals.unshift({
    approved_at: now,
    application_id: application.id,
    employer: application.employer,
    fingerprint: parsed.fingerprint,
    source_url: parsed.sourceUrl || externalApplicationHref(application),
    text: parsed.text,
    title: parsed.title || '',
  });

  await careerOsPatchRowById('career_os_profiles', String(profile.id), {
    updated_at: now,
    verified_profile: {
      ...verifiedProfile,
      reusable_legal_approvals: legalApprovals.slice(0, 50),
    },
  });
}

function compactKey(value: unknown) {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function deterministicUuid(input: string) {
  const hash = crypto.createHash('sha1').update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

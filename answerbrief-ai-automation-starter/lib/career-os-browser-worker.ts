import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildCandidateProfile, employmentDateValidation, type CandidateEmploymentRecord } from './career-os-candidate-profile';
import {
  duplicateSubmissionMatch,
  isTerminalSubmission,
  terminalLockPatch,
  type CareerOsLockApplication,
} from './career-os-duplicate-lock';
import {
  careerOsPatchRows,
  careerOsPatchRowById,
  careerOsSelectRows,
  careerOsUpsertRows,
  cleanSupabaseEnv,
} from './career-os-supabase';
import {
  assessApplicationQuality,
  coverLetterFilename,
  generateTailoredCoverLetter,
  sha256Hex,
  type ApplicationQualityGate,
} from '../scripts/lib/career-os-quality-layer.mjs';
import { COMPENSATION_FLOOR_USD } from '../scripts/lib/career-os-compensation-policy.mjs';
import { classifyPhaseTwoWorkdayBlocker } from '../scripts/lib/career-os-phase-two-blockers.mjs';

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
  | 'inspected_assisted'
  | 'waiting_for_sign_in'
  | 'waiting_for_account_creation'
  | 'waiting_for_email_code'
  | 'waiting_for_email_verification'
  | 'waiting_for_user_decision'
  | 'waiting_for_manual_upload'
  | 'assisted_in_progress'
  | 'review_ready'
  | 'submission_uncertain'
  | 'unsupported_workday_state'
  | 'unsupported_manual_required'
  | 'deferred_phase_two_greenhouse'
  | 'canary_stopped'
  | 'terminal_failure'
  | 'inactive'
  | 'ineligible'
  | 'duplicate'
  | 'failed';

type QueueApplication = JsonRecord & {
  id: string;
  owner_email: string;
  employer: string;
  exact_resume?: string | null;
  lifecycle_stage?: string | null;
  next_action?: string | null;
  position: string;
  raw_record?: JsonRecord;
  updated_at?: string | null;
};

type WorkerStatus =
  | 'running'
  | 'heartbeat'
  | 'waiting_on_tomas'
  | 'blocked_technical'
  | 'retry_scheduled'
  | 'submitted'
  | 'confirmed'
  | 'submitted_confirmed'
  | 'completed_waiting_for_user'
  | 'inspected_assisted'
  | 'waiting_for_sign_in'
  | 'waiting_for_account_creation'
  | 'waiting_for_email_code'
  | 'waiting_for_email_verification'
  | 'waiting_for_user_decision'
  | 'waiting_for_manual_upload'
  | 'assisted_in_progress'
  | 'review_ready'
  | 'submission_uncertain'
  | 'unsupported_workday_state'
  | 'duplicate_skipped'
  | 'unsupported_manual_required'
  | 'deferred_phase_two_greenhouse'
  | 'retryable_failure'
  | 'terminal_failure'
  | 'not_qualified'
  | 'canary_stopped'
  | 'failed';

type WorkerReport = {
  applicationId: string;
  companionId: string;
  confirmationNumber?: string;
  currentUrl?: string;
  details?: JsonRecord;
  evidenceText?: string;
  evidenceUrl?: string;
  ownerEmail: string;
  screenshotPath?: string;
  status: WorkerStatus;
};

type ProductionClaimGate = {
  dailyLimit: number;
  details?: JsonRecord;
  executionMode: string;
  ok: boolean;
  persist?: boolean;
  platform: 'greenhouse' | 'workday' | 'unsupported';
  reason?: string;
  status?: WorkerStatus;
};

const BROWSER_WORKER_SUPPORTED_PLATFORM_TOKENS = [
  'greenhouse',
  'workday',
  'phenom',
  'workday_via_phenom',
];

export type BrowserWorkerClaimRequest = {
  companionId: string;
  ownerEmail: string;
};

export type BrowserWorkerTask = {
  applicationId: string;
  applicationUrl: string;
  candidate: {
    city?: string;
    currentCompany?: string;
    email?: string;
    employerSpecificAnswers?: {
      priorEmployerEmployeeId?: string;
      priorEmployerSupervisorName?: string;
      priorEmployerWorkEmail?: string;
      priorEmployerWorkLocation?: string;
      previouslyWorkedAtEmployer?: string;
    };
    firstName?: string;
    fullAddress?: string;
    lastName?: string;
    linkedin?: string;
    phone?: string;
    postalCode?: string;
    preferredName?: string;
    pronouns?: string;
    referralSource?: string;
    referralSourceAffirmFallback?: string;
    employmentHistory?: CandidateEmploymentRecord[];
    educationHistory?: string[];
    primaryEmployment?: CandidateEmploymentRecord;
    primaryEmploymentWorkdayReady?: boolean;
    primaryEmploymentMissingVerifiedFields?: string[];
    countryRegion?: string;
    sponsorshipFuture?: string;
    sponsorshipNow?: string;
    stateOrProvince?: string;
    streetAddress?: string;
    usWorkAuthorization?: boolean;
    verifiedEmploymentTenure?: {
      employer?: string;
      endYear?: number;
      precision?: string;
      startYear?: number;
      usePolicy?: string;
    };
    previouslyWorkedAtEmployer?: string;
  };
  companionId: string;
  employer: string;
  legal: {
    approvedAcknowledgements: string[];
  };
  ownerEmail: string;
  platform: string;
  position: string;
  questionCatalog: Array<{
    allowedOptions: string[];
    exactWording: string;
    required: boolean;
    verifiedMappedAnswer?: JsonRecord | null;
  }>;
  resume: {
    content?: string;
    fileName: string;
    localPath?: string;
  };
  coverLetter?: {
    content?: string;
    fileName: string;
    localPath?: string;
    sha256?: string;
  };
  productionExecutionMode?: string;
  rawRecord?: JsonRecord;
};

export type SubmitSafetyCheckResult = {
  duplicate?: {
    existingApplicationId: string;
    lockKey: string;
    reason: string;
  };
  ok: boolean;
  status: 'safe' | 'duplicate_locked' | 'terminal_locked' | 'missing_application';
};

function browserWorkerAuthToken() {
  return cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN);
}

export function browserWorkerConfigured() {
  return true;
}

export async function authorizeBrowserWorker(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const sharedToken = browserWorkerAuthToken();
  if (sharedToken && bearer === sharedToken) return { authorized: true, reason: '' };
  const oidc = await verifyGitHubActionsOidc(bearer);
  if (oidc) return { authorized: true, reason: '' };
  return { authorized: false, reason: 'Unauthorized browser worker request.' };
}

async function verifyGitHubActionsOidc(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { alg?: string; kid?: string };
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    if (header.alg !== 'RS256' || !header.kid) return false;
    if (payload.iss !== 'https://token.actions.githubusercontent.com') return false;
    if (payload.aud !== 'answerbrief-career-os') return false;
    if (payload.repository !== 'boritomas/answerbrief-ai-automation') return false;
    if (payload.ref !== 'refs/heads/main') return false;
    if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return false;
    const response = await fetch('https://token.actions.githubusercontent.com/.well-known/jwks');
    if (!response.ok) return false;
    const jwks = await response.json() as { keys?: Array<Record<string, unknown>> };
    const jwk = jwks.keys?.find((key) => key.kid === header.kid);
    if (!jwk) return false;
    const publicKey = crypto.createPublicKey({ key: jwk as unknown as import('node:crypto').JsonWebKey, format: 'jwk' });
    const signingInput = parts[0] + '.' + parts[1];
    return crypto.verify('RSA-SHA256', Buffer.from(signingInput), publicKey, Buffer.from(parts[2], 'base64url'));
  } catch {
    return false;
  }
}

export async function claimNextBrowserWorkerTask(input: BrowserWorkerClaimRequest): Promise<BrowserWorkerTask | null> {
  const queuePaused = careerOsQueuePaused();
  const applications = await selectAll(
    'career_os_applications',
    `select=*&owner_email=eq.${encodeURIComponent(input.ownerEmail)}&order=updated_at.asc.nullslast,created_at.asc.nullslast`,
  ) as QueueApplication[];

  for (const application of applications) {
    if (queuePaused && !isExplicitlyResumedApplication(application)) {
      debugClaimSkip(application, 'queue_paused');
      continue;
    }
    if (!isBrowserWorkerEligible(application, input.companionId)) {
      debugClaimSkip(application, 'not_browser_worker_eligible', {
        state: canonicalQueueState(application),
        workerStatus: cleanEnv(asRecord(asRecord(application.raw_record).browser_worker).status),
        href: externalApplicationHref(application),
      });
      continue;
    }
    const productionGate = productionClaimGate(application, applications);
    if (!productionGate.ok) {
      debugClaimSkip(application, 'production_gate', {
        reason: productionGate.reason,
        status: productionGate.status,
      });
      if (productionGate.persist) {
        await markProductionClaimGate(application, productionGate, input.companionId);
      }
      continue;
    }
    const safety = await checkBrowserWorkerSubmitSafety({
      applicationId: application.id,
      ownerEmail: input.ownerEmail,
    });
    if (!safety.ok) {
      debugClaimSkip(application, 'submit_safety', { status: safety.status });
      continue;
    }
    const task = await buildTaskPayload(application, input.companionId);
    if (!task) {
      debugClaimSkip(application, 'payload_unavailable');
      continue;
    }

    const now = new Date().toISOString();
    const runId = deterministicUuid(`career-os-browser-claim:${application.id}:${input.companionId}:${now}`);
    const raw = asRecord(application.raw_record);
    const originalLifecycleStage = cleanEnv(application.lifecycle_stage);
    const originalUpdatedAt = cleanEnv(application.updated_at);
    const patch = {
      lifecycle_stage: 'browser_worker_running',
      next_action: `Career OS local browser companion ${input.companionId} claimed the application for real employer-site execution.`,
      raw_record: {
        ...raw,
        browser_worker: {
          claimed_at: now,
          companion_id: input.companionId,
          claim_token: runId,
          last_heartbeat_at: now,
          status: 'running',
        },
        execution_engine: 'playwright_local_companion',
        execution_status: 'running',
        production_claim: {
          daily_limit: productionGate.dailyLimit,
          execution_mode: productionGate.executionMode,
          platform: productionGate.platform,
        },
      },
      updated_at: now,
    };
    const claimQuery = [
      `select=*`,
      `id=eq.${encodeURIComponent(application.id)}`,
      originalUpdatedAt
        ? `updated_at=eq.${encodeURIComponent(originalUpdatedAt)}`
        : `lifecycle_stage=eq.${encodeURIComponent(originalLifecycleStage)}`,
    ].join('&');
    const claimedRows = await patchApplications(claimQuery, patch);
    if (!claimedRows.length) continue;
    await appendWorkflowEvent(application, 'browser_worker_claimed', 'running', patch.next_action, now, runId, task.applicationUrl);
    return task;
  }

  return null;
}

function debugClaimSkip(application: QueueApplication, reason: string, details: JsonRecord = {}) {
  if (cleanEnv(process.env.CAREER_OS_DEBUG_CLAIM) !== '1') return;
  console.warn('[career-os-claim-skip]', JSON.stringify({
    applicationId: application.id,
    employer: application.employer,
    position: application.position,
    reason,
    ...details,
  }));
}

function buildBrowserWorkerTechnicalDiagnostic(
  application: QueueApplication,
  report: WorkerReport,
  details: JsonRecord,
  currentUrl: string,
  screenshotPath: string,
): JsonRecord {
  const raw = asRecord(application.raw_record);
  const step = cleanEnv(details.step || details.failedStep || details.stage || details.phase) || 'unknown_step';
  const attemptedAction = cleanEnv(details.attemptedAction || details.action || details.operation) || 'unknown_action';
  const selector = cleanEnv(details.selector || details.targetSelector || details.locator);
  const browserException = cleanEnv(details.browserException || details.exception || details.error || details.message || report.evidenceText);
  const platform = cleanEnv(details.platform || raw.platform || raw.ats || raw.source_platform) || 'unknown';
  const retryCountValue = Number(details.retryCount ?? details.attempt ?? details.attemptNumber ?? 0);
  const retryCount = Number.isFinite(retryCountValue) ? retryCountValue : 0;
  const retryable = details.retryable === false ? false : report.status !== 'failed';
  const summaryParts = [
    application.employer,
    platform,
    step,
    attemptedAction,
    browserException,
  ].filter(Boolean);

  return {
    attempted_action: attemptedAction,
    browser_exception: browserException,
    current_url: currentUrl,
    employer: application.employer,
    platform,
    position: application.position,
    retry_count: retryCount,
    retryable,
    screenshot_path: screenshotPath,
    selector,
    step,
    summary: summaryParts.join(' | '),
  };
}

function buildBrowserCheckpoint(
  application: QueueApplication,
  report: WorkerReport,
  details: JsonRecord,
  now: string,
): JsonRecord {
  const raw = asRecord(application.raw_record);
  const previous = asRecord(raw.browser_checkpoint);
  const completedStep = cleanEnv(details.completedStep || details.completed_step || details.step || details.stage || details.phase);
  const currentStep = cleanEnv(details.currentStep || details.current_step || details.nextStep || details.next_step || completedStep);
  const completedSections = Array.isArray(details.completedSections)
    ? details.completedSections.filter((value) => typeof value === 'string' && value.trim())
    : Array.isArray(previous.completed_sections)
      ? previous.completed_sections
      : [];

  if (!completedStep && !currentStep && !completedSections.length) return previous;

  return {
    application_id: application.id,
    completed_sections: completedSections,
    completed_step: completedStep || previous.completed_step || '',
    current_step: currentStep || previous.current_step || '',
    resume_url: cleanEnv(report.currentUrl || report.evidenceUrl) || previous.resume_url || '',
    screenshot_path: cleanEnv(report.screenshotPath) || previous.screenshot_path || '',
    status: report.status,
    updated_at: now,
    version: 1,
  };
}

export async function reportBrowserWorkerProgress(report: WorkerReport) {
  const application = await selectApplication(report.ownerEmail, report.applicationId);
  if (!application) {
    throw new Error('Career OS browser worker application was not found.');
  }

  const now = new Date().toISOString();
  const runId = deterministicUuid(`career-os-browser-report:${report.applicationId}:${report.companionId}:${report.status}:${now}`);
  const raw = asRecord(application.raw_record);
  const browserWorker = asRecord(raw.browser_worker);
  const currentUrl = cleanEnv(report.currentUrl || report.evidenceUrl || stringValue(raw.application_url) || stringValue(raw.canonical_url));
  const screenshotPath = cleanEnv(report.screenshotPath);
  const details = asRecord(report.details);
  const browserCheckpoint = buildBrowserCheckpoint(application, report, details, now);
  const technicalDiagnostic: JsonRecord = report.status === 'blocked_technical' || report.status === 'failed'
    ? buildBrowserWorkerTechnicalDiagnostic(application, report, details, currentUrl, screenshotPath)
    : {};
  const outcomeStatus = normalizeProductionOutcome(report.status, cleanEnv(details.outcomeStatus));
  const decisionQueue = mergeProductionDecisionQueue(raw.user_decision_queue, details.decisionQueue, now);

  const nextRaw: JsonRecord = {
    ...raw,
    application_url: currentUrl || raw.application_url,
    browser_checkpoint: browserCheckpoint,
    browser_worker: {
      ...browserWorker,
      companion_id: report.companionId,
      last_heartbeat_at: now,
      last_screenshot_path: screenshotPath || browserWorker.last_screenshot_path,
      status: report.status,
    },
    browser_worker_last_report: {
      current_url: currentUrl,
      details,
      resume_checkpoint: browserCheckpoint,
      technical_diagnostic: technicalDiagnostic,
      evidence_text: report.evidenceText || '',
      evidence_url: report.evidenceUrl || '',
      screenshot_path: screenshotPath || '',
      status: report.status,
      timestamp: now,
    },
    execution_engine: 'playwright_local_companion',
    execution_status: mapWorkerStatusToExecutionStatus(report.status),
    production_outcome: outcomeStatus || raw.production_outcome,
    user_decision_queue: decisionQueue.length ? decisionQueue : raw.user_decision_queue,
  };

  if (report.status === 'heartbeat' || report.status === 'running' || report.status === 'assisted_in_progress') {
    await patchApplication(application.id, {
      lifecycle_stage: 'browser_worker_running',
      next_action: report.evidenceText || 'Browser companion is progressing the employer workflow.',
      raw_record: nextRaw,
      updated_at: now,
    });
    await appendWorkflowEvent(application, 'browser_worker_progress', 'running', report.evidenceText || 'Browser companion heartbeat received.', now, runId, currentUrl || undefined, {
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
    return;
  }

  if (report.status === 'waiting_on_tomas') {
    await patchApplication(application.id, {
      lifecycle_stage: 'waiting_on_tomas_browser_worker',
      next_action: report.evidenceText || 'Browser companion reached a human-only gate.',
      raw_record: nextRaw,
      updated_at: now,
    });
    await appendWorkflowEvent(application, 'browser_worker_waiting_on_tomas', 'waiting_on_tomas', report.evidenceText || 'Human-only gate detected.', now, runId, currentUrl || undefined, {
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
    return;
  }

  if (report.status === 'blocked_technical' || report.status === 'failed') {
    await patchApplication(application.id, {
      lifecycle_stage: report.status === 'failed' ? 'browser_worker_failed' : 'browser_worker_blocked_technical',
      next_action: cleanEnv(technicalDiagnostic.summary) || report.evidenceText || 'Browser companion hit a technical blocker.',
      raw_record: nextRaw,
      updated_at: now,
    });
    await appendWorkflowEvent(application, 'browser_worker_blocked', report.status === 'failed' ? 'failed' : 'blocked_technical', report.evidenceText || 'Technical blocker detected.', now, runId, currentUrl || undefined, {
      screenshot_path: screenshotPath || undefined,
      technical_diagnostic: technicalDiagnostic,
      ...details,
    });
    return;
  }

  if (report.status === 'retry_scheduled') {
    await patchApplication(application.id, {
      lifecycle_stage: 'retry_scheduled',
      next_action: report.evidenceText || (cleanEnv(browserCheckpoint.current_step)
        ? 'Browser companion scheduled a retry from ' + cleanEnv(browserCheckpoint.current_step) + '.'
        : 'Browser companion scheduled a retry.'),
      raw_record: nextRaw,
      updated_at: now,
    });
    await appendWorkflowEvent(application, 'browser_worker_retry_scheduled', 'retry_scheduled', report.evidenceText || 'Retry scheduled.', now, runId, currentUrl || undefined, {
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
    return;
  }

  const productionOutcome = productionOutcomeHandling(report.status, report.evidenceText);
  if (productionOutcome) {
    await patchApplication(application.id, {
      lifecycle_stage: productionOutcome.lifecycleStage,
      next_action: productionOutcome.nextAction,
      raw_record: nextRaw,
      updated_at: now,
    });
    await appendWorkflowEvent(application, productionOutcome.eventType, productionOutcome.eventStatus, productionOutcome.nextAction, now, runId, currentUrl || undefined, {
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
    return;
  }

  if (report.status === 'submitted' || report.status === 'confirmed' || report.status === 'submitted_confirmed') {
    const safety = await checkBrowserWorkerSubmitSafety({
      applicationId: report.applicationId,
      ownerEmail: report.ownerEmail,
    });
    if (!safety.ok) {
      await appendWorkflowEvent(application, 'duplicate_submission_report_rejected', 'duplicate_locked', 'Browser worker attempted to report a submission after the duplicate lock was active.', now, runId, currentUrl || undefined, {
        duplicate: safety.duplicate,
        screenshot_path: screenshotPath || undefined,
        ...details,
      });
      return;
    }
    const emailConfirmationEvidence = submissionConfirmationEmailEvidence(report);
    if (report.status === 'submitted_confirmed' && !emailConfirmationEvidence) {
      const pageEvidence = report.evidenceText || 'Submission confirmation page was detected, but no matching employer confirmation email has been captured yet.';
      await patchApplication(application.id, {
        lifecycle_stage: 'submitted_email_confirmation_pending',
        next_action: 'Application page indicated submission, but Career OS still needs the employer confirmation email before counting it as confirmed.',
        raw_record: {
          ...nextRaw,
          confirmation_email_required: true,
          confirmation_email_status: 'pending',
          confirmation_page_evidence: {
            captured_at: now,
            current_url: report.evidenceUrl || currentUrl || '',
            evidence_text: pageEvidence,
            screenshot_path: screenshotPath || '',
          },
          confirmation_url: report.evidenceUrl || currentUrl || raw.confirmation_url,
          production_outcome: 'submitted_email_confirmation_pending',
        },
        updated_at: now,
      });
      await appendWorkflowEvent(application, 'browser_worker_submission_email_pending', 'submitted_email_confirmation_pending', pageEvidence, now, runId, report.evidenceUrl || currentUrl || undefined, {
        confirmation_email_required: true,
        screenshot_path: screenshotPath || undefined,
        ...details,
      });
      return;
    }
    const confirmationNumber = cleanEnv(report.confirmationNumber) || `browser-worker-${application.id}-confirmation`;
    const confirmed = report.status === 'confirmed' || report.status === 'submitted_confirmed';
    const submissionEvidence = report.evidenceText || (confirmed
      ? 'Submission confirmation email was captured by the Career OS browser companion.'
      : 'Submission was completed by the Career OS browser companion.');
    await patchApplication(application.id, {
      confirmation_number: confirmationNumber,
      lifecycle_stage: confirmed ? 'confirmed' : 'submitted',
      next_action: confirmed
        ? 'Application submitted and confirmation evidence captured by the browser companion.'
        : 'Application submitted by the browser companion; awaiting confirmation evidence review.',
      raw_record: {
        ...nextRaw,
        confirmation_email_evidence: emailConfirmationEvidence || raw.confirmation_email_evidence,
        confirmation_email_required: report.status === 'submitted_confirmed' ? true : raw.confirmation_email_required,
        confirmation_email_status: emailConfirmationEvidence ? 'verified' : raw.confirmation_email_status,
        confirmation_url: report.evidenceUrl || currentUrl || raw.confirmation_url,
      },
      submission_evidence: submissionEvidence,
      updated_at: now,
    });
    await appendWorkflowEvent(application, confirmed ? 'browser_worker_confirmed' : 'browser_worker_submitted', confirmed ? 'confirmed' : 'submitted', submissionEvidence, now, runId, report.evidenceUrl || currentUrl || undefined, {
      confirmation_number: confirmationNumber,
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
  }
}

export async function checkBrowserWorkerSubmitSafety(input: { applicationId: string; ownerEmail: string }): Promise<SubmitSafetyCheckResult> {
  const applications = await selectAll(
    'career_os_applications',
    `select=*&owner_email=eq.${encodeURIComponent(input.ownerEmail)}&order=updated_at.desc`,
  ) as QueueApplication[];
  const application = applications.find((row) => row.id === input.applicationId);
  if (!application) return { ok: false, status: 'missing_application' };

  if (isTerminalSubmission(application)) {
    const now = new Date().toISOString();
    const runId = deterministicUuid(`career-os-submit-safety:${application.id}:terminal:${now}`);
    await patchApplication(application.id, terminalLockPatch(application, 'terminal_submission_reopen_prevented', now));
    await appendWorkflowEvent(application, 'terminal_submission_reopen_prevented', 'duplicate_locked', 'Submitted/confirmed application was blocked from browser execution.', now, runId);
    return { ok: false, status: 'terminal_locked' };
  }

  const duplicate = duplicateSubmissionMatch(application, applications as CareerOsLockApplication[]);
  if (duplicate) {
    const now = new Date().toISOString();
    const runId = deterministicUuid(`career-os-submit-safety:${application.id}:duplicate:${duplicate.existingApplicationId}:${now}`);
    await patchApplication(application.id, terminalLockPatch(application, duplicate.reason, now));
    await appendWorkflowEvent(application, 'duplicate_submission_prevented', 'duplicate_locked', duplicate.reason, now, runId, externalApplicationHref(application) || undefined, {
      duplicate_existing_application_id: duplicate.existingApplicationId,
      duplicate_lock_key: duplicate.lockKey,
    });
    return { ok: false, duplicate, status: 'duplicate_locked' };
  }

  return { ok: true, status: 'safe' };
}

export async function browserWorkerHealth(ownerEmail: string) {
  const applications = await selectAll(
    'career_os_applications',
    `select=id,employer,position,lifecycle_stage,next_action,raw_record,updated_at,confirmation_number,submission_evidence&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc`,
  ) as QueueApplication[];

  const eligibleBeforeProductionGate = applications.filter((application) => isBrowserWorkerEligible(application, undefined)).length;
  const eligible = applications.filter((application) => {
    if (!isBrowserWorkerEligible(application, undefined)) return false;
    return productionClaimGate(application, applications).ok;
  }).length;
  const running = applications.filter((application) => {
    const raw = asRecord(application.raw_record);
    return cleanEnv(raw.execution_engine) === 'playwright_local_companion' && cleanEnv(asRecord(raw.browser_worker).status) === 'running';
  }).length;

  return {
    configured: browserWorkerConfigured(),
    eligible,
    production: {
      dailyLimit: productionDailyLimit(),
      executionMode: productionExecutionMode() || 'missing',
      executionModeValid: Boolean(normalizeProductionExecutionMode(productionExecutionMode())),
      greenhouseCanaryApplicationIdConfigured: Boolean(cleanEnv(process.env.CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID)),
      queueEnabled: !careerOsQueuePaused(),
      workdayBroadSubmissionDisabled: false,
      workdayCanaryIdConfigured: Boolean(workdayCanaryId()),
      workdayCanaryUrlConfigured: Boolean(cleanEnv(process.env.CAREER_OS_WORKDAY_CANARY_URL)),
      workdayFirstModeAvailable: true,
      workdaySingleCanaryModeAvailable: true,
      submitRunAuthorizationConfigured: Boolean(cleanEnv(process.env.CAREER_OS_SUBMIT_RUN_AUTHORIZATION || process.env.CAREER_OS_GREENHOUSE_SUBMIT_AUTHORIZATION)),
      supportedPlatformTokens: [...BROWSER_WORKER_SUPPORTED_PLATFORM_TOKENS],
    },
    productionGateBlocked: Math.max(0, eligibleBeforeProductionGate - eligible),
    running,
  };
}

function isBrowserWorkerEligible(application: QueueApplication, companionId: string | undefined) {
  if (isTerminalSubmission(application)) return false;
  const state = canonicalQueueState(application);
  if (!['queued', 'package_ready', 'qualified', 'retry_scheduled', 'running', 'review_ready'].includes(state)) return false;
  if (state === 'review_ready' && !cleanEnv(process.env.CAREER_OS_WORKDAY_SUBMIT_APPROVAL)) return false;
  if (application.confirmation_number || application.submission_evidence) return false;
  const raw = asRecord(application.raw_record);
  const browserWorker = asRecord(raw.browser_worker);
  const lastReport = asRecord(raw.browser_worker_last_report);
  const lastReportStatus = cleanEnv(lastReport.status);
  const explicitlyQueued = state === 'queued' && (
    cleanEnv(application.lifecycle_stage).toLowerCase() === 'queue_queued'
    || cleanEnv(raw.execution_status).toLowerCase() === 'queued'
  );
  if (
    (lastReportStatus === 'waiting_on_tomas' || lastReportStatus === 'blocked_technical')
    && !isExplicitlyResumedApplication(application)
    && !recoverableLegacyAdapterState(application)
    && !explicitlyQueued
    && !isWorkdayAuthorizedAccountGate(application)
  ) {
    return false;
  }
  const claimedBy = cleanEnv(browserWorker.companion_id);
  const status = cleanEnv(browserWorker.status);
  if (status === 'running' && claimedBy && companionId && claimedBy !== companionId) return false;
  return Boolean(externalApplicationHref(application));
}

function isExplicitlyResumedApplication(application: QueueApplication) {
  const raw = asRecord(application.raw_record);
  return Boolean(raw.explicit_resume_requested_at || raw.human_step_completed_at || raw.blocker_resolved_at);
}

function canonicalQueueState(application: JsonRecord): QueueState {
  const raw = asRecord(application.raw_record);
  const lifecycleStage = cleanEnv(application.lifecycle_stage).toLowerCase();
  const text = applicationText(application);
  const recoveredState = recoverableLegacyAdapterState(application);
  if (recoveredState) return recoveredState;
  if (
    lifecycleStage === 'queued_after_human_step'
    || lifecycleStage === 'queued_after_tomas_resolution'
    || cleanEnv(raw.execution_status).toLowerCase() === 'queued'
  ) return 'queued';
  if (application.confirmation_number || application.submission_evidence) return 'confirmed';
  if (hasAny(text, ['retry_scheduled', 'retry scheduled'])) return 'retry_scheduled';
  if (hasAny(text, ['submitted'])) return 'submitted';
  if (hasAny(text, ['duplicate'])) return 'duplicate';
  if (hasAny(text, ['deferred_phase_two_greenhouse'])) return 'ineligible';
  if (hasAny(text, ['quality_hold', 'hold_for_quality'])) return 'ineligible';
  if (hasAny(text, ['inactive', 'closed', 'expired', 'unavailable', 'no longer available', 'generic careers listing'])) return 'inactive';
  if (hasAny(text, ['ineligible'])) return 'ineligible';
  if (isWorkdayAuthorizedAccountGate(application)) return 'queued';
  if (hasAny(text, ['review_ready'])) return 'review_ready';
  if (hasAny(text, ['submission_uncertain'])) return 'submission_uncertain';
  if (hasAny(text, ['unsupported_workday_state'])) return 'unsupported_workday_state';
  if (hasAny(text, ['waiting_for_sign_in', 'waiting_for_account_creation', 'waiting_for_email_code', 'waiting_for_email_verification', 'waiting_for_user_decision', 'waiting_for_manual_upload'])) return 'waiting_on_tomas';
  if (hasAny(text, ['failed', 'error'])) return 'failed';
  if (hasAny(text, ['running'])) return 'running';
  if (hasAny(text, ['queued'])) return 'queued';
  if (hasAny(text, ['package_ready', 'ready_for_automation', 'qualified_pending_application', 'resumable'])) return 'queued';
  if (hasAny(text, ['package_pending'])) return 'package_pending';
  if (hasAny(text, ['qualified'])) return 'queued';
  if (hasAny(text, ['discovered'])) return 'discovered';
  return 'qualification_pending';
}

async function buildTaskPayload(application: QueueApplication, companionId: string): Promise<BrowserWorkerTask | null> {
  const applicationUrl = await resolveApplicationHref(application);
  if (!applicationUrl) return null;

  const profileRows = await selectAll(
    'career_os_profiles',
    `select=*&owner_email=eq.${encodeURIComponent(application.owner_email)}&limit=1`,
  );
  const profile = asRecord(profileRows[0]);
  const verifiedProfile = asRecord(profile.verified_profile);
  const employerRows = await selectAll(
    'career_os_employers',
    `select=id,canonical_name&owner_email=eq.${encodeURIComponent(application.owner_email)}&canonical_name=eq.${encodeURIComponent(application.employer)}&limit=1`,
  );
  const employer = asRecord(employerRows[0]);
  const employerId = cleanEnv(employer.id);
  const questionRows = employerId
    ? await selectAll(
        'career_os_employer_question_catalog',
        `select=exact_wording,required,allowed_options,verified_mapped_answer&owner_email=eq.${encodeURIComponent(application.owner_email)}&employer_id=eq.${encodeURIComponent(employerId)}&order=updated_at.asc`,
      )
    : [];
  const processRows = employerId
    ? await selectAll(
        'career_os_employer_application_processes',
        `select=legal_acknowledgements,platform_name&owner_email=eq.${encodeURIComponent(application.owner_email)}&employer_id=eq.${encodeURIComponent(employerId)}&order=updated_at.desc&limit=1`,
      )
    : [];
  const artifacts = await selectAll(
    'career_os_artifacts',
    `select=artifact_type,filename,content_type,local_path,storage_url,drive_url,approval_status,validation_status,application_id,opportunity_id,input_hash,metadata&owner_email=eq.${encodeURIComponent(application.owner_email)}&application_id=eq.${encodeURIComponent(application.id)}&order=created_at.desc`,
  );
  const raw = asRecord(application.raw_record);
  const postingId = cleanEnv(application.opportunity_id || raw.canonical_job_posting_id);
  const postingRows = postingId
    ? await selectAll(
        'career_os_job_postings',
        `select=*&owner_email=eq.${encodeURIComponent(application.owner_email)}&id=eq.${encodeURIComponent(postingId)}&limit=1`,
      )
    : [];
  const posting = asRecord(postingRows[0]);

  let packageArtifacts = artifacts;
  let enrichedApplication: QueueApplication = application;
  let coverLetterArtifact = findCoverLetterArtifact(packageArtifacts);
  let qualityGate = assessApplicationQuality({
    application: enrichedApplication,
    artifacts: packageArtifacts,
    posting,
    preferredMinimumBaseSalaryUsd: COMPENSATION_FLOOR_USD,
  });
  if (qualityGate.coverLetterNeeded && !qualityGate.coverLetterAvailable && canGenerateCoverLetterForQualityGate(qualityGate)) {
    coverLetterArtifact = await ensureCoverLetterArtifact({
      application: enrichedApplication,
      artifacts: packageArtifacts,
      companionId,
      posting,
      profile,
    });
    packageArtifacts = [coverLetterArtifact, ...packageArtifacts];
    enrichedApplication = {
      ...enrichedApplication,
      cover_letter: cleanEnv(coverLetterArtifact.metadata && asRecord(coverLetterArtifact.metadata).inline_content),
      raw_record: {
        ...raw,
        cover_letter: asRecord(coverLetterArtifact.metadata).cover_letter,
      },
    } as QueueApplication;
    qualityGate = assessApplicationQuality({
      application: enrichedApplication,
      artifacts: packageArtifacts,
      posting,
      preferredMinimumBaseSalaryUsd: COMPENSATION_FLOOR_USD,
    });
  }
  if (!qualityGate.submitReady) {
    await markApplicationQualityHold(enrichedApplication, qualityGate, posting, companionId);
    return null;
  }

  const resumeArtifact = packageArtifacts.find((row) => {
    const record = asRecord(row);
    return cleanEnv(record.artifact_type).includes('resume');
  });
  const displayName = cleanEnv(profile.display_name) || 'Tomas Nieves';
  const contact = asRecord(verifiedProfile.contact);
  const pronouns = asRecord(verifiedProfile.pronouns);
  const referralSource = asRecord(verifiedProfile.referral_source);
  const priorAffirm = asRecord(verifiedProfile.prior_affirm_employment);
  const sponsorship = asRecord(verifiedProfile.sponsorship_requirement);
  const employerSpecificAnswers = asRecord(asRecord(verifiedProfile.employer_specific_answers)[application.employer]);
  const employmentTenure = asRecord(asRecord(application.application_answers).verified_employment_tenure);
  const candidateProfile = buildCandidateProfile(verifiedProfile, profile, application.application_answers);
  const employmentProfile = candidateProfile.primaryEmployment;
  const employmentValidation = employmentDateValidation(employmentProfile);
  const process = asRecord(processRows[0]);
  const legalAcknowledgements = arrayValue(process.legal_acknowledgements)
    .map((item) => cleanEnv(asRecord(item).wording))
    .filter(Boolean);

  return {
    applicationId: application.id,
    applicationUrl,
    candidate: {
      currentCompany: cleanEnv(raw.current_company) || candidateProfile.currentCompany || 'Verizon',
      email: candidateProfile.email,
      employerSpecificAnswers: {
        priorEmployerEmployeeId: cleanEnv(
          employerSpecificAnswers.prior_employer_employee_id
          ?? employerSpecificAnswers.employee_id
          ?? employerSpecificAnswers.enterprise_id
        ),
        priorEmployerSupervisorName: cleanEnv(
          employerSpecificAnswers.prior_employer_supervisor_name
          ?? employerSpecificAnswers.supervisor_name
          ?? employerSpecificAnswers.manager_name
        ),
        priorEmployerWorkEmail: cleanEnv(
          employerSpecificAnswers.prior_employer_work_email
          ?? employerSpecificAnswers.work_email
        ),
        priorEmployerWorkLocation: cleanEnv(
          employerSpecificAnswers.prior_employer_work_location
          ?? employerSpecificAnswers.primary_work_location
          ?? employerSpecificAnswers.work_location
        ),
        previouslyWorkedAtEmployer: normalizeEmployerBooleanAnswer(
          employerSpecificAnswers.previously_worked_at_samsara
          ?? employerSpecificAnswers.previously_worked_at_employer
          ?? employerSpecificAnswers.previously_worked_for_verizon_or_predecessor
          ?? employerSpecificAnswers.previously_employed_here
          ?? employerSpecificAnswers.prior_employment,
        ),
      },
      employmentHistory: candidateProfile.employmentHistory,
      educationHistory: arrayValue(verifiedProfile.education).map((item) => cleanEnv(item)).filter(Boolean),
      firstName: candidateProfile.firstName || displayName.split(/\s+/)[0] || 'Tomas',
      fullAddress: candidateProfile.fullAddress || cleanEnv(contact.full_address),
      lastName: candidateProfile.lastName || 'Nieves',
      linkedin: candidateProfile.linkedin,
      phone: candidateProfile.phone,
      postalCode: candidateProfile.postalCode,
      preferredName: candidateProfile.preferredName,
      primaryEmployment: employmentProfile,
      primaryEmploymentMissingVerifiedFields: employmentValidation.missingVerifiedFields,
      primaryEmploymentWorkdayReady: employmentValidation.canAutofillWorkday,
      previouslyWorkedAtEmployer: priorAffirm.answer_label ? cleanEnv(priorAffirm.answer_label) : undefined,
      pronouns: candidateProfile.pronouns || cleanEnv(pronouns.answer),
      referralSource: candidateProfile.referralSource || cleanEnv(referralSource.value),
      referralSourceAffirmFallback: application.employer === 'Affirm' ? 'Other' : undefined,
      city: candidateProfile.city || cleanEnv(contact.city),
      countryRegion: candidateProfile.countryRegion || 'United States of America',
      sponsorshipFuture: sponsorship.answer_label ? cleanEnv(sponsorship.answer_label) : undefined,
      sponsorshipNow: sponsorship.answer_label ? cleanEnv(sponsorship.answer_label) : undefined,
      stateOrProvince: candidateProfile.stateOrProvince,
      streetAddress: candidateProfile.streetAddress || cleanEnv(contact.street_address),
      usWorkAuthorization: candidateProfile.usWorkAuthorization,
      verifiedEmploymentTenure: employmentTenure.start_year || employmentTenure.end_year
        ? {
            employer: cleanEnv(employmentTenure.employer),
            endYear: numberValue(employmentTenure.end_year),
            precision: cleanEnv(employmentTenure.precision),
            startYear: numberValue(employmentTenure.start_year),
            usePolicy: cleanEnv(employmentTenure.use_policy),
          }
        : undefined,
    },
    companionId,
    employer: application.employer,
    legal: {
      approvedAcknowledgements: legalAcknowledgements,
    },
    ownerEmail: application.owner_email,
    platform: cleanEnv(process.platform_name || raw.platform || raw.ats_platform) || 'unknown',
    position: application.position,
    questionCatalog: questionRows.map((row) => {
      const record = asRecord(row);
      return {
        allowedOptions: arrayValue(record.allowed_options).map((value) => cleanEnv(value)).filter(Boolean),
        exactWording: cleanEnv(record.exact_wording),
        required: Boolean(record.required),
        verifiedMappedAnswer: record.verified_mapped_answer ? asRecord(record.verified_mapped_answer) : null,
      };
    }),
    resume: {
      content: cleanEnv(enrichedApplication.exact_resume) || undefined,
      fileName: cleanEnv(asRecord(resumeArtifact).filename) || `${slugify(application.employer)}-${slugify(application.position)}-resume.txt`,
      localPath: cleanEnv(asRecord(resumeArtifact).local_path) || undefined,
    },
    coverLetter: coverLetterArtifact
      ? {
          content: cleanEnv(enrichedApplication.cover_letter) || cleanEnv(asRecord(coverLetterArtifact.metadata).inline_content) || undefined,
          fileName: cleanEnv(coverLetterArtifact.filename) || coverLetterFilename(application),
          localPath: cleanEnv(coverLetterArtifact.local_path) || undefined,
          sha256: cleanEnv(asRecord(coverLetterArtifact.metadata).sha256) || undefined,
        }
      : undefined,
    productionExecutionMode: cleanEnv(raw.production_execution_mode || raw.execution_mode) || undefined,
    rawRecord: {
      ...raw,
      quality_gate: qualityGate,
    },
  };
}

function findCoverLetterArtifact(artifacts: JsonRecord[]) {
  return artifacts.find((row) => {
    const record = asRecord(row);
    return cleanEnv(record.artifact_type) === 'cover_letter'
      && hasAny(`${record.validation_status || ''} ${record.approval_status || ''}`, ['passed', 'approved']);
  });
}

function canGenerateCoverLetterForQualityGate(qualityGate: ApplicationQualityGate) {
  const hardHoldReasons = qualityGate.holdReasons.filter((reason: string) => reason !== 'borderline_score_requires_cover_letter');
  return hardHoldReasons.length === 0 && qualityGate.score >= 75;
}

async function ensureCoverLetterArtifact(input: {
  application: QueueApplication;
  artifacts: JsonRecord[];
  companionId: string;
  posting: JsonRecord;
  profile: JsonRecord;
}) {
  const existing = findCoverLetterArtifact(input.artifacts);
  if (existing) return existing;

  const now = new Date().toISOString();
  const generated = generateTailoredCoverLetter({
    application: input.application,
    posting: input.posting,
    profile: input.profile,
  });
  const filename = coverLetterFilename(input.application);
  const coverLetterDir = path.join(process.cwd(), '.career-os-browser-worker', 'cover-letters');
  fs.mkdirSync(coverLetterDir, { recursive: true });
  const localPath = path.join(coverLetterDir, `${input.application.id}-${filename}`);
  fs.writeFileSync(localPath, generated.content, 'utf8');
  const hash = generated.hash || sha256Hex(generated.content);
  const raw = asRecord(input.application.raw_record);
  const artifactId = deterministicUuid(`career-os-cover-letter:${input.application.id}:${hash}`);
  const inputHash = sha256Hex([
    input.application.id,
    input.application.employer,
    input.application.position,
    input.posting.id,
    input.posting.job_description,
    input.application.exact_resume,
  ].map(cleanEnv).join('\n'));
  const metadata = {
    application_quality_layer: true,
    cover_letter: {
      generated_at: now,
      hash,
      local_path: localPath,
      source: generated.source,
      status: 'generated',
      uploaded: false,
    },
    employer: input.application.employer,
    filename,
    generated_at: now,
    inline_content: generated.content,
    position: input.application.position,
    requisition_id: cleanEnv(raw.external_requisition_id || raw.requisition_id || raw.job_id || input.application.opportunity_id),
    resume_hash: sha256Hex(input.application.exact_resume || cleanEnv(raw.resume_path)),
    sha256: hash,
    source: generated.source,
    source_job_description_hash: sha256Hex(input.posting.job_description || input.posting.normalized_description || ''),
    uploaded: false,
  };
  const artifact = {
    id: artifactId,
    owner_email: input.application.owner_email,
    opportunity_id: cleanEnv(input.application.opportunity_id || raw.canonical_job_posting_id) || null,
    application_id: input.application.id,
    artifact_type: 'cover_letter',
    filename,
    content_type: 'text/plain',
    storage_url: null,
    local_path: localPath,
    drive_url: null,
    validation_status: 'passed',
    approval_status: 'approved_for_automation',
    profile_version: cleanEnv(asRecord(input.profile.verified_profile).profile_version) || 'career-os-approved-profile',
    prompt_version: generated.source,
    model_version: 'deterministic_template',
    input_hash: inputHash,
    metadata,
    created_at: now,
    updated_at: now,
  };

  await upsertRows('career_os_artifacts', artifact);
  await patchApplication(input.application.id, {
    cover_letter: generated.content,
    raw_record: {
      ...raw,
      cover_letter: {
        generated_at: now,
        hash,
        local_path: localPath,
        source: generated.source,
        status: 'generated',
        uploaded: false,
      },
      quality_gate_status: 'cover_letter_generated',
    },
    updated_at: now,
  });
  await appendWorkflowEvent(
    input.application,
    'cover_letter_generated',
    'approved_for_automation',
    `Generated a tailored cover letter for ${input.application.employer} ${input.application.position}.`,
    now,
    deterministicUuid(`career-os-cover-letter-event:${input.application.id}:${hash}`),
    externalApplicationHref(input.application) || undefined,
    {
      artifact_id: artifactId,
      cover_letter_hash: hash,
      companion_id: input.companionId,
      filename,
      source: generated.source,
    },
  );
  return artifact;
}

async function markApplicationQualityHold(application: QueueApplication, qualityGate: ApplicationQualityGate, posting: JsonRecord, companionId: string) {
  const now = new Date().toISOString();
  const raw = asRecord(application.raw_record);
  const runId = deterministicUuid(`career-os-quality-hold:${application.id}:${now}`);
  const holdReasons = qualityGate.holdReasons.length ? qualityGate.holdReasons : ['quality_gate_not_submit_ready'];
  await patchApplication(application.id, {
    lifecycle_stage: 'quality_hold',
    next_action: `Career OS held this application for stronger fit before browser execution: ${holdReasons.join(', ')}.`,
    raw_record: {
      ...raw,
      browser_worker: {
        ...asRecord(raw.browser_worker),
        companion_id: companionId,
        last_heartbeat_at: now,
        status: 'quality_hold',
      },
      execution_status: 'quality_hold',
      production_outcome: 'quality_hold',
      quality_gate: qualityGate,
      quality_gate_status: 'hold_for_quality',
      quality_gate_updated_at: now,
      quality_gate_version: 'career_os_quality_layer_v1',
    },
    updated_at: now,
  });
  await appendWorkflowEvent(
    application,
    'application_quality_hold',
    'quality_hold',
    `Career OS held this application before submission: ${holdReasons.join(', ')}.`,
    now,
    runId,
    externalApplicationHref(application) || undefined,
    {
      companion_id: companionId,
      fit_score: qualityGate.score,
      hold_reasons: holdReasons,
      posting_id: cleanEnv(posting.id),
      threshold_band: qualityGate.thresholdBand,
    },
  );
}

async function selectApplication(ownerEmail: string, applicationId: string): Promise<QueueApplication | undefined> {
  const rows = await selectAll(
    'career_os_applications',
    `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&id=eq.${encodeURIComponent(applicationId)}&limit=1`,
  ) as QueueApplication[];
  return rows[0];
}

async function patchApplication(id: string, patch: JsonRecord) {
  await careerOsPatchRowById('career_os_applications', id, patch);
}

async function patchApplications(query: string, patch: JsonRecord) {
  return await careerOsPatchRows('career_os_applications', query, patch);
}

async function appendWorkflowEvent(
  application: JsonRecord,
  eventType: string,
  status: string,
  evidenceText: string,
  occurredAt: string,
  runId: string,
  evidenceUrl?: string,
  metadata?: JsonRecord,
) {
  const id = deterministicUuid(`career-os-worker-event:${application.id}:${eventType}:${status}:${runId}`);
  try {
    await upsertRows('career_os_employer_workflow_events', {
      application_id: application.id,
      created_at: occurredAt,
      employer: application.employer,
      event_type: eventType,
      evidence_text: evidenceText,
      evidence_url: evidenceUrl || externalApplicationHref(application) || null,
      id,
      metadata: {
        source: 'career_os_browser_worker',
        ...metadata,
      },
      occurred_at: occurredAt,
      opportunity_id: null,
      owner_email: application.owner_email,
      platform: cleanEnv(asRecord(application.raw_record).platform) || 'Career OS',
      status,
    });
  } catch (error) {
    console.error('Career OS browser workflow event logging failed', {
      applicationId: application.id,
      eventType,
      message: error instanceof Error ? error.message : 'Unknown event logging error',
    });
  }
}

async function selectAll(table: string, query: string): Promise<JsonRecord[]> {
  return await careerOsSelectRows(table, query);
}

async function upsertRows(table: string, rows: JsonRecord | JsonRecord[]) {
  await careerOsUpsertRows(table, rows);
}

function mapWorkerStatusToExecutionStatus(status: WorkerStatus) {
  if (status === 'heartbeat') return 'running';
  if (status === 'assisted_in_progress') return 'running';
  if (status === 'submitted_confirmed') return 'confirmed';
  if (status === 'completed_waiting_for_user') return 'waiting_on_tomas';
  if (status.startsWith('waiting_for_')) return 'waiting_on_tomas';
  if (status === 'duplicate_skipped') return 'duplicate';
  if (status === 'retryable_failure') return 'retry_scheduled';
  if (status === 'terminal_failure') return 'failed';
  if (status === 'not_qualified') return 'ineligible';
  if (status === 'deferred_phase_two_greenhouse') return 'ineligible';
  if (status === 'unsupported_workday_state') return 'unsupported_manual_required';
  return status;
}

function externalApplicationHref(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const candidates = [
    raw.confirmation_url,
    raw.canonical_url,
    raw.job_url,
    raw.application_url,
    application.evidence_url,
    application.application_url,
  ].map(cleanEnv).filter(Boolean);
  return preferredApplicationHref(candidates);
}

async function resolveApplicationHref(application: QueueApplication) {
  const direct = externalApplicationHref(application);
  if (direct) return direct;
  const opportunityId = cleanEnv(application.opportunity_id);
  if (!opportunityId) return '';
  const postingRows = await selectAll(
    'career_os_job_postings',
    `select=canonical_url,raw_record&owner_email=eq.${encodeURIComponent(application.owner_email)}&id=eq.${encodeURIComponent(opportunityId)}&limit=1`,
  );
  const posting = asRecord(postingRows[0]);
  const postingRaw = asRecord(posting.raw_record);
  const candidates = [
    posting.canonical_url,
    postingRaw.canonical_url,
    postingRaw.job_url,
    postingRaw.application_url,
  ].map(cleanEnv).filter(Boolean);
  return preferredApplicationHref(candidates);
}

function isClaimableApplicationHref(value: string) {
  const href = cleanEnv(value);
  if (!href) return false;
  if (/\/embed\/job_board\b/i.test(href) && /(?:\?|&)error=true\b/i.test(href)) return false;
  return /^https?:\/\//i.test(href);
}

function preferredApplicationHref(candidates: string[]) {
  return candidates
    .filter((value) => isClaimableApplicationHref(value))
    .sort((left, right) => scoreApplicationHref(right) - scoreApplicationHref(left))[0] || '';
}

function scoreApplicationHref(value: string) {
  const href = cleanEnv(value).toLowerCase();
  let score = 0;
  if (/\/jobs\/\d+/.test(href) || /[?&](gh_jid|token|jobid|job_id|jobseqno)=/.test(href)) score += 5;
  if (/greenhouse|workday|myworkdayjobs/.test(href)) score += 3;
  if (/myworkdayjobs\.com/.test(href) && /\/apply(?:\/|$)/.test(href)) score += 12;
  if (/myworkdayjobs\.com/.test(href) && /\/apply\/autofillwithresume\b/.test(href)) score += 4;
  if (/myworkdayjobs\.com/.test(href) && /\/job\//.test(href)) score += 6;
  if (/myworkdayjobs\.com/.test(href) && /\/(?:userhome|candidatehome|login)(?:[/?#]|$)/.test(href)) score -= 20;
  if (/myworkdayjobs\.com/.test(href) && /usemylastapplication/.test(href)) score -= 10;
  if (/\/company\/careers\/roles\/?$/.test(href) || /\/careers\/jobs\/?$/.test(href)) score -= 5;
  if (/confirmation/.test(href)) score += 2;
  return score;
}

function applicationText(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return `${application.lifecycle_stage || ''} ${application.next_action || ''} ${raw.blocker_type || ''} ${raw.execution_status || ''} ${raw.reason_not_submitted || ''} ${JSON.stringify(application.application_answers || {})}`.toLowerCase();
}

function hasAny(text: string, terms: string[]) {
  const haystack = String(text || '').toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeEmployerBooleanAnswer(value: unknown) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  const record = asRecord(value);
  const answerLabel = cleanEnv(record.answer_label || record.answer || record.value);
  if (/^(yes|no)$/i.test(answerLabel)) {
    return answerLabel[0].toUpperCase() + answerLabel.slice(1).toLowerCase();
  }
  const direct = cleanEnv(value);
  if (/^(yes|no)$/i.test(direct)) {
    return direct[0].toUpperCase() + direct.slice(1).toLowerCase();
  }
  return undefined;
}

function slugify(value: string) {
  return cleanEnv(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'resume';
}

function cleanEnv(value: unknown) {
  return cleanSupabaseEnv(value);
}

function careerOsQueuePaused() {
  return cleanEnv(process.env.CAREER_OS_QUEUE_ENABLED) !== '1';
}

function deterministicUuid(input: string) {
  const hash = crypto.createHash('sha1').update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function productionClaimGate(application: QueueApplication, applications: QueueApplication[]): ProductionClaimGate {
  const platform = productionPlatform(application);
  const executionMode = productionExecutionMode();
  const normalizedMode = normalizeProductionExecutionMode(executionMode);
  const dailyLimit = productionDailyLimit();

  if (!isProductionQualified(application)) {
    return {
      dailyLimit,
      executionMode,
      ok: false,
      persist: false,
      platform,
      reason: 'Application is not qualified for controlled Career OS production execution.',
      status: 'not_qualified',
    };
  }

  if (platform === 'unsupported') {
    return {
      dailyLimit,
      executionMode,
      ok: false,
      persist: true,
      platform,
      reason: 'Application ATS is unsupported for controlled Career OS production execution; manual application is required.',
      status: 'unsupported_manual_required',
    };
  }

  if (platform === 'greenhouse') {
    return {
      dailyLimit,
      executionMode,
      ok: false,
      persist: true,
      platform,
      reason: 'Greenhouse is deferred for this Workday-first production phase; records stay visible but will not be submitted.',
      status: 'deferred_phase_two_greenhouse',
    };
  }

  if (productionProcessedToday(applications) >= dailyLimit) {
    return {
      dailyLimit,
      executionMode,
      ok: false,
      persist: false,
      platform,
      reason: `Career OS controlled launch daily limit of ${dailyLimit} browser-worker task(s) is already reached.`,
      status: 'canary_stopped',
    };
  }

  if (!executionMode || !normalizedMode) {
    return {
      dailyLimit,
      executionMode,
      ok: false,
      persist: true,
      platform,
      reason: executionMode
        ? `Invalid CAREER_OS_EXECUTION_MODE=${executionMode}; automation is blocked.`
        : 'CAREER_OS_EXECUTION_MODE is missing; automation is blocked.',
      status: 'terminal_failure',
    };
  }

  if (platform === 'workday') {
    const phaseTwoBlocker = classifyPhaseTwoWorkdayBlocker(application);
    if (phaseTwoBlocker && !isExplicitlyResumedApplication(application) && !isWorkdayAuthorizedAccountGate(application)) {
      return {
        dailyLimit,
        details: {
          phase_two_classification: phaseTwoBlocker.classification,
          phase_two_next_required_fix: phaseTwoBlocker.nextRequiredFix,
          phase_two_tomas_action_needed: phaseTwoBlocker.tomasActionNeeded,
        },
        executionMode: normalizedMode,
        ok: false,
        persist: true,
        platform,
        reason: `Phase 2 Workday blocker parked for production run: ${phaseTwoBlocker.blocker}`,
        status: 'unsupported_workday_state',
      };
    }

    if (!['inspect_only', 'assisted_apply', 'workday_single_canary', 'workday_first_submit', 'submit_enabled'].includes(normalizedMode)) {
      return {
        dailyLimit,
        executionMode: normalizedMode,
        ok: false,
        persist: true,
        platform,
        reason: 'Workday production automation requires inspect_only, assisted_apply, workday_single_canary, or workday_first_submit mode.',
        status: 'canary_stopped',
      };
    }

    if (normalizedMode === 'workday_single_canary') {
      const canaryId = workdayCanaryId();
      const canaryUrl = cleanEnv(process.env.CAREER_OS_WORKDAY_CANARY_URL);
      const applicationIdentity = workdayJobIdentity(externalApplicationHref(application));
      const canaryIdentity = canaryUrl ? workdayJobIdentity(canaryUrl) : undefined;
      const raw = asRecord(application.raw_record);
      const rawCanaryId = cleanEnv(raw.workday_canary_id || raw.workday_canary_application_id);
      const canaryCandidates = applications.filter((candidate) => {
        if (productionPlatform(candidate) !== 'workday') return false;
        if (isTerminalSubmission(candidate)) return false;
        if (!isProductionQualified(candidate)) return false;
        const candidateRaw = asRecord(candidate.raw_record);
        const candidateCanaryId = cleanEnv(candidateRaw.workday_canary_id || candidateRaw.workday_canary_application_id);
        if (canaryId && (candidate.id === canaryId || candidateCanaryId === canaryId)) return true;
        if (!canaryIdentity?.ok) return false;
        const candidateIdentity = workdayJobIdentity(externalApplicationHref(candidate));
        return candidateIdentity.ok && sameWorkdayIdentity(candidateIdentity, canaryIdentity);
      });
      const duplicateSameJob = applications.filter((candidate) => {
        if (candidate.id === application.id || productionPlatform(candidate) !== 'workday') return false;
        if (isTerminalSubmission(candidate)) return false;
        const candidateIdentity = workdayJobIdentity(externalApplicationHref(candidate));
        return applicationIdentity.ok && candidateIdentity.ok && sameWorkdayIdentity(applicationIdentity, candidateIdentity);
      });
      if (!canaryId) {
        return {
          dailyLimit,
          details: { workday_canary_id_configured: false },
          executionMode: normalizedMode,
          ok: false,
          persist: true,
          platform,
          reason: 'Workday single-canary mode requires CAREER_OS_WORKDAY_CANARY_ID.',
          status: 'canary_stopped',
        };
      }
      if (!(canaryId === application.id || canaryId === rawCanaryId)) {
        return {
          dailyLimit,
          details: { workday_canary_id_configured: true, workday_canary_id_matches_task: false },
          executionMode: normalizedMode,
          ok: false,
          persist: false,
          platform,
          reason: 'Workday single-canary mode is limited to the configured canary application id.',
          status: 'canary_stopped',
        };
      }
      if (!applicationIdentity.ok) {
        return {
          dailyLimit,
          details: { workday_identity_reason: applicationIdentity.reason },
          executionMode: normalizedMode,
          ok: false,
          persist: true,
          platform,
          reason: 'Workday single-canary mode requires an unambiguous Workday tenant and job id.',
          status: 'canary_stopped',
        };
      }
      if (canaryIdentity && !canaryIdentity.ok) {
        return {
          dailyLimit,
          details: { workday_canary_url_reason: canaryIdentity.reason },
          executionMode: normalizedMode,
          ok: false,
          persist: true,
          platform,
          reason: 'CAREER_OS_WORKDAY_CANARY_URL is not an unambiguous Workday URL.',
          status: 'canary_stopped',
        };
      }
      if (canaryIdentity?.ok && !sameWorkdayIdentity(applicationIdentity, canaryIdentity)) {
        return {
          dailyLimit,
          details: { application_identity: applicationIdentity, canary_identity: canaryIdentity },
          executionMode: normalizedMode,
          ok: false,
          persist: true,
          platform,
          reason: 'CAREER_OS_WORKDAY_CANARY_URL does not match the configured Workday canary application.',
          status: 'canary_stopped',
        };
      }
      if (canaryCandidates.length !== 1) {
        return {
          dailyLimit,
          details: { workday_canary_candidate_count: canaryCandidates.length },
          executionMode: normalizedMode,
          ok: false,
          persist: false,
          platform,
          reason: 'Workday single-canary mode requires exactly one qualified canary task.',
          status: 'canary_stopped',
        };
      }
      if (duplicateSameJob.length) {
        return {
          dailyLimit,
          details: { duplicate_workday_application_ids: duplicateSameJob.map((candidate) => candidate.id) },
          executionMode: normalizedMode,
          ok: false,
          persist: true,
          platform,
          reason: 'Duplicate Workday applications for the same tenant/job are present; canary is blocked.',
          status: 'duplicate_skipped',
        };
      }
    }
  }

  return {
    dailyLimit,
    executionMode: normalizedMode,
    ok: true,
    platform,
  };
}

async function markProductionClaimGate(application: QueueApplication, gate: ProductionClaimGate, companionId: string) {
  const now = new Date().toISOString();
  const runId = deterministicUuid(`career-os-production-claim-gate:${application.id}:${gate.status}:${now}`);
  const raw = asRecord(application.raw_record);
  const details = {
    ...(gate.details || {}),
    daily_limit: gate.dailyLimit,
    execution_mode: gate.executionMode || 'missing',
    platform: gate.platform,
  };
  const decisionItem = productionDecisionItem(application, gate, now);
  const status = gate.status || 'terminal_failure';
  const handling = productionOutcomeHandling(status, gate.reason);
  await patchApplication(application.id, {
    lifecycle_stage: handling?.lifecycleStage || 'browser_worker_terminal_failure',
    next_action: gate.reason || 'Career OS production claim gate blocked browser automation.',
    raw_record: {
      ...raw,
      browser_worker: {
        ...asRecord(raw.browser_worker),
        companion_id: companionId,
        last_heartbeat_at: now,
        status,
      },
      browser_worker_last_report: {
        current_url: externalApplicationHref(application),
        details,
        evidence_text: gate.reason || '',
        evidence_url: externalApplicationHref(application),
        screenshot_path: '',
        status,
        timestamp: now,
      },
      execution_engine: 'playwright_local_companion',
      execution_status: mapWorkerStatusToExecutionStatus(status),
      production_outcome: normalizeProductionOutcome(status, ''),
      user_decision_queue: mergeProductionDecisionQueue(raw.user_decision_queue, [decisionItem], now),
    },
    updated_at: now,
  });
  await appendWorkflowEvent(application, handling?.eventType || 'browser_worker_production_blocked', handling?.eventStatus || status, gate.reason || 'Production claim gate blocked browser automation.', now, runId, externalApplicationHref(application) || undefined, {
    ...details,
    decision_queue_item: decisionItem,
  });
}

function productionOutcomeHandling(status: WorkerStatus, evidenceText?: string) {
  const fallback = cleanEnv(evidenceText);
  const outcomes: Partial<Record<WorkerStatus, { eventStatus: string; eventType: string; lifecycleStage: QueueState | string; nextAction: string }>> = {
    canary_stopped: {
      eventStatus: 'canary_stopped',
      eventType: 'browser_worker_canary_stopped',
      lifecycleStage: 'canary_stopped',
      nextAction: fallback || 'Controlled-launch canary guard stopped this browser-worker task.',
    },
    deferred_phase_two_greenhouse: {
      eventStatus: 'deferred_phase_two_greenhouse',
      eventType: 'browser_worker_greenhouse_deferred',
      lifecycleStage: 'deferred_phase_two_greenhouse',
      nextAction: fallback || 'Greenhouse is deferred while Career OS runs Workday-first production.',
    },
    completed_waiting_for_user: {
      eventStatus: 'waiting_on_tomas',
      eventType: 'browser_worker_completed_waiting_for_user',
      lifecycleStage: 'waiting_on_tomas_browser_worker',
      nextAction: fallback || 'Browser worker stopped at a human-controlled step.',
    },
    duplicate_skipped: {
      eventStatus: 'duplicate',
      eventType: 'browser_worker_duplicate_skipped',
      lifecycleStage: 'duplicate',
      nextAction: fallback || 'Duplicate protection skipped this application.',
    },
    inspected_assisted: {
      eventStatus: 'inspected_assisted',
      eventType: 'browser_worker_inspected_assisted',
      lifecycleStage: 'inspected_assisted',
      nextAction: fallback || 'Browser worker inspected the employer application and stopped before submit.',
    },
    review_ready: {
      eventStatus: 'review_ready',
      eventType: 'browser_worker_workday_review_ready',
      lifecycleStage: 'review_ready',
      nextAction: fallback || 'Workday canary is ready for Tomas review and exact submit approval.',
    },
    waiting_for_sign_in: {
      eventStatus: 'waiting_on_tomas',
      eventType: 'browser_worker_workday_waiting_for_sign_in',
      lifecycleStage: 'waiting_on_tomas_browser_worker',
      nextAction: fallback || 'Workday requires Tomas to sign in before this canary can continue.',
    },
    waiting_for_account_creation: {
      eventStatus: 'waiting_on_tomas',
      eventType: 'browser_worker_workday_waiting_for_account_creation',
      lifecycleStage: 'waiting_on_tomas_browser_worker',
      nextAction: fallback || 'Workday requires Tomas to create or open an employer account before this canary can continue.',
    },
    waiting_for_email_code: {
      eventStatus: 'waiting_on_tomas',
      eventType: 'browser_worker_workday_waiting_for_email_code',
      lifecycleStage: 'waiting_on_tomas_browser_worker',
      nextAction: fallback || 'Workday requires an email or security code before this canary can continue.',
    },
    waiting_for_email_verification: {
      eventStatus: 'waiting_on_tomas',
      eventType: 'browser_worker_workday_waiting_for_email_verification',
      lifecycleStage: 'waiting_on_tomas_browser_worker',
      nextAction: fallback || 'Workday requires email verification before this canary can continue.',
    },
    waiting_for_user_decision: {
      eventStatus: 'waiting_on_tomas',
      eventType: 'browser_worker_workday_waiting_for_user_decision',
      lifecycleStage: 'waiting_on_tomas_browser_worker',
      nextAction: fallback || 'Workday requires an application-specific Tomas decision before this canary can continue.',
    },
    waiting_for_manual_upload: {
      eventStatus: 'waiting_on_tomas',
      eventType: 'browser_worker_workday_waiting_for_manual_upload',
      lifecycleStage: 'waiting_on_tomas_browser_worker',
      nextAction: fallback || 'Workday requires manual upload or restoration of an approved resume artifact.',
    },
    submission_uncertain: {
      eventStatus: 'submission_uncertain',
      eventType: 'browser_worker_workday_submission_uncertain',
      lifecycleStage: 'waiting_on_tomas_browser_worker',
      nextAction: fallback || 'Workday submit state is uncertain and needs Tomas review.',
    },
    unsupported_workday_state: {
      eventStatus: 'unsupported_workday_state',
      eventType: 'browser_worker_workday_unsupported_state',
      lifecycleStage: 'unsupported_manual_required',
      nextAction: fallback || 'Workday reached an unsupported state that needs manual review.',
    },
    not_qualified: {
      eventStatus: 'not_qualified',
      eventType: 'browser_worker_not_qualified',
      lifecycleStage: 'ineligible',
      nextAction: fallback || 'Application is not qualified for browser-worker execution.',
    },
    retryable_failure: {
      eventStatus: 'retry_scheduled',
      eventType: 'browser_worker_retryable_failure',
      lifecycleStage: 'retry_scheduled',
      nextAction: fallback || 'Browser worker hit a retryable production failure.',
    },
    terminal_failure: {
      eventStatus: 'failed',
      eventType: 'browser_worker_terminal_failure',
      lifecycleStage: 'browser_worker_terminal_failure',
      nextAction: fallback || 'Browser worker hit a terminal production failure.',
    },
    unsupported_manual_required: {
      eventStatus: 'unsupported_manual_required',
      eventType: 'browser_worker_unsupported_manual_required',
      lifecycleStage: 'unsupported_manual_required',
      nextAction: fallback || 'Unsupported ATS requires manual application.',
    },
  };
  return outcomes[status] || null;
}

function normalizeProductionOutcome(status: WorkerStatus, explicitOutcome: string) {
  if (explicitOutcome) return explicitOutcome;
  if (status === 'confirmed' || status === 'submitted_confirmed') return 'submitted_confirmed';
  if (status === 'waiting_on_tomas') return 'completed_waiting_for_user';
  if (status === 'blocked_technical' || status === 'failed') return 'terminal_failure';
  if (status === 'retry_scheduled') return 'retryable_failure';
  if ([
    'canary_stopped',
    'completed_waiting_for_user',
    'deferred_phase_two_greenhouse',
    'duplicate_skipped',
    'inspected_assisted',
    'not_qualified',
    'review_ready',
    'retryable_failure',
    'submission_uncertain',
    'submitted_email_confirmation_pending',
    'terminal_failure',
    'unsupported_workday_state',
    'unsupported_manual_required',
    'waiting_for_account_creation',
    'waiting_for_email_code',
    'waiting_for_email_verification',
    'waiting_for_manual_upload',
    'waiting_for_sign_in',
    'waiting_for_user_decision',
  ].includes(status)) return status;
  return '';
}

function submissionConfirmationEmailEvidence(report: WorkerReport) {
  const details = asRecord(report.details);
  const candidates = [
    details.confirmationEmail,
    details.confirmation_email,
    details.confirmationEmailEvidence,
    details.confirmation_email_evidence,
    details.submissionConfirmationEmail,
    details.submission_confirmation_email,
    details.submissionConfirmationEvidence,
    details.submission_confirmation_evidence,
  ].map(asRecord);
  const direct = candidates.find((item) => {
    const kind = cleanEnv(item.kind || item.type || item.evidence_kind || item.evidenceType).toLowerCase();
    return kind.includes('email') && Boolean(cleanEnv(item.subject || item.sender || item.from || item.messageId || item.message_id || item.evidencePath || item.evidence_path));
  });
  if (direct) {
    return {
      evidence_hash: cleanEnv(direct.evidence_hash || direct.hash),
      evidence_path: cleanEnv(direct.evidencePath || direct.evidence_path || direct.sourcePath || direct.source_path),
      from: cleanEnv(direct.from || direct.sender),
      kind: 'submission_confirmation_email',
      message_id: cleanEnv(direct.messageId || direct.message_id || direct.id),
      received_at: cleanEnv(direct.receivedAt || direct.received_at || direct.date || direct.timestamp),
      subject: cleanEnv(direct.subject),
    };
  }
  return null;
}

function mergeProductionDecisionQueue(existing: unknown, incoming: unknown, timestamp: string) {
  const existingItems = arrayValue(existing).filter((item) => typeof item === 'object' && item !== null);
  const nextItems = arrayValue(incoming)
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item) => ({
      ...asRecord(item),
      timestamp: cleanEnv(asRecord(item).timestamp) || timestamp,
    }));
  return [...existingItems, ...nextItems].slice(-50);
}

function productionDecisionItem(application: QueueApplication, gate: ProductionClaimGate, timestamp: string) {
  return {
    ats: gate.platform,
    category: productionDecisionCategory(gate.reason || ''),
    confidence: gate.status === 'unsupported_manual_required' ? 0.94 : 0.86,
    fieldLabel: 'Production execution gate',
    jobIdentity: {
      applicationId: application.id,
      employer: application.employer,
      position: application.position,
    },
    proposedAllowedAnswer: null,
    provenance: {
      source: 'career_os_browser_worker',
      status: 'claim_gate',
    },
    reason: gate.reason || 'Career OS production claim gate blocked this application.',
    requiredAction: productionRequiredAction(gate.status),
    resumePoint: 'Update production controls or complete the application manually, then mark the Career OS row resumed if needed.',
    sensitivity: 'operational',
    tenant: productionTenant(application),
    timestamp,
    url: externalApplicationHref(application),
  };
}

function productionRequiredAction(status: WorkerStatus | undefined) {
  if (status === 'deferred_phase_two_greenhouse') return 'No Tomas action is required; this Greenhouse row is preserved for phase two.';
  if (status === 'unsupported_manual_required') return 'Complete this application manually or add a production adapter.';
  if (status === 'completed_waiting_for_user') return 'Review and complete the employer-controlled step manually.';
  if (status === 'canary_stopped') return 'Choose exactly one canary application id and explicit authorization before rerunning.';
  if (status === 'duplicate_skipped') return 'Resolve duplicate Workday application rows before rerunning.';
  if (status === 'not_qualified') return 'Do not run this application unless qualification changes.';
  return 'Fix the production execution configuration before rerunning.';
}

function productionDecisionCategory(reason: string) {
  if (/captcha/i.test(reason)) return 'captcha';
  if (/mfa|multi-factor|identity/i.test(reason)) return 'mfa';
  if (/login|sign in/i.test(reason)) return 'login';
  if (/account/i.test(reason)) return 'account';
  if (/salary|compensation/i.test(reason)) return 'salary';
  if (/sponsor|visa|work authorization/i.test(reason)) return 'sponsorship';
  if (/legal|consent|terms|acknowledge|signature/i.test(reason)) return 'legal';
  return 'unknown';
}

function productionPlatform(application: QueueApplication): 'greenhouse' | 'workday' | 'unsupported' {
  const raw = asRecord(application.raw_record);
  const text = `${raw.platform || ''} ${raw.ats_platform || ''} ${externalApplicationHref(application)}`.toLowerCase();
  if (/greenhouse/.test(text)) return 'greenhouse';
  if (/workday|myworkdayjobs|phenom|careers\.cisco\.com\/.*\/apply/.test(text)) return 'workday';
  return 'unsupported';
}

function productionTenant(application: QueueApplication) {
  const href = externalApplicationHref(application);
  if (!href) return '';
  try {
    const url = new URL(href);
    return url.hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isWorkdayAuthorizedAccountGate(application: JsonRecord) {
  if (!isWorkdayApplication(application)) return false;
  const raw = asRecord(application.raw_record);
  const report = asRecord(raw.browser_worker_last_report);
  const text = `${applicationText(application)} ${raw.production_outcome || ''} ${raw.application_status || ''} ${raw.blocker || ''} ${report.status || ''} ${report.classification || ''} ${report.reason || ''}`.toLowerCase();
  if (!hasAny(text, [
    'account',
    'create account',
    'create or open the employer account',
    'login',
    'log in',
    'sign in',
    'sign into',
    'waiting_for_account_creation',
    'waiting_for_sign_in',
    'workday requires tomas to create or open an employer account',
    'workday requires tomas to sign in',
  ])) return false;
  if (hasAny(text, [
    'captcha',
    'email code',
    'email verification',
    'identity',
    'mfa',
    'otp',
    'password rejected',
    'password reset',
    'security code',
    'verification code',
    'wrong email address or password',
    'wrong password',
    'account is locked',
    'account locked',
    'locked out',
  ])) return false;
  return true;
}

function isWorkdayApplication(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const text = `${application.employer || ''} ${application.position || ''} ${raw.platform || ''} ${raw.ats_platform || ''} ${raw.application_url || ''} ${raw.canonical_url || ''} ${raw.job_url || ''} ${externalApplicationHref(application)}`.toLowerCase();
  return hasAny(text, ['workday', 'myworkdayjobs.com', '.wd1.', '.wd3.', '.wd5.', '.wd12.']);
}

function isProductionQualified(application: QueueApplication) {
  const raw = asRecord(application.raw_record);
  const text = applicationText(application);
  const lifecycleStage = cleanEnv(application.lifecycle_stage).toLowerCase();
  const executionStatus = cleanEnv(raw.execution_status).toLowerCase();
  if (isWorkdayAuthorizedAccountGate(application) && hasResumeOrPackage(application) && !isTerminalSubmission(application)) return true;
  if (hasAny(text, ['deferred_phase_two_greenhouse', 'ineligible', 'not_qualified', 'discovered', 'quality_hold', 'hold_for_quality'])) return false;
  if (lifecycleStage === 'qualification_pending' || executionStatus === 'qualification_pending') return false;
  if (hasAny(`${raw.production_outcome || ''} ${raw.execution_status || ''} ${asRecord(raw.browser_worker_last_report).status || ''}`, [
    'deferred_today',
    'phase_two',
    'unsupported_workday_state',
    'ineligible',
    'not_qualified',
    'terminal_failure',
    'waiting_on_tomas',
    'deferred_hard_workday_selector',
  ])) return false;
  if (hasAny(text, ['qualified', 'package_ready', 'ready_for_automation', 'qualified_pending_application', 'queued'])) return true;
  if (raw.queue_eligible === true && hasAny(`${raw.package_status || ''}`, ['approved_for_automation', 'package_ready'])) return true;
  const fitScore = numberValue(raw.fit_score || raw.match_score || raw.score);
  return typeof fitScore === 'number' && fitScore >= 70;
}

function productionProcessedToday(applications: QueueApplication[]) {
  return applications.filter((application) => {
    const raw = asRecord(application.raw_record);
    if (!applicationTouchedByBrowserWorkerToday(application)) return false;
    const browserWorker = asRecord(raw.browser_worker);
    return Boolean(browserWorker.claimed_at)
      || Boolean(application.confirmation_number || application.submission_evidence)
      || cleanEnv(raw.production_outcome) === 'submitted_confirmed';
  }).length;
}

function greenhouseSubmittedToday(applications: QueueApplication[]) {
  return applications.filter((application) => {
    const raw = asRecord(application.raw_record);
    return productionPlatform(application) === 'greenhouse'
      && applicationTouchedByBrowserWorkerToday(application)
      && (
        Boolean(application.confirmation_number || application.submission_evidence)
        || cleanEnv(raw.production_outcome) === 'submitted_confirmed'
      );
  }).length;
}

function applicationTouchedByBrowserWorkerToday(application: QueueApplication) {
  const raw = asRecord(application.raw_record);
  const browserWorker = asRecord(raw.browser_worker);
  const report = asRecord(raw.browser_worker_last_report);
  const candidates = [
    application.updated_at,
    browserWorker.claimed_at,
    browserWorker.last_heartbeat_at,
    report.timestamp,
  ].map(cleanEnv).filter(Boolean);
  const start = startOfLocalDayMs();
  return candidates.some((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= start;
  });
}

function productionDailyLimit() {
  const value = Number(cleanEnv(process.env.CAREER_OS_DAILY_LIMIT) || '5');
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 25) : 5;
}

function greenhouseSubmitCanaryLimit() {
  const value = Number(cleanEnv(process.env.CAREER_OS_GREENHOUSE_SUBMIT_CANARY_LIMIT) || '1');
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 5) : 1;
}

function workdayCanaryId() {
  return cleanEnv(process.env.CAREER_OS_WORKDAY_CANARY_ID || process.env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
}

function productionExecutionMode() {
  return cleanEnv(process.env.CAREER_OS_EXECUTION_MODE);
}

function normalizeProductionExecutionMode(value: string) {
  return ['inspect_only', 'assisted_apply', 'workday_single_canary', 'workday_first_submit', 'submit_enabled'].includes(value) ? value : '';
}

function workdayJobIdentity(value: string): { host?: string; jobId?: string; ok: boolean; reason?: string; tenant?: string } {
  const href = cleanEnv(value);
  if (!href) return { ok: false, reason: 'missing_url' };
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  const host = parsed.hostname.toLowerCase();
  const text = `${host} ${parsed.pathname} ${parsed.search}`.toLowerCase();
  if (!/myworkdayjobs\.com|workday|phenom|careers\.cisco\.com/.test(text)) return { ok: false, reason: 'unsupported_ats_url' };
  const tenant = workdayTenant(host);
  const jobId = cleanEnv(
    parsed.searchParams.get('jobSeqNo')
    || parsed.searchParams.get('jobId')
    || parsed.searchParams.get('jobID')
    || parsed.searchParams.get('job')
    || parsed.searchParams.get('jid')
    || workdayPathJobId(parsed.pathname),
  );
  if (!tenant || !jobId) return { ok: false, reason: 'ambiguous_workday_identity', host, tenant };
  return { host, jobId, ok: true, tenant };
}

function workdayTenant(host: string) {
  if (/careers\.cisco\.com$/i.test(host)) return 'cisco';
  if (/myworkdayjobs\.com$/i.test(host)) return host.replace(/\.myworkdayjobs\.com$/i, '');
  return host.split('.')[0] || host;
}

function workdayPathJobId(pathname: string) {
  const segments = decodeURIComponent(cleanEnv(pathname)).split('/').map(cleanEnv).filter(Boolean);
  const jobIndex = segments.findIndex((segment) => segment.toLowerCase() === 'job');
  const jobSegments = jobIndex >= 0 ? segments.slice(jobIndex + 1) : segments;
  const actionIndex = jobSegments.findIndex((segment) => /^(apply|usemylastapplication|autofillwithresume|manual)$/i.test(segment));
  const identitySegments = actionIndex >= 0 ? jobSegments.slice(0, actionIndex) : jobSegments;
  const candidate = identitySegments.slice().reverse().find((segment) => !/^(en-us|external|apply|job)$/i.test(segment));
  if (!candidate || /^(en-us|external|apply|job)$/i.test(candidate)) return '';
  return cleanEnv(candidate.match(/[_-]([A-Z]*\d[A-Z0-9-]*)$/i)?.[1] || candidate);
}

function sameWorkdayIdentity(left: { jobId?: string; tenant?: string }, right: { jobId?: string; tenant?: string }) {
  return cleanEnv(left.tenant).toLowerCase() === cleanEnv(right.tenant).toLowerCase()
    && cleanEnv(left.jobId).toLowerCase() === cleanEnv(right.jobId).toLowerCase();
}

function startOfLocalDayMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function recoverableLegacyAdapterState(application: JsonRecord): QueueState | null {
  const text = applicationText(application);
  const raw = asRecord(application.raw_record);
  const platform = cleanEnv(raw.platform || raw.ats_platform).toLowerCase();
  if (!browserWorkerPlatformSupported(platform)) return null;
  if (!text.includes('does not yet have an ats adapter for platform')) return null;
  return hasResumeOrPackage(application) ? 'package_ready' : 'qualified';
}

function browserWorkerPlatformSupported(platform: string) {
  return BROWSER_WORKER_SUPPORTED_PLATFORM_TOKENS.some((token) => platform.includes(token));
}

function hasResumeOrPackage(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return Boolean(application.exact_resume || raw.resume_path || raw.package_status);
}

import crypto from 'node:crypto';

import { parseWorkdayJobUrl } from './career-os-workday-production.mjs';

export const TMOBILE_REQ361094_RECORDING_OUTCOME = {
  applicationId: 'workday-recorded-tmobile-req361094',
  applicationUrl: 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Bellevue%2C-Washington/Sr-Broadband-Fiber-Hardware-Product-Manager_REQ361094/apply/useMyLastApplication',
  automationBoundary: 'Career OS learned from the manual screen-recorded session but did not autonomously submit this application.',
  company: 'T-Mobile',
  confirmationPage: 'Application Submitted',
  evidenceSource: 'user_completed_tmobile_workday_application_REQ361094',
  jobId: 'REQ361094',
  observedSubmissionDate: '2026-07-24',
  observationSource: 'full screen recording',
  position: 'Sr. Broadband Fiber Hardware Product Manager',
  submissionMethod: 'manual_recorded_session',
  tenant: 'tmobile.wd1',
};

export function validateWorkdayRecordingIdentity(row, expected = TMOBILE_REQ361094_RECORDING_OUTCOME) {
  if (!row) return { ok: true, reason: 'no_existing_row' };
  const raw = asRecord(row.raw_record);
  const identity = asRecord(raw.workday_identity);
  const candidateUrls = [
    raw.application_url,
    raw.canonical_url,
    raw.job_url,
    raw.confirmation_url,
  ].map(clean).filter(Boolean);
  const parsedIdentities = candidateUrls
    .map((url) => parseWorkdayJobUrl(url))
    .filter((parsed) => parsed.ok);
  const candidates = [
    ...parsedIdentities.map((parsed) => ({ jobId: parsed.jobId, tenant: parsed.tenant })),
    { jobId: identity.jobId, tenant: identity.tenant },
  ].filter((candidate) => clean(candidate.jobId) || clean(candidate.tenant));

  if (!candidates.length) {
    return { ok: false, reason: 'missing_workday_identity' };
  }
  const match = candidates.some((candidate) => sameIdentity(candidate, expected));
  return match
    ? { ok: true, reason: 'matched_workday_identity' }
    : {
        ok: false,
        reason: 'workday_identity_mismatch',
        expected: { jobId: expected.jobId, tenant: expected.tenant },
        found: candidates,
      };
}

export function buildWorkdayRecordingReconciliationPatch(input = {}) {
  const expected = input.expected || TMOBILE_REQ361094_RECORDING_OUTCOME;
  const existingRow = input.existingRow || null;
  const identity = validateWorkdayRecordingIdentity(existingRow, expected);
  if (!identity.ok) {
    throw new Error(`Cannot reconcile Workday recording: ${identity.reason}`);
  }

  const now = clean(input.now) || new Date().toISOString();
  const evidenceReferences = Array.isArray(input.evidenceReferences)
    ? input.evidenceReferences.map(clean).filter(Boolean)
    : [];
  const raw = asRecord(existingRow?.raw_record);
  const stateHistory = appendStateHistory(raw.state_history, {
    at: now,
    automation_boundary: expected.automationBoundary,
    confirmation_page: expected.confirmationPage,
    event: 'manual_recorded_submission_reconciled',
    observation_source: expected.observationSource,
    previous_lifecycle_stage: clean(existingRow?.lifecycle_stage),
    previous_production_outcome: clean(raw.production_outcome),
    source: expected.evidenceSource,
    status: 'submitted_confirmed',
    submission_method: expected.submissionMethod,
  });
  const parsed = parseWorkdayJobUrl(expected.applicationUrl);
  const workdayIdentity = parsed.ok
    ? {
        canonicalUrl: parsed.canonicalUrl,
        host: parsed.host,
        jobId: parsed.jobId,
        tenant: parsed.tenant,
        vendor: parsed.vendor,
      }
    : {
        canonicalUrl: expected.applicationUrl,
        jobId: expected.jobId,
        tenant: expected.tenant,
        vendor: 'workday',
      };

  const nextRaw = {
    ...raw,
    application_url: expected.applicationUrl,
    automation_boundary: expected.automationBoundary,
    canonical_url: expected.applicationUrl,
    confirmation_page: expected.confirmationPage,
    execution_status: 'submitted_confirmed',
    manual_recorded_session: {
      confirmation_page: expected.confirmationPage,
      evidence_references: evidenceReferences,
      observed_submission_date: expected.observedSubmissionDate,
      source: expected.evidenceSource,
    },
    observation_source: expected.observationSource,
    platform: 'workday',
    production_outcome: 'submitted_confirmed',
    state_history: stateHistory,
    submission_method: expected.submissionMethod,
    submission_timestamp_evidence: {
      exact_timestamp_available: false,
      observed_submission_date: expected.observedSubmissionDate,
      reason: 'The recording confirms the submission date and confirmation page, but no reliable exact submission timestamp was visible.',
    },
    workday_identity: workdayIdentity,
  };

  return {
    event: {
      application_id: clean(existingRow?.id) || expected.applicationId,
      employer: expected.company,
      event_type: 'manual_recorded_submission_reconciled',
      evidence_text: `${expected.confirmationPage} captured from ${expected.observationSource}; Career OS did not autonomously submit.`,
      evidence_url: expected.applicationUrl,
      id: deterministicUuid(`career-os-manual-recording:${expected.tenant}:${expected.jobId}:${expected.evidenceSource}`),
      metadata: {
        automation_boundary: expected.automationBoundary,
        confirmation_page: expected.confirmationPage,
        evidence_references: evidenceReferences,
        jobId: expected.jobId,
        observation_source: expected.observationSource,
        source: expected.evidenceSource,
        submission_method: expected.submissionMethod,
        tenant: expected.tenant,
      },
      platform: 'workday',
      status: 'submitted_confirmed',
    },
    row: {
      id: clean(existingRow?.id) || expected.applicationId,
      employer: expected.company,
      lifecycle_stage: 'confirmed',
      next_action: 'Manual screen-recorded Workday submission reconciled; no autonomous worker action is pending.',
      owner_email: clean(existingRow?.owner_email || input.ownerEmail) || 'tomas@nieves.com',
      position: expected.position,
      raw_record: nextRaw,
      submission_evidence: `${expected.confirmationPage} captured in a manual screen-recorded Workday session for ${expected.company} ${expected.jobId}.`,
      updated_at: now,
    },
  };
}

function appendStateHistory(value, event) {
  const history = Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
  const alreadyRecorded = history.some((item) => (
    clean(item.event) === event.event
    && clean(item.source) === event.source
    && clean(item.status) === event.status
    && clean(item.submission_method) === event.submission_method
  ));
  return alreadyRecorded ? history : [...history, event];
}

function sameIdentity(left, right) {
  return clean(left.jobId).toLowerCase() === clean(right.jobId).toLowerCase()
    && clean(left.tenant).toLowerCase() === clean(right.tenant).toLowerCase();
}

function deterministicUuid(input) {
  const hash = crypto.createHash('sha1').update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clean(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}

import { duplicateLockKeys } from './career-os-duplicate-lock';

type JsonRecord = Record<string, unknown>;

export type CanonicalSubmittedApplication = {
  application: JsonRecord;
  confirmationEvidence: boolean;
  duplicateLocked: boolean;
  executionState: 'confirmed' | 'submitted' | 'duplicate';
  identityKey: string;
  manualAttestation: boolean;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function compactKey(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeTitle(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeUrl(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

function hasAny(text: string, fragments: string[]) {
  return fragments.some((fragment) => text.includes(fragment));
}

function centralDateKey(value: unknown) {
  const time = Date.parse(String(value || ''));
  if (!Number.isFinite(time)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(time));
}

function hasManualSubmissionAttestation(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return raw.manual_submission_attested === true
    || raw.submission_source === 'manual_tomas_attestation'
    || raw.submission_source === 'manual_tomas_completion'
    || raw.user_confirmed_submission === true;
}

function hasConfirmationEvidence(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return Boolean(
    application.confirmation_number
    || application.submission_evidence
    || raw.confirmation_number
    || raw.confirmation_url
    || raw.confirmation_page_url
    || raw.confirmation_text
    || raw.confirmation_evidence
    || raw.externally_confirmed === true
    || raw.user_confirmed_submission === true
    || raw.confirmed_at,
  );
}

function canonicalSubmittedApplicationIdentity(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  const keys = duplicateLockKeys({
    confirmation_number: stringValue(application.confirmation_number) || null,
    employer: stringValue(application.employer) || null,
    id: stringValue(application.id) || 'unknown-application',
    lifecycle_stage: stringValue(application.lifecycle_stage) || null,
    next_action: stringValue(application.next_action) || null,
    opportunity_id: stringValue(application.opportunity_id) || null,
    position: stringValue(application.position) || null,
    raw_record: raw,
    submission_evidence: stringValue(application.submission_evidence) || null,
  });

  if (keys.length) return keys[0];

  return [
    compactKey(application.employer),
    normalizeTitle(application.position),
    normalizeUrl(raw.canonical_url || raw.application_url || raw.job_url || raw.posting_url || ''),
    compactKey(raw.external_requisition_id || raw.requisition_id || raw.ats_job_id || raw.job_id || raw.token),
    stringValue(application.id),
  ].filter(Boolean).join(':');
}

function submissionExecutionState(application: JsonRecord): CanonicalSubmittedApplication['executionState'] | null {
  const raw = asRecord(application.raw_record);
  const text = `${application.lifecycle_stage || ''} ${application.next_action || ''} ${raw.blocker_type || ''} ${raw.execution_status || ''} ${raw.reason_not_submitted || ''}`.toLowerCase();

  if (hasAny(text, ['duplicate'])) return 'duplicate';
  if (hasConfirmationEvidence(application)) return 'confirmed';
  if (hasManualSubmissionAttestation(application) || hasAny(text, ['externally_submitted', 'submitted'])) return 'submitted';
  return null;
}

function submittedApplicationRank(item: CanonicalSubmittedApplication) {
  if (item.confirmationEvidence && item.executionState === 'confirmed') return 5;
  if (item.confirmationEvidence) return 4;
  if (item.manualAttestation && item.executionState === 'submitted') return 3;
  if (item.manualAttestation) return 2;
  return 1;
}

function canonicalSubmissionTimestamp(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return String(
    raw.confirmed_at
    || raw.confirmation_captured_at
    || raw.submitted_at
    || raw.last_submitted_at
    || application.updated_at
    || application.created_at
    || '',
  );
}

function canonicalSubmissionEvidenceTimestamp(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return String(
    raw.confirmed_at
    || raw.confirmation_captured_at
    || raw.submitted_at
    || raw.last_submitted_at
    || '',
  );
}

export function selectCanonicalSubmittedApplications(applications: JsonRecord[]): CanonicalSubmittedApplication[] {
  const bestByIdentity = new Map<string, CanonicalSubmittedApplication>();

  for (const application of applications) {
    const executionState = submissionExecutionState(application);
    if (!executionState) continue;

    const confirmationEvidence = hasConfirmationEvidence(application);
    const manualAttestation = hasManualSubmissionAttestation(application);
    if (!confirmationEvidence && !manualAttestation) continue;

    const candidate: CanonicalSubmittedApplication = {
      application,
      confirmationEvidence,
      duplicateLocked: executionState === 'duplicate' || asRecord(application.raw_record).duplicate_locked === true,
      executionState,
      identityKey: canonicalSubmittedApplicationIdentity(application),
      manualAttestation,
    };
    const existing = bestByIdentity.get(candidate.identityKey);
    if (!existing || submittedApplicationRank(candidate) > submittedApplicationRank(existing)) {
      bestByIdentity.set(candidate.identityKey, candidate);
    }
  }

  return Array.from(bestByIdentity.values()).sort((left, right) => {
    const leftUpdated = Date.parse(canonicalSubmissionTimestamp(left.application)) || 0;
    const rightUpdated = Date.parse(canonicalSubmissionTimestamp(right.application)) || 0;
    return rightUpdated - leftUpdated;
  });
}

export function countCanonicalSubmittedApplicationsOnDate(applications: JsonRecord[], generatedAt: Date) {
  const centralToday = centralDateKey(generatedAt.toISOString());
  return selectCanonicalSubmittedApplications(applications).filter((item) => {
    return centralDateKey(canonicalSubmissionEvidenceTimestamp(item.application)) === centralToday;
  }).length;
}

export function countCanonicalSubmittedApplicationsWithinHours(applications: JsonRecord[], hours: number) {
  return selectCanonicalSubmittedApplications(applications).filter((item) => {
    const timestamp = canonicalSubmissionEvidenceTimestamp(item.application);
    if (!timestamp) return false;
    const submittedAt = Date.parse(timestamp);
    if (!Number.isFinite(submittedAt)) return false;
    return (Date.now() - submittedAt) <= (hours * 60 * 60 * 1000);
  }).length;
}

type JsonRecord = Record<string, unknown>;

export type CareerOsLockApplication = JsonRecord & {
  confirmation_number?: string | null;
  employer?: string | null;
  id: string;
  lifecycle_stage?: string | null;
  next_action?: string | null;
  opportunity_id?: string | null;
  position?: string | null;
  raw_record?: JsonRecord | null;
  submission_evidence?: string | null;
};

export type DuplicateMatch = {
  existingApplicationId: string;
  lockKey: string;
  reason: string;
};

const TERMINAL_STATES = new Set([
  'confirmed',
  'submitted',
  'externally_confirmed',
  'externally_submitted',
  'duplicate_locked',
]);

export function isTerminalSubmission(application: CareerOsLockApplication) {
  const raw = asRecord(application.raw_record);
  const values = [
    application.lifecycle_stage,
    application.confirmation_number,
    application.submission_evidence,
    raw.execution_status,
    raw.submission_status,
    raw.duplicate_locked,
    raw.externally_submitted,
    raw.externally_confirmed,
  ].map((value) => clean(value).toLowerCase());

  return Boolean(application.confirmation_number || application.submission_evidence)
    || values.some((value) => TERMINAL_STATES.has(value) || value === 'true');
}

export function duplicateLockKeys(application: CareerOsLockApplication) {
  const raw = asRecord(application.raw_record);
  const employer = normalizeEmployer(application.employer || raw.employer || raw.company);
  const requisition = normalizeId(
    raw.external_requisition_id
    || raw.requisition_id
    || raw.ats_job_id
    || raw.job_id
    || raw.token
    || application.opportunity_id,
  );
  const title = normalizeTitle(application.position || raw.position || raw.title || raw.role);
  const url = normalizeUrl(raw.canonical_url || raw.application_url || raw.job_url || raw.posting_url || application.application_url);
  const keys: string[] = [];

  if (employer && requisition) keys.push(`employer_requisition:${employer}:${requisition}`);
  if (employer && title && url) keys.push(`employer_title_url:${employer}:${title}:${url}`);
  if (employer && title && requisition) keys.push(`employer_title_requisition:${employer}:${title}:${requisition}`);
  return Array.from(new Set(keys));
}

export function duplicateSubmissionMatch(
  candidate: CareerOsLockApplication,
  applications: CareerOsLockApplication[],
): DuplicateMatch | null {
  const candidateKeys = duplicateLockKeys(candidate);
  if (!candidateKeys.length) return null;

  for (const existing of applications) {
    if (existing.id === candidate.id) continue;
    if (!isTerminalSubmission(existing)) continue;
    const existingKeys = new Set(duplicateLockKeys(existing));
    const lockKey = candidateKeys.find((key) => existingKeys.has(key));
    if (lockKey) {
      return {
        existingApplicationId: existing.id,
        lockKey,
        reason: 'duplicate_submission_prevented',
      };
    }
  }

  return null;
}

export function terminalLockPatch(application: CareerOsLockApplication, reason: string, now: string) {
  const raw = asRecord(application.raw_record);
  const existingAudit = Array.isArray(application.audit_timeline) ? application.audit_timeline : [];
  return {
    audit_timeline: existingAudit.concat({
      at: now,
      event: 'duplicate_submission_lock_applied',
      evidence: reason,
    }),
    lifecycle_stage: 'duplicate_locked',
    next_action: 'Terminal submission lock is active. Do not reopen, queue, or resubmit unless Tomas explicitly authorizes an override.',
    raw_record: {
      ...raw,
      duplicate_locked: true,
      duplicate_lock_keys: duplicateLockKeys(application),
      externally_confirmed: true,
      externally_submitted: true,
      execution_status: 'duplicate_locked',
      submission_lock_reason: reason,
      submission_locked_at: now,
    },
    updated_at: now,
  };
}

export function normalizeEmployer(value: unknown) {
  return clean(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeTitle(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeId(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function normalizeUrl(value: unknown) {
  const text = clean(value);
  if (!text) return '';
  try {
    const url = new URL(text);
    url.hash = '';
    const keep = new URLSearchParams();
    for (const key of ['for', 'token', 'gh_jid', 'jobSeqNo']) {
      const param = url.searchParams.get(key);
      if (param) keep.set(key, param);
    }
    url.search = keep.toString();
    return url.toString().toLowerCase().replace(/\/$/, '');
  } catch {
    return text.toLowerCase().replace(/[#?].*$/, '').replace(/\/$/, '');
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

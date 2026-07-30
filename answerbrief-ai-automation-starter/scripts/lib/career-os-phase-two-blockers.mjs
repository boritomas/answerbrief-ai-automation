export const PHASE_TWO_WORKDAY_BLOCKER_STATUSES = Object.freeze([
  'phase_two_workday_blocker',
  'phase_two_account_recovery',
  'phase_two_selector_mapping',
  'phase_two_original_apply_replay',
  'phase_two_password_reset',
  'phase_two_employer_modal',
  'phase_two_user_decision',
]);

export function classifyPhaseTwoWorkdayBlocker(application = {}) {
  const row = asRecord(application);
  const raw = asRecord(row.raw_record);
  if (isTerminalOutcome(row, raw) || isExplicitQueuedRetry(row, raw)) return null;
  const existing = asRecord(raw.phase_two_workday_blocker);
  if (clean(existing.classification)) {
    return normalizeBacklogItem(row, {
      classification: clean(existing.classification),
      blocker: clean(existing.currentBlocker || existing.blocker),
      nextRequiredFix: clean(existing.nextRequiredFix),
      tomasActionNeeded: existing.tomasActionNeeded === true,
      engineeringFixNeeded: existing.engineeringFixNeeded !== false,
      eligibleLater: existing.eligibleLater !== false,
    });
  }

  if (!isWorkdayApplication(row)) return null;

  const employer = clean(row.employer);
  const role = clean(row.position || row.title);
  const text = normalized([
    employer,
    role,
    row.lifecycle_stage,
    row.next_action,
    raw.production_outcome,
    raw.execution_status,
    raw.application_status,
    raw.browser_worker_status,
    asRecord(raw.browser_worker_last_report).status,
    asRecord(raw.browser_worker_last_report).classification,
    asRecord(raw.browser_worker_last_report).reason,
    asRecord(raw.latest_report).status,
    raw.failure_reason,
    raw.blocker,
    raw.application_url,
    raw.canonical_url,
  ].join(' '));

  if (!text) return null;

  if (/password reset|password_reset|account locked|account_locked/.test(text)) {
    return normalizeBacklogItem(row, {
      classification: 'phase_two_password_reset',
      blocker: 'Password reset or account recovery handoff prevents safe autonomous completion.',
      nextRequiredFix: 'Add bounded password-reset recovery resume logic or refresh the stored employer account before retry.',
      tomasActionNeeded: /email required|email_required|code|verification/.test(text),
      engineeringFixNeeded: true,
      eligibleLater: true,
    });
  }

  if (/workday_email_account_path_not_advancing|email account path|userhome|user home|original apply|not advancing|not_advancing/.test(text)) {
    return normalizeBacklogItem(row, {
      classification: 'phase_two_original_apply_replay',
      blocker: 'Workday account path or userHome redirect prevents reliable return to the original apply flow.',
      nextRequiredFix: 'Teach replay to recover original apply URL after authenticated userHome/account-path redirects.',
      tomasActionNeeded: false,
      engineeringFixNeeded: true,
      eligibleLater: true,
    });
  }

  if (/selector|unsupported control|unsupported_workday_state|hard_workday_selector|deferred_hard_workday_selector/.test(text)) {
    return normalizeBacklogItem(row, {
      classification: 'phase_two_selector_mapping',
      blocker: 'Workday selector/control mapping is not reliable enough for Phase 1 production.',
      nextRequiredFix: 'Capture the failed control and add a bounded semantic selector mapping before retry.',
      tomasActionNeeded: false,
      engineeringFixNeeded: true,
      eligibleLater: !/partner sales|pure sales|quota/.test(text),
    });
  }

  if (/waiting_for_user_decision|user decision|unresolved question|missing answer/.test(text)) {
    return normalizeBacklogItem(row, {
      classification: 'phase_two_user_decision',
      blocker: 'Application-specific answer or selector decision is unresolved for autonomous Phase 1.',
      nextRequiredFix: 'Convert the unresolved decision into a verified answer-bank or selector mapping before retry.',
      tomasActionNeeded: true,
      engineeringFixNeeded: /selector|control/.test(text),
      eligibleLater: true,
    });
  }

  if (/waiting_for_sign_in|sign in|signin|account creation|account modal|employer modal/.test(text)
    && /yahoo|newfold|cisco|zendesk/.test(text)) {
    return normalizeBacklogItem(row, {
      classification: 'phase_two_account_recovery',
      blocker: 'Employer account/session state is ambiguous or repeatedly blocks Workday replay.',
      nextRequiredFix: 'Refresh or recreate the employer account session, then resume from the saved apply URL.',
      tomasActionNeeded: false,
      engineeringFixNeeded: true,
      eligibleLater: true,
    });
  }

  if (/retryable_failure|terminal_failure/.test(text) && /workday|myworkdayjobs/.test(text)) {
    return normalizeBacklogItem(row, {
      classification: 'phase_two_workday_blocker',
      blocker: 'Workday application has a repeat runtime failure that should not block Phase 1 production.',
      nextRequiredFix: 'Inspect the preserved evidence and classify the failure into account, selector, or replay recovery before retry.',
      tomasActionNeeded: false,
      engineeringFixNeeded: true,
      eligibleLater: !/partner sales|pure sales|quota/.test(text),
    });
  }

  return null;
}

export function buildPhaseTwoBacklogItem(application = {}, now = new Date().toISOString()) {
  const classified = classifyPhaseTwoWorkdayBlocker(application);
  if (!classified) return null;
  return {
    ...classified,
    recordedAt: now,
    source: 'career_os_phase_1_blocker_parking',
  };
}

function isTerminalOutcome(row, raw) {
  const text = normalized([
    row.lifecycle_stage,
    row.confirmation_number,
    row.submission_evidence,
    raw.production_outcome,
    raw.execution_status,
    raw.application_status,
    raw.submission_evidence,
    raw.confirmation_number,
  ].join(' '));
  return Boolean(
    row.confirmation_number
    || row.submission_evidence
    || raw.externally_confirmed === true
    || raw.externally_submitted === true
    || /submitted confirmed|submitted_confirmed|externally submitted|externally_submitted/.test(text)
  );
}

function isExplicitQueuedRetry(row, raw) {
  const lifecycle = clean(row.lifecycle_stage).toLowerCase();
  const execution = clean(raw.execution_status).toLowerCase();
  const browserStatus = clean(asRecord(raw.browser_worker).status).toLowerCase();
  const resolved = Boolean(raw.blocker_resolved_at || raw.human_step_completed_at || raw.explicit_resume_requested_at);
  return resolved && (
    lifecycle === 'queued_after_human_step'
    || lifecycle === 'queued_after_tomas_resolution'
    || lifecycle === 'queue_queued'
    || execution === 'queued'
    || browserStatus === 'running'
  );
}

function normalizeBacklogItem(application, item) {
  const row = asRecord(application);
  const raw = asRecord(row.raw_record);
  const url = clean(raw.application_url || raw.canonical_url || raw.job_url);
  return {
    applicationId: clean(row.id),
    blocker: clean(item.blocker) || 'Workday blocker parked for Phase 2.',
    classification: PHASE_TWO_WORKDAY_BLOCKER_STATUSES.includes(clean(item.classification))
      ? clean(item.classification)
      : 'phase_two_workday_blocker',
    currentStatus: clean(raw.production_outcome || row.lifecycle_stage || row.next_action),
    eligibleLater: item.eligibleLater !== false,
    employer: clean(row.employer),
    engineeringFixNeeded: item.engineeringFixNeeded !== false,
    lastEvidencePath: firstNonEmpty(
      asRecord(raw.browser_worker_last_report).evidence_path,
      asRecord(raw.browser_worker_last_report).screenshot_path,
      raw.last_evidence_path,
      raw.source_evidence_path,
    ),
    nextRequiredFix: clean(item.nextRequiredFix) || 'Preserve for bounded Phase 2 recovery before retry.',
    requisition: firstNonEmpty(raw.external_requisition_id, raw.requisition_id, raw.job_id, extractRequisition(url)),
    role: clean(row.position || row.title),
    tenant: firstNonEmpty(raw.workday_tenant, raw.tenant, extractTenant(url)),
    tomasActionNeeded: item.tomasActionNeeded === true,
    url,
  };
}

function isWorkdayApplication(row) {
  const raw = asRecord(row.raw_record);
  const text = normalized([
    raw.ats_platform,
    raw.platform,
    raw.application_url,
    raw.canonical_url,
    raw.job_url,
    row.source,
  ].join(' '));
  return /workday|myworkdayjobs|phenom/.test(text);
}

function extractTenant(value) {
  const host = clean(value).match(/https?:\/\/([^/]+)/i)?.[1] || '';
  const match = host.match(/^([a-z0-9-]+\.wd\d+)/i);
  return match ? match[1].toLowerCase() : '';
}

function extractRequisition(value) {
  const text = clean(value);
  return text.match(/(?:REQ|JR|R|REQ-|JR-|R-)?\d{4,}(?:-\d+)?/i)?.[0] || '';
}

function firstNonEmpty(...values) {
  return values.map(clean).find(Boolean) || '';
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalized(value) {
  return clean(value).toLowerCase();
}

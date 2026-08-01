import { careerOsSelectRows, cleanSupabaseEnv } from './career-os-supabase';

type JsonRecord = Record<string, unknown>;

type ApplicationRow = JsonRecord & {
  id?: string;
  owner_email?: string;
  employer?: string;
  position?: string;
  lifecycle_stage?: string;
  next_action?: string;
  raw_record?: JsonRecord;
};

export type WorkerGateDiagnostic = {
  applicationId: string;
  employer: string;
  position: string;
  lifecycleStage: string;
  platform: string;
  reason: string;
  nextAction: string;
  fixableAutomatically: boolean;
};

export async function browserWorkerGateDiagnostics(ownerEmail: string) {
  const rows = await careerOsSelectRows(
    'career_os_applications',
    `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.asc.nullslast,created_at.asc.nullslast`,
    { rangeStart: 0, rangeEnd: 249 },
  ) as ApplicationRow[];

  const executionMode = clean(process.env.CAREER_OS_EXECUTION_MODE);
  const dailyLimit = numberFrom(process.env.CAREER_OS_BROWSER_WORKER_DAILY_LIMIT, 25);
  const canaryId = clean(process.env.CAREER_OS_WORKDAY_CANARY_ID);
  const queueEnabled = clean(process.env.CAREER_OS_QUEUE_ENABLED) === '1';
  const diagnostics = rows
    .map((row) => diagnose(row, { executionMode, dailyLimit, canaryId, queueEnabled }))
    .filter((item): item is WorkerGateDiagnostic => Boolean(item));

  const reasonCounts = diagnostics.reduce<Record<string, number>>((counts, item) => {
    counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, {});

  return {
    configuration: {
      canaryIdConfigured: Boolean(canaryId),
      dailyLimit,
      executionMode: executionMode || 'missing',
      queueEnabled,
    },
    blockedCount: diagnostics.length,
    reasonCounts,
    blockedApplications: diagnostics.slice(0, 50),
  };
}

function diagnose(row: ApplicationRow, config: { executionMode: string; dailyLimit: number; canaryId: string; queueEnabled: boolean }): WorkerGateDiagnostic | null {
  const raw = asRecord(row.raw_record);
  const platform = detectPlatform(row, raw);
  const lifecycleStage = clean(row.lifecycle_stage);
  const base = {
    applicationId: clean(row.id) || 'unknown',
    employer: clean(row.employer) || 'Unknown employer',
    position: clean(row.position) || 'Unknown role',
    lifecycleStage: lifecycleStage || 'unknown',
    platform,
  };

  if (!config.queueEnabled && !isExplicitlyResumed(raw, row)) {
    return result(base, 'Queue is paused for this application.', 'Resume the application or enable the Career OS queue.', false);
  }
  if (!isProductionQualified(row, raw)) {
    return result(base, 'Application is not qualified for controlled production execution.', 'Approve and queue a qualified role with a package-ready state.', true);
  }
  if (platform === 'unsupported') {
    return result(base, 'Application ATS is unsupported for controlled production execution.', 'Continue manually or add an ATS adapter.', false);
  }
  if (platform === 'greenhouse') {
    return result(base, 'Greenhouse is deferred by the current Workday-first production policy.', 'Enable Greenhouse production execution or select a Workday role.', true);
  }
  if (!config.executionMode) {
    return result(base, 'CAREER_OS_EXECUTION_MODE is missing.', 'Set a supported production execution mode.', true);
  }
  if (platform === 'workday' && normalizeMode(config.executionMode) === 'submit_enabled') {
    return result(base, 'Workday submit_enabled is rejected by controlled-launch policy.', 'Use assisted_apply, inspect_only, workday_single_canary, or workday_first_submit.', true);
  }
  if (platform === 'workday' && normalizeMode(config.executionMode) === 'workday_single_canary') {
    if (!config.canaryId) {
      return result(base, 'Workday single-canary mode has no configured canary application ID.', 'Set CAREER_OS_WORKDAY_CANARY_ID to the approved application ID.', true);
    }
    const rawCanaryId = clean(raw.workday_canary_id || raw.workday_canary_application_id);
    if (config.canaryId !== base.applicationId && config.canaryId !== rawCanaryId) {
      return result(base, 'Application does not match the configured Workday canary ID.', 'Approve the configured canary or update CAREER_OS_WORKDAY_CANARY_ID.', true);
    }
  }

  const blockerText = `${clean(row.next_action)} ${clean(raw.blocker_type)} ${clean(raw.reason_not_submitted)} ${clean(raw.execution_status)}`.toLowerCase();
  if (/identity|mfa|captcha|email code|verification|account creation|sign[- ]?in/.test(blockerText)) {
    return result(base, 'A verified human-only identity or authentication checkpoint is active.', 'Complete the employer checkpoint, then resume the application.', false);
  }
  if (/unsupported|manual required|technical blocker/.test(blockerText)) {
    return result(base, 'A technical or unsupported browser state is active.', 'Review the checkpoint evidence and add or repair the ATS/browser adapter.', true);
  }

  return null;
}

function result(base: Omit<WorkerGateDiagnostic, 'reason' | 'nextAction' | 'fixableAutomatically'>, reason: string, nextAction: string, fixableAutomatically: boolean): WorkerGateDiagnostic {
  return { ...base, reason, nextAction, fixableAutomatically };
}

function detectPlatform(row: ApplicationRow, raw: JsonRecord) {
  const text = [row.employer, row.position, row.next_action, raw.application_url, raw.canonical_url, raw.job_url, raw.platform, raw.ats].map(clean).join(' ').toLowerCase();
  if (/greenhouse|boards\.greenhouse\.io|job-boards\.greenhouse\.io/.test(text)) return 'greenhouse';
  if (/workday|myworkdayjobs|phenom/.test(text)) return 'workday';
  if (/lever\.co/.test(text)) return 'lever';
  if (/icims/.test(text)) return 'icims';
  return 'unsupported';
}

function isProductionQualified(row: ApplicationRow, raw: JsonRecord) {
  const state = `${clean(row.lifecycle_stage)} ${clean(raw.execution_status)} ${clean(raw.package_status)}`.toLowerCase();
  const approved = raw.package_ready === true || raw.approved === true || /qualified|package_ready|queued|browser_worker/.test(state);
  const href = clean(raw.application_url || raw.canonical_url || raw.job_url);
  return approved && /^https?:\/\//i.test(href);
}

function isExplicitlyResumed(raw: JsonRecord, row: ApplicationRow) {
  const text = `${clean(row.lifecycle_stage)} ${clean(row.next_action)} ${clean(raw.execution_status)} ${clean(raw.resume_status)}`.toLowerCase();
  return raw.explicitly_resumed === true || /resume|resumed|approved and queued/.test(text);
}

function normalizeMode(value: string) {
  return clean(value).toLowerCase().replace(/[-\s]+/g, '_');
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return cleanSupabaseEnv(value);
}

function numberFrom(value: unknown, fallback: number) {
  const parsed = Number(clean(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

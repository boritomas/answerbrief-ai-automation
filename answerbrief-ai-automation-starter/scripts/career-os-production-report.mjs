#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { classifyPhaseTwoWorkdayBlocker } from './lib/career-os-phase-two-blockers.mjs';

const root = process.cwd();
loadDotEnv(path.join(root, '.env.local'));

const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
const supabaseUrl = clean(process.env.SUPABASE_URL);
const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const rows = await selectApplications();
const todayRows = rows.filter((row) => touchedToday(row));
const totals = {
  totalTouched: todayRows.length,
  submitted_confirmed: 0,
  feedback_requested: 0,
  rejected_fast: 0,
  rejected_after_review: 0,
  rejected_unknown_reason: 0,
  recruiter_response: 0,
  interview_requested: 0,
  assessment_requested: 0,
  duplicate_submission_detected: 0,
  withdrawn_or_closed: 0,
  outcome_unknown: 0,
  completed_waiting_for_user: 0,
  inspected_assisted: 0,
  waiting_for_sign_in: 0,
  waiting_for_account_creation: 0,
  waiting_for_email_code: 0,
  waiting_for_email_verification: 0,
  waiting_for_user_decision: 0,
  waiting_for_manual_upload: 0,
  assisted_in_progress: 0,
  review_ready: 0,
  submission_uncertain: 0,
  unsupported_workday_state: 0,
  duplicate_skipped: 0,
  unsupported_manual_required: 0,
  retryable_failure: 0,
  terminal_failure: 0,
  not_qualified: 0,
  canary_stopped: 0,
  phase_two_workday_blocker: 0,
  phase_two_account_recovery: 0,
  phase_two_selector_mapping: 0,
  phase_two_original_apply_replay: 0,
  phase_two_password_reset: 0,
  phase_two_employer_modal: 0,
  phase_two_user_decision: 0,
};

for (const row of todayRows) {
  const outcome = productionOutcome(row);
  if (Object.prototype.hasOwnProperty.call(totals, outcome)) {
    totals[outcome] += 1;
  }
  if (outcome.startsWith('phase_two_') && outcome !== 'phase_two_workday_blocker') totals.phase_two_workday_blocker += 1;
}
const phaseTwoBacklog = todayRows.map((row) => classifyPhaseTwoWorkdayBlocker(row)).filter(Boolean);

console.log(JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  ownerEmail,
  executionMode: clean(process.env.CAREER_OS_EXECUTION_MODE) || 'missing',
  queueEnabled: clean(process.env.CAREER_OS_QUEUE_ENABLED) === '1',
  totals,
  phaseTwoBacklog,
  rows: todayRows.map((row) => ({
    applicationId: clean(row.id),
    ats: productionPlatform(row),
    employer: clean(row.employer),
    outcome: productionOutcome(row),
    position: clean(row.position),
    updatedAt: clean(row.updated_at),
    url: applicationUrl(row),
  })),
}, null, 2));

async function selectApplications() {
  const url = new URL('/rest/v1/career_os_applications', supabaseUrl);
  url.searchParams.set('select', 'id,employer,position,lifecycle_stage,next_action,raw_record,updated_at,confirmation_number,submission_evidence');
  url.searchParams.set('owner_email', `eq.${ownerEmail}`);
  url.searchParams.set('order', 'updated_at.desc');
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Supabase career_os_applications query failed with ${response.status}.`);
  }
  return response.json();
}

function productionOutcome(row) {
  const raw = asRecord(row.raw_record);
  const latestOutcome = clean(asRecord(raw.latest_outcome).status || asRecord(raw.outcome_intelligence).latest_status);
  if (isEmployerOutcome(latestOutcome)) return latestOutcome;
  const explicit = clean(raw.production_outcome);
  if (explicit) return explicit;
  const statusText = `${row.lifecycle_stage || ''} ${clean(raw.execution_status)} ${clean(raw.application_status)} ${clean(asRecord(raw.browser_worker_last_report).status)}`.toLowerCase();
  if (row.confirmation_number || row.submission_evidence || /(^|[_\\s-])(confirmed|submitted_confirmed|externally_submitted|submitted)([_\\s-]|$)/.test(statusText)) return 'submitted_confirmed';
  if (/queued|ready_for_autonomous_replay/.test(statusText)) return 'assisted_in_progress';
  const text = `${row.lifecycle_stage || ''} ${row.next_action || ''} ${clean(asRecord(raw.browser_worker_last_report).status)}`.toLowerCase();
  const phaseTwo = classifyPhaseTwoWorkdayBlocker(row);
  if (phaseTwo) return phaseTwo.classification;
  if (/inspected_assisted/.test(text)) return 'inspected_assisted';
  if (/waiting_for_sign_in/.test(text)) return 'waiting_for_sign_in';
  if (/waiting_for_account_creation/.test(text)) return 'waiting_for_account_creation';
  if (/waiting_for_email_code/.test(text)) return 'waiting_for_email_code';
  if (/waiting_for_email_verification/.test(text)) return 'waiting_for_email_verification';
  if (/waiting_for_user_decision/.test(text)) return 'waiting_for_user_decision';
  if (/waiting_for_manual_upload/.test(text)) return 'waiting_for_manual_upload';
  if (/assisted_in_progress/.test(text)) return 'assisted_in_progress';
  if (/review_ready/.test(text)) return 'review_ready';
  if (/submission_uncertain/.test(text)) return 'submission_uncertain';
  if (/unsupported_workday_state/.test(text)) return 'unsupported_workday_state';
  if (/unsupported/.test(text)) return 'unsupported_manual_required';
  if (/duplicate/.test(text)) return 'duplicate_skipped';
  if (/retry/.test(text)) return 'retryable_failure';
  if (/canary/.test(text)) return 'canary_stopped';
  if (/waiting_on_tomas|waiting/.test(text)) return 'completed_waiting_for_user';
  if (/ineligible|not_qualified/.test(text)) return 'not_qualified';
  return 'terminal_failure';
}

function isEmployerOutcome(status) {
  return [
    'submitted_confirmed',
    'feedback_requested',
    'rejected_fast',
    'rejected_after_review',
    'rejected_unknown_reason',
    'recruiter_response',
    'interview_requested',
    'assessment_requested',
    'duplicate_submission_detected',
    'withdrawn_or_closed',
    'outcome_unknown',
  ].includes(clean(status));
}

function touchedToday(row) {
  const raw = asRecord(row.raw_record);
  const browserWorker = asRecord(raw.browser_worker);
  const report = asRecord(raw.browser_worker_last_report);
  const start = startOfLocalDayMs();
  return [
    row.updated_at,
    browserWorker.claimed_at,
    browserWorker.last_heartbeat_at,
    report.timestamp,
  ].map(clean).filter(Boolean).some((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= start;
  });
}

function productionPlatform(row) {
  const raw = asRecord(row.raw_record);
  const text = `${raw.platform || ''} ${raw.ats_platform || ''} ${applicationUrl(row)}`.toLowerCase();
  if (/greenhouse/.test(text)) return 'greenhouse';
  if (/workday|myworkdayjobs|phenom/.test(text)) return 'workday';
  return 'unsupported';
}

function applicationUrl(row) {
  const raw = asRecord(row.raw_record);
  return clean(raw.application_url || raw.canonical_url || raw.job_url);
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function startOfLocalDayMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
loadDotEnv(path.join(root, '.env.local'));

const markdown = process.argv.includes('--markdown');
const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
const supabaseUrl = clean(process.env.SUPABASE_URL);
const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const generatedAt = new Date().toISOString();
const runStartedAt = clean(process.env.CAREER_OS_RUN_STARTED_AT);
const windowStartMs = Number.isFinite(Date.parse(runStartedAt))
  ? Date.parse(runStartedAt)
  : startOfLocalDayMs();
const minFitScore = numberValue(process.env.CAREER_OS_MIN_FIT_SCORE, 70);

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const [applications, postings, sourceRuns] = await Promise.all([
  selectRows('career_os_applications', {
    owner_email: `eq.${ownerEmail}`,
    order: 'updated_at.desc',
    select: '*',
    limit: '500',
  }),
  selectRows('career_os_job_postings', {
    owner_email: `eq.${ownerEmail}`,
    order: 'last_checked_at.desc.nullslast,updated_at.desc.nullslast',
    select: '*',
    limit: '500',
  }),
  selectRows('career_os_source_runs', {
    owner_email: `eq.${ownerEmail}`,
    order: 'executed_at.desc.nullslast,created_at.desc.nullslast',
    select: '*',
    limit: '100',
  }),
]);

const runApplications = applications.filter(applicationTouchedInWindow);
const runPostings = postings.filter(postingTouchedInWindow);
const runSourceRuns = sourceRuns.filter(sourceRunTouchedInWindow);
const submittedThisRun = runApplications.filter(isSubmittedApplication);
const submittedToday = applications.filter((row) => touchedSince(row, startOfLocalDayMs())).filter(isSubmittedApplication);
const submittedAll = applications.filter(isSubmittedApplication);
const rejectedThisRun = runApplications.filter(isRejectedApplication);
const queuedNow = applications.filter(isQueuedApplication);
const blockedNow = applications.filter(isBlockedApplication);
const highFitRunPostings = runPostings
  .filter((posting) => fitScore(posting) >= minFitScore)
  .sort((a, b) => fitScore(b) - fitScore(a));

const report = {
  ok: true,
  generatedAt,
  ownerEmail,
  runWindow: {
    startedAt: new Date(windowStartMs).toISOString(),
    endedAt: generatedAt,
  },
  summary: {
    postingsDiscoveredOrRefreshedThisRun: runPostings.length,
    highFitPostingsThisRun: highFitRunPostings.length,
    sourceRunsThisRun: runSourceRuns.length,
    applicationsTouchedThisRun: runApplications.length,
    submittedOrConfirmedThisRun: submittedThisRun.length,
    submittedOrConfirmedToday: submittedToday.length,
    submittedOrConfirmedAllTime: submittedAll.length,
    rejectedThisRun: rejectedThisRun.length,
    currentlyQueuedOrReady: queuedNow.length,
    currentlyBlockedOrWaiting: blockedNow.length,
  },
  sourceRunsThisRun: runSourceRuns.slice(0, 20).map(sourceRunSummary),
  highFitPostingsThisRun: highFitRunPostings.slice(0, 20).map(postingSummary),
  submittedThisRun: submittedThisRun.slice(0, 30).map(applicationSummary),
  submittedToday: submittedToday.slice(0, 30).map(applicationSummary),
  queuedNow: queuedNow.map(applicationSummary),
  blockedNow: blockedNow.map(applicationSummary),
  rejectedThisRun: rejectedThisRun.slice(0, 20).map(applicationSummary),
};

if (markdown) printMarkdown(report);
else console.log(JSON.stringify(report, null, 2));

async function selectRows(table, params) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`${table} query failed with ${response.status}: ${await response.text()}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function printMarkdown(input) {
  console.log(`# Career OS Run Report`);
  console.log('');
  console.log(`Generated: ${input.generatedAt}`);
  console.log(`Owner: ${input.ownerEmail}`);
  console.log(`Window: ${input.runWindow.startedAt} to ${input.runWindow.endedAt}`);
  console.log('');
  console.log('## Summary');
  console.log(`- Opportunities discovered/refreshed this run: ${input.summary.postingsDiscoveredOrRefreshedThisRun}`);
  console.log(`- High-fit opportunities this run: ${input.summary.highFitPostingsThisRun}`);
  console.log(`- Source runs this run: ${input.summary.sourceRunsThisRun}`);
  console.log(`- Applications touched this run: ${input.summary.applicationsTouchedThisRun}`);
  console.log(`- Submitted/confirmed this run: ${input.summary.submittedOrConfirmedThisRun}`);
  console.log(`- Submitted/confirmed today: ${input.summary.submittedOrConfirmedToday}`);
  console.log(`- Submitted/confirmed all time: ${input.summary.submittedOrConfirmedAllTime}`);
  console.log(`- Rejections imported this run: ${input.summary.rejectedThisRun}`);
  console.log(`- Currently queued/ready: ${input.summary.currentlyQueuedOrReady}`);
  console.log(`- Currently blocked/waiting: ${input.summary.currentlyBlockedOrWaiting}`);
  printTable('Source Runs This Run', input.sourceRunsThisRun, ['source', 'status', 'reviewed', 'accepted', 'skipped', 'updated', 'note']);
  printTable('Submitted / Confirmed This Run', input.submittedThisRun, ['employer', 'role', 'status', 'evidence', 'updated']);
  printTable('Submitted / Confirmed Today', input.submittedToday, ['employer', 'role', 'status', 'evidence', 'updated']);
  printTable('High-Fit Opportunities This Run', input.highFitPostingsThisRun, ['source', 'employer', 'role', 'fit', 'status', 'updated']);
  printTable('Queued / Ready Now', input.queuedNow, ['employer', 'role', 'status', 'updated', 'note']);
  printBlockedSummary(input.blockedNow);
  printTable('Blocked / Waiting Now', input.blockedNow, ['category', 'employer', 'role', 'status', 'updated', 'note']);
  printTable('Rejections Imported This Run', input.rejectedThisRun, ['employer', 'role', 'status', 'updated', 'note']);
}

function printTable(title, rows, columns) {
  console.log('');
  console.log(`## ${title}`);
  if (!rows.length) {
    console.log('None.');
    return;
  }
  console.log(`| ${columns.map(titleCase).join(' | ')} |`);
  console.log(`| ${columns.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    console.log(`| ${columns.map((column) => markdownCell(row[column])).join(' | ')} |`);
  }
}

function applicationSummary(row) {
  const raw = asRecord(row.raw_record);
  return {
    category: blockedCategory(row),
    employer: clean(row.employer || raw.company || raw.employer),
    role: truncate(clean(row.position || raw.job_title || raw.title), 90),
    status: applicationStatus(row),
    evidence: row.confirmation_number || row.submission_evidence || raw.confirmation_url ? 'yes' : 'status',
    updated: clean(row.updated_at).slice(0, 19),
    note: truncate(clean(row.next_action || raw.production_outcome || raw.execution_status || raw.application_status), 120),
  };
}

function printBlockedSummary(rows) {
  console.log('');
  console.log('## Blocked / Waiting Summary');
  if (!rows.length) {
    console.log('None.');
    return;
  }
  const counts = new Map();
  for (const row of rows) counts.set(row.category, (counts.get(row.category) || 0) + 1);
  for (const [category, count] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`- ${category}: ${count}`);
  }
}

function blockedCategory(row) {
  const text = applicationText(row);
  if (/worker\/report failed|unknown error|500/.test(text)) return 'Technical report/save blocker';
  if (/location_not_verified/.test(text)) return 'Needs location/work-policy verification';
  if (/compensation/.test(text)) return 'Needs compensation decision';
  if (/password|account|sign-?in|session|login|verification|verify|captcha|mfa|security code|bot verification/.test(text)) return 'Needs account/sign-in or verification';
  if (/legal|privacy|terms|certify|attestation|acknowledge/.test(text)) return 'Needs legal/privacy/attestation answer';
  if (/unsupported|page state|not recognized|step budget|loop|redirect|returned|selector|control mapping/.test(text)) return 'Technical ATS/browser blocker';
  if (/inactive|ineligible|closed|removed|no longer available/.test(text)) return 'Inactive/ineligible';
  return 'Needs role-specific answer or review';
}

function sourceRunSummary(row) {
  const searchConfig = asRecord(row.search_config);
  const errors = Array.isArray(searchConfig.errors) ? searchConfig.errors.map(clean).filter(Boolean) : [];
  const topHoldReasons = Array.isArray(searchConfig.top_hold_reasons)
    ? searchConfig.top_hold_reasons.map((reason) => {
        if (typeof reason === 'string') return reason;
        const record = asRecord(reason);
        return [record.reason, record.count].map(clean).filter(Boolean).join(': ');
      }).filter(Boolean)
    : [];
  return {
    source: truncate(clean(row.source_name || row.source_type || searchConfig.source), 70),
    status: clean(row.status || 'unknown'),
    reviewed: numberValue(row.number_reviewed, 0),
    accepted: numberValue(row.number_accepted, 0),
    skipped: numberValue(row.number_skipped, 0),
    updated: clean(row.executed_at || row.updated_at || row.created_at).slice(0, 19),
    note: truncate(errors.join('; ') || topHoldReasons.join('; '), 120),
  };
}

function postingSummary(row) {
  const raw = asRecord(row.raw_record);
  return {
    source: clean(raw.source_label || raw.source || row.source || raw.ats || 'career_os'),
    employer: clean(row.company || row.employer || raw.company || raw.employer),
    role: truncate(clean(row.title || row.position || raw.title || raw.job_title), 90),
    fit: fitScore(row),
    status: clean(row.status || raw.status || row.posting_validation_status || 'discovered'),
    updated: clean(row.last_checked_at || row.updated_at || raw.last_checked_at).slice(0, 19),
  };
}

function isSubmittedApplication(row) {
  if (isRejectedApplication(row)) return false;
  const raw = asRecord(row.raw_record);
  const text = applicationText(row);
  // Deliberately no bare \bsubmitted\b/\bapplied\b/\bconfirmed\b fallback
  // here: audited 2026-08-08 and found it produces real false positives --
  // e.g. next_action text like "will not be submitted" or "before browser
  // execution" contains the bare word "submitted"/"applied" while
  // literally describing the opposite. Real evidence or an unambiguous
  // phrase only; undercounting is the safe direction, overcounting
  // silently hides applications that still need work.
  return Boolean(row.confirmation_number || row.submission_evidence || raw.confirmation_url)
    || /submitted_confirmed|externally_submitted|externally_confirmed|application submitted|successfully applied|under consideration|in process/.test(text);
}

function isRejectedApplication(row) {
  return /rejected|not selected|not moving forward|declined|no longer under consideration/.test(applicationText(row));
}

function isQueuedApplication(row) {
  if (isSubmittedApplication(row) || isRejectedApplication(row)) return false;
  const raw = asRecord(row.raw_record);
  const lastReport = asRecord(raw.browser_worker_last_report);
  const lifecycle = clean(row.lifecycle_stage).toLowerCase();
  const executionStatus = clean(raw.execution_status).toLowerCase();
  const reportStatus = clean(lastReport.status).toLowerCase();
  const text = [lifecycle, executionStatus, reportStatus, row.next_action].map(clean).join(' ').toLowerCase();
  if (/failed|blocked|hold|phase_two|waiting|ineligible|inactive|unsupported|password|account|legal|privacy|terms/.test(text)) return false;
  return lifecycle === 'queue_queued'
    || lifecycle === 'queued_after_human_step'
    || lifecycle === 'queued_after_tomas_resolution'
    || executionStatus === 'queued'
    || reportStatus === 'queued'
    || /ready_for_autonomous|package_ready|qualified_pending_application/.test(text);
}

function isBlockedApplication(row) {
  if (isSubmittedApplication(row) || isRejectedApplication(row) || isQueuedApplication(row)) return false;
  const text = applicationText(row);
  return /blocked|waiting|hold|manual|captcha|mfa|verification|unsupported|failed|ineligible|inactive|quality_hold|password|account|legal|privacy|terms/.test(text);
}

function applicationStatus(row) {
  if (isRejectedApplication(row)) return 'rejected';
  if (isSubmittedApplication(row)) return 'submitted/confirmed';
  if (isQueuedApplication(row)) return 'queued/ready';
  if (isBlockedApplication(row)) return 'blocked/waiting';
  return clean(row.lifecycle_stage || asRecord(row.raw_record).production_outcome || 'unknown');
}

function applicationTouchedInWindow(row) {
  return touchedSince(row, windowStartMs);
}

function touchedSince(row, startMs) {
  const raw = asRecord(row.raw_record);
  const browserWorker = asRecord(raw.browser_worker);
  const report = asRecord(raw.browser_worker_last_report);
  return [
    row.updated_at,
    row.created_at,
    browserWorker.claimed_at,
    browserWorker.last_heartbeat_at,
    report.timestamp,
  ].map(clean).filter(Boolean).some((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= startMs;
  });
}

function postingTouchedInWindow(row) {
  const raw = asRecord(row.raw_record);
  return [
    row.last_checked_at,
    row.updated_at,
    row.created_at,
    raw.last_checked_at,
    raw.updated_at,
  ].map(clean).filter(Boolean).some((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= windowStartMs;
  });
}

function sourceRunTouchedInWindow(row) {
  return [
    row.executed_at,
    row.updated_at,
    row.created_at,
  ].map(clean).filter(Boolean).some((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= windowStartMs;
  });
}

function applicationText(row) {
  const raw = asRecord(row.raw_record);
  const lastReport = asRecord(raw.browser_worker_last_report);
  return [
    row.lifecycle_stage,
    row.next_action,
    row.confirmation_number,
    row.submission_evidence,
    raw.production_outcome,
    raw.execution_status,
    raw.application_status,
    raw.status,
    raw.outcome,
    raw.rejection_status,
    raw.confirmation_url,
    lastReport.status,
    lastReport.evidence_text,
  ].map(clean).join(' ').toLowerCase();
}

function fitScore(row) {
  const raw = asRecord(row.raw_record);
  return numberValue(row.fit_score ?? raw.fit_score ?? asRecord(row.ats_analysis).score ?? asRecord(raw.ats_analysis).score, 0);
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
}

function startOfLocalDayMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function markdownCell(value) {
  return truncate(clean(value), 140).replace(/\|/g, '\\|') || '-';
}

function titleCase(value) {
  return String(value).replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()).trim();
}

function truncate(value, max) {
  const text = clean(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

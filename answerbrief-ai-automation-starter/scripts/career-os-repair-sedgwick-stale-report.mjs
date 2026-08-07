// One-time, narrowly-scoped follow-up repair for exactly one row:
// app-auto-workday-sedgwick-r76271. The first Sedgwick repair (#70) cleared
// raw_record.production_outcome, but isProductionQualified() also folds
// raw_record.browser_worker_last_report.status into its disqualifying-text
// check, and that nested field still held the same stale
// "unsupported_workday_state" value from an earlier run -- so the
// application remained stuck as not_qualified even after the first repair.
// This clears only that one nested field (matching the established
// precedent in scripts/career-os-requeue-quality-holds.mjs, which resets
// browser_worker_last_report to null when requeuing past a stale report),
// verifying the exact BEFORE state first. No other fields, and no other
// rows, are touched.
//
// Dry run (default): node scripts/career-os-repair-sedgwick-stale-report.mjs
// Apply:             node scripts/career-os-repair-sedgwick-stale-report.mjs --write

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const OWNER_EMAIL = process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const WRITE = process.argv.includes('--write');
const TARGET_ID = 'app-auto-workday-sedgwick-r76271';

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function endpoint(query) {
  return `${SUPABASE_URL}/rest/v1/career_os_applications${query ? `?${query}` : ''}`;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

console.log(WRITE ? 'MODE: WRITE (repair will be applied)' : 'MODE: DRY RUN (no writes; pass --write to apply)');
console.log('');

const rows = await (await fetch(
  endpoint(`select=*&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}&id=eq.${encodeURIComponent(TARGET_ID)}`),
  { headers },
)).json();

if (rows.length !== 1) {
  console.error(`ABORTED: expected exactly 1 row for ${TARGET_ID}, found ${rows.length}. No write attempted.`);
  process.exit(1);
}

const app = rows[0];
const raw = asRecord(app.raw_record);
const lastReport = asRecord(raw.browser_worker_last_report);
const before = {
  lifecycle_stage: app.lifecycle_stage,
  production_outcome: raw.production_outcome ?? null,
  last_report_status: lastReport.status ?? null,
};
console.log(`BEFORE: ${JSON.stringify(before)}`);

const expected = before.lifecycle_stage === 'queued'
  && before.production_outcome == null
  && before.last_report_status === 'unsupported_workday_state';

if (!expected) {
  console.error('ABORTED: live state does not match the expected BEFORE condition. No write attempted.');
  process.exit(1);
}

if (!WRITE) {
  console.log('DRY RUN: would clear raw_record.browser_worker_last_report.');
  process.exit(0);
}

const response = await fetch(
  endpoint(`id=eq.${encodeURIComponent(TARGET_ID)}&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`),
  {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      raw_record: { ...raw, browser_worker_last_report: null },
    }),
  },
);

if (!response.ok) {
  throw new Error(`PATCH failed: ${response.status} ${await response.text()}`);
}

const [patched] = await response.json();
const patchedRaw = asRecord(patched.raw_record);
console.log(`AFTER:  ${JSON.stringify({
  lifecycle_stage: patched.lifecycle_stage,
  production_outcome: patchedRaw.production_outcome ?? null,
  last_report_status: asRecord(patchedRaw.browser_worker_last_report).status ?? null,
})}`);
console.log(`REPAIRED: ${TARGET_ID}`);

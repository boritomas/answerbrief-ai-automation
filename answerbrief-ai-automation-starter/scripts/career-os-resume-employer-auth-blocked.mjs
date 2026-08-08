// Reusable (not one-off) maintenance script: once Tomas has fixed an
// employer's Workday credential (stored the new working password in the
// macOS Keychain, or otherwise unblocked account access), resume every
// application currently stuck in lifecycle_stage='waiting_on_tomas_browser_worker'
// for that same employer/tenant with an authentication-shaped blocker
// (password reset, sign-in, account creation, locked account, or the
// shared employer-auth-recovery cooldown state introduced 2026-08-08).
//
// This is the "Tomas resolves Capital One once, Career OS resumes every
// eligible Capital One application" behavior: credentials are already
// shared per employer/tenant in the Keychain (resolveEmployerAccountCredential
// in scripts/career-os-browser-companion.mjs), so once the working password
// is stored there, every application just needs its one-time resume flag
// set again (cleared by clearResumeFlags() in lib/career-os-browser-worker.ts
// whenever an application lands in the waiting state) to become claimable.
//
// Uses the existing founder-dashboard 'resume_application' action (same
// codepath as the dashboard's own Resume button) via POST
// /api/career-os/actions -- never a raw Supabase write, never touches
// credentials, never prints them.
//
// Usage:
//   node scripts/career-os-resume-employer-auth-blocked.mjs --employer "Capital One"          (dry run)
//   node scripts/career-os-resume-employer-auth-blocked.mjs --employer "Capital One" --write

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const OWNER_EMAIL = process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const CRON_SECRET = String(process.env.CAREER_OS_CRON_SECRET || '');
const APP_BASE_URL = String(process.env.APP_BASE_URL || 'http://127.0.0.1:3210');
const WRITE = process.argv.includes('--write');

const employerFlagIndex = process.argv.indexOf('--employer');
const EMPLOYER = employerFlagIndex >= 0 ? process.argv[employerFlagIndex + 1] : '';

if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and CAREER_OS_CRON_SECRET are required.');
}
if (!EMPLOYER) {
  throw new Error('Usage: node scripts/career-os-resume-employer-auth-blocked.mjs --employer "Capital One" [--write]');
}

const AUTH_BLOCKER_PATTERN = /password reset|password rejected|sign.?in|account.*(?:creation|locked|required)|employer auth|forgot.*password/i;

const dbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

console.log(WRITE ? 'MODE: WRITE (resumes will be applied)' : 'MODE: DRY RUN (no writes; pass --write to apply)');
console.log(`Employer: ${EMPLOYER}`);
console.log('');

const rows = await (await fetch(
  `${SUPABASE_URL}/rest/v1/career_os_applications?select=id,employer,position,lifecycle_stage,next_action,raw_record&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}&employer=ilike.*${encodeURIComponent(EMPLOYER)}*&lifecycle_stage=eq.waiting_on_tomas_browser_worker`,
  { headers: dbHeaders },
)).json();

const targets = rows.filter((row) => AUTH_BLOCKER_PATTERN.test(row.next_action || ''));
console.log(`Waiting-on-Tomas applications for ${EMPLOYER}: ${rows.length}`);
console.log(`Auth-shaped blockers eligible for resume: ${targets.length}`);
console.log('');

let resumed = 0;
let skipped = 0;

for (const row of targets) {
  const fresh = await (await fetch(
    `${SUPABASE_URL}/rest/v1/career_os_applications?select=id,employer,lifecycle_stage,next_action,raw_record&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}&id=eq.${encodeURIComponent(row.id)}`,
    { headers: dbHeaders },
  )).json();

  if (fresh.length !== 1 || fresh[0].lifecycle_stage !== 'waiting_on_tomas_browser_worker' || !AUTH_BLOCKER_PATTERN.test(fresh[0].next_action || '')) {
    console.error(`SKIPPED (${row.id}): live state changed since initial read. No action taken.`);
    skipped += 1;
    continue;
  }

  console.log(`${row.id} (${row.employer} -- ${row.position})`);
  console.log(`  BEFORE: lifecycle_stage=${fresh[0].lifecycle_stage}, next_action="${fresh[0].next_action}"`);

  if (!WRITE) {
    console.log('  DRY RUN: would call resume_application.');
    continue;
  }

  const response = await fetch(`${APP_BASE_URL}/api/career-os/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CRON_SECRET}` },
    body: JSON.stringify({ action: 'resume_application', applicationId: row.id, ownerEmail: OWNER_EMAIL }),
  });
  const result = await response.json().catch(() => ({}));
  console.log(`  ACTION RESULT: ok=${result.ok} status=${result.status} message=${result.message || ''}`);
  if (result.ok) resumed += 1;
  else skipped += 1;
}

console.log('');
console.log(WRITE ? `Resume run complete. Resumed: ${resumed}. Skipped: ${skipped}.` : 'Dry run complete. Re-run with --write to apply.');

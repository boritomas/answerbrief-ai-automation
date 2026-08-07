// One-time, narrowly-scoped follow-up repair for exactly one row:
// app-auto-linkedin-workday-upbound-wd501-100639-0c1dcb7b. Two separate,
// independent single-canary-id gates in the Workday execution chain
// (scripts/lib/career-os-production-controls.mjs and
// scripts/lib/career-os-workday-production.mjs) each rejected this
// already-allowlisted, already-repaired application before both were fixed
// (PRs #72, #73), each writing the same canary_stopped corruption pattern
// with a slightly different next_action message. This restores exactly the
// fields either rejection touched, verifying the exact BEFORE state first
// (accepting either known message) and aborting if it doesn't match. No
// other fields, and no other rows, are touched.
//
// Dry run (default): node scripts/career-os-repair-upbound-canary-stopped.mjs
// Apply:             node scripts/career-os-repair-upbound-canary-stopped.mjs --write

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const OWNER_EMAIL = process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const WRITE = process.argv.includes('--write');
const TARGET_ID = 'app-auto-linkedin-workday-upbound-wd501-100639-0c1dcb7b';

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
const before = {
  lifecycle_stage: app.lifecycle_stage,
  next_action: app.next_action,
  production_outcome: raw.production_outcome ?? null,
  explicit_resume_requested_at: raw.explicit_resume_requested_at ?? null,
};
console.log(`BEFORE: ${JSON.stringify(before)}`);

const KNOWN_REJECTION_MESSAGES = [
  'Workday single-canary mode is limited to the configured canary application id.',
  'Workday canary id does not match this task.',
];

const expected = before.lifecycle_stage === 'canary_stopped'
  && KNOWN_REJECTION_MESSAGES.includes(before.next_action)
  && before.production_outcome === 'canary_stopped'
  && before.explicit_resume_requested_at != null;

if (!expected) {
  console.error('ABORTED: live state does not match the expected BEFORE condition. No write attempted.');
  process.exit(1);
}

if (!WRITE) {
  console.log('DRY RUN: would restore lifecycle_stage/next_action/production_outcome.');
  process.exit(0);
}

const response = await fetch(
  endpoint(`id=eq.${encodeURIComponent(TARGET_ID)}&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`),
  {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      lifecycle_stage: 'queued',
      next_action: 'Approved and queued. Run One Production Application to execute.',
      raw_record: { ...raw, production_outcome: null },
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
  next_action: patched.next_action,
  production_outcome: patchedRaw.production_outcome ?? null,
  explicit_resume_requested_at: patchedRaw.explicit_resume_requested_at ?? null,
})}`);
console.log(`REPAIRED: ${TARGET_ID}`);

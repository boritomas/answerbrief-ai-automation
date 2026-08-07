// One-time repair: sets explicit_resume_requested_at on the currently-queued
// Workday applications so they bypass the global queue pause
// (careerOsQueuePaused() in lib/career-os-browser-worker.ts only exempts
// rows carrying this flag -- it is a separate, earlier gate from the
// Workday single-canary allowlist added in PR #68/#72/#73, and adding an id
// to that allowlist alone is not sufficient to make it claimable). Scope is
// intentionally narrow: only rows that are lifecycle_stage = 'queued' AND
// on the Workday platform AND already present in the current
// CAREER_OS_WORKDAY_CANARY_ID allowlist are touched -- this does not
// silently expand which applications are claimable beyond what the
// allowlist already authorizes, it only unblocks the ones already
// explicitly authorized there. Each row's BEFORE state is verified
// immediately before writing; no other field is touched.
//
// Dry run (default): node scripts/career-os-resume-workday-backlog.mjs
// Apply:             node scripts/career-os-resume-workday-backlog.mjs --write

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const OWNER_EMAIL = process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const WRITE = process.argv.includes('--write');

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const allowlist = new Set(
  String(process.env.CAREER_OS_WORKDAY_CANARY_ID || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
);

if (!allowlist.size) {
  throw new Error('CAREER_OS_WORKDAY_CANARY_ID is empty; nothing to resume.');
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
console.log(`Allowlist size: ${allowlist.size}`);
console.log('');

const rows = await (await fetch(
  endpoint(`select=id,employer,position,lifecycle_stage,raw_record&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}&lifecycle_stage=eq.queued`),
  { headers },
)).json();

const targets = rows.filter((row) => {
  const raw = asRecord(row.raw_record);
  const isWorkday = String(raw.application_url || '').toLowerCase().includes('myworkdayjobs');
  const alreadyResumed = raw.explicit_resume_requested_at != null;
  return isWorkday && allowlist.has(row.id) && !alreadyResumed;
});

console.log(`Queued Workday applications in the allowlist, not yet resumed: ${targets.length}`);
console.log('');

let resumed = 0;
let skipped = 0;

for (const row of targets) {
  const fresh = await (await fetch(
    endpoint(`select=id,lifecycle_stage,raw_record&id=eq.${encodeURIComponent(row.id)}&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`),
    { headers },
  )).json();

  if (fresh.length !== 1 || fresh[0].lifecycle_stage !== 'queued' || asRecord(fresh[0].raw_record).explicit_resume_requested_at != null) {
    console.error(`SKIPPED (${row.id}): live state changed since initial read. No write attempted.`);
    skipped += 1;
    continue;
  }

  console.log(`${row.id} (${row.employer} -- ${row.position})`);

  if (!WRITE) {
    console.log('  DRY RUN: would set explicit_resume_requested_at.');
    continue;
  }

  const raw = asRecord(fresh[0].raw_record);
  const response = await fetch(
    endpoint(`id=eq.${encodeURIComponent(row.id)}&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`),
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        raw_record: { ...raw, explicit_resume_requested_at: new Date().toISOString() },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`PATCH failed for ${row.id}: ${response.status} ${await response.text()}`);
  }

  console.log('  RESUMED.');
  resumed += 1;
}

console.log('');
console.log(WRITE ? `Repair run complete. Resumed: ${resumed}. Skipped: ${skipped}.` : 'Dry run complete. Re-run with --write to apply.');

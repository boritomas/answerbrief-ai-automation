// One-time repair: clears the cached exact_resume field on queued (not yet
// submitted) Workday applications whose stored résumé text still contains
// the pre-correction "Fort Worth"/"76227" location, now that the root-cause
// profile record (career_os_profiles.verified_profile.contact) has been
// fixed to Dallas, Texas (see career-os-repair-profile-location.mjs). The
// browser worker regenerates exact_resume at claim time whenever it is
// empty (lib/career-os-browser-worker.ts, buildAuthorizedInlineResume), so
// clearing this one field is sufficient -- it does not fabricate new
// résumé content itself.
//
// Scope: only rows with lifecycle_stage = 'queued' (not yet submitted) AND
// exact_resume matching /fort worth|76227/i are touched. Each row's BEFORE
// state is verified immediately before writing. Never touches submitted/
// confirmed application history.
//
// Dry run (default): node scripts/career-os-clear-stale-resumes.mjs
// Apply:             node scripts/career-os-clear-stale-resumes.mjs --write

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

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function endpoint(query) {
  return `${SUPABASE_URL}/rest/v1/career_os_applications${query ? `?${query}` : ''}`;
}

const STALE_PATTERN = /fort worth|76227/i;

console.log(WRITE ? 'MODE: WRITE (repairs will be applied)' : 'MODE: DRY RUN (no writes; pass --write to apply)');
console.log('');

const rows = await (await fetch(
  endpoint(`select=id,employer,position,lifecycle_stage,exact_resume&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}&lifecycle_stage=eq.queued`),
  { headers },
)).json();

const stale = rows.filter((row) => STALE_PATTERN.test(row.exact_resume || ''));
console.log(`Queued applications: ${rows.length}`);
console.log(`Stale (Fort Worth/76227) queued applications: ${stale.length}`);
console.log('');

let repaired = 0;
let skipped = 0;

for (const row of stale) {
  // Re-verify immediately before writing (fail-closed against any change
  // since the initial select, e.g. a concurrent submission).
  const fresh = await (await fetch(
    endpoint(`select=id,lifecycle_stage,exact_resume&id=eq.${encodeURIComponent(row.id)}&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`),
    { headers },
  )).json();

  if (fresh.length !== 1 || fresh[0].lifecycle_stage !== 'queued' || !STALE_PATTERN.test(fresh[0].exact_resume || '')) {
    console.error(`SKIPPED (${row.id}): live state changed since initial read. No write attempted.`);
    skipped += 1;
    continue;
  }

  console.log(`${row.id} (${row.employer} -- ${row.position}): stale resume confirmed.`);

  if (!WRITE) {
    console.log('  DRY RUN: would clear exact_resume.');
    continue;
  }

  const response = await fetch(
    endpoint(`id=eq.${encodeURIComponent(row.id)}&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`),
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ exact_resume: null }),
    },
  );

  if (!response.ok) {
    throw new Error(`PATCH failed for ${row.id}: ${response.status} ${await response.text()}`);
  }

  console.log('  CLEARED: exact_resume (will regenerate from corrected profile at next claim).');
  repaired += 1;
}

console.log('');
console.log(WRITE ? `Repair run complete. Cleared: ${repaired}. Skipped: ${skipped}.` : 'Dry run complete. Re-run with --write to apply.');

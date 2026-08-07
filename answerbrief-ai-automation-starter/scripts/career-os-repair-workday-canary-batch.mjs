// One-time, narrowly-scoped repair for exactly three career_os_applications
// rows: Upbound, Sedgwick, Cisco. Each target is resolved from live data
// (employer + position + Workday-platform URL, not a trusted hardcoded id),
// and each row's current state is verified against an expected BEFORE value
// immediately before it is touched. Any row whose live state does not match
// its expected BEFORE value is skipped (fail-closed) rather than guessed at.
// Only the specific field(s) each repair targets are changed -- everything
// else in the row, including all submission-approval/fingerprint fields, is
// left untouched. No fields on any other row are read or written.
//
// Dry run (default): node scripts/career-os-repair-workday-canary-batch.mjs
// Apply:             node scripts/career-os-repair-workday-canary-batch.mjs --write

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

function endpoint(table, query = '') {
  return `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function selectRows(query) {
  const response = await fetch(endpoint('career_os_applications', query), { headers });
  if (!response.ok) {
    throw new Error(`SELECT failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function patchById(id, patch) {
  const response = await fetch(
    endpoint('career_os_applications', `id=eq.${encodeURIComponent(id)}&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`),
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    },
  );
  if (!response.ok) {
    throw new Error(`PATCH failed for ${id}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

// Each target is resolved by employer + position + (for Workday-platform
// disambiguation) an application_url containing myworkdayjobs -- Sedgwick
// specifically has a second, unrelated LinkedIn-routed row for the same
// position with no application_url, which this excludes.
const TARGETS = [
  {
    name: 'UPBOUND',
    employerLike: '*Upbound*',
    positionLike: '*Retention*',
    expectedId: 'app-auto-linkedin-workday-upbound-wd501-100639-0c1dcb7b',
    expectBefore: (app, raw) => raw.explicit_resume_requested_at == null && app.lifecycle_stage === 'queued',
    describeBefore: (app, raw) => ({ lifecycle_stage: app.lifecycle_stage, explicit_resume_requested_at: raw.explicit_resume_requested_at ?? null }),
    apply: (app, raw) => ({
      raw_record: { ...raw, explicit_resume_requested_at: new Date().toISOString() },
    }),
    describeAfter: (patched) => {
      const raw = asRecord(patched.raw_record);
      return { lifecycle_stage: patched.lifecycle_stage, explicit_resume_requested_at: raw.explicit_resume_requested_at ?? null };
    },
  },
  {
    name: 'SEDGWICK',
    employerLike: '*Sedgwick*',
    positionLike: '*Director Product Management*',
    expectedId: 'app-auto-workday-sedgwick-r76271',
    expectBefore: (app, raw) => raw.production_outcome === 'unsupported_workday_state' && app.lifecycle_stage === 'queued',
    describeBefore: (app, raw) => ({ lifecycle_stage: app.lifecycle_stage, production_outcome: raw.production_outcome ?? null }),
    apply: (app, raw) => ({
      raw_record: { ...raw, production_outcome: null },
    }),
    describeAfter: (patched) => {
      const raw = asRecord(patched.raw_record);
      return { lifecycle_stage: patched.lifecycle_stage, production_outcome: raw.production_outcome ?? null };
    },
  },
  {
    name: 'CISCO',
    employerLike: '*Cisco*',
    positionLike: '*AI Collaboration*',
    expectedId: 'app-auto-workday-cisco-2010550',
    expectBefore: (app, raw) =>
      app.lifecycle_stage === 'canary_stopped'
      && app.next_action === 'Workday single-canary mode is limited to the configured canary application id.'
      && raw.production_outcome === 'canary_stopped',
    describeBefore: (app, raw) => ({ lifecycle_stage: app.lifecycle_stage, next_action: app.next_action, production_outcome: raw.production_outcome ?? null }),
    apply: (app, raw) => ({
      lifecycle_stage: 'queued',
      next_action: 'Approved and queued. Run One Production Application to execute.',
      raw_record: { ...raw, production_outcome: null },
    }),
    describeAfter: (patched) => {
      const raw = asRecord(patched.raw_record);
      return { lifecycle_stage: patched.lifecycle_stage, next_action: patched.next_action, production_outcome: raw.production_outcome ?? null };
    },
  },
];

console.log(WRITE ? 'MODE: WRITE (repairs will be applied)' : 'MODE: DRY RUN (no writes; pass --write to apply)');
console.log('');

for (const target of TARGETS) {
  console.log(`--- ${target.name} ---`);

  const rows = await selectRows(
    `select=*&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`
    + `&employer=ilike.${encodeURIComponent(target.employerLike)}`
    + `&position=ilike.${encodeURIComponent(target.positionLike)}`
    + '&raw_record->>application_url=ilike.*myworkdayjobs*',
  );

  if (rows.length !== 1) {
    console.error(`ABORTED (${target.name}): expected exactly 1 matching row from live data, found ${rows.length}. No write attempted.`);
    console.log('');
    continue;
  }

  const app = rows[0];
  const raw = asRecord(app.raw_record);

  if (app.id !== target.expectedId) {
    console.error(`ABORTED (${target.name}): resolved row id "${app.id}" does not match expected "${target.expectedId}". No write attempted.`);
    console.log('');
    continue;
  }

  const before = target.describeBefore(app, raw);
  console.log(`Resolved id: ${app.id}`);
  console.log(`BEFORE: ${JSON.stringify(before)}`);

  if (!target.expectBefore(app, raw)) {
    console.error(`ABORTED (${target.name}): live state does not match the expected BEFORE condition. No write attempted.`);
    console.log('');
    continue;
  }

  if (!WRITE) {
    console.log(`DRY RUN: would apply targeted repair to ${app.id}.`);
    console.log('');
    continue;
  }

  const patch = target.apply(app, raw);
  const [patched] = await patchById(app.id, patch);
  console.log(`AFTER:  ${JSON.stringify(target.describeAfter(patched))}`);
  console.log(`REPAIRED: ${target.name} (${app.id})`);
  console.log('');
}

console.log(WRITE ? 'Repair run complete.' : 'Dry run complete. Re-run with --write to apply.');

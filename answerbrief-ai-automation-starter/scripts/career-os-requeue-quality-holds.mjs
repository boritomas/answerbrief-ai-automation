import fs from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
import { assessApplicationQuality } from './lib/career-os-quality-layer.mjs';

loadEnvConfig(process.cwd());

const OWNER_EMAIL = process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

const TARGET_IDS = [
  'app-auto-workday-capital-one-r247078',
  'app-auto-workday-capital-one-r237198',
  'app-auto-workday-capital-one-r247559',
  'app-auto-workday-capital-one-r246651',
];

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

async function selectRows(table, query) {
  const response = await fetch(endpoint(table, query), {
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `${table} SELECT failed: ${response.status} ${await response.text()}`,
    );
  }

  return await response.json();
}

async function patchApplication(id, patch) {
  const response = await fetch(
    endpoint(
      'career_os_applications',
      `id=eq.${encodeURIComponent(id)}&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`,
    ),
    {
      method: 'PATCH',
      headers: {
        ...headers,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    },
  );

  if (!response.ok) {
    throw new Error(
      `${id} PATCH failed: ${response.status} ${await response.text()}`,
    );
  }

  return await response.json();
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function clean(value) {
  return String(value ?? '').trim();
}

async function loadApplication(id) {
  const rows = await selectRows(
    'career_os_applications',
    `select=*&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}&id=eq.${encodeURIComponent(id)}&limit=1`,
  );

  if (!rows.length) {
    throw new Error(`Application not found: ${id}`);
  }

  return rows[0];
}

async function loadArtifacts(applicationId) {
  return await selectRows(
    'career_os_artifacts',
    `select=*&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}&application_id=eq.${encodeURIComponent(applicationId)}&order=created_at.desc`,
  );
}

async function loadPosting(application) {
  const raw = asRecord(application.raw_record);
  const postingId = clean(
    application.opportunity_id || raw.canonical_job_posting_id,
  );

  if (!postingId) return {};

  const rows = await selectRows(
    'career_os_job_postings',
    `select=*&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}&id=eq.${encodeURIComponent(postingId)}&limit=1`,
  );

  return rows[0] || {};
}

const evaluations = [];

for (const id of TARGET_IDS) {
  const application = await loadApplication(id);
  const artifacts = await loadArtifacts(id);
  const posting = await loadPosting(application);
  const raw = asRecord(application.raw_record);

  const qualityGate = assessApplicationQuality({
    application,
    artifacts,
    posting,
  });

  evaluations.push({
    id,
    employer: application.employer,
    position: application.position,
    currentLifecycleStage: application.lifecycle_stage,
    currentProductionOutcome: raw.production_outcome,
    postingId: posting.id || null,
    qualityGate,
    application,
  });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDirectory = path.join(
  process.cwd(),
  '.career-os-runtime-backups',
);
const backupPath = path.join(
  backupDirectory,
  `capital-one-quality-requeue-${timestamp}.json`,
);

await fs.mkdir(backupDirectory, { recursive: true });
await fs.writeFile(
  backupPath,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      ownerEmail: OWNER_EMAIL,
      writeRequested: WRITE,
      records: evaluations.map(({ application, ...result }) => ({
        ...result,
        originalApplication: application,
      })),
    },
    null,
    2,
  ),
);

console.log(`Backup written: ${backupPath}`);
console.log('');
console.log('Quality re-evaluation:');

for (const result of evaluations) {
  console.log(
    JSON.stringify(
      {
        id: result.id,
        position: result.position,
        score: result.qualityGate.score,
        status: result.qualityGate.status,
        submitReady: result.qualityGate.submitReady,
        locationOk: result.qualityGate.locationOk,
        compensationOk: result.qualityGate.compensationOk,
        packageComplete: result.qualityGate.packageComplete,
        holdReasons: result.qualityGate.holdReasons,
      },
      null,
      2,
    ),
  );
}

const failures = evaluations.filter(
  (result) => result.qualityGate.submitReady !== true,
);

if (failures.length) {
  console.error('');
  console.error(
    `STOPPED: ${failures.length} application(s) still fail the quality gate.`,
  );
  console.error('No database records were changed.');

  for (const failure of failures) {
    console.error(
      `${failure.id}: ${failure.qualityGate.holdReasons.join(', ') || failure.qualityGate.status}`,
    );
  }

  process.exitCode = 2;
} else if (!WRITE) {
  console.log('');
  console.log('DRY RUN PASSED: all four applications are submit-ready.');
  console.log('No database records were changed.');
} else {
  console.log('');
  console.log('All four passed. Requeueing...');

  for (const result of evaluations) {
    const application = result.application;
    const raw = asRecord(application.raw_record);
    const browserWorker = asRecord(raw.browser_worker);
    const now = new Date().toISOString();

    const updatedRaw = {
      ...raw,
      blocker_reason: null,
      browser_worker: {
        ...browserWorker,
        last_heartbeat_at: now,
        status: 'queued',
      },
      browser_worker_last_report: null,
      execution_status: 'queued',
      last_error: null,
      package_status: 'approved_for_automation',
      production_outcome: null,
      quality_gate: result.qualityGate,
      quality_gate_status: result.qualityGate.status,
      quality_gate_updated_at: now,
      quality_gate_version: 'career_os_quality_layer_v1_location_policy_fix',
      queue_eligible: true,
      requeued_from_quality_hold_at: now,
      requeue_reason: 'quality_gate_passed_after_location_policy_reassessment',
    };

    const patched = await patchApplication(result.id, {
      lifecycle_stage: 'package_ready',
      next_action:
        'Quality gate passed after location-policy reassessment. Ready for browser-worker execution.',
      raw_record: updatedRaw,
      updated_at: now,
    });

    console.log(
      `REQUEUED: ${result.id} (${patched.length ? 'updated' : 'no returned row'})`,
    );
  }

  console.log('');
  console.log('Requeue completed successfully.');
}

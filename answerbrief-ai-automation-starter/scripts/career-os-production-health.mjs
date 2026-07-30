#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

import { getATSAdapter } from './lib/career-os-ats-adapters.mjs';
import {
  loadAtsProductionCapabilities,
  resolveProductionExecutionPolicy,
} from './lib/career-os-production-controls.mjs';
import {
  analyzeWorkdayAnswerBank,
  loadWorkdayAnswerBank,
} from './lib/career-os-workday-answer-bank.mjs';
import {
  validateWorkdayObservationBounds,
  workdayObserveModeEnabled,
} from './lib/career-os-workday-observation.mjs';
import { parseWorkdayJobUrl } from './lib/career-os-workday-production.mjs';

const root = process.cwd();
loadDotEnv(path.join(root, '.env.local'));

const checks = [];

function task(overrides = {}) {
  return {
    applicationId: 'health-greenhouse',
    applicationUrl: 'https://job-boards.greenhouse.io/answerbrief/jobs/123456',
    candidate: {},
    companionId: 'career-os-health',
    employer: 'AnswerBrief Health',
    legal: { approvedAcknowledgements: [] },
    ownerEmail: clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com',
    platform: 'greenhouse',
    position: 'Production Health',
    questionCatalog: [],
    resume: { fileName: 'resume.txt' },
    ...overrides,
  };
}

try {
  const matrix = loadAtsProductionCapabilities({ reload: true });
  pass('capability_matrix', `Loaded ${matrix.version}.`);
  if (matrix.adapters.oracle || !matrix.claimPolicy?.forbiddenAdapters?.includes('oracle')) {
    fail('forbidden_adapter', 'Oracle must be forbidden and absent from production capabilities.');
  } else {
    pass('forbidden_adapter', 'Oracle is forbidden and absent from the production adapter matrix.');
  }

  checkEnvironment();
  checkAdapterRouting();
  checkProductionPolicies();
  checkWorkdayProductionReadiness(matrix);
  await checkBrowserTooling();
  checkDuplicateLockFiles();
  await checkEvidenceDirectory();
  await checkOptionalWorkerEndpoint();
} catch (error) {
  fail('health_command_exception', error instanceof Error ? error.message : String(error));
}

const summary = {
  ok: checks.every((check) => check.status !== 'fail'),
  checkedAt: new Date().toISOString(),
  checks,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);

function checkEnvironment() {
  const required = [
    'CAREER_OS_BROWSER_WORKER_TOKEN',
    'CAREER_OS_OWNER_EMAIL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_URL',
  ];
  for (const key of required) {
    if (clean(process.env[key])) pass(`env:${key}`, 'present');
    else fail(`env:${key}`, 'missing');
  }

  if (clean(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL)) {
    pass('env:base_url', 'present');
  } else {
    fail('env:base_url', 'APP_BASE_URL or NEXT_PUBLIC_BASE_URL is missing.');
  }

  const mode = clean(process.env.CAREER_OS_EXECUTION_MODE);
  if (mode) {
    pass('env:CAREER_OS_EXECUTION_MODE', mode);
  } else {
    warn('env:CAREER_OS_EXECUTION_MODE', 'missing; runtime guard will fail closed.');
  }

  const queueEnabled = clean(process.env.CAREER_OS_QUEUE_ENABLED) === '1';
  if (queueEnabled) pass('env:CAREER_OS_QUEUE_ENABLED', 'queue enabled explicitly');
  else pass('env:CAREER_OS_QUEUE_ENABLED', 'queue paused unless explicitly enabled');

  if (mode === 'workday_first_submit') {
    pass('workday_first_mode', 'Workday-first production submission mode is active.');
  } else if (mode === 'submit_enabled') {
    fail('submit_enabled_authorization', 'submit_enabled is reserved for deferred non-Workday phases; use CAREER_OS_EXECUTION_MODE=workday_first_submit.');
  } else {
    pass('submit_enabled_authorization', 'legacy submit_enabled is disabled during Workday-first production.');
  }

  if (mode === 'workday_single_canary') {
    const canaryId = clean(process.env.CAREER_OS_WORKDAY_CANARY_ID || process.env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
    const canaryUrl = clean(process.env.CAREER_OS_WORKDAY_CANARY_URL);
    if (canaryId) pass('workday_canary_id', 'configured');
    else fail('workday_canary_id', 'CAREER_OS_WORKDAY_CANARY_ID is required in workday_single_canary mode.');
    if (canaryUrl) {
      const parsed = parseWorkdayJobUrl(canaryUrl);
      if (parsed.ok) pass('workday_canary_url', `tenant=${parsed.tenant} jobId=${parsed.jobId}`);
      else fail('workday_canary_url', `CAREER_OS_WORKDAY_CANARY_URL is not canary-qualified: ${parsed.reason}`);
    } else {
      warn('workday_canary_url', 'not configured; worker will rely on the task URL and still require an unambiguous tenant/job.');
    }
  } else {
    pass('workday_canary_mode', 'workday_single_canary is inactive unless explicitly selected.');
  }
}

function checkAdapterRouting() {
  const env = {
    CAREER_OS_EXECUTION_MODE: 'submit_enabled',
    CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID: 'health-greenhouse',
    CAREER_OS_SUBMIT_RUN_AUTHORIZATION: 'health-check',
  };
  const greenhouse = getATSAdapter(task(), { env });
  if (greenhouse.id === 'greenhouse') pass('adapter:greenhouse', 'Greenhouse routes to production-guarded adapter.');
  else fail('adapter:greenhouse', `Expected greenhouse, received ${greenhouse.id}.`);

  const workday = getATSAdapter(task({
    applicationId: 'health-workday',
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123',
    platform: 'workday',
  }), { env: { CAREER_OS_EXECUTION_MODE: 'assisted_apply' } });
  if (workday.id === 'workday') pass('adapter:workday', 'Workday routes to assisted production adapter.');
  else fail('adapter:workday', `Expected workday, received ${workday.id}.`);

  const unsupported = getATSAdapter(task({
    applicationId: 'health-unsupported',
    applicationUrl: 'https://example.com/jobs/123',
    platform: 'unknown',
  }), { env: { CAREER_OS_EXECUTION_MODE: 'inspect_only' } });
  if (unsupported.id === 'unsupported') pass('adapter:unsupported', 'Unsupported ATS routes to manual-required adapter.');
  else fail('adapter:unsupported', `Expected unsupported, received ${unsupported.id}.`);

  const oracle = getATSAdapter(task({
    applicationId: 'health-oracle',
    applicationUrl: 'https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/123',
    platform: 'oracle',
  }), { env: { CAREER_OS_EXECUTION_MODE: 'inspect_only' } });
  if (oracle.id === 'unsupported') pass('adapter:oracle_forbidden', 'Oracle routes to unsupported/manual.');
  else fail('adapter:oracle_forbidden', `Oracle unexpectedly routed to ${oracle.id}.`);
}

function checkProductionPolicies() {
  const missing = resolveProductionExecutionPolicy({
    adapterId: 'greenhouse',
    env: {},
    task: task(),
  });
  if (!missing.allowed && missing.reason.includes('missing')) pass('policy:missing_mode', 'missing mode fails closed');
  else fail('policy:missing_mode', 'missing mode did not fail closed');

  const workdaySubmit = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' },
    task: task({
      applicationId: 'health-workday',
      applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123',
      platform: 'workday',
    }),
  });
  if (workdaySubmit.allowed && workdaySubmit.submitAllowed) {
    pass('policy:workday_first_submit', 'Workday-first submit mode is allowed with duplicate safety.');
  } else {
    fail('policy:workday_first_submit', 'Workday-first submit mode was not allowed.');
  }

  const greenhouseSubmit = resolveProductionExecutionPolicy({
    adapterId: 'greenhouse',
    env: {
      CAREER_OS_EXECUTION_MODE: 'submit_enabled',
      CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID: 'health-greenhouse',
      CAREER_OS_SUBMIT_RUN_AUTHORIZATION: 'health-check',
    },
    task: task(),
  });
  if (!greenhouseSubmit.allowed && greenhouseSubmit.outcomeStatus === 'deferred_phase_two_greenhouse') {
    pass('policy:greenhouse_deferred', 'Greenhouse is recognized and deferred for phase two.');
  } else {
    fail('policy:greenhouse_deferred', 'Greenhouse was not deferred for Workday-first production.');
  }

  const workdayMissingCanary = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: { CAREER_OS_EXECUTION_MODE: 'workday_single_canary' },
    task: task({
      applicationId: 'health-workday',
      applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123',
      platform: 'workday',
    }),
  });
  if (!workdayMissingCanary.allowed && workdayMissingCanary.outcomeStatus === 'canary_stopped') {
    pass('policy:workday_canary_missing_id', 'Workday single canary fails closed without a canary id.');
  } else {
    fail('policy:workday_canary_missing_id', 'Workday single canary did not fail closed without a canary id.');
  }

  const workdayCanary = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: {
      CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
      CAREER_OS_WORKDAY_CANARY_ID: 'health-workday',
      CAREER_OS_WORKDAY_CANARY_URL: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123',
    },
    task: task({
      applicationId: 'health-workday',
      applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123',
      platform: 'workday',
    }),
  });
  if (workdayCanary.allowed && !workdayCanary.submitAllowed) pass('policy:workday_single_canary', 'Workday canary is allowed but submit remains blocked without exact review approval.');
  else fail('policy:workday_single_canary', 'Workday canary policy did not allow inspect/fill while blocking submit.');
}

function checkWorkdayProductionReadiness(matrix) {
  const workday = matrix.adapters.workday;
  if (workday.allowedModes.includes('workday_single_canary')) pass('workday:mode', 'workday_single_canary is available.');
  else fail('workday:mode', 'workday_single_canary is missing from the capability matrix.');
  if (workday.allowedModes.includes('workday_first_submit')) pass('workday:first_mode', 'workday_first_submit is available.');
  else fail('workday:first_mode', 'workday_first_submit is missing from the capability matrix.');
  if (workday.submitPolicy?.submitEnabled === true && workday.submitPolicy?.standingAuthorizationMode === 'workday_first_submit') {
    pass('workday:submit_guard', 'Workday-first submit is enabled with duplicate safety and human-gate boundaries.');
  } else {
    fail('workday:submit_guard', 'Workday submit guard is incomplete.');
  }
  const bank = loadWorkdayAnswerBank();
  const summary = analyzeWorkdayAnswerBank(bank);
  if (summary.total >= 10 && summary.humanOnly >= 2 && summary.staleOrConflicting >= 1) {
    pass('workday:answer_bank', `loaded ${summary.total} entries; humanOnly=${summary.humanOnly}; conflicts=${summary.staleOrConflicting}.`);
  } else {
    fail('workday:answer_bank', `answer bank is incomplete: ${JSON.stringify(summary)}.`);
  }

  const profileDir = path.join(root, '.career-os-browser-worker', 'chrome-profile');
  fs.mkdirSync(profileDir, { recursive: true });
  pass('workday:browser_profile', 'Controlled browser profile directory is present.');

  const mode = clean(process.env.CAREER_OS_EXECUTION_MODE);
  if (mode === 'workday_single_canary' && clean(process.env.CAREER_OS_WORKDAY_SUBMIT_APPROVAL)) {
    warn('workday:submit_approval', 'CAREER_OS_WORKDAY_SUBMIT_APPROVAL is configured; confirm it matches the current review fingerprint before running.');
  } else {
    pass('workday:submit_approval', 'No Workday submit approval token is active.');
  }

  if (!workdayObserveModeEnabled(process.env)) {
    pass('workday:observe_mode', 'CAREER_OS_WORKDAY_OBSERVE_MODE is disabled by default.');
  } else {
    const validation = validateWorkdayObservationBounds({
      canaryId: clean(process.env.CAREER_OS_WORKDAY_CANARY_ID || process.env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID),
      env: process.env,
      url: clean(process.env.CAREER_OS_WORKDAY_CANARY_URL),
    });
    if (validation.ok) {
      pass('workday:observe_mode', `bounded to tenant=${validation.details.workdayIdentity.tenant} jobId=${validation.details.workdayIdentity.jobId}.`);
    } else {
      fail('workday:observe_mode', validation.reason);
    }
  }
}

async function checkBrowserTooling() {
  const executablePath = chromium.executablePath();
  if (fs.existsSync(executablePath)) pass('browser_tooling', 'Playwright Chromium executable is present.');
  else fail('browser_tooling', 'Playwright Chromium executable is missing.');
}

function checkDuplicateLockFiles() {
  const file = path.join(root, 'lib/career-os-duplicate-lock.ts');
  if (!fs.existsSync(file)) {
    fail('duplicate_lock', 'lib/career-os-duplicate-lock.ts is missing.');
    return;
  }
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('duplicateSubmissionMatch') && source.includes('terminalLockPatch')) {
    pass('duplicate_lock', 'Duplicate and terminal submission lock helpers are present.');
  } else {
    fail('duplicate_lock', 'Duplicate lock helpers are incomplete.');
  }
}

async function checkEvidenceDirectory() {
  const dir = path.join(root, '.career-os-browser-worker', 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.health-${process.pid}.tmp`);
  fs.writeFileSync(probe, 'ok', 'utf8');
  fs.unlinkSync(probe);
  pass('evidence_directory', 'Screenshot evidence directory is writable.');
}

async function checkOptionalWorkerEndpoint() {
  const token = clean(process.env.CAREER_OS_BROWSER_WORKER_TOKEN);
  const baseUrl = clean(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL);
  if (!token || !baseUrl) return;
  try {
    const response = await fetch(new URL('/api/career-os/worker/health', baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      warn('queue_status_read_safe', `worker health endpoint returned ${response.status}; local checks still passed.`);
      return;
    }
    const json = await response.json();
    pass('queue_status_read_safe', `worker health endpoint responded ok=${Boolean(json.ok)}.`);
    if (clean(json.production?.executionMode) === 'workday_single_canary' && Number(json.eligible || 0) > 1) {
      warn('queue_status_single_canary', `worker endpoint reports ${json.eligible} eligible task(s); Workday claim gate still requires one exact canary.`);
    } else if (clean(json.production?.executionMode) === 'workday_first_submit') {
      pass('queue_status_workday_first', 'Worker endpoint reports Workday-first execution mode.');
    } else {
      pass('queue_status_single_canary', 'No multi-task Workday canary warning from worker health.');
    }
  } catch (error) {
    warn('queue_status_read_safe', `worker health endpoint is not reachable locally: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
}

function pass(name, detail) {
  checks.push({ name, status: 'pass', detail });
}

function warn(name, detail) {
  checks.push({ name, status: 'warn', detail });
}

function fail(name, detail) {
  checks.push({ name, status: 'fail', detail });
}

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

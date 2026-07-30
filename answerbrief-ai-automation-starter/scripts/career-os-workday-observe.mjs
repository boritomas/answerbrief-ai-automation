#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  attachToActiveWorkdayObservation,
  defaultObservationArtifactDir,
  defaultWorkdayObservationCanaryId,
  startWorkdayObservationSession,
  validateWorkdayObservationBounds,
  workdayObserveModeEnabled,
} from './lib/career-os-workday-observation.mjs';
import { parseWorkdayJobUrl } from './lib/career-os-workday-production.mjs';

const root = process.cwd();
loadDotEnv(path.join(root, '.env.local'));

const command = process.argv[2] || 'help';
const args = parseArgs(process.argv.slice(3));

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'status') {
  const status = observationStatus(args);
  printJson(status);
  process.exit(status.ok ? 0 : 1);
}

if (command === 'prepare') {
  const prepared = prepareObservation(args);
  printJson(prepared);
  process.exit(prepared.ok ? 0 : 1);
}

if (command === 'run') {
  const result = await runObservation(args);
  printJson(result);
  process.exit(result.ok ? 0 : 1);
}

if (command === 'attach-active') {
  const result = await attachActiveObservation(args);
  printJson(result);
  process.exit(result.ok ? 0 : 1);
}

console.error(`Unsupported command: ${command}`);
printHelp();
process.exit(1);

function observationStatus(input = {}) {
  const url = clean(input.url || input._?.[0] || process.env.CAREER_OS_WORKDAY_CANARY_URL);
  const canaryId = clean(input.canaryId || input['canary-id'] || process.env.CAREER_OS_WORKDAY_CANARY_ID || process.env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
  const parsed = url ? parseWorkdayJobUrl(url) : null;
  const validation = url && canaryId
    ? validateWorkdayObservationBounds({
      canaryId,
      env: process.env,
      requireMode: false,
      requireConfiguredUrl: false,
      url,
      approvedOrigins: parsed?.ok ? [new URL(parsed.canonicalUrl).origin] : [],
    })
    : null;
  return {
    ok: true,
    observeModeEnabled: workdayObserveModeEnabled(process.env),
    disabledByDefault: !workdayObserveModeEnabled({}),
    queueEnabled: clean(process.env.CAREER_OS_QUEUE_ENABLED) === '1',
    canaryIdConfigured: Boolean(canaryId),
    urlConfigured: Boolean(url),
    workdayIdentity: parsed?.ok ? publicIdentity(parsed) : null,
    validation: validation ? {
      ok: validation.ok,
      reason: validation.reason,
      details: validation.details,
    } : {
      ok: false,
      reason: 'No Workday observation URL and canary id are configured.',
    },
    artifactRoot: path.join(root, '.runtime', 'workday-observations'),
    nextAction: 'Provide one approved Workday URL and enable CAREER_OS_WORKDAY_OBSERVE_MODE=1 before run.',
  };
}

function prepareObservation(input = {}) {
  const url = clean(input.url || input._?.[0]);
  const parsed = parseWorkdayJobUrl(url);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: `Workday observation URL is not qualified: ${parsed.reason}.`,
      url,
    };
  }
  const canaryId = clean(input.canaryId || input['canary-id']) || defaultWorkdayObservationCanaryId(url);
  const validation = validateWorkdayObservationBounds({
    canaryId,
    env: process.env,
    requireMode: false,
    requireConfiguredUrl: false,
    url,
    approvedOrigins: [new URL(parsed.canonicalUrl).origin],
  });
  if (!validation.ok) return validation;
  const artifactDir = clean(input.artifactDir || input['artifact-dir']) || defaultObservationArtifactDir(canaryId, root);
  if (input.write || input['write-artifacts']) fs.mkdirSync(artifactDir, { recursive: true });
  return {
    ok: true,
    reason: 'Workday observation canary is prepared but not started.',
    canaryId,
    artifactDir,
    workdayIdentity: publicIdentity(parsed),
    recommendedEnv: {
      CAREER_OS_WORKDAY_OBSERVE_MODE: '1',
      CAREER_OS_QUEUE_ENABLED: '0',
      CAREER_OS_WORKDAY_CANARY_ID: canaryId,
      CAREER_OS_WORKDAY_CANARY_URL: parsed.canonicalUrl,
      CAREER_OS_WORKDAY_OBSERVE_ALLOWED_ORIGINS: new URL(parsed.canonicalUrl).origin,
    },
    command: `npm run workday:observe -- run --url "${parsed.canonicalUrl}" --canary-id "${canaryId}"`,
    liveSessionStarted: false,
  };
}

async function runObservation(input = {}) {
  const url = clean(input.url || input._?.[0] || process.env.CAREER_OS_WORKDAY_CANARY_URL);
  const canaryId = clean(input.canaryId || input['canary-id'] || process.env.CAREER_OS_WORKDAY_CANARY_ID || process.env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
  const artifactDir = clean(input.artifactDir || input['artifact-dir']) || defaultObservationArtifactDir(canaryId, root);
  const resumePath = clean(input.resumePath || input['resume-path']);
  const resumeArtifactId = clean(input.resumeArtifactId || input['resume-artifact-id']);
  const validation = validateWorkdayObservationBounds({
    canaryId,
    env: process.env,
    url,
  });
  if (!validation.ok) return validation;
  return startWorkdayObservationSession({
    artifactDir,
    browserProfileDir: input.browserProfileDir || input['browser-profile-dir'],
    canaryId,
    company: input.company,
    durationMs: input.durationMs || input['duration-ms'],
    env: process.env,
    headless: input.headless === true || input.headless === 'true',
    pollMs: input.pollMs || input['poll-ms'],
    resume: resumePath || resumeArtifactId ? {
      artifactId: resumeArtifactId,
      runtimePath: resumePath,
    } : null,
    role: input.role,
    url,
  });
}

async function attachActiveObservation(input = {}) {
  const canaryId = clean(input.canaryId || input['canary-id'] || process.env.CAREER_OS_WORKDAY_CANARY_ID || process.env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
  const artifactDir = clean(input.artifactDir || input['artifact-dir']) || defaultObservationArtifactDir(canaryId || 'active-tab-discovery', root);
  const cdpEndpoints = clean(input.cdpEndpoint || input['cdp-endpoint'])
    ? clean(input.cdpEndpoint || input['cdp-endpoint']).split(',').map(clean).filter(Boolean)
    : [];
  return attachToActiveWorkdayObservation({
    artifactDir,
    canaryId,
    cdpEndpoints,
    company: input.company,
    confirmed: input.confirmed === true || input.confirmed === 'true' || input.start === true,
    env: process.env,
    expectedJobId: input.expectedJobId || input['expected-job-id'],
    expectedTenant: input.expectedTenant || input['expected-tenant'],
    pollMs: input.pollMs || input['poll-ms'],
    requireExpectedIdentity: input.requireExpectedIdentity === true || input['require-expected-identity'] === true,
    resume: resumeInput(input),
    role: input.role,
    stopWorkers: input.stopWorkers !== false && input['stop-workers'] !== 'false',
  });
}

function resumeInput(input = {}) {
  const resumePath = clean(input.resumePath || input['resume-path']);
  const resumeArtifactId = clean(input.resumeArtifactId || input['resume-artifact-id']);
  if (!resumePath && !resumeArtifactId) return null;
  return {
    artifactId: resumeArtifactId,
    runtimePath: resumePath,
  };
}

function parseArgs(values) {
  const parsed = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) {
      parsed._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      parsed[rawKey] = inlineValue;
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      parsed[rawKey] = true;
    } else {
      parsed[key] = next;
      parsed[rawKey] = next;
      index += 1;
    }
  }
  return parsed;
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

function publicIdentity(parsed) {
  return {
    canonicalUrl: clean(parsed.canonicalUrl),
    host: clean(parsed.host),
    jobId: clean(parsed.jobId),
    tenant: clean(parsed.tenant),
    vendor: clean(parsed.vendor),
  };
}

function printHelp() {
  console.log(`Career OS Workday observation helper

Usage:
  node scripts/career-os-workday-observe.mjs status
  node scripts/career-os-workday-observe.mjs prepare --url <workday-url> [--canary-id <id>]
  node scripts/career-os-workday-observe.mjs run --url <workday-url> --canary-id <id> [--resume-path <path>] [--resume-artifact-id <id>]
  node scripts/career-os-workday-observe.mjs attach-active --canary-id <id> --expected-tenant <tenant> --expected-job-id <job-id>

run requires CAREER_OS_WORKDAY_OBSERVE_MODE=1, CAREER_OS_QUEUE_ENABLED=0, CAREER_OS_WORKDAY_CANARY_ID,
and CAREER_OS_WORKDAY_CANARY_URL matching the requested tenant/job. attach-active can use the active tab URL after
verification. Observation records committed visible values only; it never presses Submit.`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function clean(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}

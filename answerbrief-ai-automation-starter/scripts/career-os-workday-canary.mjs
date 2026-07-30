#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { parseWorkdayJobUrl } from './lib/career-os-workday-production.mjs';

const root = process.cwd();
loadDotEnv(path.join(root, '.env.local'));

const command = process.argv[2] || 'help';
const args = parseArgs(process.argv.slice(3));

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'inspect-url') {
  const url = args.url || args._[0];
  const parsed = parseWorkdayJobUrl(url);
  printJson({
    ok: parsed.ok,
    reason: parsed.reason || '',
    url: clean(url),
    workdayIdentity: parsed.ok ? publicIdentity(parsed) : null,
  });
  process.exit(parsed.ok ? 0 : 1);
}

if (command === 'intake') {
  const result = await intakeWorkdayCanary(args);
  printJson(result);
  process.exit(result.ok ? 0 : 1);
}

console.error(`Unsupported command: ${command}`);
printHelp();
process.exit(1);

async function intakeWorkdayCanary(input) {
  const url = clean(input.url || input._[0]);
  const parsed = parseWorkdayJobUrl(url);
  if (!parsed.ok) {
    return { ok: false, reason: `Workday URL is not canary-qualified: ${parsed.reason}`, url };
  }
  const ownerEmail = clean(input.ownerEmail || input['owner-email'] || process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
  const canaryId = clean(input.canaryId || input['canary-id']);
  const employer = clean(input.employer);
  const position = clean(input.position);
  const write = Boolean(input.write);
  if (write && (!canaryId || !employer || !position)) {
    return {
      ok: false,
      reason: '--write requires --canary-id, --employer, and --position.',
      workdayIdentity: publicIdentity(parsed),
    };
  }

  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (write && (!supabaseUrl || !serviceRoleKey)) {
    return { ok: false, reason: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --write.' };
  }

  const duplicate = write ? await findDuplicate({ ownerEmail, parsed, serviceRoleKey, supabaseUrl }) : null;
  if (duplicate) {
    return {
      ok: false,
      duplicateApplicationId: duplicate.id,
      reason: 'A Workday application with the same tenant/job already exists.',
      workdayIdentity: publicIdentity(parsed),
    };
  }

  const row = {
    id: canaryId || `workday-canary-${parsed.tenant}-${parsed.jobId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    employer: employer || '(dry-run employer required for --write)',
    lifecycle_stage: 'qualified_pending_application',
    next_action: 'Workday canary URL accepted; queue remains paused until the operator enables workday_single_canary.',
    owner_email: ownerEmail,
    position: position || '(dry-run position required for --write)',
    raw_record: {
      application_url: parsed.canonicalUrl,
      canonical_url: parsed.canonicalUrl,
      execution_mode: 'workday_single_canary',
      fit_score: Number(input.qualificationScore || input['qualification-score'] || 100),
      intake_source: 'career_os_workday_canary_cli',
      platform: parsed.vendor,
      production_execution_mode: 'workday_single_canary',
      workday_canary_id: canaryId || null,
      workday_identity: publicIdentity(parsed),
    },
    updated_at: new Date().toISOString(),
  };

  if (!write) {
    return {
      ok: true,
      dryRun: true,
      reason: 'URL is canary-qualified. Re-run with --write plus --canary-id, --employer, and --position to create the production task.',
      recommendedEnv: {
        CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
        CAREER_OS_WORKDAY_CANARY_ID: row.id,
        CAREER_OS_WORKDAY_CANARY_URL: parsed.canonicalUrl,
      },
      rowPreview: row,
      workdayIdentity: publicIdentity(parsed),
    };
  }

  await postSupabaseApplication({ row, serviceRoleKey, supabaseUrl });
  return {
    ok: true,
    applicationId: row.id,
    dryRun: false,
    recommendedEnv: {
      CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
      CAREER_OS_WORKDAY_CANARY_ID: row.id,
      CAREER_OS_WORKDAY_CANARY_URL: parsed.canonicalUrl,
    },
    workdayIdentity: publicIdentity(parsed),
  };
}

async function findDuplicate({ ownerEmail, parsed, serviceRoleKey, supabaseUrl }) {
  const url = new URL('/rest/v1/career_os_applications', supabaseUrl);
  url.searchParams.set('select', 'id,raw_record');
  url.searchParams.set('owner_email', `eq.${ownerEmail}`);
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', '500');
  const rows = await supabaseFetchJson(url, serviceRoleKey);
  return rows.find((row) => {
    const raw = row.raw_record && typeof row.raw_record === 'object' ? row.raw_record : {};
    const candidate = parseWorkdayJobUrl(clean(raw.application_url || raw.canonical_url || raw.job_url));
    return candidate.ok
      && clean(candidate.tenant).toLowerCase() === clean(parsed.tenant).toLowerCase()
      && clean(candidate.jobId).toLowerCase() === clean(parsed.jobId).toLowerCase();
  });
}

async function postSupabaseApplication({ row, serviceRoleKey, supabaseUrl }) {
  const url = new URL('/rest/v1/career_os_applications', supabaseUrl);
  const response = await fetch(url, {
    body: JSON.stringify(row),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    method: 'POST',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase canary intake failed with ${response.status}: ${text.slice(0, 200)}`);
  }
}

async function supabaseFetchJson(url, serviceRoleKey) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase duplicate check failed with ${response.status}.`);
  return response.json();
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
  console.log(`Career OS Workday canary helper

Usage:
  node scripts/career-os-workday-canary.mjs inspect-url <url>
  node scripts/career-os-workday-canary.mjs intake --url <url> --canary-id <id> --employer <name> --position <title> [--write]

intake is dry-run by default. --write creates one Career OS application row after duplicate tenant/job checks.`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
}

function clean(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}

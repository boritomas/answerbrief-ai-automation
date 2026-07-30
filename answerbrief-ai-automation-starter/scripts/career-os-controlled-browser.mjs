#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  controlledBrowserStatus,
  launchControlledBrowser,
  stopControlledBrowser,
} from './lib/career-os-controlled-browser.mjs';

const root = process.cwd();
loadDotEnv(path.join(root, '.env.local'));

const command = process.argv[2] || 'help';
const args = parseArgs(process.argv.slice(3));

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'launch') {
  const result = await launchControlledBrowser({
    canaryId: args.canaryId || args['canary-id'],
    cdpPort: args.cdpPort || args['cdp-port'],
    executable: args.executable,
    expectedJobId: args.expectedJobId || args['expected-job-id'],
    expectedTenant: args.expectedTenant || args['expected-tenant'],
    profile: args.profile,
    profileDir: args.profileDir || args['profile-dir'],
    root,
    url: args.url || args._?.[0],
  });
  printJson(result);
  process.exit(result.ok ? 0 : 1);
}

if (command === 'status') {
  const result = await controlledBrowserStatus({ root });
  printJson(result);
  process.exit(result.ok ? 0 : 1);
}

if (command === 'stop') {
  const result = await stopControlledBrowser({ root });
  printJson(result);
  process.exit(result.ok ? 0 : 1);
}

console.error(`Unsupported command: ${command}`);
printHelp();
process.exit(1);

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

function printHelp() {
  console.log(`Career OS controlled browser launcher

Usage:
  node scripts/career-os-controlled-browser.mjs launch --cdp-port 9222 --profile career-os --url <approved-workday-url>
  node scripts/career-os-controlled-browser.mjs status
  node scripts/career-os-controlled-browser.mjs stop

launch uses the existing Career OS controlled Chrome profile, exposes CDP only on 127.0.0.1,
opens one approved Workday URL, and records only sanitized runtime state. It never submits applications.`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

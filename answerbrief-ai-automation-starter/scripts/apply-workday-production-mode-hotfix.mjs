#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const target = path.join(process.cwd(), 'lib', 'career-os-browser-worker.ts');
const source = fs.readFileSync(target, 'utf8');

const rejectedBlock = `  if (platform === 'workday' && normalizedMode === 'submit_enabled') {
    return {
      dailyLimit,
      executionMode: normalizedMode,
      ok: false,
      persist: true,
      platform,
      reason: 'Workday submit_enabled is rejected during controlled launch; Workday is assisted/inspect only.',
      status: 'completed_waiting_for_user',
    };
  }

`;

const allowedModesBefore = `    if (!['inspect_only', 'assisted_apply', 'workday_single_canary', 'workday_first_submit'].includes(normalizedMode)) {`;
const allowedModesAfter = `    if (!['inspect_only', 'assisted_apply', 'workday_single_canary', 'workday_first_submit', 'submit_enabled'].includes(normalizedMode)) {`;

let next = source;
if (next.includes(rejectedBlock)) {
  next = next.replace(rejectedBlock, '');
}
if (next.includes(allowedModesBefore)) {
  next = next.replace(allowedModesBefore, allowedModesAfter);
}

if (next.includes('Workday submit_enabled is rejected during controlled launch')) {
  throw new Error('Workday submit_enabled rejection is still present after hotfix.');
}
if (!next.includes(allowedModesAfter)) {
  throw new Error('Workday production-mode allowlist was not updated.');
}

if (next !== source) {
  fs.writeFileSync(target, next, 'utf8');
  console.log('Applied Workday production-mode hotfix.');
} else {
  console.log('Workday production-mode hotfix already applied.');
}

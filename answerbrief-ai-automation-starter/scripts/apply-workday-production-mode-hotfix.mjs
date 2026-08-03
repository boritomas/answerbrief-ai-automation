#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const target = path.join(process.cwd(), 'lib', 'career-os-browser-worker.ts');
const source = fs.readFileSync(target, 'utf8');

const rejectedBlockPattern = /\n[ \t]*if\s*\(platform\s*===\s*['"]workday['"]\s*&&\s*normalizedMode\s*===\s*['"]submit_enabled['"]\)\s*\{[\s\S]*?Workday submit_enabled is rejected during controlled launch[\s\S]*?\n[ \t]*\}\n/m;
const allowedModesBeforePattern = /\['inspect_only',\s*'assisted_apply',\s*'workday_single_canary',\s*'workday_first_submit'\]/g;
const allowedModesAfter = "['inspect_only', 'assisted_apply', 'workday_single_canary', 'workday_first_submit', 'submit_enabled']";

let next = source.replace(rejectedBlockPattern, '\n');
next = next.replace(allowedModesBeforePattern, allowedModesAfter);

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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const queuePath = path.resolve(here, '../lib/career-os-queue.ts');
let source = fs.readFileSync(queuePath, 'utf8');

for (const overlyBroadHumanTerm of [
  "  'captcha',\n",
  "  'account',\n",
  "  'workday',\n",
]) {
  source = source.replace(overlyBroadHumanTerm, '');
}

const anchor = `const TECHNICAL_BLOCKER_TERMS = [\n  'technical blocker',\n  'technical failure',\n`;
const replacement = `const TECHNICAL_BLOCKER_TERMS = [\n  'technical blocker',\n  'technical failure',\n  'unsupported browser or ats operation',\n  'unsupported browser operation',\n  'unsupported ats operation',\n  'selector not found',\n  'navigation timeout',\n  'browser timeout',\n  'resume upload failure',\n  'file picker',\n`;

if (!source.includes("'unsupported browser or ats operation'")) {
  if (!source.includes(anchor)) {
    throw new Error('Career OS blocker hotfix anchor was not found.');
  }
  source = source.replace(anchor, replacement);
}

fs.writeFileSync(queuePath, source);
console.log('Career OS blocker classification hotfix applied.');

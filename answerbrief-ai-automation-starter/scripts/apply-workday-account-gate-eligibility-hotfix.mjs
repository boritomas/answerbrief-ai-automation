import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const target = path.resolve(__dirname, '../lib/career-os-browser-worker.ts');
const source = fs.readFileSync(target, 'utf8');

const marker = "  const executionStatus = cleanEnv(raw.execution_status).toLowerCase();\n";
const insertion = `${marker}  if (isWorkdayAuthorizedAccountGate(application) && hasResumeOrPackage(application) && !isTerminalSubmission(application)) return true;\n`;

if (source.includes(insertion)) {
  process.exit(0);
}

if (!source.includes(marker)) {
  throw new Error('Workday account-gate eligibility hotfix anchor was not found.');
}

fs.writeFileSync(target, source.replace(marker, insertion));
console.log('Applied Workday account-gate eligibility hotfix.');

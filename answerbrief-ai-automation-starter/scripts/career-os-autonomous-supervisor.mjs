#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const runId = process.env.GITHUB_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
const evidenceDir = path.join(root, '.career-os-ci', runId, 'supervisor');
const maxAttempts = Math.max(1, Math.min(Number(process.env.CAREER_OS_SUPERVISOR_MAX_ATTEMPTS || 3), 3));
const autoRepair = process.env.CAREER_OS_AUTO_REPAIR !== '0';

fs.mkdirSync(evidenceDir, { recursive: true });

function run(name, command, args = [], options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    timeout: options.timeout || 20 * 60 * 1000,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const record = {
    name,
    command: [command, ...args],
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.status,
    signal: result.signal,
    error: result.error?.message || '',
  };
  fs.writeFileSync(path.join(evidenceDir, `${name}.json`), JSON.stringify(record, null, 2));
  fs.writeFileSync(path.join(evidenceDir, `${name}.log`), `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return { ok: result.status === 0 && !result.error, stdout, stderr, record };
}

function collectArtifacts() {
  const candidates = [
    '.career-os-browser-worker',
    'playwright-report',
    'test-results',
    'career-os-production-report.md',
  ];
  const index = [];
  for (const candidate of candidates) {
    const absolute = path.join(root, candidate);
    if (fs.existsSync(absolute)) index.push(absolute);
  }
  fs.writeFileSync(path.join(evidenceDir, 'artifact-index.json'), JSON.stringify(index, null, 2));
}

function repairTask(attempt, workerResult, healthResult) {
  const combined = [healthResult.stdout, healthResult.stderr, workerResult.stdout, workerResult.stderr]
    .filter(Boolean)
    .join('\n')
    .slice(-18000);
  return [
    'Career OS production canary failed.',
    `Attempt: ${attempt} of ${maxAttempts}.`,
    'Diagnose and repair the smallest verified code or configuration defect in this repository.',
    'Do not weaken CAPTCHA, MFA, identity, legal, duplicate, compensation, or confirmation-email safeguards.',
    'Run targeted validation after the repair. Do not redesign architecture or add unrelated features.',
    'Failure evidence follows:',
    combined,
  ].join('\n\n');
}

function main() {
  const journal = {
    objective: 'Complete one controlled Career OS production canary with evidence.',
    runId,
    startedAt: new Date().toISOString(),
    maxAttempts,
    autoRepair,
    attempts: [],
  };

  const preflight = run('00-preflight', 'npm', ['run', 'health:career-os']);
  if (!preflight.ok) {
    journal.outcome = 'preflight_failed';
    journal.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidenceDir, 'journal.json'), JSON.stringify(journal, null, 2));
    process.exit(1);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const health = run(`${attempt}-health-before`, 'npm', ['run', 'worker:health']);
    const worker = run(`${attempt}-worker-run-once`, 'npm', ['run', 'worker:run-once'], {
      env: {
        CAREER_OS_DAILY_LIMIT: '1',
        CAREER_OS_DEBUG_CLAIM: '1',
      },
      timeout: 30 * 60 * 1000,
    });
    const report = run(`${attempt}-production-report`, 'npm', ['run', 'report:career-os']);
    collectArtifacts();

    journal.attempts.push({
      attempt,
      healthOk: health.ok,
      workerOk: worker.ok,
      reportOk: report.ok,
      at: new Date().toISOString(),
    });

    if (worker.ok && report.ok) {
      journal.outcome = 'canary_completed';
      journal.finishedAt = new Date().toISOString();
      fs.writeFileSync(path.join(evidenceDir, 'journal.json'), JSON.stringify(journal, null, 2));
      process.exit(0);
    }

    if (!autoRepair || attempt === maxAttempts) break;

    const taskPath = path.join(evidenceDir, `${attempt}-repair-task.txt`);
    fs.writeFileSync(taskPath, repairTask(attempt, worker, health));
    const repair = run(`${attempt}-auto-repair`, 'npm', ['run', 'executor', '--', '--task-file', taskPath], {
      env: {
        ANSWERBRIEF_EXECUTOR_AUTO_MERGE: '0',
        ANSWERBRIEF_EXECUTOR_SKIP_VALIDATION: '0',
      },
      timeout: 40 * 60 * 1000,
    });
    journal.attempts[journal.attempts.length - 1].repairOk = repair.ok;
    if (!repair.ok) break;
  }

  journal.outcome = 'blocked_after_retries';
  journal.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, 'journal.json'), JSON.stringify(journal, null, 2));
  process.exit(1);
}

try {
  main();
} catch (error) {
  fs.writeFileSync(path.join(evidenceDir, 'fatal-error.txt'), error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}

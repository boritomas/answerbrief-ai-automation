#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildProviderCommand,
  createDeveloperAgentConfig,
  providerDefinitions,
  selectAvailableProvider,
} from './lib/career-os-developer-agent.mjs';

const FULL_CAPABILITIES = {
  writeFiles: true,
  createBranch: true,
  commit: true,
  push: true,
  openPullRequest: true,
  triggerCi: true,
  inspectCi: true,
};

function executableExists(binary) {
  const result = spawnSync('sh', ['-lc', `command -v ${binary}`], { encoding: 'utf8' });
  return result.status === 0;
}

function parseArgs(argv) {
  const args = { dryRun: false, provider: '', task: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run') args.dryRun = true;
    else if (value === '--provider') args.provider = argv[++index] || '';
    else if (value === '--task-file') args.taskFile = argv[++index] || '';
    else if (!value.startsWith('--')) args.task = [args.task, value].filter(Boolean).join(' ');
  }
  return args;
}

function resolveTask(args) {
  if (args.taskFile) return fs.readFileSync(path.resolve(args.taskFile), 'utf8').trim();
  return (args.task || process.env.ANSWERBRIEF_EXECUTOR_TASK || '').trim();
}

function detectAvailability() {
  const definitions = providerDefinitions();
  return Object.fromEntries(
    Object.entries(definitions).map(([provider, definition]) => [
      provider,
      definition.binaries.some(executableExists),
    ]),
  );
}

function run(command, options = {}) {
  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: options.cwd || process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary} exited with status ${result.status}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const task = resolveTask(args);
  if (!task) {
    console.error('Usage: npm run executor -- "Fix the issue" [--provider openhands] [--dry-run]');
    process.exit(2);
  }

  const availability = detectAvailability();
  const preferred = (process.env.ANSWERBRIEF_EXECUTOR_PROVIDER_ORDER || 'openhands,aider,opencode,gemini,claude-code,codex')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const selectedProvider = args.provider || selectAvailableProvider(availability, preferred);

  if (!selectedProvider) {
    console.error(JSON.stringify({
      ok: false,
      status: 'hard_blocker',
      reason: 'No supported execution provider is installed.',
      availability,
    }, null, 2));
    process.exit(3);
  }

  const config = createDeveloperAgentConfig({
    provider: selectedProvider,
    repository: process.env.ANSWERBRIEF_EXECUTOR_REPOSITORY || 'boritomas/answerbrief-ai-automation',
    capabilities: FULL_CAPABILITIES,
    requireHumanMerge: process.env.ANSWERBRIEF_EXECUTOR_AUTO_MERGE !== '1',
    validateCommand: process.env.ANSWERBRIEF_EXECUTOR_VALIDATE || 'npm run typecheck && npm run lint && npm test && npm run build',
  });
  const command = buildProviderCommand(config, task);

  console.log(JSON.stringify({
    ok: true,
    status: args.dryRun ? 'dry_run' : 'executing',
    provider: selectedProvider,
    availability,
    repository: config.repository,
    command: [command[0], ...command.slice(1).map((value, index) => index === command.length - 2 ? '<task>' : value)],
  }, null, 2));

  if (args.dryRun) return;

  run(command);

  if (process.env.ANSWERBRIEF_EXECUTOR_SKIP_VALIDATION !== '1') {
    run(['sh', '-lc', config.commands.validate]);
  }

  console.log(JSON.stringify({
    ok: true,
    status: 'completed',
    provider: selectedProvider,
    validation: process.env.ANSWERBRIEF_EXECUTOR_SKIP_VALIDATION === '1' ? 'skipped' : 'passed',
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    status: 'failed',
    message: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}

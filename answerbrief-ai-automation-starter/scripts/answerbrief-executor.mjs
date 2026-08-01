#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildProviderCommand,
  createDeveloperAgentConfig,
  providerDefinitions,
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

const DEFAULT_PROVIDER_ORDER = 'openhands,gemini,opencode,aider,claude-code,codex';

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

function providerOrder(args, availability) {
  const requested = args.provider ? [args.provider] : [];
  const configured = (process.env.ANSWERBRIEF_EXECUTOR_PROVIDER_ORDER || DEFAULT_PROVIDER_ORDER)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const known = Object.keys(providerDefinitions());
  const ordered = [...requested, ...configured, ...known];
  return [...new Set(ordered)].filter((provider) => availability[provider] === true);
}

function execute(command) {
  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) return { ok: false, message: result.error.message };
  if (result.status !== 0) return { ok: false, message: `${binary} exited with status ${result.status}` };
  return { ok: true, message: '' };
}

function configFor(provider) {
  return createDeveloperAgentConfig({
    provider,
    repository: process.env.ANSWERBRIEF_EXECUTOR_REPOSITORY || 'boritomas/answerbrief-ai-automation',
    capabilities: FULL_CAPABILITIES,
    requireHumanMerge: process.env.ANSWERBRIEF_EXECUTOR_AUTO_MERGE !== '1',
    validateCommand: process.env.ANSWERBRIEF_EXECUTOR_VALIDATE || 'npm run typecheck && npm run lint && npm test && npm run build',
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const task = resolveTask(args);
  if (!task) {
    console.error('Usage: npm run executor -- "Fix the issue" [--provider openhands] [--dry-run]');
    process.exit(2);
  }

  const availability = detectAvailability();
  const providers = providerOrder(args, availability);

  if (!providers.length) {
    console.error(JSON.stringify({
      ok: false,
      status: 'hard_blocker',
      reason: 'No supported execution provider is installed.',
      availability,
    }, null, 2));
    process.exit(3);
  }

  if (args.dryRun) {
    const provider = providers[0];
    const command = buildProviderCommand(configFor(provider), task);
    console.log(JSON.stringify({
      ok: true,
      status: 'dry_run',
      provider,
      fallbackOrder: providers,
      availability,
      command: [command[0], ...command.slice(1).map((value) => value === task ? '<task>' : value)],
    }, null, 2));
    return;
  }

  const failures = [];
  let completedProvider = '';
  let completedConfig = null;

  for (const provider of providers) {
    const config = configFor(provider);
    const command = buildProviderCommand(config, task);
    console.log(JSON.stringify({
      ok: true,
      status: 'executing',
      provider,
      fallbackOrder: providers,
      repository: config.repository,
    }, null, 2));

    const result = execute(command);
    if (result.ok) {
      completedProvider = provider;
      completedConfig = config;
      break;
    }

    failures.push({ provider, message: result.message });
    console.error(JSON.stringify({
      ok: false,
      status: 'provider_failed_trying_fallback',
      provider,
      message: result.message,
    }, null, 2));
  }

  if (!completedProvider || !completedConfig) {
    console.error(JSON.stringify({
      ok: false,
      status: 'failed',
      message: 'Every available execution provider failed.',
      failures,
    }, null, 2));
    process.exit(1);
  }

  if (process.env.ANSWERBRIEF_EXECUTOR_SKIP_VALIDATION !== '1') {
    const validation = execute(['sh', '-lc', completedConfig.commands.validate]);
    if (!validation.ok) {
      console.error(JSON.stringify({
        ok: false,
        status: 'validation_failed',
        provider: completedProvider,
        message: validation.message,
      }, null, 2));
      process.exit(1);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    status: 'completed',
    provider: completedProvider,
    attemptedProviders: [...failures.map(({ provider }) => provider), completedProvider],
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

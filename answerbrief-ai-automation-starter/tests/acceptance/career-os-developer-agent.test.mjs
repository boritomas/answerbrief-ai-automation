import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProviderCommand, createDeveloperAgentConfig, developerAgentPreflight } from '../../scripts/lib/career-os-developer-agent.mjs';

const fullCapabilities = {
  writeFiles: true,
  createBranch: true,
  commit: true,
  push: true,
  openPullRequest: true,
  triggerCi: true,
  inspectCi: true,
};

test('preflight blocks agents without verifiable execution capabilities', () => {
  const result = developerAgentPreflight({ writeFiles: true });
  assert.equal(result.ready, false);
  assert.equal(result.status, 'hard_blocker');
  assert.ok(result.missing.includes('push'));
});

test('creates a human-gated OpenHands configuration', () => {
  const config = createDeveloperAgentConfig({
    provider: 'openhands',
    repository: 'boritomas/answerbrief-ai-automation',
    capabilities: fullCapabilities,
  });
  assert.equal(config.preflight.ready, true);
  assert.equal(config.requireHumanMerge, true);
  assert.deepEqual(buildProviderCommand(config, 'Implement the approved issue'), ['openhands', '--task', 'Implement the approved issue']);
});

test('supports Aider as a secondary provider', () => {
  const config = createDeveloperAgentConfig({ provider: 'aider', capabilities: fullCapabilities });
  assert.deepEqual(buildProviderCommand(config, 'Fix the failing test'), ['aider', '--yes-always', '--message', 'Fix the failing test']);
});

test('rejects unsupported providers', () => {
  assert.throws(() => createDeveloperAgentConfig({ provider: 'unknown', capabilities: fullCapabilities }), /Unsupported developer agent provider/);
});

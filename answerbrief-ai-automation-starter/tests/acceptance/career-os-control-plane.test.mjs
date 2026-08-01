import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('MCP control plane exposes only bounded CareerOS tools', () => {
  const source = read('scripts/career-os-mcp-server.mjs');
  const required = [
    'career_os_health',
    'career_os_worker_health',
    'career_os_run_canary',
    'career_os_latest_report',
    'career_os_list_evidence',
    'career_os_sync_main',
  ];
  for (const tool of required) assert.match(source, new RegExp(`registerTool\\('${tool}'`));
  assert.match(source, /const allowed = new Set\(\['npm', 'git', 'node'\]\)/);
  assert.match(source, /CAREER_OS_MCP_TOKEN must be set/);
  assert.match(source, /127\.0\.0\.1/);
});

test('OpenHands is the first repair provider', () => {
  const executor = read('scripts/answerbrief-executor.mjs');
  const workflow = read('../.github/workflows/career-os-mac-production.yml');
  assert.match(executor, /openhands,gemini,opencode,aider,claude-code,codex/);
  assert.match(workflow, /ANSWERBRIEF_EXECUTOR_PROVIDER_ORDER: openhands,gemini,opencode,aider,claude-code,codex/);
});

test('Mac installer activates runner, control plane, and OpenHands integration', () => {
  const installer = read('../INSTALL_CAREER_OS_RUNNER.command');
  assert.match(installer, /bootstrap-career-os-mac-runner\.sh/);
  assert.match(installer, /install-career-os-control-plane\.sh/);
  assert.match(installer, /CareerOS-Control-Plane\.txt/);
  assert.match(installer, /openhands/);
});

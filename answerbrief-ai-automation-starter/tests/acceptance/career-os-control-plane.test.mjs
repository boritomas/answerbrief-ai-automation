import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

function findRepositoryRoot(start = root) {
  const candidates = [
    process.env.GITHUB_WORKSPACE,
    start,
    path.resolve(start, '..'),
    path.resolve(start, '../..'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, '.github', 'workflows', 'career-os-mac-production.yml'))) {
      return candidate;
    }
  }
  return start;
}

const repositoryRoot = findRepositoryRoot();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readRepositoryFile = (relative) => fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

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
  const workflow = readRepositoryFile('.github/workflows/career-os-mac-production.yml');
  assert.match(executor, /openhands,gemini,opencode,aider,claude-code,codex/);
  assert.match(workflow, /ANSWERBRIEF_EXECUTOR_PROVIDER_ORDER: openhands,gemini,opencode,aider,claude-code,codex/);
});

test('browser companion refreshes GitHub OIDC tokens during retries', () => {
  const companion = read('scripts/career-os-browser-companion.mjs');
  assert.match(companion, /currentGitHubActionsOidcToken/);
  assert.match(companion, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(companion, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(companion, /response\.status === 401/);
  assert.match(companion, /githubOidcTokenCache = \{ value: '', expiresAtMs: 0 \}/);
});

test('approved queue dispatch config is checked before queue mutation', () => {
  const route = read('app/api/career-os/run-approved-queue/route.ts');
  assert.match(route, /resolveApprovedQueueDispatchConfig/);
  assert.match(route, /Mac runner dispatch is not configured/);
  assert.ok(
    route.indexOf('const dispatchConfig = resolveApprovedQueueDispatchConfig();')
      < route.indexOf('const queueResult = await processCareerOsQueue'),
  );
});

test('Mac installer activates runner, control plane, and OpenHands integration', () => {
  const installer = readRepositoryFile('INSTALL_CAREER_OS_RUNNER.command');
  assert.match(installer, /bootstrap-career-os-mac-runner\.sh/);
  assert.match(installer, /install-career-os-control-plane\.sh/);
  assert.match(installer, /CareerOS-Control-Plane\.txt/);
  assert.match(installer, /openhands/);
});

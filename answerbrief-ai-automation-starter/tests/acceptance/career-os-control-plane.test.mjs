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

test('approved queue workflow acquires GitHub OIDC worker token', () => {
  const workflow = readRepositoryFile('.github/workflows/career-os-approved-queue.yml');
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /Acquire GitHub OIDC worker token/);
  assert.match(workflow, /answerbrief-career-os/);
  assert.match(workflow, /CAREER_OS_BROWSER_WORKER_TOKEN=\$token/);
});

test('approved queue workflow drains with the batch worker', () => {
  const workflow = readRepositoryFile('.github/workflows/career-os-approved-queue.yml');
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(
    packageJson.scripts['worker:run-batch'],
    'node ./scripts/career-os-browser-companion.mjs run-batch',
  );
  assert.match(workflow, /npm run worker:run-batch -- --limit "\$limit"/);
  assert.match(workflow, /approved-queue-worker-batch\.log/);
  assert.doesNotMatch(workflow, /npm run supervisor 2>&1 \| tee "\.career-os-ci\/\$\{GITHUB_RUN_ID\}\/approved-queue-supervisor\.log"/);
});

test('browser companion forwards Greenhouse canary authorization into claims', () => {
  const route = read('app/api/career-os/worker/claim/route.ts');
  const companion = read('scripts/career-os-browser-companion.mjs');
  const worker = read('lib/career-os-browser-worker.ts');
  for (const source of [route, companion, worker]) {
    assert.match(source, /greenhouseCanaryApplicationId/);
    assert.match(source, /greenhouseSubmitAuthorized/);
    assert.match(source, /productionExecutionMode/);
  }
  assert.match(companion, /CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID/);
  assert.match(companion, /CAREER_OS_GREENHOUSE_SUBMIT_AUTHORIZATION \|\| process\.env\.CAREER_OS_SUBMIT_RUN_AUTHORIZATION/);
  assert.match(worker, /productionExecutionMode\(overrides\)/);
  assert.match(worker, /isGreenhouseSubmitCanaryConfiguredFor\(application, overrides\)/);
  assert.match(worker, /if \(isGreenhouseSubmitCanaryConfiguredFor\(application as QueueApplication, overrides\)\) return 'queued';/);
});

test('Mac canary reports no eligible applications without failing infrastructure checks', () => {
  const workflow = readRepositoryFile('.github/workflows/career-os-mac-production.yml');
  const supervisor = read('scripts/career-os-autonomous-supervisor.mjs');
  assert.match(workflow, /no_eligible_canary_after_refresh/);
  assert.match(workflow, /No browser-worker eligible application is currently claimable/);
  assert.match(supervisor, /canary_task_executed_report_unavailable/);
  assert.match(supervisor, /worker\.ok && claimed === true/);
});

test('approved queue workflow can restore runtime env after a Mac reboot', () => {
  const workflow = readRepositoryFile('.github/workflows/career-os-approved-queue.yml');
  assert.match(workflow, /Canonical Career OS runtime environment file restored from GitHub secrets/);
  assert.match(workflow, /printf 'APP_BASE_URL=%s\\n'/);
  assert.match(workflow, /printf 'SUPABASE_SERVICE_ROLE_KEY=%s\\n'/);
});

test('approved queue dashboard labels batch and one-off actions distinctly', () => {
  const controls = read('app/founder-dashboard/founder-run-controls.tsx');
  assert.match(controls, /Start Approved Queue Run/);
  assert.match(controls, /Run Next Eligible Application/);
  assert.doesNotMatch(controls, /Process \$\{approvedCount\} Approved Application/);
});

test('Mac installer activates runner, control plane, and OpenHands integration', () => {
  const installer = readRepositoryFile('INSTALL_CAREER_OS_RUNNER.command');
  assert.match(installer, /bootstrap-career-os-mac-runner\.sh/);
  assert.match(installer, /install-career-os-control-plane\.sh/);
  assert.match(installer, /CareerOS-Control-Plane\.txt/);
  assert.match(installer, /openhands/);
});

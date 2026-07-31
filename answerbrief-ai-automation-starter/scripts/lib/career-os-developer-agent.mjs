const PROVIDERS = new Set(['openhands', 'aider', 'codex', 'claude-code']);

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function developerAgentPreflight(capabilities = {}) {
  const required = ['writeFiles', 'createBranch', 'commit', 'push', 'openPullRequest', 'triggerCi', 'inspectCi'];
  const missing = required.filter((name) => capabilities[name] !== true);
  return {
    ready: missing.length === 0,
    missing,
    status: missing.length ? 'hard_blocker' : 'ready',
  };
}

export function createDeveloperAgentConfig(input = {}) {
  const provider = clean(input.provider).toLowerCase();
  if (!PROVIDERS.has(provider)) throw new Error(`Unsupported developer agent provider: ${provider || 'empty'}`);

  const preflight = developerAgentPreflight(input.capabilities);
  return {
    provider,
    repository: clean(input.repository),
    branchPrefix: clean(input.branchPrefix) || 'agent/',
    requireHumanMerge: input.requireHumanMerge !== false,
    preflight,
    commands: {
      validate: clean(input.validateCommand) || 'npm run typecheck && npm run lint && npm test && npm run build',
    },
  };
}

export function buildProviderCommand(config, task) {
  const prompt = clean(task);
  if (!prompt) throw new Error('Developer agent task is required.');
  if (!config?.preflight?.ready) throw new Error(`Developer agent preflight failed: ${(config?.preflight?.missing || []).join(', ')}`);

  if (config.provider === 'aider') return ['aider', '--yes-always', '--message', prompt];
  if (config.provider === 'openhands') return ['openhands', '--task', prompt];
  if (config.provider === 'codex') return ['codex', 'exec', prompt];
  return ['claude', '--print', prompt];
}

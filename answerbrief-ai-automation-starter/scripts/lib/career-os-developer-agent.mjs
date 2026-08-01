const PROVIDER_DEFINITIONS = {
  openhands: { binaries: ['openhands'], priority: 10 },
  aider: { binaries: ['aider'], priority: 20 },
  opencode: { binaries: ['opencode'], priority: 30 },
  gemini: { binaries: ['gemini', 'npx'], priority: 40 },
  'claude-code': { binaries: ['claude'], priority: 50 },
  codex: { binaries: ['codex'], priority: 60 },
};

const PROVIDERS = new Set(Object.keys(PROVIDER_DEFINITIONS));

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

export function providerDefinitions() {
  return structuredClone(PROVIDER_DEFINITIONS);
}

export function selectAvailableProvider(availability = {}, preferred = []) {
  const ordered = [
    ...preferred.map((value) => clean(value).toLowerCase()),
    ...Object.entries(PROVIDER_DEFINITIONS)
      .sort((left, right) => left[1].priority - right[1].priority)
      .map(([name]) => name),
  ];
  const seen = new Set();
  for (const provider of ordered) {
    if (seen.has(provider) || !PROVIDERS.has(provider)) continue;
    seen.add(provider);
    if (availability[provider] === true) return provider;
  }
  return '';
}

export function buildProviderCommand(config, task) {
  const prompt = clean(task);
  if (!prompt) throw new Error('Developer agent task is required.');
  if (!config?.preflight?.ready) throw new Error(`Developer agent preflight failed: ${(config?.preflight?.missing || []).join(', ')}`);

  if (config.provider === 'aider') return ['aider', '--yes-always', '--message', prompt];
  if (config.provider === 'openhands') return ['openhands', '--headless', '--json', '--exit-without-confirmation', '-t', prompt];
  if (config.provider === 'opencode') return ['opencode', 'run', prompt];
  if (config.provider === 'gemini') return ['npx', '-y', '@google/gemini-cli', '--yolo', '--prompt', prompt];
  if (config.provider === 'codex') return ['codex', 'exec', prompt];
  return ['claude', '--print', prompt];
}

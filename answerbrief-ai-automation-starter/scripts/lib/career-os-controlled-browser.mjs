import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { discoverActiveWorkdayApplicationTab } from './career-os-workday-observation.mjs';
import { parseWorkdayJobUrl } from './career-os-workday-production.mjs';

const execFileAsync = promisify(execFile);

export const CONTROLLED_BROWSER_STATE_FILE = 'controlled-browser-state.json';
export const CONTROLLED_BROWSER_STATUSES = [
  'CONTROLLED BROWSER READY — SIGN-IN REQUIRED',
  'CONTROLLED BROWSER READY — WORKDAY APPLICATION OPEN',
  'PROFILE NOT FOUND',
  'CDP LAUNCH FAILED',
  'WRONG TENANT',
  'WRONG JOB',
  'BLOCKED',
];

const PROFILE_MARKER_FILES = ['Local State', 'First Run'];
const PROFILE_MARKER_DIRS = ['Default', 'Profile 1'];
const AUTH_URL_PATTERN = /sign.?in|log.?in|login|account|auth|verify|verification|password|candidate/i;

export function defaultControlledBrowserStateDir(root = process.cwd()) {
  return path.join(root, '.career-os-browser-worker');
}

export function defaultControlledBrowserProfileDir(root = process.cwd()) {
  return path.join(defaultControlledBrowserStateDir(root), 'chrome-profile');
}

export function controlledBrowserStatePath(root = process.cwd(), stateDir = defaultControlledBrowserStateDir(root)) {
  return path.join(stateDir, CONTROLLED_BROWSER_STATE_FILE);
}

export function sanitizeRuntimeUrl(value = '') {
  const raw = clean(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/token|code|state|session|auth|secret|credential|password|otp/i.test(key)) {
        parsed.searchParams.set(key, '[redacted]');
      }
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw.replace(/([?&](?:token|code|state|session|auth|secret|credential|password|otp)=)[^&#\s]+/gi, '$1[redacted]');
  }
}

export function isLocalhostCdpEndpoint(value = '') {
  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function findControlledBrowserProfileCandidates(root = process.cwd(), stateDir = defaultControlledBrowserStateDir(root)) {
  if (!fs.existsSync(stateDir)) return [];
  return fs.readdirSync(stateDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(stateDir, entry.name))
    .filter((candidate) => looksLikeChromeProfile(candidate))
    .map((candidate) => ({
      path: candidate,
      name: path.basename(candidate),
      approvedCareerOsProfile: isPathInside(candidate, stateDir),
    }));
}

export function resolveControlledBrowserProfile(input = {}) {
  const root = input.root || process.cwd();
  const stateDir = input.stateDir || defaultControlledBrowserStateDir(root);
  const requested = clean(input.profile || input.profileName || input.env?.CAREER_OS_CONTROLLED_BROWSER_PROFILE || 'career-os');
  const envProfileDir = clean(input.profileDir || input.env?.CAREER_OS_CONTROLLED_BROWSER_PROFILE_DIR || input.env?.CAREER_OS_WORKDAY_OBSERVE_PROFILE_DIR);
  let profilePath = '';

  if (envProfileDir) {
    profilePath = path.resolve(envProfileDir);
  } else if (!requested || requested === 'career-os' || requested === 'default' || requested === 'chrome-profile') {
    profilePath = defaultControlledBrowserProfileDir(root);
  } else if (path.isAbsolute(requested)) {
    profilePath = path.resolve(requested);
  } else {
    profilePath = path.join(stateDir, requested);
  }

  const candidates = findControlledBrowserProfileCandidates(root, stateDir);
  if (!isPathInside(profilePath, stateDir)) {
    return {
      ok: false,
      status: 'PROFILE NOT FOUND',
      reason: 'Requested browser profile is not inside the Career OS controlled browser state directory.',
      candidates,
      profilePath,
      stateDir,
    };
  }
  if (!looksLikeChromeProfile(profilePath)) {
    return {
      ok: false,
      status: 'PROFILE NOT FOUND',
      reason: 'Approved Career OS controlled browser profile was not found or has no Chrome profile state.',
      candidates,
      profilePath,
      stateDir,
    };
  }

  return {
    ok: true,
    profilePath,
    profileName: path.basename(profilePath),
    stateDir,
  };
}

export function resolveChromeExecutable(input = {}) {
  const env = input.env || process.env;
  const explicit = clean(input.executable || env.CAREER_OS_CHROME_EXECUTABLE || env.CHROME_PATH || env.CHROMIUM_PATH);
  const candidates = [
    explicit,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    path.join(os.homedir(), 'Applications/Chromium.app/Contents/MacOS/Chromium'),
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { ok: true, executable: candidate, source: candidate === explicit ? 'env' : 'installed' };
    }
  }
  return {
    ok: false,
    reason: 'No installed Chrome or Chromium executable was found.',
    attempted: candidates,
  };
}

export async function selectAvailableLocalPort(preferredPort = 9222, options = {}) {
  const host = clean(options.host || '127.0.0.1');
  const attempts = Math.max(1, Number(options.attempts || 40));
  const start = Number(preferredPort || 9222);
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = start + offset;
    if (await isPortAvailable(port, host)) return { ok: true, host, port, preferredPort: start, portChanged: port !== start };
  }
  return {
    ok: false,
    reason: `No available localhost CDP port was found starting at ${start}.`,
    host,
    preferredPort: start,
  };
}

export function buildControlledChromeArgs(input = {}) {
  const cdpHost = clean(input.cdpHost || '127.0.0.1');
  const cdpPort = Number(input.cdpPort || 9222);
  const profilePath = clean(input.profilePath);
  const url = clean(input.url);
  const args = [
    `--remote-debugging-address=${cdpHost}`,
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profilePath}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  const profileDirectory = clean(input.profileDirectory || detectChromeProfileDirectory(profilePath));
  if (profileDirectory) args.push(`--profile-directory=${profileDirectory}`);
  if (url) args.push(url);
  return args;
}

export async function verifyCdpEndpoint(endpoint, options = {}) {
  if (!isLocalhostCdpEndpoint(endpoint)) {
    return {
      ok: false,
      reason: 'CDP endpoint is not bound to localhost.',
      endpoint,
    };
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  try {
    const versionResponse = await fetchImpl(new URL('/json/version', endpoint), { signal: AbortSignal.timeout(Number(options.timeoutMs || 3000)) });
    if (!versionResponse.ok) {
      return { ok: false, reason: `CDP version endpoint returned HTTP ${versionResponse.status}.`, endpoint };
    }
    const version = await versionResponse.json();
    const pagesResponse = await fetchImpl(new URL('/json/list', endpoint), { signal: AbortSignal.timeout(Number(options.timeoutMs || 3000)) });
    if (!pagesResponse.ok) {
      return { ok: false, reason: `CDP page list returned HTTP ${pagesResponse.status}.`, endpoint, version };
    }
    const pages = await pagesResponse.json();
    return {
      ok: true,
      browser: clean(version.Browser || version.browser),
      endpoint,
      pages: Array.isArray(pages) ? pages.map(sanitizeCdpPageTarget) : [],
      webSocketDebuggerUrl: clean(version.webSocketDebuggerUrl),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      endpoint,
    };
  }
}

export async function pollCdpEndpoint(endpoint, options = {}) {
  const deadline = Date.now() + Number(options.timeoutMs || 15000);
  let last = null;
  while (Date.now() <= deadline) {
    last = await verifyCdpEndpoint(endpoint, options);
    if (last.ok) return last;
    await delay(Number(options.pollMs || 500));
  }
  return {
    ok: false,
    reason: `CDP endpoint was not reachable before timeout: ${last?.reason || 'unknown'}.`,
    endpoint,
    last,
  };
}

export async function verifyControlledWorkdayTab(input = {}) {
  const endpoint = clean(input.endpoint);
  const expectedTenant = clean(input.expectedTenant);
  const expectedJobId = clean(input.expectedJobId);
  const cdp = input.cdp || await verifyCdpEndpoint(endpoint);
  if (!cdp.ok) return { ok: false, status: 'CDP LAUNCH FAILED', reason: cdp.reason, cdp };

  const fallback = classifyCdpWorkdayTargets(cdp.pages || [], {
    expectedJobId,
    expectedTenant,
  });

  if (fallback.status === 'CONTROLLED BROWSER READY — SIGN-IN REQUIRED') {
    return {
      ok: true,
      authenticationState: 'sign_in_required',
      pages: cdp.pages,
      reason: fallback.reason,
      status: fallback.status,
      workdayTab: fallback.workdayTab,
    };
  }

  try {
    const { chromium } = await import('playwright');
    const browser = input.browser || await chromium.connectOverCDP(endpoint, { timeout: Number(input.timeoutMs || 5000) });
    try {
      const discovery = await discoverActiveWorkdayApplicationTab({
        browser,
        expectedJobId,
        expectedTenant,
      });
      if (discovery.ok) {
        return {
          ok: true,
          authenticationState: 'authenticated',
          discovery: reportableDiscovery(discovery),
          pages: cdp.pages,
          status: 'CONTROLLED BROWSER READY — WORKDAY APPLICATION OPEN',
          workdayTab: discovery.selectedTab ? reportableSelectedTab(discovery.selectedTab) : null,
        };
      }
      if (discovery.status === 'SIGN-IN REQUIRED') {
        return {
          ok: true,
          authenticationState: 'sign_in_required',
          discovery: reportableDiscovery(discovery),
          pages: cdp.pages,
          reason: discovery.reason,
          status: 'CONTROLLED BROWSER READY — SIGN-IN REQUIRED',
          workdayTab: fallback.workdayTab || null,
        };
      }
      if (discovery.status === 'WRONG TENANT' || discovery.status === 'WRONG JOB') {
        return {
          ok: false,
          discovery: reportableDiscovery(discovery),
          pages: cdp.pages,
          reason: discovery.reason,
          status: discovery.status,
          workdayTab: fallback.workdayTab || null,
        };
      }
      if (fallback.status === 'CONTROLLED BROWSER READY — SIGN-IN REQUIRED') {
        return {
          ok: true,
          authenticationState: 'sign_in_required',
          discovery: reportableDiscovery(discovery),
          pages: cdp.pages,
          reason: fallback.reason,
          status: fallback.status,
          workdayTab: fallback.workdayTab,
        };
      }
      return {
        ok: false,
        discovery: reportableDiscovery(discovery),
        pages: cdp.pages,
        reason: discovery.reason,
        status: 'BLOCKED',
        workdayTab: fallback.workdayTab || null,
      };
    } finally {
      if (!input.browser && browser && typeof browser.close === 'function') {
        await browser.close().catch(() => {});
      }
    }
  } catch (error) {
    if (fallback.status === 'CONTROLLED BROWSER READY — SIGN-IN REQUIRED') {
      return {
        ok: true,
        authenticationState: 'sign_in_required',
        pages: cdp.pages,
        reason: fallback.reason,
        status: fallback.status,
        workdayTab: fallback.workdayTab,
      };
    }
    return {
      ok: false,
      pages: cdp.pages,
      reason: error instanceof Error ? error.message : String(error),
      status: 'CDP LAUNCH FAILED',
      workdayTab: fallback.workdayTab || null,
    };
  }
}

export function classifyCdpWorkdayTargets(targets = [], input = {}) {
  const expectedTenant = clean(input.expectedTenant).toLowerCase();
  const expectedJobId = clean(input.expectedJobId).toLowerCase();
  const workdayTargets = targets
    .filter((target) => /^page$/i.test(clean(target.type || 'page')))
    .map((target) => ({ ...target, parsed: parseWorkdayJobUrl(target.url || '') }))
    .filter((target) => {
      const host = hostForUrl(target.url);
      return /workday|myworkdayjobs\.com/i.test(host);
    });

  const wrongTenant = workdayTargets.find((target) => target.parsed.ok && expectedTenant && clean(target.parsed.tenant).toLowerCase() !== expectedTenant);
  if (wrongTenant) {
    return {
      ok: false,
      reason: `Workday tab tenant ${wrongTenant.parsed.tenant} does not match expected ${input.expectedTenant}.`,
      status: 'WRONG TENANT',
      workdayTab: reportableTarget(wrongTenant),
    };
  }

  const signIn = workdayTargets.filter((target) => {
    const parsedHost = parseTenantFromHost(hostForUrl(target.url));
    if (expectedTenant && parsedHost && parsedHost !== expectedTenant) return false;
    return AUTH_URL_PATTERN.test(`${target.url || ''} ${target.title || ''}`);
  });
  if (signIn.length === 1) {
    return {
      ok: true,
      reason: 'One Workday tab appears to be at an authentication page for the expected tenant.',
      status: 'CONTROLLED BROWSER READY — SIGN-IN REQUIRED',
      workdayTab: reportableTarget(signIn[0], { tenant: expectedTenant }),
    };
  }

  const wrongJob = workdayTargets.find((target) => target.parsed.ok && expectedJobId && clean(target.parsed.jobId).toLowerCase() !== expectedJobId);
  if (wrongJob) {
    return {
      ok: false,
      reason: `Workday tab job ${wrongJob.parsed.jobId} does not match expected ${input.expectedJobId}.`,
      status: 'WRONG JOB',
      workdayTab: reportableTarget(wrongJob),
    };
  }

  const exact = workdayTargets.filter((target) => target.parsed.ok
    && (!expectedTenant || clean(target.parsed.tenant).toLowerCase() === expectedTenant)
    && (!expectedJobId || clean(target.parsed.jobId).toLowerCase() === expectedJobId));
  if (exact.length === 1) {
    return {
      ok: true,
      reason: 'One Workday tab matches the approved tenant/job URL.',
      status: 'CONTROLLED BROWSER READY — WORKDAY APPLICATION OPEN',
      workdayTab: reportableTarget(exact[0]),
    };
  }

  return {
    ok: false,
    reason: workdayTargets.length ? 'No single Workday tab matched the approved tenant/job identity.' : 'No Workday tab was visible from CDP.',
    status: 'BLOCKED',
    workdayTab: null,
  };
}

export async function launchControlledBrowser(input = {}) {
  const root = input.root || process.cwd();
  const env = input.env || process.env;
  const url = clean(input.url || env.CAREER_OS_WORKDAY_CANARY_URL);
  const parsedUrl = parseWorkdayJobUrl(url);
  if (!url) {
    return { ok: false, status: 'BLOCKED', reason: 'A single approved Workday URL is required.' };
  }
  if (!parsedUrl.ok) {
    return { ok: false, status: 'BLOCKED', reason: `Approved Workday URL is not qualified: ${parsedUrl.reason}.` };
  }
  const expectedTenant = clean(input.expectedTenant || parsedUrl.tenant);
  const expectedJobId = clean(input.expectedJobId || parsedUrl.jobId);
  if (clean(env.CAREER_OS_QUEUE_ENABLED) === '1' && input.allowQueueEnabled !== true) {
    return { ok: false, status: 'BLOCKED', reason: 'CAREER_OS_QUEUE_ENABLED must remain disabled before launching the controlled browser.' };
  }

  const profile = resolveControlledBrowserProfile({
    env,
    profile: input.profile,
    profileDir: input.profileDir,
    root,
    stateDir: input.stateDir,
  });
  if (!profile.ok) return profile;

  const stoppedWorkers = input.stopWorkers === false
    ? { ok: true, stoppedPids: [], runningPids: [] }
    : await stopCareerOsWorkerProcesses({ processList: input.processList });
  if (!stoppedWorkers.ok) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: stoppedWorkers.reason,
      workerProcesses: stoppedWorkers,
    };
  }

  const existing = await findRunningControlledBrowserProcesses({ processList: input.processList, profilePath: profile.profilePath });
  if (existing.length) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `A Career OS controlled browser is already running for this profile: ${existing.map((item) => item.pid).join(', ')}.`,
      runningBrowserPids: existing.map((item) => item.pid),
    };
  }

  const executable = resolveChromeExecutable({ env, executable: input.executable });
  if (!executable.ok) {
    return { ok: false, status: 'CDP LAUNCH FAILED', reason: executable.reason, attemptedExecutables: executable.attempted };
  }

  const cdpHost = clean(input.cdpHost || '127.0.0.1');
  if (!['127.0.0.1', 'localhost', '::1'].includes(cdpHost)) {
    return { ok: false, status: 'CDP LAUNCH FAILED', reason: 'Refusing to bind CDP to a non-localhost address.' };
  }

  const selectedPort = await selectAvailableLocalPort(input.cdpPort || env.CAREER_OS_BROWSER_DEBUG_PORT || 9222, {
    attempts: input.portAttempts || 40,
    host: cdpHost,
  });
  if (!selectedPort.ok) return { ok: false, status: 'CDP LAUNCH FAILED', reason: selectedPort.reason };

  const endpoint = `http://${selectedPort.host}:${selectedPort.port}`;
  if (!isLocalhostCdpEndpoint(endpoint)) {
    return { ok: false, status: 'CDP LAUNCH FAILED', reason: 'Refusing to launch CDP on a non-localhost endpoint.' };
  }

  fs.mkdirSync(profile.stateDir, { recursive: true });
  const args = buildControlledChromeArgs({
    cdpHost: selectedPort.host,
    cdpPort: selectedPort.port,
    profilePath: profile.profilePath,
    url: parsedUrl.canonicalUrl,
  });

  const child = input.spawnBrowser
    ? input.spawnBrowser(executable.executable, args)
    : spawn(executable.executable, args, { detached: true, stdio: 'ignore' });
  const pid = Number(child?.pid || 0);
  if (!pid) {
    return { ok: false, status: 'CDP LAUNCH FAILED', reason: 'Chrome launch did not return a browser PID.' };
  }
  if (!input.spawnBrowser && typeof child.unref === 'function') child.unref();

  const cdp = await pollCdpEndpoint(endpoint, {
    fetchImpl: input.fetchImpl,
    pollMs: input.pollMs || 500,
    timeoutMs: input.cdpTimeoutMs || 20000,
  });
  if (!cdp.ok) {
    await terminateSpawnedBrowser(child, pid);
    return {
      ok: false,
      status: 'CDP LAUNCH FAILED',
      reason: cdp.reason,
      browserPid: pid,
      endpoint,
    };
  }

  const workday = await verifyControlledWorkdayTab({
    endpoint,
    expectedJobId,
    expectedTenant,
    cdp,
    browser: input.browser,
    timeoutMs: input.attachTimeoutMs || 5000,
  });
  const state = {
    browserPid: pid,
    canaryId: clean(input.canaryId || env.CAREER_OS_WORKDAY_CANARY_ID || defaultCanaryId(expectedTenant, expectedJobId)),
    cdpEndpoint: endpoint,
    cdpHost: selectedPort.host,
    cdpPort: selectedPort.port,
    executable: executable.executable,
    expectedJobId,
    expectedTenant,
    initialUrlSanitized: sanitizeRuntimeUrl(parsedUrl.canonicalUrl),
    launchedAt: new Date().toISOString(),
    profilePath: profile.profilePath,
    status: workday.status,
    workdayTab: workday.workdayTab || null,
  };
  writeControlledBrowserState(root, state, profile.stateDir);

  return {
    ok: workday.ok,
    status: workday.status,
    reason: workday.reason || 'Controlled Career OS browser launched with localhost CDP.',
    browser: {
      executable: executable.executable,
      pid,
      processAlive: await isProcessAlive(pid),
      profilePath: profile.profilePath,
    },
    cdp: {
      browser: cdp.browser,
      endpoint,
      endpointVerified: true,
      host: selectedPort.host,
      port: selectedPort.port,
      portChanged: selectedPort.portChanged,
    },
    statePath: controlledBrowserStatePath(root, profile.stateDir),
    workerProcesses: stoppedWorkers,
    workday: {
      authenticationState: workday.authenticationState || (workday.status === 'CONTROLLED BROWSER READY — WORKDAY APPLICATION OPEN' ? 'authenticated' : 'unknown'),
      jobId: expectedJobId,
      pages: cdp.pages,
      tab: workday.workdayTab || null,
      tenant: expectedTenant,
      urlSanitized: sanitizeRuntimeUrl(parsedUrl.canonicalUrl),
    },
  };
}

export async function controlledBrowserStatus(input = {}) {
  const root = input.root || process.cwd();
  const stateDir = input.stateDir || defaultControlledBrowserStateDir(root);
  const state = readControlledBrowserState(root, stateDir);
  if (!state) return { ok: false, status: 'BLOCKED', reason: 'No recorded Career OS controlled browser state exists.' };
  const endpoint = clean(state.cdpEndpoint || `http://${state.cdpHost}:${state.cdpPort}`);
  const cdp = await verifyCdpEndpoint(endpoint, { fetchImpl: input.fetchImpl });
  return {
    ok: cdp.ok && await isProcessAlive(state.browserPid),
    status: cdp.ok ? state.status || 'CONTROLLED BROWSER READY — WORKDAY APPLICATION OPEN' : 'CDP LAUNCH FAILED',
    browserPid: state.browserPid,
    cdp,
    processAlive: await isProcessAlive(state.browserPid),
    profilePath: state.profilePath,
    statePath: controlledBrowserStatePath(root, stateDir),
  };
}

export async function stopControlledBrowser(input = {}) {
  const root = input.root || process.cwd();
  const stateDir = input.stateDir || defaultControlledBrowserStateDir(root);
  const state = input.state || readControlledBrowserState(root, stateDir);
  if (!state?.browserPid) {
    return {
      ok: true,
      status: 'BLOCKED',
      reason: 'No recorded Career OS controlled browser PID exists.',
      stopped: false,
    };
  }
  const pid = Number(state.browserPid);
  const processCommand = input.processCommand || await readProcessCommand(pid);
  const expectedPort = clean(state.cdpPort);
  const expectedProfile = clean(state.profilePath);
  if (processCommand && expectedProfile && !processCommand.includes(expectedProfile)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'Recorded PID no longer belongs to the Career OS controlled browser profile.',
      stopped: false,
    };
  }
  if (processCommand && expectedPort && !processCommand.includes(`--remote-debugging-port=${expectedPort}`)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'Recorded PID does not match the Career OS controlled browser CDP port.',
      stopped: false,
    };
  }
  const processAlive = input.isProcessAlive || isProcessAlive;
  if (!await processAlive(pid)) {
    markControlledBrowserStopped(root, stateDir, state, { stopped: false, reason: 'Recorded browser process is no longer running.' });
    return {
      ok: true,
      status: 'BLOCKED',
      reason: 'Recorded browser process is no longer running.',
      stopped: false,
    };
  }
  const killProcess = input.killProcess || ((targetPid, signal) => process.kill(targetPid, signal));
  killProcess(pid, 'SIGTERM');
  await delay(Number(input.waitMs || 750));
  const alive = input.assumeStopped ? false : await processAlive(pid);
  markControlledBrowserStopped(root, stateDir, state, {
    stopped: !alive,
    stoppedAt: new Date().toISOString(),
  });
  return {
    ok: !alive,
    status: alive ? 'BLOCKED' : 'BLOCKED',
    reason: alive ? 'Recorded browser process is still running after SIGTERM.' : 'Recorded Career OS controlled browser was stopped.',
    stopped: !alive,
    stoppedPid: pid,
  };
}

export function readControlledBrowserState(root = process.cwd(), stateDir = defaultControlledBrowserStateDir(root)) {
  const file = controlledBrowserStatePath(root, stateDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeControlledBrowserState(root = process.cwd(), state = {}, stateDir = defaultControlledBrowserStateDir(root)) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(controlledBrowserStatePath(root, stateDir), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function stopCareerOsWorkerProcesses(options = {}) {
  const processes = await findCareerOsWorkerProcesses(options);
  if (!processes.length) return { ok: true, stoppedPids: [], runningPids: [] };
  const stoppedPids = [];
  for (const item of processes) {
    try {
      if (options.killProcess) options.killProcess(item.pid, 'SIGTERM');
      else process.kill(item.pid, 'SIGTERM');
      stoppedPids.push(item.pid);
    } catch {
      // Process may already have exited.
    }
  }
  await delay(Number(options.waitMs || 500));
  const remaining = options.assumeStopped ? [] : await findCareerOsWorkerProcesses(options);
  if (remaining.length) {
    return {
      ok: false,
      reason: `Career OS worker process(es) remain running: ${remaining.map((item) => item.pid).join(', ')}`,
      runningPids: remaining.map((item) => item.pid),
      stoppedPids,
    };
  }
  return { ok: true, stoppedPids, runningPids: [] };
}

export async function findCareerOsWorkerProcesses(options = {}) {
  const stdout = options.processList || await readProcessList();
  return stdout.split(/\r?\n/)
    .map(parsePsLine)
    .filter(Boolean)
    .filter((item) => /career-os-browser-companion\.mjs/.test(item.command))
    .filter((item) => /\s(start|run-once)\b/.test(item.command));
}

export async function findRunningControlledBrowserProcesses(options = {}) {
  const profilePath = clean(options.profilePath);
  const stdout = options.processList || await readProcessList();
  return stdout.split(/\r?\n/)
    .map(parsePsLine)
    .filter(Boolean)
    .filter((item) => item.pid !== process.pid)
    .filter((item) => !profilePath || item.command.includes(profilePath))
    .filter((item) => /chrome|chromium/i.test(item.command) || item.command.includes('--user-data-dir=') || item.command.includes('--remote-debugging-port='));
}

async function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function readProcessList() {
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command='], { timeout: 3000 });
    return stdout;
  } catch {
    return '';
  }
}

async function readProcessCommand(pid) {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command='], { timeout: 3000 });
    return clean(stdout);
  } catch {
    return '';
  }
}

async function terminateSpawnedBrowser(child, pid) {
  if (child && typeof child.kill === 'function') {
    try {
      child.kill('SIGTERM');
      return;
    } catch {
      // Fall through to killing the child PID we just spawned.
    }
  }
  if (Number.isInteger(Number(pid)) && Number(pid) > 0) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      // The launch attempt may have already exited.
    }
  }
}

async function isProcessAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function markControlledBrowserStopped(root, stateDir, state, patch) {
  writeControlledBrowserState(root, {
    ...state,
    lastStop: patch,
  }, stateDir);
}

function looksLikeChromeProfile(profilePath) {
  if (!profilePath || !fs.existsSync(profilePath) || !fs.statSync(profilePath).isDirectory()) return false;
  return PROFILE_MARKER_FILES.some((marker) => fs.existsSync(path.join(profilePath, marker)))
    || PROFILE_MARKER_DIRS.some((marker) => fs.existsSync(path.join(profilePath, marker)));
}

function detectChromeProfileDirectory(profilePath) {
  for (const profileDirectory of PROFILE_MARKER_DIRS) {
    if (fs.existsSync(path.join(profilePath, profileDirectory))) return profileDirectory;
  }
  return '';
}

function sanitizeCdpPageTarget(target = {}) {
  return {
    id: clean(target.id),
    title: clean(target.title),
    type: clean(target.type),
    url: sanitizeRuntimeUrl(target.url),
  };
}

function reportableDiscovery(discovery = {}) {
  return {
    matchingTabs: discovery.matchingTabs || [],
    reason: clean(discovery.reason),
    rejectedTabs: discovery.rejectedTabs || [],
    status: clean(discovery.status),
  };
}

function reportableSelectedTab(tab = {}) {
  return {
    applicationActive: Boolean(tab.applicationActive),
    authenticated: Boolean(tab.authenticated),
    host: clean(tab.host || hostForUrl(tab.url)),
    jobId: clean(tab.jobId),
    pageName: clean(tab.pageName),
    reviewReached: Boolean(tab.reviewReached),
    sanitizedUrl: sanitizeRuntimeUrl(tab.url || tab.sanitizedUrl),
    tenant: clean(tab.tenant),
    title: clean(tab.title),
  };
}

function reportableTarget(target = {}, overrides = {}) {
  const parsed = target.parsed?.ok ? target.parsed : parseWorkdayJobUrl(target.url || '');
  return {
    host: hostForUrl(target.url),
    jobId: clean(overrides.jobId || (parsed.ok ? parsed.jobId : '')),
    sanitizedUrl: sanitizeRuntimeUrl(target.url),
    tenant: clean(overrides.tenant || (parsed.ok ? parsed.tenant : parseTenantFromHost(hostForUrl(target.url)))),
    title: clean(target.title),
  };
}

function parseTenantFromHost(host = '') {
  const value = clean(host).toLowerCase();
  const match = value.match(/^([^.]+\.wd\d+)/);
  return match ? match[1] : '';
}

function hostForUrl(value = '') {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function defaultCanaryId(tenant, jobId) {
  return `workday-observe-${tenant}-${jobId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

function isPathInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return Boolean(relative) ? !relative.startsWith('..') && !path.isAbsolute(relative) : true;
}

function parsePsLine(line = '') {
  const match = clean(line).match(/^(\d+)\s+(.+)$/);
  if (!match) return null;
  const pid = Number(match[1]);
  if (!Number.isInteger(pid)) return null;
  return { pid, command: match[2] };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}

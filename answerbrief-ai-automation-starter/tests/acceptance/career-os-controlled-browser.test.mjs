import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildControlledChromeArgs,
  classifyCdpWorkdayTargets,
  controlledBrowserStatePath,
  findRunningControlledBrowserProcesses,
  isLocalhostCdpEndpoint,
  launchControlledBrowser,
  resolveControlledBrowserProfile,
  sanitizeRuntimeUrl,
  selectAvailableLocalPort,
  stopControlledBrowser,
  verifyControlledWorkdayTab,
} from '../../scripts/lib/career-os-controlled-browser.mjs';

const WORKDAY_URL = 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Bellevue%2C-Washington/Sr-Product-Manager_REQ362163-1/apply/useMyLastApplication';
const CANARY_ID = 'workday-observe-tmobile-req362163';

test('controlled browser args bind CDP to localhost and use the approved Career OS profile', () => {
  const args = buildControlledChromeArgs({
    cdpHost: '127.0.0.1',
    cdpPort: 9222,
    profilePath: '/tmp/career-os/.career-os-browser-worker/chrome-profile',
    url: WORKDAY_URL,
  });

  assert.equal(args.includes('--remote-debugging-address=127.0.0.1'), true);
  assert.equal(args.includes('--remote-debugging-port=9222'), true);
  assert.equal(args.includes('--user-data-dir=/tmp/career-os/.career-os-browser-worker/chrome-profile'), true);
  assert.equal(args.includes('--incognito'), false);
  assert.equal(args.at(-1), WORKDAY_URL);
  assert.equal(isLocalhostCdpEndpoint('http://127.0.0.1:9222'), true);
  assert.equal(isLocalhostCdpEndpoint('http://0.0.0.0:9222'), false);
});

test('controlled browser profile resolution fails closed and reports Career OS candidates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-profile-'));
  const stateDir = path.join(root, '.career-os-browser-worker');
  const candidate = path.join(stateDir, 'handoff-chrome-profile');
  fs.mkdirSync(path.join(candidate, 'Default'), { recursive: true });

  const missing = resolveControlledBrowserProfile({ root, profile: 'career-os' });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 'PROFILE NOT FOUND');
  assert.equal(missing.candidates.length, 1);
  assert.equal(missing.candidates[0].path, candidate);

  const personal = resolveControlledBrowserProfile({
    root,
    profile: path.join(os.homedir(), 'Library/Application Support/Google/Chrome'),
  });
  assert.equal(personal.ok, false);
  assert.match(personal.reason, /not inside/);
});

test('controlled browser launcher selects another localhost CDP port when preferred port is occupied', async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const occupied = server.address().port;

  try {
    const selected = await selectAvailableLocalPort(occupied, { attempts: 3, host: '127.0.0.1' });
    assert.equal(selected.ok, true);
    assert.equal(selected.host, '127.0.0.1');
    assert.notEqual(selected.port, occupied);
    assert.equal(selected.portChanged, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('controlled browser launch persists browser PID and verified localhost CDP endpoint', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-launch-'));
  const profilePath = path.join(root, '.career-os-browser-worker', 'chrome-profile');
  fs.mkdirSync(path.join(profilePath, 'Default'), { recursive: true });
  const executable = path.join(root, 'Chrome');
  fs.writeFileSync(executable, '#!/bin/sh\n', 'utf8');

  const cdpPages = [{
    id: 'page-1',
    title: 'Application Questions',
    type: 'page',
    url: WORKDAY_URL,
  }];
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    async json() {
      if (String(url).endsWith('/json/version')) return { Browser: 'Chrome/126.0', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/test' };
      return cdpPages;
    },
  });
  const launched = [];
  const result = await launchControlledBrowser({
    browser: mockBrowser([mockPage({ url: WORKDAY_URL, dom: activeDom() })]),
    canaryId: CANARY_ID,
    cdpPort: 9422,
    executable,
    fetchImpl,
    processList: '',
    root,
    spawnBrowser(pathToExecutable, args) {
      launched.push({ args, pathToExecutable });
      return { pid: 456789, unref() {} };
    },
    url: WORKDAY_URL,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'CONTROLLED BROWSER READY — WORKDAY APPLICATION OPEN');
  assert.equal(result.cdp.endpoint, 'http://127.0.0.1:9422');
  assert.equal(launched[0].pathToExecutable, executable);
  assert.equal(launched[0].args.includes('--remote-debugging-address=127.0.0.1'), true);

  const state = JSON.parse(fs.readFileSync(controlledBrowserStatePath(root), 'utf8'));
  assert.equal(state.browserPid, 456789);
  assert.equal(state.cdpEndpoint, 'http://127.0.0.1:9422');
  assert.equal(state.profilePath, profilePath);
  assert.equal(state.status, 'CONTROLLED BROWSER READY — WORKDAY APPLICATION OPEN');
});

test('controlled browser launch refuses an already-open Career OS browser profile', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-existing-browser-'));
  const profilePath = path.join(root, '.career-os-browser-worker', 'chrome-profile');
  fs.mkdirSync(path.join(profilePath, 'Default'), { recursive: true });
  const executable = path.join(root, 'Chrome');
  fs.writeFileSync(executable, '#!/bin/sh\n', 'utf8');

  const processList = `111 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=${profilePath}\n222 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/tmp/unrelated`;
  const running = await findRunningControlledBrowserProcesses({ processList, profilePath });
  assert.deepEqual(running.map((item) => item.pid), [111]);

  const result = await launchControlledBrowser({
    executable,
    processList,
    root,
    url: WORKDAY_URL,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.reason, /already running/);
});

test('controlled browser launch terminates the spawned child if CDP never verifies', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-cdp-fail-'));
  const profilePath = path.join(root, '.career-os-browser-worker', 'chrome-profile');
  fs.mkdirSync(path.join(profilePath, 'Default'), { recursive: true });
  const executable = path.join(root, 'Chrome');
  fs.writeFileSync(executable, '#!/bin/sh\n', 'utf8');

  const killed = [];
  const result = await launchControlledBrowser({
    cdpPort: 9522,
    cdpTimeoutMs: 1,
    executable,
    fetchImpl: async () => {
      throw new Error('connection refused');
    },
    pollMs: 1,
    processList: '',
    root,
    spawnBrowser() {
      return {
        pid: 456790,
        kill(signal) {
          killed.push(signal);
        },
        unref() {},
      };
    },
    url: WORKDAY_URL,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'CDP LAUNCH FAILED');
  assert.deepEqual(killed, ['SIGTERM']);
});

test('controlled Workday verification reports sign-in without requiring a clean profile or observation start', async () => {
  const result = await verifyControlledWorkdayTab({
    cdp: {
      ok: true,
      endpoint: 'http://127.0.0.1:9222',
      pages: [{
        title: 'Sign In',
        type: 'page',
        url: 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/login',
      }],
    },
    endpoint: 'http://127.0.0.1:9222',
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'CONTROLLED BROWSER READY — SIGN-IN REQUIRED');
  assert.equal(result.authenticationState, 'sign_in_required');
});

test('controlled Workday target classification rejects wrong tenant and wrong job', () => {
  const wrongTenant = classifyCdpWorkdayTargets([{
    title: 'Workday',
    type: 'page',
    url: WORKDAY_URL,
  }], { expectedJobId: 'REQ362163-1', expectedTenant: 'acme.wd5' });
  assert.equal(wrongTenant.status, 'WRONG TENANT');

  const wrongJob = classifyCdpWorkdayTargets([{
    title: 'Workday',
    type: 'page',
    url: WORKDAY_URL,
  }], { expectedJobId: 'REQ000000', expectedTenant: 'tmobile.wd1' });
  assert.equal(wrongJob.status, 'WRONG JOB');
});

test('controlled browser stop only terminates the recorded Career OS browser PID', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-stop-'));
  const profilePath = path.join(root, '.career-os-browser-worker', 'chrome-profile');
  fs.mkdirSync(profilePath, { recursive: true });
  fs.mkdirSync(path.dirname(controlledBrowserStatePath(root)), { recursive: true });
  fs.writeFileSync(controlledBrowserStatePath(root), JSON.stringify({
    browserPid: 12345,
    cdpPort: 9222,
    profilePath,
  }), 'utf8');

  const killed = [];
  const mismatch = await stopControlledBrowser({
    isProcessAlive: async () => true,
    killProcess(pid) {
      killed.push(pid);
    },
    processCommand: 'Google Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/unrelated',
    root,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(killed.length, 0);

  let checks = 0;
  const stopped = await stopControlledBrowser({
    isProcessAlive: async () => {
      checks += 1;
      return checks === 1;
    },
    killProcess(pid, signal) {
      killed.push([pid, signal]);
    },
    processCommand: `Google Chrome --remote-debugging-port=9222 --user-data-dir=${profilePath}`,
    root,
    waitMs: 1,
  });
  assert.equal(stopped.ok, true);
  assert.deepEqual(killed, [[12345, 'SIGTERM']]);
});

test('controlled browser runtime URL sanitizer redacts credentials from persisted state', () => {
  const sanitized = sanitizeRuntimeUrl(`${WORKDAY_URL}?token=abc123&state=secret&keep=visible#fragment`);
  assert.equal(sanitized.includes('abc123'), false);
  assert.equal(sanitized.includes('secret'), false);
  assert.equal(sanitized.includes('#fragment'), false);
  assert.equal(sanitized.includes('keep=visible'), true);
});

function mockBrowser(pages) {
  return {
    contexts() {
      return [{
        pages() {
          return pages;
        },
      }];
    },
  };
}

function mockPage({ dom, title = 'Workday', url = WORKDAY_URL }) {
  return {
    async evaluate() {
      return typeof dom === 'function' ? dom() : dom;
    },
    async title() {
      return title;
    },
    url() {
      return url;
    },
  };
}

function activeDom(overrides = {}) {
  return {
    applicationStructureDetected: true,
    authGateDetected: false,
    detectedJobId: 'REQ362163-1',
    fieldCount: 12,
    headings: ['Application Questions'],
    inactiveDetected: false,
    pageName: 'Application Questions',
    reviewSignals: { nextVisible: true, reviewReached: false, submitVisible: false },
    ...overrides,
  };
}

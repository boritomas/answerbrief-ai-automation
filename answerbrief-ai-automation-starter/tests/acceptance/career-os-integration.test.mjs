import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCareerOsAtsFacade,
  routeLegacyAtsExecution,
} from '../../scripts/lib/career-os-ats-integration.mjs';
import { getATSAdapter } from '../../scripts/lib/career-os-ats-adapters.mjs';

function task(overrides = {}) {
  return {
    applicationId: 'app-1',
    applicationUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
    candidate: {},
    companionId: 'test-companion',
    employer: 'Affirm',
    legal: { approvedAcknowledgements: [] },
    ownerEmail: 'tomas@example.com',
    platform: 'greenhouse',
    position: 'Product Manager',
    questionCatalog: [],
    resume: { fileName: 'resume.txt' },
    ...overrides,
  };
}

function productionEnvFor(routedTask) {
  if (/greenhouse/i.test(`${routedTask.platform || ''} ${routedTask.applicationUrl || ''}`)) {
    return {
      CAREER_OS_EXECUTION_MODE: 'submit_enabled',
      CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID: routedTask.applicationId,
      CAREER_OS_SUBMIT_RUN_AUTHORIZATION: 'test-authorized-canary',
    };
  }
  return {
    CAREER_OS_EXECUTION_MODE: 'assisted_apply',
  };
}

function legacyAdapter(id, options = {}) {
  const calls = {
    matches: [],
    execute: [],
  };
  const adapter = {
    id,
    calls,
    matches(receivedTask) {
      calls.matches.push(receivedTask);
      return options.matchesResult ?? true;
    },
    async execute(page, receivedTask, runtime) {
      calls.execute.push({ page, task: receivedTask, runtime });
      if (options.error) throw options.error;
      return options.executeResult ?? true;
    },
  };
  return adapter;
}

function fixtures() {
  return {
    page: Object.freeze({ marker: 'original-page' }),
    runtime: Object.freeze({
      marker: 'original-runtime',
      reportCalls: [],
      async report(payload) {
        this.reportCalls.push(payload);
      },
    }),
  };
}

function greenhouseSubmitPage(applicationUrl) {
  const state = {
    clickedSubmit: false,
    navigatedUrl: '',
    uploadedFiles: [],
  };
  const page = {
    state,
    frames() {
      return [];
    },
    url() {
      return state.clickedSubmit ? `${applicationUrl}/confirmation` : applicationUrl;
    },
    async goto(url) {
      state.navigatedUrl = url;
    },
    async waitForTimeout() {},
    async waitForLoadState() {},
    async textContent() {
      return state.clickedSubmit ? 'Application submitted.' : 'Submit application';
    },
    async evaluate() {
      return [];
    },
    locator(selector) {
      return greenhouseLocator(selector, state);
    },
  };
  return page;
}

function greenhouseLocator(selector, state) {
  const locator = {
    selector,
    first() {
      return this;
    },
    filter() {
      return this;
    },
    locator(nextSelector) {
      return greenhouseLocator(nextSelector, state);
    },
    async count() {
      if (String(selector).includes('input[type="file"]')) return 1;
      if (String(selector).includes('button[type="submit"]') || String(selector).includes('input[type="submit"]')) return 1;
      return 0;
    },
    async getAttribute() {
      return '';
    },
    async setInputFiles(filePath) {
      state.uploadedFiles.push(filePath);
    },
    async click() {
      if (String(selector).includes('submit')) state.clickedSubmit = true;
    },
    async fill() {},
    async evaluate(callback) {
      if (typeof callback !== 'function') return null;
      return null;
    },
    async evaluateAll() {
      return '';
    },
    async selectOption() {},
    async check() {},
    async isChecked() {
      return false;
    },
    async inputValue() {
      return '';
    },
  };
  return locator;
}

test('Greenhouse routes through facade and delegates to the legacy adapter unchanged', async () => {
  const greenhouse = legacyAdapter('greenhouse');
  const workday = legacyAdapter('workday');
  const facade = createCareerOsAtsFacade({
    legacyAdapters: { greenhouse, workday },
  });
  const greenhouseTask = task();
  const { page, runtime } = fixtures();

  const adapter = facade.getRoutedAtsAdapter(greenhouseTask);

  assert.equal(adapter.id, 'greenhouse');
  assert.equal(adapter.routingMetadata.detectedPlatform, 'greenhouse');
  assert.equal(adapter.routingMetadata.adapterId, 'greenhouse');
  assert.equal(adapter.routingMetadata.supported, true);
  assert.ok(adapter.routingMetadata.matchedSignals.some((signal) => signal.includes('greenhouse')));
  assert.equal(adapter.matches(greenhouseTask), true);
  assert.ok(greenhouse.calls.matches.includes(greenhouseTask));
  assert.equal(workday.calls.matches.length, 0);

  const result = await adapter.execute(page, greenhouseTask, runtime);
  assert.equal(result, true);
  assert.equal(greenhouse.calls.execute.length, 1);
  assert.equal(greenhouse.calls.execute[0].page, page);
  assert.equal(greenhouse.calls.execute[0].task, greenhouseTask);
  assert.equal(greenhouse.calls.execute[0].runtime, runtime);
  assert.equal(workday.calls.execute.length, 0);
});

test('Greenhouse bridge preserves false return values and thrown errors', async () => {
  const falseAdapter = legacyAdapter('greenhouse', { executeResult: false });
  const falseFacade = createCareerOsAtsFacade({
    legacyAdapters: {
      greenhouse: falseAdapter,
      workday: legacyAdapter('workday'),
    },
  });
  const greenhouseTask = task();
  const { page, runtime } = fixtures();
  assert.equal(await falseFacade.getRoutedAtsAdapter(greenhouseTask).execute(page, greenhouseTask, runtime), false);

  const error = new Error('greenhouse legacy failure');
  const throwingFacade = createCareerOsAtsFacade({
    legacyAdapters: {
      greenhouse: legacyAdapter('greenhouse', { error }),
      workday: legacyAdapter('workday'),
    },
  });
  let thrown;
  try {
    await throwingFacade.getRoutedAtsAdapter(greenhouseTask).execute(page, greenhouseTask, runtime);
  } catch (caught) {
    thrown = caught;
  }
  assert.equal(thrown, error);
});

test('Workday routes through facade and delegates to the legacy adapter unchanged', async () => {
  const greenhouse = legacyAdapter('greenhouse');
  const workday = legacyAdapter('workday');
  const facade = createCareerOsAtsFacade({
    legacyAdapters: { greenhouse, workday },
  });
  const workdayTask = task({
    applicationId: 'app-2',
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dallas-TX/Product-Manager_JR123456',
    employer: 'Acme',
    platform: 'workday',
  });
  const { page, runtime } = fixtures();

  const adapter = facade.getRoutedAtsAdapter(workdayTask);

  assert.equal(adapter.id, 'workday');
  assert.equal(adapter.routingMetadata.detectedPlatform, 'workday');
  assert.equal(adapter.routingMetadata.adapterId, 'workday');
  assert.equal(adapter.routingMetadata.supported, true);
  assert.ok(adapter.routingMetadata.matchedSignals.some((signal) => signal.includes('workday')));
  assert.equal(adapter.matches(workdayTask), true);
  assert.ok(workday.calls.matches.includes(workdayTask));
  assert.equal(greenhouse.calls.matches.length, 0);

  const result = await adapter.execute(page, workdayTask, runtime);
  assert.equal(result, true);
  assert.equal(workday.calls.execute.length, 1);
  assert.equal(workday.calls.execute[0].page, page);
  assert.equal(workday.calls.execute[0].task, workdayTask);
  assert.equal(workday.calls.execute[0].runtime, runtime);
  assert.equal(greenhouse.calls.execute.length, 0);
});

test('Workday bridge preserves false return values and thrown errors', async () => {
  const falseAdapter = legacyAdapter('workday', { executeResult: false });
  const falseFacade = createCareerOsAtsFacade({
    legacyAdapters: {
      greenhouse: legacyAdapter('greenhouse'),
      workday: falseAdapter,
    },
  });
  const workdayTask = task({
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dallas-TX/Product-Manager_JR123456',
    platform: 'workday',
  });
  const { page, runtime } = fixtures();
  assert.equal(await falseFacade.getRoutedAtsAdapter(workdayTask).execute(page, workdayTask, runtime), false);

  const error = new Error('workday legacy failure');
  const throwingFacade = createCareerOsAtsFacade({
    legacyAdapters: {
      greenhouse: legacyAdapter('greenhouse'),
      workday: legacyAdapter('workday', { error }),
    },
  });
  let thrown;
  try {
    await throwingFacade.getRoutedAtsAdapter(workdayTask).execute(page, workdayTask, runtime);
  } catch (caught) {
    thrown = caught;
  }
  assert.equal(thrown, error);
});

test('unsupported routes retain evidence and do not call legacy execution or page actions', async () => {
  const greenhouse = legacyAdapter('greenhouse');
  const workday = legacyAdapter('workday');
  const facade = createCareerOsAtsFacade({
    legacyAdapters: { greenhouse, workday },
  });
  const unsupportedTask = task({
    applicationId: 'app-3',
    applicationUrl: 'https://example.com/jobs/123',
    employer: 'Example',
    platform: 'greenhouse',
  });
  const page = new Proxy({}, {
    get() {
      throw new Error('unsupported route must not access the page');
    },
  });
  const reportCalls = [];
  const runtime = {
    async report(payload) {
      reportCalls.push(payload);
    },
  };

  const route = routeLegacyAtsExecution(unsupportedTask);
  assert.equal(route.detectedPlatform, 'unsupported');
  assert.equal(route.adapterId, 'unsupported');
  assert.equal(route.supported, false);
  assert.equal(route.sourceUrl, unsupportedTask.applicationUrl);
  assert.ok(route.matchedSignals.includes('url:unsupported'));
  assert.ok(route.conflictingSignals.some((signal) => signal.includes('platform_hint:greenhouse')));

  const adapter = facade.getRoutedAtsAdapter(unsupportedTask);
  assert.equal(adapter.id, 'unsupported');
  assert.equal(adapter.routingMetadata.normalizedUrl, unsupportedTask.applicationUrl);
  assert.equal(adapter.routingMetadata.supported, false);
  assert.equal(await adapter.execute(page, unsupportedTask, runtime), false);
  assert.equal(reportCalls.length, 1);
  assert.equal(reportCalls[0].status, 'blocked_technical');
  assert.equal(reportCalls[0].details.routing.adapterId, 'unsupported');
  assert.equal(greenhouse.calls.matches.length, 0);
  assert.equal(workday.calls.matches.length, 0);
  assert.equal(greenhouse.calls.execute.length, 0);
  assert.equal(workday.calls.execute.length, 0);
});

test('tracked local adapter selection path uses the routed facade', () => {
  const greenhouseAdapter = getATSAdapter(task());
  assert.equal(greenhouseAdapter.id, 'greenhouse');
  assert.equal(greenhouseAdapter.routingMetadata.adapterId, 'greenhouse');

  const workdayAdapter = getATSAdapter(task({
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dallas-TX/Product-Manager_JR123456',
    platform: 'workday',
  }));
  assert.equal(workdayAdapter.id, 'workday');
  assert.equal(workdayAdapter.routingMetadata.adapterId, 'workday');

  const unsupportedAdapter = getATSAdapter(task({
    applicationUrl: 'https://example.com/jobs/123',
    platform: 'unknown',
  }));
  assert.equal(unsupportedAdapter.id, 'unsupported');
  assert.equal(unsupportedAdapter.routingMetadata.adapterId, 'unsupported');
  assert.equal(unsupportedAdapter.routingMetadata.supported, false);
});

test('tracked Workday routed adapter reaches existing legacy execute body without live navigation', async () => {
  for (const routedTask of [
    task({
      applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dallas-TX/Product-Manager_JR123456',
      platform: 'workday',
    }),
  ]) {
    const adapter = getATSAdapter(routedTask, { env: productionEnvFor(routedTask) });
    const sentinel = new Error(`${adapter.id} navigation trapped`);
    const reportCalls = [];
    const page = {
      async goto(url) {
        assert.equal(url, routedTask.applicationUrl);
        throw sentinel;
      },
    };
    const runtime = {
      async report(payload) {
        reportCalls.push(payload);
      },
    };

    let thrown;
    try {
      await adapter.execute(page, routedTask, runtime);
    } catch (caught) {
      thrown = caught;
    }

    assert.equal(thrown, sentinel);
    assert.equal(reportCalls.length, 1);
    assert.match(reportCalls[0].evidenceText, new RegExp(routedTask.applicationUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('tracked Greenhouse production path defers before live navigation without canary authorization', async () => {
  const greenhouseTask = task();
  const adapter = getATSAdapter(greenhouseTask, { env: { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' } });
  const page = greenhouseSubmitPage(greenhouseTask.applicationUrl);
  const reportCalls = [];
  const runtime = {
    async report(payload) {
      reportCalls.push(payload);
    },
  };

  const result = await adapter.execute(page, greenhouseTask, runtime);

  assert.equal(result, true);
  assert.equal(page.state.navigatedUrl, '');
  assert.deepEqual(page.state.uploadedFiles, []);
  assert.equal(page.state.clickedSubmit, false);
  assert.ok(reportCalls.some((payload) => payload.status === 'deferred_phase_two_greenhouse'));
  assert.equal(adapter.routingMetadata.adapterId, 'greenhouse');
});

test('tracked Greenhouse production canary submits with explicit authorization', async () => {
  const greenhouseTask = task();
  const adapter = getATSAdapter(greenhouseTask, { env: productionEnvFor(greenhouseTask) });
  const page = greenhouseSubmitPage(greenhouseTask.applicationUrl);
  const reportCalls = [];
  let safetyChecks = 0;
  const runtime = {
    async detectCommonHumanGate() {
      return false;
    },
    async ensureResumeFile() {
      return '/tmp/approved-resume.pdf';
    },
    async report(payload) {
      reportCalls.push(payload);
    },
    async assertSafeToSubmit() {
      safetyChecks += 1;
    },
    async safeShot(label) {
      return `/tmp/${label}.png`;
    },
    async takeShot(label) {
      return `/tmp/${label}.png`;
    },
  };

  const result = await adapter.execute(page, greenhouseTask, runtime);

  assert.equal(result, true);
  assert.equal(page.state.navigatedUrl, greenhouseTask.applicationUrl);
  assert.deepEqual(page.state.uploadedFiles, ['/tmp/approved-resume.pdf']);
  assert.equal(safetyChecks, 1);
  assert.equal(page.state.clickedSubmit, true);
  assert.ok(reportCalls.some((payload) => payload.status === 'confirmed' || payload.status === 'submitted_confirmed'));
  assert.equal(adapter.routingMetadata.adapterId, 'greenhouse');
});

test('tracked Workday legacy path preserves account gate stop without live navigation', async () => {
  const workdayTask = task({
    applicationId: 'app-workday-runtime',
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dallas-TX/Product-Manager_JR123456',
    employer: 'Acme',
    platform: 'workday',
  });
  const adapter = getATSAdapter(workdayTask, { env: productionEnvFor(workdayTask) });
  const reportCalls = [];
  let safetyChecks = 0;
  const page = {
    state: { navigatedUrl: '' },
    url() {
      return workdayTask.applicationUrl;
    },
    async goto(url) {
      this.state.navigatedUrl = url;
    },
    async waitForTimeout() {},
    async textContent() {
      return 'Sign in or create account to continue';
    },
  };
  const runtime = {
    async detectCommonHumanGate() {
      return false;
    },
    async report(payload) {
      reportCalls.push(payload);
    },
    async takeShot(label) {
      return `/tmp/${label}.png`;
    },
    async safeShot(label) {
      return `/tmp/${label}.png`;
    },
    async assertSafeToSubmit() {
      safetyChecks += 1;
    },
  };

  const result = await adapter.execute(page, workdayTask, runtime);

  assert.equal(result, true);
  assert.equal(page.state.navigatedUrl, workdayTask.applicationUrl);
  assert.equal(safetyChecks, 0);
  assert.ok(reportCalls.some((payload) => payload.status === 'waiting_for_account_creation'));
  assert.match(reportCalls.find((payload) => payload.status === 'waiting_for_account_creation').evidenceText, /account|sign-in|sign in/i);
  assert.equal(adapter.routingMetadata.adapterId, 'workday');
});

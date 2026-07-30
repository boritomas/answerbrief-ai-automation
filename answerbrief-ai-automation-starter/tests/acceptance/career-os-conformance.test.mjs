import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertUnsupportedFacadeConformance,
  registerAdapterConformanceTests,
} from '../helpers/ats-adapter-conformance.mjs';
import { loadTsModule } from '../helpers/load-ts-module.mjs';
import {
  createCareerOsAtsFacade,
  routeLegacyAtsExecution,
} from '../../scripts/lib/career-os-ats-integration.mjs';

const registryModule = loadTsModule('lib/ats/registry.ts');
const contracts = loadTsModule('lib/ats/contracts.ts');
const observability = loadTsModule('lib/ats/observability.ts');
const router = loadTsModule('lib/ats/router.ts');
const greenhouse = loadTsModule('lib/ats/adapters/greenhouse.ts');
const unsupported = loadTsModule('lib/ats/adapters/unsupported.ts');
const workday = loadTsModule('lib/ats/adapters/workday.ts');

const baseTask = {
  applicationId: 'app-conformance',
  candidate: {},
  companionId: 'test-companion',
  legal: { approvedAcknowledgements: [] },
  ownerEmail: 'tomas@example.com',
  questionCatalog: [],
  resume: { fileName: 'resume.txt' },
};

function greenhouseTask(overrides = {}) {
  return {
    ...baseTask,
    applicationUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456?gh_jid=123456',
    employer: 'Affirm',
    platform: 'greenhouse',
    position: 'Product Manager',
    ...overrides,
  };
}

function workdayTask(overrides = {}) {
  return {
    ...baseTask,
    applicationId: 'app-workday-conformance',
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dallas-TX/Product-Manager_JR123456',
    employer: 'Acme',
    platform: 'workday',
    position: 'Product Manager',
    ...overrides,
  };
}

function unsupportedTask(overrides = {}) {
  return {
    ...baseTask,
    applicationId: 'app-unsupported-conformance',
    applicationUrl: 'https://example.com/jobs/123',
    employer: 'Example',
    platform: 'unknown',
    position: 'Product Manager',
    ...overrides,
  };
}

registerAdapterConformanceTests(test, {
  adapter: async () => greenhouse.greenhouseCompatibilityAdapter,
  context: { platformHint: 'greenhouse', sourceUrl: greenhouseTask().applicationUrl },
  executeResult: true,
  facade: createCareerOsAtsFacade,
  label: 'Greenhouse',
  platform: 'greenhouse',
  status: 'compatibility',
  task: greenhouseTask,
});

registerAdapterConformanceTests(test, {
  adapter: async () => workday.workdayCompatibilityAdapter,
  allowedStatuses: ['compatibility', 'experimental'],
  context: { platformHint: 'workday', sourceUrl: workdayTask().applicationUrl },
  executeResult: false,
  facade: createCareerOsAtsFacade,
  label: 'Workday',
  platform: 'workday',
  task: workdayTask,
});

registerAdapterConformanceTests(test, {
  adapter: async () => unsupported.unsupportedAtsAdapter,
  context: { platformHint: 'unknown', sourceUrl: unsupportedTask().applicationUrl },
  label: 'Unsupported',
  platform: 'unsupported',
  status: 'unsupported',
});

test('registry-wide conformance allows only Phase 2 ATS platforms', () => {
  const registry = registryModule.createDefaultAtsAdapterRegistry();
  const metadata = registry.listMetadata();
  const adapterIds = metadata.map((entry) => entry.adapterId).sort();

  assert.deepEqual(adapterIds, ['greenhouse', 'unsupported', 'workday']);
  assert.equal(registry.getAdapter('greenhouse').metadata.adapterId, 'greenhouse');
  assert.equal(registry.getAdapter('workday').metadata.adapterId, 'workday');
  assert.equal(registry.getAdapter('unsupported').metadata.adapterId, 'unsupported');
  assert.equal(registry.getAdapter('unknown').metadata.adapterId, 'unsupported');
  assert.equal(registry.hasSupportedAdapter('unknown'), false);
  assert.throws(() => registry.register(greenhouse.greenhouseCompatibilityAdapter, 'greenhouse'), /already registered/);
});

test('normalized ATS context preserves route evidence and original task identity', () => {
  const task = greenhouseTask();
  const before = JSON.stringify(task);
  const route = router.routeAtsApplication({
    applicationId: task.applicationId,
    originalTask: task,
    platformHint: task.platform,
    sourceUrl: task.applicationUrl,
  });

  assert.equal(route.normalizedContext.originalTask, task);
  assert.equal(JSON.stringify(task), before);
  assert.equal(route.normalizedContext.detectedPlatform, 'greenhouse');
  assert.equal(route.normalizedContext.sourceUrl, task.applicationUrl);
  assert.equal(route.normalizedContext.normalizedUrl.includes('gh_jid=123456'), true);
  assert.equal(route.normalizedContext.tenant, 'affirm');
  assert.equal(route.normalizedContext.jobId, '123456');
  assert.equal(route.normalizedContext.adapterId, 'greenhouse');
  assert.equal(route.normalizedContext.supported, true);
  assert.ok(route.normalizedContext.matchedSignals.some((signal) => signal.includes('greenhouse')));
});

test('router handles URL variants, missing identity, confidence, and conflicts without mutation', () => {
  const variants = [
    {
      expectedJobId: '123456',
      expectedPlatform: 'greenhouse',
      expectedTenant: 'affirm',
      url: 'https://boards-api.greenhouse.io/v1/boards/affirm/jobs/123456',
    },
    {
      expectedJobId: 'Senior-Product-Manager_JR123456',
      expectedPlatform: 'workday',
      expectedTenant: 'acme.wd5.myworkdayjobs.com:en-US/External',
      url: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dallas-TX/Senior-Product-Manager_JR123456',
    },
  ];

  for (const variant of variants) {
    const route = router.routeAtsApplication({ sourceUrl: variant.url });
    assert.equal(route.detection.platform, variant.expectedPlatform);
    assert.equal(route.normalizedContext.jobId, variant.expectedJobId);
    assert.equal(route.normalizedContext.tenant, variant.expectedTenant);
    assert.ok(route.normalizedContext.confidence >= 0.9);
    assert.ok(route.normalizedContext.matchedSignals.length > 0);
  }

  const missingIdentity = router.routeAtsApplication({ sourceUrl: 'https://job-boards.greenhouse.io/' });
  assert.equal(missingIdentity.normalizedContext.detectedPlatform, 'greenhouse');
  assert.ok(missingIdentity.normalizedContext.unknowns.includes('tenant'));
  assert.ok(missingIdentity.normalizedContext.unknowns.includes('job_id'));

  const conflict = router.routeAtsApplication({
    platformHint: 'workday',
    sourceUrl: greenhouseTask().applicationUrl,
  });
  assert.equal(conflict.normalizedContext.detectedPlatform, 'greenhouse');
  assert.ok(conflict.normalizedContext.conflictingSignals.some((signal) => signal.includes('workday')));
  assert.ok(conflict.normalizedContext.confidence < 0.9);

  const unsupportedRoute = router.routeAtsApplication({ sourceUrl: unsupportedTask().applicationUrl });
  assert.equal(unsupportedRoute.normalizedContext.detectedPlatform, 'unsupported');
  assert.equal(unsupportedRoute.normalizedContext.supported, false);
  assert.ok(unsupportedRoute.normalizedContext.matchedSignals.includes('url:unsupported'));
});

test('JavaScript facade normalized context stays aligned with typed router context', () => {
  const task = workdayTask();
  const scriptRoute = routeLegacyAtsExecution(task);
  const typedRoute = router.routeAtsApplication({
    applicationId: task.applicationId,
    originalTask: task,
    platformHint: task.platform,
    sourceUrl: task.applicationUrl,
  });

  for (const key of [
    'detectedPlatform',
    'sourceUrl',
    'normalizedUrl',
    'platformHint',
    'tenant',
    'jobId',
    'applicationId',
    'confidence',
    'detectorVersion',
    'adapterId',
    'adapterVersion',
    'implementationStatus',
    'supported',
  ]) {
    assert.deepEqual(scriptRoute.normalizedContext[key], typedRoute.normalizedContext[key], key);
  }
  assert.equal(scriptRoute.normalizedContext.originalTask, task);
  assert.deepEqual(scriptRoute.normalizedContext.matchedSignals, typedRoute.normalizedContext.matchedSignals);
  assert.deepEqual(scriptRoute.normalizedContext.conflictingSignals, typedRoute.normalizedContext.conflictingSignals);
});

test('unsupported facade conformance blocks execution without page interaction', async () => {
  await assertUnsupportedFacadeConformance({
    facade: createCareerOsAtsFacade,
    task: unsupportedTask(),
  });
});

test('observability contract maps phase results to local workflow event patches without persistence', () => {
  const result = contracts.createPhaseResult({
    phase: 'locateSubmitControl',
    status: 'succeeded',
    canonicalState: 'SUBMIT_CONTROL_RESOLVED',
    metadata: greenhouse.greenhouseCompatibilityAdapter.metadata,
    currentUrl: greenhouseTask().applicationUrl,
    data: {
      submitControl: {
        selectorType: 'css',
        selectorValue: 'button[type=submit]',
        visible: true,
        enabled: true,
      },
    },
  });
  const event = observability.phaseResultToExecutionEvent(result, {
    applicationId: 'app-observability',
    eventId: 'event-observability',
    jobId: '123456',
  });
  const patch = observability.executionEventToWorkflowEvent(event);

  assert.equal(event.eventId, 'event-observability');
  assert.equal(event.selectorType, 'css');
  assert.equal(event.selectorValue, 'button[type=submit]');
  assert.equal(patch.application_id, 'app-observability');
  assert.equal(patch.event_type, 'ats_locateSubmitControl');
  assert.equal(patch.platform, 'greenhouse');
  assert.equal(patch.metadata.selector_type, 'css');
});

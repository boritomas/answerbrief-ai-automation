import assert from 'node:assert/strict';

export const capabilityKeys = [
  'supportsResumeUpload',
  'supportsResumeParsing',
  'supportsSavedProfile',
  'supportsAccountCreation',
  'supportsAuthenticatedSessions',
  'supportsMultiStepApplications',
  'supportsRepeatedWorkHistory',
  'supportsRepeatedEducation',
  'supportsDynamicQuestions',
  'supportsSubmissionVerification',
  'supportsEvidenceScreenshots',
  'requiresCandidateAccount',
  'supportsAnonymousApplication',
  'supportsPauseAndResume',
];

export function registerAdapterConformanceTests(test, descriptor) {
  test(`${descriptor.label} adapter metadata conforms`, async () => {
    const adapter = await descriptor.adapter();
    assertAdapterMetadata(adapter, descriptor);
  });

  test(`${descriptor.label} adapter phase results conform`, async () => {
    const adapter = await descriptor.adapter();
    await assertAdapterPhaseResults(adapter, descriptor.context);
  });

  if (descriptor.facade) {
    test(`${descriptor.label} facade delegation conforms`, async () => {
      await assertFacadeDelegation(descriptor);
    });
  }
}

export function assertAdapterMetadata(adapter, descriptor = {}) {
  assert.ok(adapter, 'adapter exists');
  assert.ok(adapter.metadata.adapterId, 'adapter ID exists');
  assert.ok(adapter.metadata.adapterVersion, 'adapter version exists');
  assert.ok(adapter.metadata.implementationStatus, 'implementation status exists');
  assert.ok(Array.isArray(adapter.metadata.supportedPlatforms), 'supported platform list exists');
  assert.ok(adapter.metadata.supportedPlatforms.length > 0, 'supported platform list is nonempty');
  if (descriptor.platform) {
    assert.ok(adapter.metadata.supportedPlatforms.includes(descriptor.platform), `${descriptor.platform} is supported`);
  }
  if (descriptor.status) {
    assert.equal(adapter.metadata.implementationStatus, descriptor.status);
  }
  if (descriptor.allowedStatuses) {
    assert.ok(descriptor.allowedStatuses.includes(adapter.metadata.implementationStatus), 'implementation status is allowed');
  }

  assert.ok(adapter.capabilities && typeof adapter.capabilities === 'object', 'capabilities object exists');
  for (const key of capabilityKeys) {
    assert.equal(typeof adapter.capabilities[key], 'boolean', `${adapter.metadata.adapterId}.${key} is boolean`);
  }

  if (adapter.metadata.implementationStatus === 'unsupported') {
    assert.equal(Object.values(adapter.capabilities).some(Boolean), false, 'unsupported adapter advertises no capabilities');
  }
}

export async function assertAdapterPhaseResults(adapter, context = {}) {
  const phases = [
    ['openApplication', 'openApplication'],
    ['authenticate', 'authenticate'],
    ['uploadResume', 'uploadResume'],
    ['inspectApplication', 'inspectApplication'],
    ['mapFields', 'mapFields'],
    ['fillFields', 'fillFields'],
    ['answerQuestions', 'answerQuestions'],
    ['validate', 'validate'],
    ['locateSubmitControl', 'locateSubmitControl'],
    ['clickSubmit', 'clickSubmit'],
    ['verifySubmission', 'verifySubmission'],
    ['captureEvidence', 'captureEvidence'],
  ];

  for (const [method, expectedPhase] of phases) {
    const result = await adapter[method]({
      mode: 'dry_run',
      sourceUrl: context.sourceUrl || 'https://example.com/jobs/fixture',
      platformHint: context.platformHint,
      rawJobRecord: context.rawJobRecord || {},
    });
    assertPhaseResult(result, adapter, expectedPhase);
    if (adapter.metadata.implementationStatus === 'unsupported') {
      assert.equal(result.canonicalState, 'TERMINAL_FAILURE');
      assert.notEqual(result.status, 'succeeded');
    }
  }
}

export function assertPhaseResult(result, adapter, expectedPhase) {
  assert.equal(result.phase, expectedPhase);
  assert.equal(result.adapterId, adapter.metadata.adapterId);
  assert.equal(result.adapterVersion, adapter.metadata.adapterVersion);
  assert.ok(result.status, 'phase status exists');
  assert.ok(result.canonicalState, 'canonical state exists');
  assert.ok(result.startedAt, 'startedAt exists');
  assert.ok(result.completedAt, 'completedAt exists');
  assert.equal(typeof result.durationMs, 'number', 'durationMs is numeric');
  assert.ok(Array.isArray(result.evidence), 'evidence is an array');
  assert.ok(Array.isArray(result.unknowns), 'unknowns is an array');
}

export async function assertFacadeDelegation(descriptor) {
  const page = { marker: `${descriptor.platform}-page` };
  const runtime = { marker: `${descriptor.platform}-runtime` };
  const task = descriptor.task();
  const primary = legacyAdapter(descriptor.platform, descriptor.executeResult);
  const otherPlatform = descriptor.platform === 'greenhouse' ? 'workday' : 'greenhouse';
  const other = legacyAdapter(otherPlatform, true);
  const facade = descriptor.facade({
    legacyAdapters: {
      [descriptor.platform]: primary.adapter,
      [otherPlatform]: other.adapter,
    },
  });
  const routed = facade.getRoutedAtsAdapter(task);

  assert.equal(routed.id, descriptor.platform);
  assert.equal(routed.routingMetadata.adapterId, descriptor.platform);
  assert.equal(routed.routingMetadata.supported, true);
  assert.ok(routed.routingMetadata.matchedSignals.length > 0, 'routing evidence is preserved');
  assert.equal(routed.matches(task), true);
  assert.equal(await routed.execute(page, task, runtime), descriptor.executeResult);
  assert.equal(primary.calls.execute.length, 1);
  assert.equal(primary.calls.execute[0].page, page);
  assert.equal(primary.calls.execute[0].task, task);
  assert.equal(primary.calls.execute[0].runtime, runtime);
  assert.equal(other.calls.execute.length, 0);

  const error = new Error(`${descriptor.platform} conformance error`);
  const throwing = legacyAdapter(descriptor.platform, true, error);
  const throwingFacade = descriptor.facade({
    legacyAdapters: {
      [descriptor.platform]: throwing.adapter,
      [otherPlatform]: other.adapter,
    },
  });
  await assert.rejects(
    () => throwingFacade.getRoutedAtsAdapter(task).execute(page, task, runtime),
    (caught) => caught === error,
  );
}

export async function assertUnsupportedFacadeConformance({ facade, task }) {
  const greenhouse = legacyAdapter('greenhouse', true);
  const workday = legacyAdapter('workday', true);
  const routedFacade = facade({
    legacyAdapters: {
      greenhouse: greenhouse.adapter,
      workday: workday.adapter,
    },
  });
  const adapter = routedFacade.getRoutedAtsAdapter(task);
  const reportCalls = [];
  const page = new Proxy({}, {
    get() {
      throw new Error('unsupported adapter must not touch the page');
    },
  });
  const runtime = {
    async report(payload) {
      reportCalls.push(payload);
    },
  };

  assert.equal(adapter.id, 'unsupported');
  assert.equal(adapter.routingMetadata.supported, false);
  assert.equal(adapter.routingMetadata.adapterId, 'unsupported');
  assert.equal(await adapter.execute(page, task, runtime), false);
  assert.equal(reportCalls.length, 1);
  assert.equal(reportCalls[0].status, 'blocked_technical');
  assert.equal(greenhouse.calls.execute.length, 0);
  assert.equal(workday.calls.execute.length, 0);
}

export function legacyAdapter(id, executeResult = true, error) {
  const calls = {
    matches: [],
    execute: [],
  };
  return {
    calls,
    adapter: {
      id,
      matches(task) {
        calls.matches.push(task);
        return true;
      },
      async execute(page, task, runtime) {
        calls.execute.push({ page, task, runtime });
        if (error) throw error;
        return executeResult;
      },
    },
  };
}

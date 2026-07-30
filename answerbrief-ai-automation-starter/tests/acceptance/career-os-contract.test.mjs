import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { loadTsModule } from '../helpers/load-ts-module.mjs';

const appRoot = process.cwd();
const contracts = loadTsModule('lib/ats/contracts.ts');
const detector = loadTsModule('lib/ats/detector.ts');
const registryModule = loadTsModule('lib/ats/registry.ts');
const router = loadTsModule('lib/ats/router.ts');
const orchestrator = loadTsModule('lib/ats/application-orchestrator.ts');
const fieldMapping = loadTsModule('lib/ats/field-mapping.ts');
const legacyBridge = loadTsModule('lib/ats/legacy-adapter-bridge.ts');
const greenhouse = loadTsModule('lib/ats/adapters/greenhouse.ts');
const unsupported = loadTsModule('lib/ats/adapters/unsupported.ts');
const workday = loadTsModule('lib/ats/adapters/workday.ts');

const capabilityKeys = [
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

test('ATS detector classifies Greenhouse URLs with evidence', () => {
  const result = detector.detectAts({
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456?gh_jid=123456',
  });

  assert.equal(result.platform, 'greenhouse');
  assert.equal(result.tenant, 'affirm');
  assert.equal(result.jobId, '123456');
  assert.ok(result.confidence >= 0.9);
  assert.ok(result.matchedSignals.some((signal) => signal.includes('greenhouse')));
  assert.equal(result.normalized.platform, 'greenhouse');
});

test('ATS detector classifies Workday URLs with tenant and job id', () => {
  const result = detector.detectAts({
    sourceUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dallas-TX/Senior-Product-Manager_JR123456',
  });

  assert.equal(result.platform, 'workday');
  assert.ok(String(result.tenant).includes('myworkdayjobs.com'));
  assert.equal(result.jobId, 'Senior-Product-Manager_JR123456');
  assert.ok(result.confidence >= 0.9);
});

test('ATS detector routes unknown URLs to unsupported and surfaces conflicts', () => {
  const unknown = detector.detectAts({ sourceUrl: 'https://example.com/jobs/123' });
  assert.equal(unknown.platform, 'unsupported');
  assert.ok(unknown.matchedSignals.includes('url:unsupported'));

  const conflict = detector.detectAts({
    platformHint: 'workday',
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  });
  assert.equal(conflict.platform, 'greenhouse');
  assert.ok(conflict.conflictingSignals.length > 0);
  assert.ok(conflict.confidence < 0.9);
});

test('adapter registry selects supported adapters and rejects duplicate registration', () => {
  const registry = registryModule.createDefaultAtsAdapterRegistry();
  assert.equal(registry.getAdapter('greenhouse').metadata.adapterId, 'greenhouse');
  assert.equal(registry.getAdapter('workday').metadata.adapterId, 'workday');
  assert.equal(registry.getAdapter('unknown').metadata.adapterId, 'unsupported');
  assert.equal(registry.getAdapter('unsupported').metadata.implementationStatus, 'unsupported');
  assert.throws(() => registry.register(greenhouse.greenhouseCompatibilityAdapter, 'greenhouse'), /already registered/);
});

test('adapter capabilities and metadata are explicit', () => {
  const adapters = [
    greenhouse.greenhouseCompatibilityAdapter,
    workday.workdayCompatibilityAdapter,
    unsupported.unsupportedAtsAdapter,
  ];

  for (const adapter of adapters) {
    assert.ok(adapter.metadata.adapterId);
    assert.ok(adapter.metadata.adapterVersion);
    assert.ok(adapter.metadata.implementationStatus);
    assert.ok(adapter.metadata.runtimeType);
    for (const key of capabilityKeys) {
      assert.equal(typeof adapter.capabilities[key], 'boolean', `${adapter.metadata.adapterId}.${key}`);
    }
  }

  assert.equal(Object.values(unsupported.unsupportedAtsAdapter.capabilities).some(Boolean), false);
  assert.equal(greenhouse.greenhouseCompatibilityAdapter.metadata.implementationStatus, 'compatibility');
  assert.equal(workday.workdayCompatibilityAdapter.metadata.implementationStatus, 'experimental');
});

test('router preserves detector evidence and returns unsupported safely', () => {
  const greenhouseRoute = router.routeAtsApplication({
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  });
  assert.equal(greenhouseRoute.supported, true);
  assert.equal(greenhouseRoute.adapterMetadata.adapterId, 'greenhouse');
  assert.ok(greenhouseRoute.matchedSignals.length > 0);

  const workdayRoute = router.routeAtsApplication({
    sourceUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Remote/Product_JR999',
  });
  assert.equal(workdayRoute.supported, true);
  assert.equal(workdayRoute.adapterMetadata.adapterId, 'workday');

  const unsupportedRoute = router.routeAtsApplication({
    sourceUrl: 'https://jobs.example.net/apply/abc',
  });
  assert.equal(unsupportedRoute.supported, false);
  assert.equal(unsupportedRoute.adapterMetadata.adapterId, 'unsupported');
  assert.match(unsupportedRoute.reason, /will not attempt generic submission/i);
});

test('orchestrator transition validation prevents false success states', () => {
  const metadata = greenhouse.greenhouseCompatibilityAdapter.metadata;
  const validationResult = contracts.createPhaseResult({
    phase: 'validate',
    status: 'succeeded',
    canonicalState: 'VALIDATION_PASSED',
    metadata,
    evidence: [contracts.createEvidenceItem({ kind: 'validation', label: 'required fields clear' })],
    data: {
      requiredFieldInspectionCompleted: true,
      unresolvedRequiredFields: 0,
      validationErrors: [],
    },
  });
  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'FORM_COMPLETED',
    to: 'VALIDATION_PASSED',
    result: validationResult,
  }).ok, true);

  const badClick = contracts.createPhaseResult({
    phase: 'clickSubmit',
    status: 'failed',
    canonicalState: 'SUBMIT_CONTROL_RESOLVED',
    metadata,
    data: {
      clicked: false,
      submitControl: {
        selectorType: 'css',
        selectorValue: 'button[type=submit]',
        visible: true,
        enabled: true,
      },
    },
  });
  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'SUBMIT_CONTROL_RESOLVED',
    to: 'SUBMIT_CLICKED',
    result: badClick,
  }).ok, false);

  const clickWithoutConfirmation = contracts.createPhaseResult({
    phase: 'verifySubmission',
    status: 'succeeded',
    canonicalState: 'SUBMIT_CLICKED',
    metadata,
    data: { confirmed: false },
  });
  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'SUBMIT_CLICKED',
    to: 'SUBMISSION_CONFIRMED',
    result: clickWithoutConfirmation,
  }).ok, false);
});

test('orchestrator classifies user gates, retryable failures, terminal failures, and dry-run submit stop', async () => {
  const metadata = greenhouse.greenhouseCompatibilityAdapter.metadata;
  const phaseResult = (phase, canonicalState, data = {}, evidence = []) => contracts.createPhaseResult({
    phase,
    status: 'succeeded',
    canonicalState,
    metadata,
    evidence,
    data,
  });
  const gateResult = contracts.createPhaseResult({
    phase: 'validate',
    status: 'paused',
    canonicalState: 'WAITING_ON_USER',
    metadata,
    userGate: {
      category: 'MISSING_VERIFIED_FACT',
      label: 'Missing fact',
      reason: 'A required field needs Tomas.',
    },
  });
  assert.equal(orchestrator.classifyPhaseResultOutcome(gateResult), 'WAITING_ON_USER');

  const retryResult = contracts.createPhaseResult({
    phase: 'openApplication',
    status: 'failed',
    canonicalState: 'RETRYABLE_FAILURE',
    metadata,
    retryPolicy: {
      classification: 'transient_navigation',
      retryable: true,
      reason: 'Temporary navigation issue.',
    },
  });
  assert.equal(orchestrator.classifyPhaseResultOutcome(retryResult), 'RETRYABLE_FAILURE');

  const terminalWithRetrySignals = contracts.createPhaseResult({
    phase: 'openApplication',
    status: 'failed',
    canonicalState: 'RETRYABLE_FAILURE',
    metadata,
    failure: {
      code: 'runtime_error',
      message: 'Terminal failures must not become automatic retries.',
      retryPolicy: {
        classification: 'terminal',
        retryable: true,
        reason: 'Contradictory adapter signal.',
      },
      terminal: true,
    },
  });
  assert.equal(orchestrator.classifyPhaseResultOutcome(terminalWithRetrySignals), 'TERMINAL_FAILURE');

  const terminal = await unsupported.unsupportedAtsAdapter.openApplication({
    mode: 'dry_run',
    sourceUrl: 'https://jobs.example.com/1',
  });
  assert.equal(orchestrator.classifyPhaseResultOutcome(terminal), 'TERMINAL_FAILURE');
  assert.equal(terminal.failure.terminal, true);
  assert.equal(terminal.failure.retryPolicy.retryable, false);

  const unsupportedRun = await orchestrator.orchestrateAtsApplication(unsupported.unsupportedAtsAdapter, {
    mode: 'dry_run',
    sourceUrl: 'https://jobs.example.com/1',
  });
  assert.equal(unsupportedRun.finalState, 'TERMINAL_FAILURE');
  assert.equal(unsupportedRun.phases.length, 1);
  assert.equal(unsupportedRun.phases[0].phase, 'openApplication');

  const safeAdapter = {
    ...greenhouse.greenhouseCompatibilityAdapter,
    openApplication: async () => phaseResult('openApplication', 'APPLICATION_OPENED', { opened: true }),
    authenticate: async () => phaseResult('authenticate', 'APPLICATION_OPENED', {
      authenticated: true,
      sessionRequired: false,
    }),
    uploadResume: async () => phaseResult('uploadResume', 'APPLICATION_OPENED', { uploaded: true }),
    inspectApplication: async () => phaseResult('inspectApplication', 'FORM_INSPECTED', {
      fieldsDetected: 2,
      requiredFields: 0,
    }),
    mapFields: async () => phaseResult('mapFields', 'FORM_INSPECTED', {
      fieldsMapped: 2,
      unresolvedFields: [],
    }),
    fillFields: async () => phaseResult('fillFields', 'FORM_COMPLETED', {
      fieldsCompleted: 2,
      unresolvedFields: [],
    }),
    answerQuestions: async () => phaseResult('answerQuestions', 'FORM_COMPLETED', {
      questionsAnswered: 0,
      unresolvedQuestions: [],
    }),
    validate: async () => phaseResult('validate', 'VALIDATION_PASSED', {
      requiredFieldInspectionCompleted: true,
      unresolvedRequiredFields: 0,
      validationErrors: [],
    }, [contracts.createEvidenceItem({ kind: 'validation', label: 'required fields clear' })]),
    locateSubmitControl: async () => phaseResult('locateSubmitControl', 'SUBMIT_CONTROL_RESOLVED', {
      submitControl: {
        selectorType: 'css',
        selectorValue: 'button[type=submit]',
        visible: true,
        enabled: true,
      },
    }),
    clickSubmit: async () => {
      throw new Error('dry run must stop before clickSubmit');
    },
  };

  const dryRun = await orchestrator.orchestrateAtsApplication(safeAdapter, {
    mode: 'dry_run',
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  });
  assert.equal(dryRun.stoppedReason, 'dry_run_submit_blocked');
  assert.notEqual(dryRun.finalState, 'SUBMISSION_CONFIRMED');

  const unsafeClickAdapter = {
    ...safeAdapter,
    clickSubmit: async () => contracts.createPhaseResult({
      phase: 'clickSubmit',
      status: 'succeeded',
      canonicalState: 'SUBMIT_CLICKED',
      metadata,
      data: {
        clicked: false,
        submitControl: {
          selectorType: 'css',
          selectorValue: 'button[type=submit]',
          visible: true,
          enabled: true,
        },
      },
    }),
  };
  const unsafeClick = await orchestrator.orchestrateAtsApplication(unsafeClickAdapter, {
    mode: 'live',
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  }, { allowSubmit: true });
  assert.equal(unsafeClick.finalState, 'TERMINAL_FAILURE');
  assert.match(unsafeClick.failure.message, /clicked is not true/);

  const unsafeConfirmedAdapter = {
    ...safeAdapter,
    openApplication: async () => phaseResult('openApplication', 'SUBMISSION_CONFIRMED', { opened: true }),
  };
  const unsafeConfirmed = await orchestrator.orchestrateAtsApplication(unsafeConfirmedAdapter, {
    mode: 'dry_run',
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  }, { maxSteps: 1 });
  assert.equal(unsafeConfirmed.finalState, 'TERMINAL_FAILURE');
  assert.match(unsafeConfirmed.failure.message, /only be claimed by verifySubmission/);
});

test('field mapping preserves provenance and blocks unsafe answers', () => {
  const requestedEmail = {
    visibleLabel: 'Email Address',
    controlType: 'text',
    options: [],
    required: true,
  };
  const values = [
    fieldMapping.canonicalFieldValue({
      canonicalFieldKey: 'email',
      value: 'tomas@example.com',
      displayValue: 'tomas@example.com',
      source: 'verified_profile.contact.email',
      confidence: 0.99,
      verified: true,
      authorizationStatus: 'authorized',
      sensitivityClassification: 'contact',
      reviewedAt: '2026-07-24T00:00:00.000Z',
      provenance: { profileVersion: 'fixture-profile' },
    }),
  ];

  const mapped = fieldMapping.resolveCanonicalFieldValue(requestedEmail, values);
  assert.equal(mapped.canAutofill, true);
  assert.deepEqual(mapped.provenance, { profileVersion: 'fixture-profile' });

  const missing = fieldMapping.resolveCanonicalFieldValue({
    visibleLabel: 'LinkedIn',
    controlType: 'text',
    options: [],
    required: false,
  }, values);
  assert.equal(missing.canAutofill, false);
  assert.equal(missing.reasonUnavailable, 'missing_canonical_value');

  const lowConfidence = fieldMapping.resolveCanonicalFieldValue(requestedEmail, [{
    ...values[0],
    confidence: 0.4,
  }]);
  assert.equal(lowConfidence.reasonUnavailable, 'low_confidence_value');
  assert.equal(lowConfidence.userGate.category, 'LOW_CONFIDENCE_ANSWER');

  const salary = fieldMapping.resolveCanonicalFieldValue({
    visibleLabel: 'Desired compensation',
    controlType: 'text',
    options: [],
    required: true,
  }, [{
    canonicalFieldKey: 'salary_expectation',
    value: '200000',
    displayValue: '$200,000',
    source: 'manual_fixture',
    confidence: 0.99,
    verified: true,
    authorizationStatus: 'authorization_required',
    sensitivityClassification: 'salary',
    provenance: { source: 'fixture' },
  }]);
  assert.equal(salary.canAutofill, false);
  assert.equal(salary.reasonUnavailable, 'sensitive_value_requires_authorization');
  assert.equal(salary.userGate.category, 'SALARY_DECISION_REQUIRED');

  const sponsorship = fieldMapping.resolveCanonicalFieldValue({
    visibleLabel: 'Will you now or in the future require visa sponsorship?',
    controlType: 'select',
    options: ['Yes', 'No'],
    required: true,
  }, [{
    canonicalFieldKey: 'sponsorship_now',
    value: 'No',
    displayValue: 'No',
    source: 'verified_profile.work_authorization.sponsorship_now',
    confidence: 0.98,
    verified: true,
    authorizationStatus: 'authorized_for_application',
    sensitivityClassification: 'sponsorship',
    provenance: { source: 'candidate_review_2026_07_24' },
  }]);
  assert.equal(sponsorship.canAutofill, true);

  const legalConsent = fieldMapping.resolveCanonicalFieldValue({
    visibleLabel: 'I consent to the privacy policy and certify my application',
    controlType: 'checkbox',
    options: ['I agree'],
    required: true,
  }, [{
    canonicalFieldKey: 'legal_consent',
    value: true,
    displayValue: 'I agree',
    source: 'prior_application.legal_consent',
    confidence: 0.99,
    verified: true,
    authorizationStatus: 'authorized_for_reuse',
    sensitivityClassification: 'legal',
    provenance: { source: 'prior_application' },
  }]);
  assert.equal(legalConsent.canAutofill, false);
  assert.equal(legalConsent.reasonUnavailable, 'legal_consent_requires_application_review');
  assert.equal(legalConsent.userGate.category, 'LEGAL_CONSENT_REQUIRED');

  const demographics = fieldMapping.resolveCanonicalFieldValue({
    visibleLabel: 'Gender',
    controlType: 'select',
    options: ['Decline to answer', 'Woman', 'Man'],
    required: false,
  }, [{
    canonicalFieldKey: 'gender',
    value: 'Decline to answer',
    displayValue: 'Decline to answer',
    source: 'candidate_profile.demographics.gender',
    confidence: 0.99,
    verified: true,
    authorizationStatus: 'authorized_for_application',
    sensitivityClassification: 'demographic',
    provenance: { source: 'candidate_profile' },
  }]);
  assert.equal(demographics.canAutofill, false);
  assert.equal(demographics.reasonUnavailable, 'demographic_decision_user_controlled');
  assert.equal(demographics.userGate.category, 'DEMOGRAPHIC_DECISION_REQUIRED');

  const expired = fieldMapping.resolveCanonicalFieldValue(requestedEmail, [{
    ...values[0],
    expiresAt: '2026-01-01T00:00:00.000Z',
  }]);
  assert.equal(expired.canAutofill, false);
  assert.equal(expired.reasonUnavailable, 'value_expired');
  assert.equal(expired.userGate.category, 'MISSING_VERIFIED_FACT');

  const conflicting = fieldMapping.resolveCanonicalFieldValue(requestedEmail, [{
    ...values[0],
    provenance: {
      profileVersion: 'fixture-profile',
      conflicts: ['candidate_profile.email', 'resume.email'],
    },
  }]);
  assert.equal(conflicting.canAutofill, false);
  assert.equal(conflicting.reasonUnavailable, 'conflicting_provenance');
  assert.deepEqual(conflicting.provenance.conflicts, ['candidate_profile.email', 'resume.email']);
});

test('legacy bridge keeps matches and execute shape compatible', async () => {
  const legacyModule = await import(pathToFileURL(path.join(appRoot, 'scripts/lib/career-os-ats-adapters.mjs')).href);
  const greenhouseTask = {
    applicationId: 'app-1',
    applicationUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
    candidate: {},
    companionId: 'test',
    employer: 'Affirm',
    legal: { approvedAcknowledgements: [] },
    ownerEmail: 'tomas@example.com',
    platform: 'greenhouse',
    position: 'Product Manager',
    questionCatalog: [],
    resume: { fileName: 'resume.txt' },
  };

  const legacyGreenhouse = legacyModule.getATSAdapter(greenhouseTask);
  assert.equal(legacyGreenhouse.id, 'greenhouse');
  assert.equal(legacyGreenhouse.matches(greenhouseTask), true);
  const originalGreenhouseExecute = legacyGreenhouse.execute;
  let greenhouseDelegated = false;
  legacyGreenhouse.execute = async (page, receivedTask, runtime) => {
    greenhouseDelegated = true;
    assert.equal(receivedTask, greenhouseTask);
    assert.equal(page.marker, 'greenhouse-page');
    assert.equal(runtime.marker, 'runtime');
    return true;
  };
  try {
    const bridge = legacyBridge.createLegacyAdapterBridge(greenhouse.greenhouseCompatibilityAdapter, {
      legacyAdapter: legacyGreenhouse,
      platform: 'greenhouse',
    });
    assert.equal(bridge.matches(greenhouseTask), true);
    assert.equal(await bridge.execute({ marker: 'greenhouse-page' }, greenhouseTask, { marker: 'runtime' }), true);
    assert.equal(greenhouseDelegated, true);
  } finally {
    legacyGreenhouse.execute = originalGreenhouseExecute;
  }

  const workdayTask = {
    ...greenhouseTask,
    applicationId: 'app-2',
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Dallas-TX/Product-Manager_JR123456',
    employer: 'Acme',
    platform: 'workday',
  };
  const legacyWorkday = legacyModule.getATSAdapter(workdayTask);
  assert.equal(legacyWorkday.id, 'workday');
  assert.equal(legacyWorkday.matches(workdayTask), true);
  const originalWorkdayExecute = legacyWorkday.execute;
  let workdayDelegated = false;
  legacyWorkday.execute = async (page, receivedTask, runtime) => {
    workdayDelegated = true;
    assert.equal(receivedTask, workdayTask);
    assert.equal(page.marker, 'workday-page');
    assert.equal(runtime.marker, 'runtime');
    return false;
  };
  try {
    const bridge = legacyBridge.createLegacyAdapterBridge(workday.workdayCompatibilityAdapter, {
      legacyAdapter: legacyWorkday,
      platform: 'workday',
    });
    assert.equal(bridge.matches(workdayTask), true);
    assert.equal(await bridge.execute({ marker: 'workday-page' }, workdayTask, { marker: 'runtime' }), false);
    assert.equal(workdayDelegated, true);
  } finally {
    legacyWorkday.execute = originalWorkdayExecute;
  }

  const unsupportedBridge = legacyBridge.createLegacyAdapterBridge(unsupported.unsupportedAtsAdapter);
  assert.equal(unsupportedBridge.matches({ ...greenhouseTask, applicationUrl: 'https://jobs.example.com/1', platform: 'unknown' }), true);
});

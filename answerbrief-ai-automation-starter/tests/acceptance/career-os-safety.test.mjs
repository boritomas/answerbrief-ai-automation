import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTsModule } from '../helpers/load-ts-module.mjs';

const contracts = loadTsModule('lib/ats/contracts.ts');
const orchestrator = loadTsModule('lib/ats/application-orchestrator.ts');
const fieldMapping = loadTsModule('lib/ats/field-mapping.ts');
const greenhouse = loadTsModule('lib/ats/adapters/greenhouse.ts');
const unsupported = loadTsModule('lib/ats/adapters/unsupported.ts');

const metadata = greenhouse.greenhouseCompatibilityAdapter.metadata;

function phaseResult(phase, canonicalState, data = {}, evidence = []) {
  return contracts.createPhaseResult({
    phase,
    status: 'succeeded',
    canonicalState,
    metadata,
    evidence,
    data,
  });
}

function safeAdapter(overrides = {}) {
  const submitControl = {
    selectorType: 'css',
    selectorValue: 'button[type=submit]',
    visible: true,
    enabled: true,
  };
  return {
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
    locateSubmitControl: async () => phaseResult('locateSubmitControl', 'SUBMIT_CONTROL_RESOLVED', { submitControl }),
    clickSubmit: async () => phaseResult('clickSubmit', 'SUBMIT_CLICKED', {
      clicked: true,
      clickedAt: '2026-07-24T12:00:00.000Z',
      submitControl,
    }),
    verifySubmission: async () => phaseResult('verifySubmission', 'SUBMISSION_CONFIRMED', {
      confirmed: true,
      confirmationText: 'Application submitted.',
    }),
    captureEvidence: async () => phaseResult('captureEvidence', 'SUBMISSION_CONFIRMED', {
      items: [],
      summary: 'done',
    }),
    ...overrides,
  };
}

test('orchestrator transition evidence requirements are enforced', () => {
  const submitControl = {
    selectorType: 'css',
    selectorValue: 'button[type=submit]',
    visible: true,
    enabled: true,
  };

  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'FORM_COMPLETED',
    to: 'VALIDATION_PASSED',
    result: phaseResult('validate', 'VALIDATION_PASSED', {
      requiredFieldInspectionCompleted: true,
      unresolvedRequiredFields: 0,
      validationErrors: [],
    }, [contracts.createEvidenceItem({ kind: 'validation', label: 'validated' })]),
  }).ok, true);

  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'FORM_COMPLETED',
    to: 'VALIDATION_PASSED',
    result: phaseResult('validate', 'VALIDATION_PASSED', {
      requiredFieldInspectionCompleted: false,
      unresolvedRequiredFields: 1,
      validationErrors: [],
    }),
  }).ok, false);

  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'VALIDATION_PASSED',
    to: 'SUBMIT_CONTROL_RESOLVED',
    result: phaseResult('locateSubmitControl', 'SUBMIT_CONTROL_RESOLVED', { submitControl }),
  }).ok, true);

  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'VALIDATION_PASSED',
    to: 'SUBMIT_CONTROL_RESOLVED',
    result: phaseResult('locateSubmitControl', 'SUBMIT_CONTROL_RESOLVED', {
      submitControl: { ...submitControl, enabled: false },
    }),
  }).ok, false);

  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'SUBMIT_CONTROL_RESOLVED',
    to: 'SUBMIT_CLICKED',
    result: phaseResult('clickSubmit', 'SUBMIT_CLICKED', {
      clicked: true,
      clickedAt: '2026-07-24T12:00:00.000Z',
      submitControl,
    }),
  }).ok, true);

  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'SUBMIT_CONTROL_RESOLVED',
    to: 'SUBMIT_CLICKED',
    result: phaseResult('clickSubmit', 'SUBMIT_CLICKED', {
      clicked: false,
      submitControl,
    }),
  }).ok, false);

  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'SUBMIT_CLICKED',
    to: 'SUBMISSION_CONFIRMED',
    result: phaseResult('verifySubmission', 'SUBMISSION_CONFIRMED', {
      confirmed: true,
      confirmationText: 'Application submitted.',
    }),
  }).ok, true);

  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'SUBMIT_CLICKED',
    to: 'SUBMISSION_CONFIRMED',
    result: phaseResult('verifySubmission', 'SUBMISSION_CONFIRMED', { confirmed: true }),
  }).ok, false);

  assert.equal(orchestrator.validateCanonicalTransition({
    from: 'SUBMIT_CLICKED',
    to: 'SUBMISSION_CONFIRMED',
    result: phaseResult('verifySubmission', 'SUBMISSION_CONFIRMED', {}, [
      contracts.createEvidenceItem({ kind: 'screenshot', label: 'confirmation screenshot' }),
    ]),
  }).ok, true);
});

test('orchestrator blocks false success, dry-run clicks, gates, unsupported, retries, and infinite loops', async () => {
  const dryRun = await orchestrator.orchestrateAtsApplication(safeAdapter(), {
    mode: 'dry_run',
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  });
  assert.equal(dryRun.stoppedReason, 'dry_run_submit_blocked');
  assert.notEqual(dryRun.finalState, 'SUBMISSION_CONFIRMED');

  const userGate = await orchestrator.orchestrateAtsApplication(safeAdapter({
    validate: async () => contracts.createPhaseResult({
      phase: 'validate',
      status: 'paused',
      canonicalState: 'WAITING_ON_USER',
      metadata,
      userGate: {
        category: 'MISSING_VERIFIED_FACT',
        label: 'Missing fact',
        reason: 'Need verified fact.',
      },
    }),
  }), {
    mode: 'dry_run',
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  });
  assert.equal(userGate.finalState, 'WAITING_ON_USER');

  const unsupportedRun = await orchestrator.orchestrateAtsApplication(unsupported.unsupportedAtsAdapter, {
    mode: 'dry_run',
    sourceUrl: 'https://example.com/jobs/1',
  });
  assert.equal(unsupportedRun.finalState, 'TERMINAL_FAILURE');
  assert.equal(unsupportedRun.phases.length, 1);

  const terminalWithRetry = orchestrator.classifyPhaseResultOutcome(contracts.createPhaseResult({
    phase: 'openApplication',
    status: 'failed',
    canonicalState: 'RETRYABLE_FAILURE',
    metadata,
    failure: {
      code: 'runtime_error',
      message: 'terminal wins',
      retryPolicy: {
        classification: 'terminal',
        retryable: true,
        reason: 'contradictory',
      },
      terminal: true,
    },
  }));
  assert.equal(terminalWithRetry, 'TERMINAL_FAILURE');

  const retryRun = await orchestrator.orchestrateAtsApplication(safeAdapter({
    openApplication: async () => contracts.createPhaseResult({
      phase: 'openApplication',
      status: 'failed',
      canonicalState: 'RETRYABLE_FAILURE',
      metadata,
      retryPolicy: {
        classification: 'transient_navigation',
        retryable: true,
        maxAttempts: 2,
        reason: 'temporary',
      },
    }),
  }), {
    mode: 'dry_run',
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  });
  assert.equal(retryRun.finalState, 'RETRYABLE_FAILURE');
  assert.equal(retryRun.phases.length, 1);

  const bounded = await orchestrator.orchestrateAtsApplication(safeAdapter(), {
    mode: 'dry_run',
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  }, { maxSteps: 2 });
  assert.equal(bounded.phases.length, 2);

  const forgedConfirmation = await orchestrator.orchestrateAtsApplication(safeAdapter({
    verifySubmission: async () => phaseResult('verifySubmission', 'SUBMISSION_CONFIRMED', { confirmed: true }),
  }), {
    mode: 'live',
    sourceUrl: 'https://job-boards.greenhouse.io/affirm/jobs/123456',
  }, { allowSubmit: true });
  assert.equal(forgedConfirmation.finalState, 'TERMINAL_FAILURE');
  assert.match(forgedConfirmation.failure.message, /external confirmation evidence is missing/);
});

test('field mapping authorization gates sensitive values without real personal data', () => {
  const map = (visibleLabel, candidate) => fieldMapping.resolveCanonicalFieldValue({
    visibleLabel,
    controlType: 'text',
    options: [],
    required: true,
  }, [fieldMapping.canonicalFieldValue({
    source: 'fixture',
    confidence: 0.99,
    verified: true,
    provenance: { fixture: true },
    ...candidate,
  })]);

  const salaryBlocked = map('Desired compensation', {
    canonicalFieldKey: 'salary_expectation',
    value: '100000',
    authorizationStatus: 'authorization_required',
    sensitivityClassification: 'salary',
  });
  assert.equal(salaryBlocked.canAutofill, false);
  assert.equal(salaryBlocked.userGate.category, 'SALARY_DECISION_REQUIRED');

  const salaryAppOnly = map('Desired compensation', {
    canonicalFieldKey: 'salary_expectation',
    value: '100000',
    authorizationStatus: 'authorized_for_application',
    sensitivityClassification: 'salary',
  });
  assert.equal(salaryAppOnly.canAutofill, true);

  const sponsorship = map('Will you require sponsorship?', {
    canonicalFieldKey: 'sponsorship_now',
    value: 'No',
    authorizationStatus: 'authorized_for_reuse',
    sensitivityClassification: 'sponsorship',
  });
  assert.equal(sponsorship.canAutofill, true);

  const relocation = map('Willing to relocate?', {
    canonicalFieldKey: 'relocation',
    value: 'Yes',
    authorizationStatus: 'user_decision_required',
    sensitivityClassification: 'relocation',
  });
  assert.equal(relocation.canAutofill, false);
  assert.equal(relocation.userGate.category, 'RELOCATION_DECISION_REQUIRED');

  for (const [label, category] of [
    ['I agree to the privacy policy', 'LEGAL_CONSENT_REQUIRED'],
    ['I agree to arbitration', 'ARBITRATION_CONSENT_REQUIRED'],
    ['I authorize a background check', 'BACKGROUND_CHECK_CONSENT_REQUIRED'],
  ]) {
    const result = map(label, {
      canonicalFieldKey: 'legal_consent',
      value: true,
      authorizationStatus: 'authorized_for_reuse',
      sensitivityClassification: 'legal',
    });
    assert.equal(result.canAutofill, false);
    assert.equal(result.userGate.category, category);
  }

  for (const [label, key, classification, category] of [
    ['Gender', 'gender', 'demographic', 'DEMOGRAPHIC_DECISION_REQUIRED'],
    ['Disability status', 'disability', 'disability', 'DISABILITY_SELF_ID_REQUIRED'],
    ['Veteran status', 'veteran', 'veteran', 'VETERAN_SELF_ID_REQUIRED'],
  ]) {
    const result = map(label, {
      canonicalFieldKey: key,
      value: 'Decline to answer',
      authorizationStatus: 'authorized_for_application',
      sensitivityClassification: classification,
    });
    assert.equal(result.canAutofill, false);
    assert.equal(result.userGate.category, category);
  }

  const lowConfidence = map('Email Address', {
    canonicalFieldKey: 'email',
    value: 'fixture@example.invalid',
    authorizationStatus: 'authorized',
    confidence: 0.1,
    sensitivityClassification: 'contact',
  });
  assert.equal(lowConfidence.userGate.category, 'LOW_CONFIDENCE_ANSWER');

  const expired = map('Email Address', {
    canonicalFieldKey: 'email',
    value: 'fixture@example.invalid',
    authorizationStatus: 'authorized',
    expiresAt: '2020-01-01T00:00:00.000Z',
    sensitivityClassification: 'contact',
  });
  assert.equal(expired.reasonUnavailable, 'value_expired');

  const conflicting = map('Email Address', {
    canonicalFieldKey: 'email',
    value: 'fixture@example.invalid',
    authorizationStatus: 'authorized',
    sensitivityClassification: 'contact',
    provenance: { conflicts: ['profile.email', 'resume.email'] },
  });
  assert.equal(conflicting.reasonUnavailable, 'conflicting_provenance');
  assert.deepEqual(conflicting.provenance.conflicts, ['profile.email', 'resume.email']);

  const missing = fieldMapping.resolveCanonicalFieldValue({
    visibleLabel: 'LinkedIn profile',
    controlType: 'text',
    options: [],
    required: false,
  }, []);
  assert.equal(missing.reasonUnavailable, 'missing_canonical_value');
  assert.equal(missing.userGate.category, 'MISSING_VERIFIED_FACT');
});

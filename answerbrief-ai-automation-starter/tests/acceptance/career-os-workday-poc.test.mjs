import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { loadTsModule } from '../helpers/load-ts-module.mjs';

const appRoot = process.cwd();
const fixtureRoot = path.join(appRoot, 'tests/fixtures/workday');
const profilePath = path.join(appRoot, 'tests/fixtures/candidate-profile/workday-synthetic-profile.json');
const candidateProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

const router = loadTsModule('lib/ats/router.ts');
const inspector = loadTsModule('lib/ats/workday-fixture-inspector.ts');
const workday = loadTsModule('lib/ats/adapters/workday.ts');

function fixturePath(name) {
  return path.join(fixtureRoot, `${name}.html`);
}

function metadata(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, `${name}.json`), 'utf8'));
}

function fixtureContext(name, overrides = {}) {
  const meta = metadata(name);
  return {
    applicationId: `fixture-${name}`,
    candidateProfile,
    employer: 'Acme Fixture Co',
    fixtureName: meta.scenarioName,
    fixturePath: fixturePath(name),
    mode: 'fixture_inspection',
    ownerEmail: 'fixture-owner@example.invalid',
    platformHint: 'workday',
    position: 'Product Manager',
    rawJobRecord: {
      ats_platform: 'workday',
      workdayFixturePath: fixturePath(name),
      fixtureScenario: meta.scenarioName,
    },
    resume: {
      fileName: 'synthetic-resume.pdf',
    },
    sourceUrl: meta.fixtureUrl,
    ...overrides,
  };
}

function cloneProfileWith(key, patch) {
  const clone = JSON.parse(JSON.stringify(candidateProfile));
  const entry = clone.canonicalValues.find((value) => value.canonicalFieldKey === key);
  assert.ok(entry, `profile fixture has ${key}`);
  Object.assign(entry, patch);
  return clone;
}

test('Workday fixture POC keeps typed routing local and preserves task identity', () => {
  const task = {
    applicationId: 'workday-fixture-route',
    applicationUrl: metadata('review-submit').fixtureUrl,
    employer: 'Acme Fixture Co',
    platform: 'workday',
    position: 'Product Manager',
  };
  const before = JSON.stringify(task);
  const route = router.routeAtsApplication({
    applicationId: task.applicationId,
    originalTask: task,
    platformHint: task.platform,
    sourceUrl: task.applicationUrl,
  });

  assert.equal(route.normalizedContext.originalTask, task);
  assert.equal(JSON.stringify(task), before);
  assert.equal(route.normalizedContext.detectedPlatform, 'workday');
  assert.equal(route.normalizedContext.adapterId, 'workday');
  assert.equal(route.normalizedContext.supported, true);
  assert.equal(route.normalizedContext.tenant, 'acme.wd5.myworkdayjobs.com:en-US/External');
  assert.equal(route.normalizedContext.jobId, 'JR123456');
  assert.ok(route.normalizedContext.matchedSignals.some((signal) => signal.includes('workday')));
});

test('Workday fixture loader accepts local files only and preserves fixture identity', () => {
  const fixture = inspector.loadWorkdayFixture(fixtureContext('review-submit'));
  assert.equal(fixture.name, 'review_submit');
  assert.equal(fixture.scenario, 'review_submit');
  assert.equal(fixture.fixtureUrl, metadata('review-submit').fixtureUrl);
  assert.equal(fixture.absolutePath, fixturePath('review-submit'));
  assert.equal(fixture.metadataPath, path.join(fixtureRoot, 'review-submit.json'));
  assert.match(fixture.html, /data-workday-state="REVIEW"/);

  assert.equal(inspector.remoteFixtureRejected({
    mode: 'fixture_inspection',
    fixturePath: 'https://example.invalid/workday-fixture.html',
  }), true);
  assert.throws(() => inspector.loadWorkdayFixture({
    mode: 'fixture_inspection',
    fixturePath: 'https://example.invalid/workday-fixture.html',
  }), /remote fixture fetches are prohibited/i);
  assert.throws(() => inspector.loadWorkdayFixture({
    mode: 'fixture_inspection',
    fixturePath: path.join(fixtureRoot, 'missing.html'),
  }), /not found/i);
  assert.throws(() => inspector.loadWorkdayFixture({
    mode: 'fixture_inspection',
    fixturePath: fixturePath('malformed'),
  }), /metadata file is missing/i);
});

test('Workday fixture classifier covers supported page states deterministically', () => {
  const expectations = {
    'account-gate': 'SIGN_IN',
    'create-account-gate': 'CREATE_ACCOUNT',
    'resume-upload': 'RESUME_UPLOAD',
    'required-fields': 'PERSONAL_INFORMATION',
    'application-questions': 'APPLICATION_QUESTIONS',
    'sensitive-fields': 'VOLUNTARY_DISCLOSURES',
    'validation-error': 'VALIDATION_ERROR',
    'review-submit': 'REVIEW',
    confirmation: 'CONFIRMATION',
  };

  for (const [name, expectedState] of Object.entries(expectations)) {
    const snapshot = inspector.inspectWorkdayFixture(fixtureContext(name));
    assert.equal(snapshot.pageState, expectedState, name);
    assert.equal(snapshot.mode, 'fixture_inspection');
    assert.equal(snapshot.fixture.absolutePath, fixturePath(name));
    assert.ok(snapshot.matchedSignals.some((signal) => signal.includes(expectedState)));
    assert.equal(snapshot.normalizedUrl, metadata(name).fixtureUrl);
  }
});

test('Workday fixture authentication and account gates pause on user action', async () => {
  const signIn = await workday.workdayCompatibilityAdapter.authenticate(fixtureContext('account-gate'));
  assert.equal(signIn.status, 'paused');
  assert.equal(signIn.canonicalState, 'WAITING_ON_USER');
  assert.equal(signIn.userGate.category, 'AUTHENTICATION_REQUIRED');
  assert.equal(signIn.data.authenticated, false);
  assert.equal(signIn.data.sessionRequired, true);
  assert.equal(signIn.rawSignals.workdayFailureCode, 'AUTHENTICATION_REQUIRED');
  assert.ok(signIn.evidence.some((item) => item.metadata?.noLiveNavigation === true));

  const createAccount = await workday.workdayCompatibilityAdapter.authenticate(fixtureContext('create-account-gate'));
  assert.equal(createAccount.status, 'paused');
  assert.equal(createAccount.canonicalState, 'WAITING_ON_USER');
  assert.equal(createAccount.userGate.category, 'ACCOUNT_CREATION_REQUIRED');
  assert.equal(createAccount.rawSignals.workdayFailureCode, 'ACCOUNT_GATE');
});

test('Workday fixture resume upload phase locates control without uploading a resume', async () => {
  const result = await workday.workdayCompatibilityAdapter.uploadResume(fixtureContext('resume-upload'));
  assert.equal(result.status, 'succeeded');
  assert.equal(result.canonicalState, 'APPLICATION_OPENED');
  assert.equal(result.data.uploaded, false);
  assert.equal(result.data.noRealResumeUpload, true);
  assert.equal(result.data.uploadPermitted, false);
  assert.deepEqual(result.data.resumeUploadControl.acceptedFileTypes, ['.pdf', '.doc', '.docx']);
  assert.equal(result.data.resumeUploadControl.selectorValue, '#resumeUpload');
});

test('Workday fixture field inspection captures required, hidden, option, validation, and repeated-section metadata', async () => {
  const required = await workday.workdayCompatibilityAdapter.inspectApplication(fixtureContext('required-fields'));
  assert.equal(required.status, 'succeeded');
  assert.equal(required.canonicalState, 'FORM_INSPECTED');
  assert.equal(required.data.fieldsDetected, 8);
  assert.equal(required.data.requiredFields, 7);
  assert.ok(required.data.requestedFields.some((field) => field.label === 'Source Tracking' && field.visible === false));

  const questions = await workday.workdayCompatibilityAdapter.inspectApplication(fixtureContext('application-questions'));
  const sponsorship = questions.data.requestedFields.find((field) => field.fieldId === 'sponsorship');
  const repeated = questions.data.requestedFields.find((field) => field.fieldId === 'previousEmployer1');
  assert.deepEqual(sponsorship.options, ['Select one', 'Yes', 'No']);
  assert.equal(sponsorship.sensitiveCategory, 'sponsorship');
  assert.equal(repeated.repeatedSectionContext.section, 'work_experience');
  assert.equal(repeated.repeatedSectionContext.index, 1);

  const validation = inspector.inspectWorkdayFixture(fixtureContext('validation-error'));
  assert.deepEqual(validation.validation.validationMessages, ['Email is required']);
  assert.deepEqual(validation.validation.requiredFields, ['Email Address']);
});

test('Workday fixture field mapping resolves safe values and gates sensitive or uncertain answers', async () => {
  const required = await workday.workdayCompatibilityAdapter.mapFields(fixtureContext('required-fields'));
  assert.equal(required.status, 'succeeded');
  assert.equal(required.data.fieldsMapped, 7);
  assert.deepEqual(required.data.unresolvedFields, []);
  assert.equal(required.data.noAutofillPerformed, true);

  const questions = await workday.workdayCompatibilityAdapter.mapFields(fixtureContext('application-questions'));
  assert.equal(questions.status, 'paused');
  assert.equal(questions.canonicalState, 'WAITING_ON_USER');
  assert.equal(questions.rawSignals.workdayFailureCode, 'SENSITIVE_FIELD_REQUIRES_USER');
  assert.ok(questions.data.unresolvedFields.includes('Desired compensation'));
  assert.ok(questions.data.unresolvedFields.includes('Willing to relocate?'));
  assert.ok(questions.data.userGates.some((gate) => gate.category === 'SALARY_DECISION_REQUIRED'));
  assert.ok(questions.data.userGates.some((gate) => gate.category === 'RELOCATION_DECISION_REQUIRED'));
  assert.ok(!questions.data.userGates.some((gate) => gate.label === 'Previous Employer'));

  const sensitive = await workday.workdayCompatibilityAdapter.mapFields(fixtureContext('sensitive-fields'));
  const categories = sensitive.data.userGates.map((gate) => gate.category).sort();
  for (const category of [
    'ARBITRATION_CONSENT_REQUIRED',
    'BACKGROUND_CHECK_CONSENT_REQUIRED',
    'CONFLICT_DISCLOSURE_REQUIRED',
    'DEMOGRAPHIC_DECISION_REQUIRED',
    'DISABILITY_SELF_ID_REQUIRED',
    'LEGAL_CONSENT_REQUIRED',
    'VETERAN_SELF_ID_REQUIRED',
  ]) {
    assert.ok(categories.includes(category), category);
  }
});

test('Workday fixture mapping classifies low confidence, expired, and conflicting profile facts', async () => {
  const lowConfidence = await workday.workdayCompatibilityAdapter.mapFields(fixtureContext('required-fields', {
    candidateProfile: cloneProfileWith('email', { confidence: 0.1 }),
  }));
  assert.equal(lowConfidence.status, 'paused');
  assert.equal(lowConfidence.rawSignals.workdayFailureCode, 'LOW_CONFIDENCE_MAPPING');
  assert.equal(lowConfidence.userGate.category, 'LOW_CONFIDENCE_ANSWER');

  const expired = await workday.workdayCompatibilityAdapter.mapFields(fixtureContext('required-fields', {
    candidateProfile: cloneProfileWith('email', { expiresAt: '2020-01-01T00:00:00.000Z' }),
  }));
  assert.equal(expired.status, 'paused');
  assert.equal(expired.userGate.category, 'MISSING_VERIFIED_FACT');
  assert.ok(expired.data.mappings.some((mapping) => mapping.reasonUnavailable === 'value_expired'));

  const conflicting = await workday.workdayCompatibilityAdapter.mapFields(fixtureContext('required-fields', {
    candidateProfile: cloneProfileWith('email', { provenance: { conflicts: ['fixture.profile.email', 'fixture.resume.email'] } }),
  }));
  assert.equal(conflicting.status, 'paused');
  assert.equal(conflicting.userGate.category, 'MISSING_VERIFIED_FACT');
  assert.ok(conflicting.data.mappings.some((mapping) => mapping.reasonUnavailable === 'conflicting_provenance'));
});

test('Workday fixture validation never passes unresolved fields or validation errors', async () => {
  const validationError = await workday.workdayCompatibilityAdapter.validate(fixtureContext('validation-error'));
  assert.equal(validationError.status, 'failed');
  assert.notEqual(validationError.canonicalState, 'VALIDATION_PASSED');
  assert.deepEqual(validationError.data.validationErrors, ['Email is required']);
  assert.equal(validationError.rawSignals.workdayFailureCode, 'VALIDATION_ERROR');

  const gated = await workday.workdayCompatibilityAdapter.validate(fixtureContext('application-questions'));
  assert.equal(gated.status, 'paused');
  assert.equal(gated.canonicalState, 'WAITING_ON_USER');
  assert.ok(gated.data.unresolvedRequiredFields > 0);

  const cleanReview = await workday.workdayCompatibilityAdapter.validate(fixtureContext('review-submit'));
  assert.equal(cleanReview.status, 'succeeded');
  assert.equal(cleanReview.canonicalState, 'VALIDATION_PASSED');
  assert.equal(cleanReview.data.requiredFieldInspectionCompleted, true);
  assert.equal(cleanReview.data.unresolvedRequiredFields, 0);
  assert.ok(cleanReview.evidence.some((item) => item.kind === 'validation'));
});

test('Workday fixture submit control can be located but never clicked or confirmed', async () => {
  const located = await workday.workdayCompatibilityAdapter.locateSubmitControl(fixtureContext('review-submit'));
  assert.equal(located.status, 'succeeded');
  assert.equal(located.canonicalState, 'SUBMIT_CONTROL_RESOLVED');
  assert.equal(located.data.submitControl.visible, true);
  assert.equal(located.data.submitControl.enabled, true);
  assert.equal(located.data.submitControl.text, 'Submit');
  assert.equal(located.data.submitControl.noSubmitClick, true);
  assert.equal(located.data.submissionReady, false);

  const clicked = await workday.workdayCompatibilityAdapter.clickSubmit(fixtureContext('review-submit'));
  assert.equal(clicked.status, 'skipped');
  assert.equal(clicked.canonicalState, 'SUBMIT_CONTROL_RESOLVED');
  assert.equal(clicked.data.clicked, false);
  assert.equal(clicked.data.submitClickAttempted, false);
  assert.equal(clicked.data.clickedAt, undefined);
  assert.notEqual(clicked.canonicalState, 'SUBMIT_CLICKED');

  const confirmed = await workday.workdayCompatibilityAdapter.verifySubmission(fixtureContext('confirmation'));
  assert.equal(confirmed.status, 'skipped');
  assert.equal(confirmed.data.confirmed, false);
  assert.equal(confirmed.data.confirmationClassifiedOnly, true);
  assert.equal(confirmed.data.noSubmissionProof, true);
  assert.notEqual(confirmed.canonicalState, 'SUBMISSION_CONFIRMED');
});

test('Workday fixture evidence records no live navigation, no click, and no production action', async () => {
  const result = await workday.workdayCompatibilityAdapter.captureEvidence(fixtureContext('review-submit'));
  assert.equal(result.status, 'succeeded');
  assert.match(result.data.summary, /no live navigation or submit click/i);
  assert.ok(result.data.items.length > 0);
  const snapshot = result.data.items.find((item) => item.kind === 'page_snapshot');
  assert.equal(snapshot.metadata.noLiveNavigation, true);
  assert.equal(snapshot.metadata.noSubmitClick, true);
  assert.equal(snapshot.metadata.noProductionAction, true);
  assert.equal(snapshot.metadata.fixtureName, 'review_submit');
});

test('Workday native fixture phases fail closed in live mode', async () => {
  const result = await workday.workdayCompatibilityAdapter.openApplication({
    mode: 'live',
    platformHint: 'workday',
    sourceUrl: metadata('review-submit').fixtureUrl,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.canonicalState, 'TERMINAL_FAILURE');
  assert.equal(result.failure.rawSignals.workdayFailureCode, 'LIVE_NAVIGATION_PROHIBITED');
  assert.equal(result.data, undefined);
  assert.ok(result.evidence.some((item) => item.metadata?.noLiveNavigation === true));
});

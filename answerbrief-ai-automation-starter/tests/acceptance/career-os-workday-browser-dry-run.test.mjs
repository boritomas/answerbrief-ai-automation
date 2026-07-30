import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadTsModule } from '../helpers/load-ts-module.mjs';

const appRoot = process.cwd();
const fixtureRoot = path.join(appRoot, 'tests/fixtures/workday');
const profilePath = path.join(appRoot, 'tests/fixtures/candidate-profile/workday-synthetic-profile.json');
const candidateProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

const inspector = loadTsModule('lib/ats/workday-fixture-inspector.ts');
const runner = loadTsModule('lib/ats/workday-local-browser-runner.ts');

function fixturePath(name) {
  return path.join(fixtureRoot, `${name}.html`);
}

function fixture(name) {
  return inspector.loadWorkdayFixture({
    fixturePath: fixturePath(name),
    fixtureName: name,
    mode: 'fixture_inspection',
  });
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-workday-browser-test-'));
}

async function closeSession(session) {
  if (!session) return;
  await session.close().catch(() => undefined);
  fs.rmSync(session.artifactDir, { force: true, recursive: true });
}

test('Workday local browser dry-run harness launches, renders a fixture, captures evidence, and closes cleanly', async () => {
  const artifactDir = tempDir();
  const result = await runner.runWorkdayLocalBrowserDryRun({
    artifactDir,
    candidateProfile,
    fixtureName: 'required-fields',
    preserveArtifacts: true,
    simulateSafeFill: true,
  });
  try {
    assert.equal(result.executionMode, 'local_browser_dry_run');
    assert.equal(result.localFixture, true);
    assert.equal(result.browserMode, 'headless');
    assert.equal(result.browserClosed, true);
    assert.equal(result.fixture.scenario, 'required_fields');
    assert.equal(result.pageState, 'PERSONAL_INFORMATION');
    assert.equal(result.normalizedContext.detectedPlatform, 'workday');
    assert.equal(result.normalizedContext.tenant, 'acme.wd5.myworkdayjobs.com:en-US/External');
    assert.equal(result.normalizedContext.jobId, 'JR123456');
    assert.equal(result.liveNavigationAttempted, false);
    assert.equal(result.productionWriteAttempted, false);
    assert.equal(result.submitClickAttempted, false);
    assert.equal(result.validation.inspectionValid, true);
    assert.equal(result.validation.classification, 'valid_for_inspection');
    assert.ok(result.simulatedFills.length >= 7);
    assert.ok(result.simulatedFills.every((fill) => ['standard', 'contact', 'employment'].includes(fill.sensitivity)));
    assert.equal(result.screenshotCaptured, true);
    assert.equal(fs.existsSync(result.screenshotPath), true);
    assert.ok(result.evidence.some((item) => item.kind === 'page_snapshot' && item.screenshotPath === result.screenshotPath));
  } finally {
    fs.rmSync(artifactDir, { force: true, recursive: true });
  }
});

test('Workday rendered DOM classifier covers local fixture page states without submission proof', async () => {
  const expectations = {
    'account-gate-generic': 'ACCOUNT_GATE',
    'account-gate': 'SIGN_IN',
    'create-account-gate': 'CREATE_ACCOUNT',
    'resume-upload': 'RESUME_UPLOAD',
    'application-questions': 'APPLICATION_QUESTIONS',
    'sensitive-fields': 'VOLUNTARY_DISCLOSURES',
    'validation-error': 'VALIDATION_ERROR',
    'review-submit': 'REVIEW',
    'submit-ready': 'SUBMIT_READY',
    confirmation: 'CONFIRMATION',
    'unknown-state': 'UNKNOWN',
  };

  for (const [name, expectedState] of Object.entries(expectations)) {
    const result = await runner.runWorkdayLocalBrowserDryRun({
      candidateProfile,
      fixtureName: name,
      simulateSafeFill: false,
    });
    assert.equal(result.pageState, expectedState, name);
    assert.equal(result.matchedSignals.some((signal) => signal.includes(expectedState)), true, name);
    assert.ok(result.confidence > 0 || expectedState === 'UNKNOWN');
    assert.equal(result.conflictingSignals.length, 0, name);
    if (name === 'confirmation') {
      assert.equal(result.confirmationClassificationOnly, true);
      assert.equal(result.validation.inspectionValid, true);
      assert.equal(result.submitClickAttempted, false);
    }
  }
});

test('Workday local browser account gate halts progression with user gates', async () => {
  const result = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'account-gate-generic',
    simulateSafeFill: true,
  });

  assert.equal(result.pageState, 'ACCOUNT_GATE');
  assert.equal(result.validation.inspectionValid, false);
  assert.equal(result.validation.classification, 'blocked_by_account_gate');
  assert.ok(result.validation.userGates.some((gate) => gate.category === 'AUTHENTICATION_REQUIRED'));
  assert.deepEqual(result.simulatedFills, []);
});

test('Workday local browser resume dry run inspects upload control without uploading', async () => {
  const result = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'resume-upload',
  });

  assert.equal(result.pageState, 'RESUME_UPLOAD');
  assert.ok(result.resumeUploadControl);
  assert.equal(result.resumeUploadControl.selectorValue, '#resumeUpload');
  assert.deepEqual(result.resumeUploadControl.acceptedFileTypes, ['.pdf', '.doc', '.docx']);
  assert.equal(result.resumeUploadControl.required, true);
  assert.equal(result.resumeUploadControl.visible, true);
  assert.equal(result.resumeUploadControl.enabled, true);
  assert.equal(result.resumeUploadControl.uploadPermitted, false);
  assert.equal(result.resumeUploadControl.metadata.currentFileState, 'empty');
  assert.match(result.resumeUploadControl.metadata.surroundingInstructions, /Upload Resume/);
});

test('Workday local browser field inspection handles hidden, required, dropdown, sensitive, and simulated fields', async () => {
  const required = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'required-fields',
    simulateSafeFill: true,
  });
  const hidden = required.fields.find((field) => field.fieldId === 'source');
  const state = required.fields.find((field) => field.fieldId === 'state');
  assert.equal(required.fields.length, 8);
  assert.equal(hidden.visible, false);
  assert.deepEqual(state.options, ['Select one', 'Texas', 'California']);
  assert.ok(required.simulatedFills.some((fill) => fill.label === 'Legal First Name'));
  assert.ok(required.simulatedFills.some((fill) => fill.label === 'Email Address'));

  const questions = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'application-questions',
    simulateSafeFill: true,
  });
  const sponsorship = questions.fields.find((field) => field.fieldId === 'sponsorship');
  const repeated = questions.fields.find((field) => field.fieldId === 'previousEmployer1');
  assert.equal(sponsorship.sensitiveCategory, 'sponsorship');
  assert.deepEqual(sponsorship.options, ['Select one', 'Yes', 'No']);
  assert.equal(repeated.repeatedSectionContext.section, 'work_experience');
  assert.equal(repeated.repeatedSectionContext.index, 1);
  assert.ok(!questions.simulatedFills.some((fill) => fill.label === 'Desired compensation'));
  assert.ok(!questions.simulatedFills.some((fill) => fill.label === 'Willing to relocate?'));
  assert.ok(questions.validation.userGates.some((gate) => gate.category === 'SALARY_DECISION_REQUIRED'));
  assert.ok(questions.validation.userGates.some((gate) => gate.category === 'RELOCATION_DECISION_REQUIRED'));
});

test('Workday local browser sensitive fields generate user gates and remain unfilled', async () => {
  const result = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'sensitive-fields',
    simulateSafeFill: true,
  });
  const categories = result.validation.userGates.map((gate) => gate.category).sort();
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
  assert.equal(result.validation.inspectionValid, false);
  assert.equal(result.validation.classification, 'blocked_by_user_gate');
  assert.equal(result.simulatedFills.length, 0);
});

test('Workday local browser validation classifies rendered validation errors and incomplete forms', async () => {
  const validationError = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'validation-error',
  });
  assert.equal(validationError.validation.classification, 'validation_error');
  assert.equal(validationError.validation.inspectionValid, false);
  assert.ok(validationError.validation.validationMessages.includes('Email is required'));

  const incomplete = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'required-fields',
    simulateSafeFill: false,
  });
  assert.equal(incomplete.validation.classification, 'incomplete');
  assert.equal(incomplete.validation.inspectionValid, false);
  assert.ok(incomplete.validation.emptyRequiredFields.includes('Legal First Name'));

  const unknown = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'unknown-state',
  });
  assert.equal(unknown.validation.classification, 'unsupported_page_state');
  assert.equal(unknown.validation.inspectionValid, false);
});

test('Workday local browser submit control metadata is resolved without submit states', async () => {
  const result = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'submit-ready',
  });

  assert.equal(result.pageState, 'SUBMIT_READY');
  assert.ok(result.submitControl);
  assert.equal(result.submitControl.visible, true);
  assert.equal(result.submitControl.enabled, true);
  assert.equal(result.submitControl.text, 'Submit Application');
  assert.equal(result.submitControl.noSubmitClick, true);
  assert.equal(result.submitControl.clickPermitted, false);
  assert.equal(result.submitControl.metadata.role, 'button');
  assert.equal(result.submitControl.metadata.formId, 'submitReadyForm');
  assert.equal(result.submitClickAttempted, false);
  assert.equal(result.submitGuardAttempts.length, 0);
  assert.ok(!result.evidence.some((item) => item.value === 'SUBMIT_CLICKED' || item.value === 'SUBMISSION_CONFIRMED'));
});

test('Workday local browser submit guard blocks click, form.submit, requestSubmit, and Enter-key submission', async () => {
  let session;
  try {
    session = await runner.createWorkdayLocalBrowserSession({ approvedFixtureDir: fixtureRoot });
    await session.renderFixture(fixture('network-escape'));

    await assert.rejects(
      () => session.page.evaluate(() => document.querySelector('#escapeSubmit').click()),
      /submit guard blocked element\.click/,
    );
    await assert.rejects(
      () => session.page.evaluate(() => document.querySelector('#escapeForm').submit()),
      /submit guard blocked form\.submit/,
    );
    await assert.rejects(
      () => session.page.evaluate(() => document.querySelector('#escapeForm').requestSubmit()),
      /submit guard blocked form\.requestSubmit/,
    );

    await session.page.focus('#escapeField');
    await session.page.keyboard.press('Enter');
    const attempts = await session.getSubmitAttempts();
    const methods = attempts.map((attempt) => attempt.method);
    assert.ok(methods.includes('element.click'));
    assert.ok(methods.includes('form.submit'));
    assert.ok(methods.includes('form.requestSubmit'));
    assert.ok(methods.includes('keyboard.enter'));
    assert.equal(session.page.url(), 'about:blank');
  } finally {
    await closeSession(session);
  }
});

test('Workday local browser blocks remote image, script, fetch, popup, redirect, and form escape attempts', async () => {
  const result = await runner.runWorkdayLocalBrowserDryRun({
    candidateProfile,
    fixtureName: 'network-escape',
  });
  const reasons = result.externalRequestsBlocked.map((request) => request.reason);
  assert.ok(reasons.includes('external_script_blocked'));
  assert.ok(reasons.includes('external_fetch_blocked'));
  assert.ok(reasons.includes('external_image_blocked'));
  assert.equal(result.externalRequestsBlocked.every((request) => request.url.startsWith('https://example.invalid/')), true);

  let session;
  try {
    session = await runner.createWorkdayLocalBrowserSession({ approvedFixtureDir: fixtureRoot });
    await session.renderFixture(fixture('network-escape'));

    await assert.rejects(
      () => session.page.goto('https://example.invalid/remote-navigation'),
      /rejected remote navigation/,
    );

    await assert.rejects(
      () => session.page.evaluate(() => window.open('https://example.invalid/workday-popup')),
      /guard blocked popup/,
    );

    await assert.rejects(
      () => session.page.evaluate(() => document.querySelector('#escapeForm').submit()),
      /submit guard blocked form\.submit/,
    );
    assert.equal(session.page.url(), 'about:blank');
    const preRedirectAttempts = await session.getSubmitAttempts();
    assert.ok(preRedirectAttempts.some((attempt) => attempt.method === 'window.open'));
    assert.ok(preRedirectAttempts.some((attempt) => attempt.method === 'form.submit'));

    await session.page.evaluate(() => {
      window.location.href = 'https://example.invalid/workday-redirect';
    }).catch(() => undefined);
    await session.page.waitForTimeout(100);

    const blocked = session.safety.blockedRequests;
    assert.ok(blocked.some((request) => request.reason === 'remote_page_goto_rejected'));
    assert.ok(blocked.some((request) => request.reason === 'external_navigation_blocked' && request.url.includes('/workday-redirect')));
  } finally {
    await closeSession(session);
  }
});

test('Workday local browser accepts only approved local fixtures', async () => {
  await assert.rejects(
    () => runner.runWorkdayLocalBrowserDryRun({
      fixturePath: 'https://example.invalid/workday.html',
    }),
    /rejects remote fixture URLs/,
  );

  await assert.rejects(
    () => runner.runWorkdayLocalBrowserDryRun({
      fixturePath: path.join(appRoot, 'package.json'),
    }),
    /outside the approved local Workday fixture directory/,
  );

  const fileUrl = runner.approvedFixtureFileUrl(fixturePath('review-submit'), fixtureRoot);
  assert.equal(fileUrl.startsWith('file://'), true);
});

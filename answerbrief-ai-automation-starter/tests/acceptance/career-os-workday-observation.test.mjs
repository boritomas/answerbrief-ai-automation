import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  WORKDAY_OBSERVATION_ARTIFACT_FILES,
  attachToActiveWorkdayObservation,
  buildWorkdayObservationArtifacts,
  buildWorkdayProposedAnswerBankPatch,
  buildWorkdayProposedReplayMap,
  buildWorkdayResumeFlowEvidence,
  classifyWorkdayObservationRedaction,
  defaultWorkdayObservationCanaryId,
  detectWorkdayFinalReview,
  discoverActiveWorkdayApplicationTab,
  normalizeObservedWorkdayField,
  normalizeObservedWorkdayFields,
  scanArtifactFilesForSecrets,
  validateActiveWorkdayAttachPreflight,
  validateWorkdayObservationBounds,
  workdayObserveModeEnabled,
  writeWorkdayObservationArtifacts,
} from '../../scripts/lib/career-os-workday-observation.mjs';

const WORKDAY_URL = 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Bellevue%2C-Washington/Sr-Product-Manager_REQ362163-1/apply/useMyLastApplication';
const CANARY_ID = 'workday-observe-tmobile-req362163';

function env(overrides = {}) {
  return {
    CAREER_OS_QUEUE_ENABLED: '0',
    CAREER_OS_WORKDAY_CANARY_ID: CANARY_ID,
    CAREER_OS_WORKDAY_CANARY_URL: WORKDAY_URL,
    CAREER_OS_WORKDAY_OBSERVE_MODE: '1',
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    canaryId: CANARY_ID,
    jobId: 'REQ362163-1',
    source: 'test_workday_observation',
    tenant: 'tmobile.wd1',
    timestamp: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

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

test('Workday observation mode is off by default and only opens one bounded canary', () => {
  assert.equal(workdayObserveModeEnabled({}), false);
  assert.match(defaultWorkdayObservationCanaryId(WORKDAY_URL), /tmobile-wd1-req362163-1/);

  const disabled = validateWorkdayObservationBounds({
    canaryId: CANARY_ID,
    env: env({ CAREER_OS_WORKDAY_OBSERVE_MODE: '0' }),
    url: WORKDAY_URL,
  });
  assert.equal(disabled.ok, false);
  assert.match(disabled.reason, /OBSERVE_MODE=1/);

  const allowed = validateWorkdayObservationBounds({
    canaryId: CANARY_ID,
    env: env(),
    url: WORKDAY_URL,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.details.workdayIdentity.tenant, 'tmobile.wd1');
  assert.equal(allowed.details.workdayIdentity.jobId, 'REQ362163-1');

  const wrongCanary = validateWorkdayObservationBounds({
    canaryId: 'second-canary',
    env: env(),
    url: WORKDAY_URL,
  });
  assert.equal(wrongCanary.ok, false);
  assert.match(wrongCanary.reason, /canary id/);

  const wrongJob = validateWorkdayObservationBounds({
    canaryId: CANARY_ID,
    env: env(),
    url: 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Product-Manager_REQ000001',
  });
  assert.equal(wrongJob.ok, false);
  assert.match(wrongJob.reason, /tenant\/job/);

  const queueEnabled = validateWorkdayObservationBounds({
    canaryId: CANARY_ID,
    env: env({ CAREER_OS_QUEUE_ENABLED: '1' }),
    url: WORKDAY_URL,
  });
  assert.equal(queueEnabled.ok, false);
  assert.match(queueEnabled.reason, /QUEUE_ENABLED/);
});

test('Workday observation rejects unrelated origins even when a canary id is present', () => {
  const rejected = validateWorkdayObservationBounds({
    canaryId: CANARY_ID,
    env: {
      CAREER_OS_QUEUE_ENABLED: '0',
      CAREER_OS_WORKDAY_CANARY_ID: CANARY_ID,
      CAREER_OS_WORKDAY_CANARY_URL: 'https://example.com/jobs/123',
      CAREER_OS_WORKDAY_OBSERVE_MODE: '1',
    },
    url: 'https://example.com/jobs/123',
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.reason, /not qualified|not an approved Workday origin/);
});

test('observed Workday fields capture only committed values with semantic anchors', () => {
  const fields = normalizeObservedWorkdayFields([
    {
      capturePhase: 'input',
      currentValue: 'partial-keypress-value',
      label: 'Legal First Name',
      name: 'firstName',
      tagName: 'input',
      type: 'text',
    },
    {
      capturePhase: 'blur',
      changed: true,
      committedValue: 'Tomas',
      label: 'Legal First Name',
      name: 'firstName',
      sectionName: 'My Information',
      tagName: 'input',
      type: 'text',
    },
    {
      capturePhase: 'change',
      committedValue: 'Local',
      label: 'Relocation preference',
      options: [{ label: 'Local', value: 'local', selected: true }],
      role: 'combobox',
      sectionName: 'Application Questions',
      tagName: 'select',
      type: 'select',
      validationMessages: ['Required field is now complete'],
    },
  ], context({ pageName: 'Application Questions' }));

  assert.equal(fields.length, 3);
  assert.equal(fields[0].selectedAnswer, '');
  assert.equal(fields[0].valueCapturePolicy, 'not_committed');
  assert.equal(fields[1].selectedAnswer, 'Tomas');
  assert.equal(fields[1].selector.strategy, 'semantic_anchor');
  assert.equal(fields[1].selector.preferred, true);
  assert.equal(fields[1].selector.anchors.normalizedQuestion, 'legal first name');
  assert.equal(fields[2].controlType, 'select');
  assert.equal(fields[2].selectedAnswer, 'Local');
  assert.equal(fields[2].reuseAuthorization, 'reusable_but_reconfirm');
  assert.deepEqual(fields[2].validationMessages, ['Required field is now complete']);
});

test('observation redaction records auth gates without credential values', () => {
  const password = normalizeObservedWorkdayField({
    capturePhase: 'blur',
    committedValue: 'DoNotPersistPassword123!',
    label: 'Password',
    tagName: 'input',
    type: 'password',
  }, context({ pageName: 'Sign In', pageText: 'Sign In Username Password' }));
  const code = normalizeObservedWorkdayField({
    autocomplete: 'one-time-code',
    capturePhase: 'change',
    committedValue: '123456',
    label: 'Verification Code',
    tagName: 'input',
    type: 'text',
  }, context({ pageName: 'Email Verification' }));
  const authEmail = normalizeObservedWorkdayField({
    capturePhase: 'blur',
    committedValue: 'tomas@example.com',
    label: 'Email Address',
    tagName: 'input',
    type: 'email',
  }, context({ pageName: 'Sign In', pageText: 'Sign In Email Address Password' }));
  const hiddenToken = classifyWorkdayObservationRedaction({
    id: 'csrf_token',
    label: 'csrf token',
    type: 'hidden',
  });

  assert.equal(password.selectedAnswer, null);
  assert.equal(password.reuseAuthorization, 'human_only');
  assert.equal(code.selectedAnswer, null);
  assert.equal(code.prohibitedFromInference, true);
  assert.equal(authEmail.selectedAnswer, null);
  assert.equal(authEmail.redaction.gateType, 'authentication');
  assert.equal(hiddenToken.redacted, true);
  const serialized = JSON.stringify([password, code, authEmail, hiddenToken]);
  assert.doesNotMatch(serialized, /DoNotPersistPassword123|123456|tomas@example.com/);
});

test('resume flow binds approved artifact metadata without browser file paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-resume-'));
  const resumePath = path.join(dir, 'approved-resume.pdf');
  fs.writeFileSync(resumePath, 'approved resume fixture', 'utf8');
  const flow = buildWorkdayResumeFlowEvidence({
    canaryId: CANARY_ID,
    fields: [
      normalizeObservedWorkdayField({
        accept: '.pdf,.doc,.docx',
        capturePhase: 'change',
        committedValue: [{ name: 'approved-resume.pdf', size: 23, type: 'application/pdf' }],
        label: 'Upload Resume',
        selectedFiles: [{ name: 'approved-resume.pdf', size: 23, type: 'application/pdf' }],
        tagName: 'input',
        type: 'file',
      }, context({ pageName: 'My Experience', sectionName: 'Resume' })),
      normalizeObservedWorkdayField({
        capturePhase: 'snapshot',
        committedValue: 'Tomas Nieves',
        label: 'Parsed Candidate Name',
        sectionName: 'Experience parsed from resume',
        tagName: 'input',
        type: 'text',
      }, context({ pageName: 'My Experience' })),
    ],
    resume: {
      artifactId: 'approved_resume_pdf',
      runtimePath: resumePath,
    },
    uploadControls: [{
      accept: '.pdf,.doc,.docx',
      label: 'Upload Resume',
      pageName: 'My Experience',
      type: 'file',
    }],
  });

  assert.equal(flow.resumeArtifact.artifactId, 'approved_resume_pdf');
  assert.equal(flow.resumeArtifact.runtimePath, resumePath);
  assert.match(flow.resumeArtifact.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(flow.uploadControls[0].acceptedFileTypes, ['.pdf', '.doc', '.docx']);
  assert.equal(flow.fileFields[0].selectedFiles[0].name, 'approved-resume.pdf');
  assert.equal(flow.parsedFieldsObserved, 1);
});

test('artifact writer emits the required files and excludes protected samples', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-workday-observation-'));
  const ordinary = normalizeObservedWorkdayField({
    capturePhase: 'change',
    committedValue: 'Yes',
    label: 'Are you at least 18 years old and able to provide proof?',
    options: [{ label: 'Yes', value: 'yes', selected: true }, { label: 'No', value: 'no' }],
    sectionName: 'Application Questions',
    tagName: 'select',
    type: 'select',
  }, context({ pageName: 'Application Questions' }));
  const sensitive = normalizeObservedWorkdayField({
    capturePhase: 'change',
    committedValue: 'Male',
    label: 'Gender',
    options: [{ label: 'Male', value: 'male', selected: true }],
    sectionName: 'Voluntary Disclosures',
    tagName: 'select',
    type: 'select',
  }, context({ pageName: 'Voluntary Disclosures' }));
  const password = normalizeObservedWorkdayField({
    capturePhase: 'blur',
    committedValue: 'NeverWriteMe',
    label: 'Password',
    tagName: 'input',
    type: 'password',
  }, context({ pageName: 'Sign In', pageText: 'Sign In Password' }));

  const artifactSet = buildWorkdayObservationArtifacts({
    browserProfileDir: '/tmp/career-os-profile',
    canaryId: CANARY_ID,
    company: 'T-Mobile',
    observeModeEnabled: true,
    queueEnabled: false,
    role: 'Sr Product Manager',
    startedAt: '2026-07-24T00:00:00.000Z',
    workdayIdentity: {
      canonicalUrl: WORKDAY_URL,
      jobId: 'REQ362163-1',
      tenant: 'tmobile.wd1',
    },
  }, [{
    actionControls: [{ label: 'Save and Continue', enabled: true }],
    capturedAt: '2026-07-24T00:00:00.000Z',
    fields: [ordinary, sensitive, password],
    pageName: 'Application Questions',
    sectionNames: ['Application Questions'],
    transitions: [{ actionLabel: 'Save and Continue', actionKind: 'save_and_continue' }],
    validationEvents: [{ message: 'Required field is complete', pageName: 'Application Questions' }],
  }], {
    answerBank: { answers: [] },
  });
  const written = writeWorkdayObservationArtifacts(dir, artifactSet);

  assert.deepEqual(written.map((file) => path.basename(file)).sort(), WORKDAY_OBSERVATION_ARTIFACT_FILES.slice().sort());
  assert.equal(artifactSet['session-summary.json'].counts.fields, 3);
  assert.equal(artifactSet['redaction-report.json'].credentialValuesPersisted, false);
  assert.equal(artifactSet['proposed-answer-bank-patch.json'].counts.sensitive, 1);
  assert.equal(artifactSet['proposed-answer-bank-patch.json'].skipped.some((entry) => entry.reason === 'redacted_human_only'), true);
  assert.equal(artifactSet['proposed-answer-bank-patch.json'].entries.find((entry) => entry.questionText === 'Gender').promotionApproved, false);
  assert.equal(artifactSet['proposed-answer-bank-patch.json'].entries.find((entry) => entry.questionText === 'Gender').sensitive, true);
  assert.equal(scanArtifactFilesForSecrets(dir, ['NeverWriteMe']).ok, true);
});

test('replay map prefers semantic anchors and gates legal, sensitive, and uncertain controls', () => {
  const fields = [
    normalizeObservedWorkdayField({
      capturePhase: 'change',
      committedValue: 'Yes',
      label: 'Legally authorized to work in the United States',
      sectionName: 'Application Questions',
      tagName: 'select',
      type: 'select',
    }, context({ pageName: 'Application Questions' })),
    normalizeObservedWorkdayField({
      capturePhase: 'change',
      committedValue: 'Accepted',
      label: 'I accept the terms and conditions for this application',
      sectionName: 'Review',
      tagName: 'input',
      type: 'checkbox',
    }, context({ pageName: 'Review' })),
    normalizeObservedWorkdayField({
      capturePhase: 'change',
      committedValue: 'No, I do not have a disability',
      label: 'Disability Status',
      sectionName: 'Self Identify',
      tagName: 'select',
      type: 'select',
    }, context({ pageName: 'Self Identify' })),
  ];
  const replayMap = buildWorkdayProposedReplayMap(fields, {
    canaryId: CANARY_ID,
    jobId: 'REQ362163-1',
    tenant: 'tmobile.wd1',
  });
  assert.equal(replayMap.selectorPolicy.includes('semantic anchors'), true);
  assert.equal(replayMap.entries[0].semanticSelector.preferred, true);
  assert.equal(replayMap.entries[0].canReplayAutomatically, false);
  assert.equal(replayMap.entries[1].replayGate, 'legal_acknowledgment_requires_application_specific_approval');
  assert.equal(replayMap.entries[2].replayGate, 'sensitive_answer_requires_explicit_user_confirmation');

  const patch = buildWorkdayProposedAnswerBankPatch(fields, {
    bank: { answers: [] },
    canaryId: CANARY_ID,
    company: 'T-Mobile',
    jobId: 'REQ362163-1',
    role: 'Sr Product Manager',
    source: 'test_observation',
    tenant: 'tmobile.wd1',
  });
  assert.equal(patch.entries.find((entry) => /terms/.test(entry.normalizedQuestion)).requiresApplicationSpecificConfirmation, true);
  assert.equal(patch.entries.find((entry) => /disability/.test(entry.normalizedQuestion)).sensitive, true);
  assert.equal(patch.entries.every((entry) => entry.promotionApproved === false), true);
});

test('active Workday tab discovery finds one valid application tab from the controlled browser', async () => {
  const browser = mockBrowser([
    mockPage({ title: 'Inbox', url: 'https://mail.example.com/inbox', dom: activeDom() }),
    mockPage({ title: 'T-Mobile Workday', url: WORKDAY_URL, dom: activeDom() }),
  ]);
  const result = await discoverActiveWorkdayApplicationTab({
    browser,
    canaryId: CANARY_ID,
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ACTIVE WORKDAY APPLICATION READY');
  assert.equal(result.selectedTab.tenant, 'tmobile.wd1');
  assert.equal(result.selectedTab.jobId, 'REQ362163-1');
  assert.equal(result.rejectedTabs[0].reason, 'non_workday_origin');
});

test('active Workday tab discovery rejects wrong tenant, wrong job, unrelated tabs, and multiples', async () => {
  const wrongTenant = await discoverActiveWorkdayApplicationTab({
    browser: mockBrowser([mockPage({ url: WORKDAY_URL, dom: activeDom() })]),
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'acme.wd5',
  });
  assert.equal(wrongTenant.status, 'WRONG TENANT');

  const wrongJob = await discoverActiveWorkdayApplicationTab({
    browser: mockBrowser([mockPage({ url: WORKDAY_URL, dom: activeDom() })]),
    expectedJobId: 'REQ000000',
    expectedTenant: 'tmobile.wd1',
  });
  assert.equal(wrongJob.status, 'WRONG JOB');

  const unrelated = await discoverActiveWorkdayApplicationTab({
    browser: mockBrowser([mockPage({ url: 'https://example.com/jobs/123', dom: activeDom() })]),
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
  });
  assert.equal(unrelated.status, 'NO ACTIVE WORKDAY APPLICATION FOUND');

  const multiple = await discoverActiveWorkdayApplicationTab({
    browser: mockBrowser([
      mockPage({ title: 'Workday 1', url: WORKDAY_URL, dom: activeDom() }),
      mockPage({ title: 'Workday 2', url: WORKDAY_URL, dom: activeDom({ pageName: 'My Experience' }) }),
    ]),
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
  });
  assert.equal(multiple.status, 'MULTIPLE MATCHING TABS');
  assert.equal(multiple.matchingTabs.length, 2);
  assert.equal(multiple.matchingTabs.every((tab) => !tab.sanitizedUrl.includes('token=')), true);
});

test('active Workday tab discovery refuses sign-in, OTP, inactive, and non-application pages', async () => {
  const signIn = await discoverActiveWorkdayApplicationTab({
    browser: mockBrowser([mockPage({
      url: WORKDAY_URL,
      dom: activeDom({ applicationStructureDetected: false, authGateDetected: true, authGateType: 'sign in' }),
    })]),
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
  });
  assert.equal(signIn.status, 'SIGN-IN REQUIRED');

  const otp = await discoverActiveWorkdayApplicationTab({
    browser: mockBrowser([mockPage({
      url: WORKDAY_URL,
      dom: activeDom({ applicationStructureDetected: false, authGateDetected: true, authGateType: 'verification code' }),
    })]),
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
  });
  assert.equal(otp.status, 'SIGN-IN REQUIRED');

  const inactive = await discoverActiveWorkdayApplicationTab({
    browser: mockBrowser([mockPage({
      url: WORKDAY_URL,
      dom: activeDom({ inactiveDetected: true }),
    })]),
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
  });
  assert.equal(inactive.status, 'APPLICATION NOT ACTIVE');

  const accountPage = await discoverActiveWorkdayApplicationTab({
    browser: mockBrowser([mockPage({
      url: 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/account',
      dom: activeDom(),
    })]),
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
  });
  assert.equal(accountPage.status, 'NO ACTIVE WORKDAY APPLICATION FOUND');
});

test('active Workday attachment preflight refuses queue enabled and another running worker', async () => {
  const queue = await validateActiveWorkdayAttachPreflight({
    canaryId: CANARY_ID,
    env: env({ CAREER_OS_QUEUE_ENABLED: '1' }),
    stopWorkers: false,
  });
  assert.equal(queue.ok, false);
  assert.match(queue.reason, /QUEUE_ENABLED/);

  const running = await validateActiveWorkdayAttachPreflight({
    canaryId: CANARY_ID,
    env: env(),
    stopWorkers: false,
    workerStatus: { ok: true, configured: true, eligible: 0, running: 1 },
  });
  assert.equal(running.ok, false);
  assert.match(running.reason, /another worker/);
});

test('attach-active verifies a non-first Workday application page and waits for confirmation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-active-tab-'));
  const result = await attachToActiveWorkdayObservation({
    artifactDir: dir,
    browser: mockBrowser([mockPage({
      title: 'Application Questions',
      url: WORKDAY_URL,
      dom: activeDom({ pageName: 'Application Questions' }),
    })]),
    canaryId: CANARY_ID,
    env: env(),
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
    stopWorkers: false,
    workerStatus: { ok: true, configured: true, eligible: 0, running: 0 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ACTIVE WORKDAY APPLICATION READY');
  assert.equal(result.observationStarted, false);
  assert.equal(fs.existsSync(path.join(dir, 'active-tab-verification.json')), true);
});

test('final review detection fingerprints review without pressing Submit', async () => {
  let evaluateCount = 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-os-review-observe-'));
  const page = {
    async evaluate() {
      evaluateCount += 1;
      if (evaluateCount === 1) return activeDom({ pageName: 'Review', reviewSignals: { reviewReached: true, submitVisible: true, nextVisible: false } });
      if (evaluateCount === 2) return undefined;
      if (evaluateCount === 3) return undefined;
      if (evaluateCount === 4) {
        return {
          actionControls: [{ enabled: true, label: 'Submit', actionKind: 'submit' }],
          capturedAt: '2026-07-24T00:00:00.000Z',
          fields: [{
            capturePhase: 'snapshot',
            committed: true,
            committedValue: 'Yes',
            label: 'Legally authorized to work in the United States',
            pageName: 'Review',
            sectionName: 'Application Questions',
            tagName: 'select',
            type: 'select',
          }],
          pageName: 'Review',
          resumeUploadControls: [],
          sectionNames: ['My Information', 'My Experience', 'Application Questions', 'Review'],
          title: 'Review',
          url: WORKDAY_URL,
          validationEvents: [],
        };
      }
      return [];
    },
    isClosed() {
      return false;
    },
    async title() {
      return 'Review';
    },
    async waitForTimeout() {},
    url() {
      return WORKDAY_URL;
    },
  };
  const result = await attachToActiveWorkdayObservation({
    artifactDir: dir,
    browser: mockBrowser([page]),
    canaryId: CANARY_ID,
    confirmed: true,
    env: env(),
    expectedJobId: 'REQ362163-1',
    expectedTenant: 'tmobile.wd1',
    stopWorkers: false,
    workerStatus: { ok: true, configured: true, eligible: 0, running: 0 },
  });
  assert.equal(result.status, 'OBSERVATION COMPLETE — REVIEW REQUIRED');
  assert.equal(result.reviewReached, true);

  const directReview = detectWorkdayFinalReview({
    fields: [normalizeObservedWorkdayField({
      capturePhase: 'snapshot',
      committedValue: 'Yes',
      label: 'Legally authorized to work in the United States',
      pageName: 'Review',
      sectionName: 'Application Questions',
      tagName: 'select',
      type: 'select',
    }, context({ pageName: 'Review' }))],
    pages: [{
      actionControls: [{ enabled: true, label: 'Submit' }],
      pageName: 'Review',
      sectionNames: ['My Information', 'My Experience', 'Review'],
    }],
    task: { applicationId: CANARY_ID, employer: 'T-Mobile', position: 'Sr Product Manager' },
    workdayIdentity: { jobId: 'REQ362163-1', tenant: 'tmobile.wd1' },
  });
  assert.match(directReview.reviewFingerprint, /^wdrev_/);

  for (const fileName of WORKDAY_OBSERVATION_ARTIFACT_FILES) {
    assert.equal(fs.existsSync(path.join(dir, fileName)), true, `${fileName} should exist`);
  }
  const summary = JSON.parse(fs.readFileSync(path.join(dir, 'session-summary.json'), 'utf8'));
  assert.equal(summary.reviewReached, true);
  assert.equal(summary.submissionPerformed, false);
});

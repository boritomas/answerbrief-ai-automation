import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright';

import { applyFieldMappings } from '../../scripts/lib/career-os-field-engine.mjs';
import { buildWorkdayQuestionMappings } from '../../scripts/lib/career-os-question-mappings.mjs';
import {
  answerReportValue,
  analyzeWorkdayAnswerBank,
  loadWorkdayAnswerBank,
  resolveWorkdayAnswerForLabel,
} from '../../scripts/lib/career-os-workday-answer-bank.mjs';
import {
  buildWorkdayReviewFingerprint,
  classifyWorkdayPageText,
  parseWorkdayJobUrl,
  runWorkdayProductionFlow,
} from '../../scripts/lib/career-os-workday-production.mjs';
import { resolveProductionExecutionPolicy } from '../../scripts/lib/career-os-production-controls.mjs';
import {
  buildWorkdayRecordingReconciliationPatch,
  validateWorkdayRecordingIdentity,
} from '../../scripts/lib/career-os-workday-recording-reconciliation.mjs';

function task(overrides = {}) {
  return {
    applicationId: 'workday-canary-health',
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123',
    candidate: {
      city: 'Aubrey',
      email: 'tomas@example.com',
      firstName: 'Tomas',
      lastName: 'Nieves',
      linkedin: 'https://www.linkedin.com/in/tomasnieves/',
      phone: '555-555-0100',
      postalCode: '76227',
      pronouns: 'He/him/his',
      stateOrProvince: 'Texas',
      usWorkAuthorization: true,
    },
    companionId: 'test-companion',
    employer: 'Acme',
    legal: { approvedAcknowledgements: [] },
    ownerEmail: 'tomas@example.com',
    platform: 'workday',
    position: 'Product Manager',
    questionCatalog: [],
    resume: { fileName: 'resume.txt' },
    ...overrides,
  };
}

function runtime() {
  const reports = [];
  return {
    reports,
    submitSafetyChecks: 0,
    async assertSafeToSubmit() {
      this.submitSafetyChecks += 1;
      return true;
    },
    async detectCommonHumanGate() {
      return false;
    },
    async ensureResumeFile() {
      throw new Error('resume should not be requested by this fixture');
    },
    async report(payload) {
      reports.push(payload);
    },
    async safeShot(label) {
      return `/tmp/${label}.png`;
    },
    async takeShot(label) {
      return `/tmp/${label}.png`;
    },
  };
}

function reviewPage({ afterSubmitConfirmation = false } = {}) {
  return {
    clicked: [],
    submitted: false,
    currentUrl: '',
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [
          { currentValue: 'Tomas', filled: true, label: 'Legal First Name', required: true, tagName: 'input', type: 'text' },
          { currentValue: 'Nieves', filled: true, label: 'Legal Last Name', required: true, tagName: 'input', type: 'text' },
        ],
      };
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async textContent() {
      if (afterSubmitConfirmation && this.submitted) return 'Thank you for applying. Your application has been submitted.';
      return 'My Information Review Submit';
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || task().applicationUrl;
    },
  };
}

test('Workday answer bank loads with provenance and conflict markers', () => {
  const bank = loadWorkdayAnswerBank();
  const summary = analyzeWorkdayAnswerBank(bank);
  assert.equal(summary.version, 'career-os-workday-answer-bank-2026-07-24');
  assert.ok(summary.total >= 19);
  assert.ok(summary.humanOnly >= 2);
  assert.ok(summary.staleOrConflicting >= 1);
  const verizon = bank.answers.find((entry) => entry.canonicalField === 'overall_verizon_employment_start_date');
  assert.match(verizon.answer, /1997/);
  assert.match(verizon.conflicts[0].value, /1996/);
});

test('T-Mobile REQ361094 recording ingestion preserves answer-bank gates and evidence', () => {
  const bank = loadWorkdayAnswerBank();
  const source = 'user_completed_tmobile_workday_application_REQ361094';
  const reqEntries = bank.answers.filter((entry) => entry.canonicalField.startsWith('tmobile_req361094_'));
  assert.equal(bank.answers.length, 62);
  assert.equal(reqEntries.length, 20);
  assert.equal(bank.answers.filter((entry) => (entry.provenance || []).includes(source)).length, 21);
  assert.equal(bank.answers.find((entry) => entry.canonicalField === 'referral_source')?.answer, 'Instagram');
  assert.equal(reqEntries.every((entry) => entry.sourceEvidence?.source === source), true);

  const sensitiveFields = [
    'tmobile_req361094_us_military_service',
    'tmobile_req361094_spouse_domestic_partner_us_military_service',
    'tmobile_req361094_gender',
    'tmobile_req361094_race_ethnicity',
    'tmobile_req361094_veteran_status',
    'tmobile_req361094_disability_status',
  ];
  for (const field of sensitiveFields) {
    const entry = reqEntries.find((candidate) => candidate.canonicalField === field);
    assert.equal(entry.status, 'human_only');
    assert.equal(entry.authorization, 'human_only');
    assert.equal(entry.requiresApplicationSpecificConfirmation, true);
  }

  const legal = reqEntries.find((entry) => entry.canonicalField === 'tmobile_req361094_terms_and_conditions');
  assert.equal(legal.sensitivity, 'legal');
  assert.equal(legal.status, 'human_only');
  assert.equal(legal.reusableScope, 'tmobile_req361094_only');
  assert.equal(legal.requiresApplicationSpecificConfirmation, true);

  const submitted = reqEntries.find((entry) => entry.canonicalField === 'tmobile_req361094_application_submitted');
  assert.equal(submitted.answer, 'Application Submitted');
  assert.equal(submitted.answerType, 'submission_evidence');
  assert.equal(submitted.status, 'application_specific_evidence');

  const audit = bank.auditTrail.find((entry) => entry.source === source);
  assert.ok(audit);
  assert.equal(audit.workflowObservations.applyChoice, 'Use My Last Application');
  assert.equal(audit.workflowObservations.resumeUploadRequired, true);
  assert.equal(audit.workflowObservations.finalReviewResume.filename, 'Tomas Nieves – Executive Master Resume.pdf');
  assert.equal(audit.workflowObservations.confirmationText, 'Application Submitted');
  assert.match(audit.notes, /completed manually/);
  assert.doesNotMatch(audit.notes, /autonomously submitted/i);
  assert.ok(audit.evidenceReferences.length >= 8);

  const persisted = JSON.stringify({ answers: reqEntries, audit });
  assert.doesNotMatch(persisted, /password|otp|one[- ]?time|cookie|session[_ -]?token|hidden credential/i);
});

test('T-Mobile REQ361094 replay-readiness map gates sensitive and legal fields', () => {
  const report = JSON.parse(fs.readFileSync('config/workday-replay-readiness-REQ361094.json', 'utf8'));
  assert.equal(report.identity.tenant, 'tmobile.wd1');
  assert.equal(report.identity.jobId, 'REQ361094');
  assert.equal(report.readinessStatus, 'READY_FOR_SUPERVISED_REPLAY_CANARY');
  assert.deepEqual(report.counts, {
    applicationFieldsObserved: 26,
    readyForAutonomousReplay: 12,
    requiringConfirmation: 4,
    humanOnly: 1,
    legalGated: 2,
    sensitiveGated: 6,
    unsupported: 0,
    unresolved: 1,
  });
  assert.equal(report.elements.find((entry) => entry.id === 'how_did_you_hear_about_us').classification, 'ready_for_autonomous_replay');
  assert.equal(report.elements.find((entry) => entry.id === 'resume_upload').classification, 'replay_with_confirmation');
  assert.equal(report.elements.find((entry) => entry.id === 'terms_and_conditions').classification, 'legal_gate');
  assert.equal(report.elements.find((entry) => entry.id === 'disability_status').classification, 'sensitive_gate');
  assert.equal(report.elements.find((entry) => entry.id === 'final_submit_control').confirmationRequiredEachTime, true);
});

test('T-Mobile REQ361094 manual recording reconciliation is identity-bound and non-autonomous', () => {
  const existingRow = {
    id: 'workday-recorded-tmobile-req361094',
    lifecycle_stage: 'waiting_on_tomas_browser_worker',
    owner_email: 'tomas@example.com',
    raw_record: {
      application_url: 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Bellevue%2C-Washington/Sr-Broadband-Fiber-Hardware-Product-Manager_REQ361094/apply/useMyLastApplication',
      production_outcome: 'waiting_for_user_decision',
      state_history: [{ event: 'previous_state', status: 'waiting_on_tomas' }],
      workday_identity: { jobId: 'REQ361094', tenant: 'tmobile.wd1' },
    },
  };
  const identity = validateWorkdayRecordingIdentity(existingRow);
  assert.equal(identity.ok, true);

  const patch = buildWorkdayRecordingReconciliationPatch({
    evidenceReferences: ['/tmp/recording.mov', '/tmp/keyframe.jpg'],
    existingRow,
    now: '2026-07-25T02:30:00.000Z',
  });
  assert.equal(patch.row.lifecycle_stage, 'confirmed');
  assert.equal(patch.row.raw_record.production_outcome, 'submitted_confirmed');
  assert.equal(patch.row.raw_record.submission_method, 'manual_recorded_session');
  assert.equal(patch.row.raw_record.observation_source, 'full screen recording');
  assert.equal(patch.row.raw_record.confirmation_page, 'Application Submitted');
  assert.match(patch.row.raw_record.automation_boundary, /did not autonomously submit/);
  assert.match(patch.row.submission_evidence, /manual screen-recorded/);
  assert.equal(patch.row.raw_record.state_history[0].event, 'previous_state');
  assert.equal(patch.row.raw_record.state_history.at(-1).status, 'submitted_confirmed');
  assert.equal(patch.event.metadata.submission_method, 'manual_recorded_session');
  assert.match(patch.event.evidence_text, /did not autonomously submit/);

  const mismatch = validateWorkdayRecordingIdentity({
    raw_record: {
      application_url: 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Product-Manager_REQ000000/apply/useMyLastApplication',
      workday_identity: { jobId: 'REQ000000', tenant: 'tmobile.wd1' },
    },
  });
  assert.equal(mismatch.ok, false);
});

test('Workday answer resolver preserves existing values and gates legal/conflicting fields', () => {
  const bank = loadWorkdayAnswerBank();
  const preserved = resolveWorkdayAnswerForLabel('Email Address', {
    bank,
    currentValue: 'already-entered@example.com',
    task: task(),
  });
  assert.equal(preserved.action, 'preserve_existing');

  const salary = resolveWorkdayAnswerForLabel('Desired Base Salary', { bank, task: task() });
  assert.equal(salary.safeToAutoFill, true);
  assert.equal(salary.answer, '200000');
  assert.equal(answerReportValue(salary), '[verified-compensation-policy]');

  const legal = resolveWorkdayAnswerForLabel('I certify that all information is accurate', { bank, task: task() });
  assert.equal(legal.action, 'gate');
  assert.equal(legal.sensitivity, 'legal');

  const standingLegal = resolveWorkdayAnswerForLabel('I certify that all information is accurate', {
    bank,
    field: { label: 'I certify that all information is accurate', required: true, tagName: 'input', type: 'checkbox' },
    standingLegalAuthorization: true,
    task: task(),
  });
  assert.equal(standingLegal.safeToAutoFill, true);
  assert.equal(standingLegal.strategy, 'first_available');

  const privacyTerms = resolveWorkdayAnswerForLabel('I authorize and consent to the Privacy Notice and Terms and Conditions', {
    bank,
    field: { label: 'I authorize and consent to the Privacy Notice and Terms and Conditions', required: true, tagName: 'input', type: 'checkbox' },
    standingLegalAuthorization: true,
    task: task(),
  });
  assert.equal(privacyTerms.safeToAutoFill, true);
  assert.equal(privacyTerms.status, 'standing_authorized');

  const staleEmployment = resolveWorkdayAnswerForLabel('Employment Start Date', { bank, task: task() });
  assert.equal(staleEmployment.action, 'gate');
  assert.equal(staleEmployment.category, 'conflict');
});

test('Workday URL parser accepts real Workday and Workday-mediated URLs only when tenant/job are clear', () => {
  const direct = parseWorkdayJobUrl('https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123');
  assert.equal(direct.ok, true);
  assert.equal(direct.tenant, 'acme.wd5');
  assert.equal(direct.jobId, 'JR123');

  const cisco = parseWorkdayJobUrl('https://careers.cisco.com/global/en/apply?jobSeqNo=CISCISGLOBAL2018031EXTERNALENGLOBAL&step=1');
  assert.equal(cisco.ok, true);
  assert.equal(cisco.tenant, 'cisco');
  assert.equal(cisco.jobId, 'CISCISGLOBAL2018031EXTERNALENGLOBAL');

  const applyEntrypoint = parseWorkdayJobUrl('https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Bellevue%2C-Washington/Sr-Product-Manager_REQ362163-1/apply/useMyLastApplication');
  assert.equal(applyEntrypoint.ok, true);
  assert.equal(applyEntrypoint.tenant, 'tmobile.wd1');
  assert.equal(applyEntrypoint.jobId, 'REQ362163-1');

  const ambiguous = parseWorkdayJobUrl('https://acme.wd5.myworkdayjobs.com/en-US/External');
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.reason, 'ambiguous_workday_identity');

  const unsupported = parseWorkdayJobUrl('https://example.com/jobs/123');
  assert.equal(unsupported.ok, false);
});

test('Workday single-canary policy fails closed and never enables broad submit without review approval', () => {
  const workdayTask = task();
  const missing = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: { CAREER_OS_EXECUTION_MODE: 'workday_single_canary' },
    task: workdayTask,
  });
  assert.equal(missing.allowed, false);
  assert.equal(missing.outcomeStatus, 'canary_stopped');

  const allowed = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: {
      CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
      CAREER_OS_WORKDAY_CANARY_ID: workdayTask.applicationId,
      CAREER_OS_WORKDAY_CANARY_URL: workdayTask.applicationUrl,
    },
    task: workdayTask,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.submitAllowed, false);

  const exactApprovalConfigured = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: {
      CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
      CAREER_OS_WORKDAY_CANARY_ID: workdayTask.applicationId,
      CAREER_OS_WORKDAY_CANARY_URL: workdayTask.applicationUrl,
      CAREER_OS_WORKDAY_SUBMIT_APPROVAL: 'wdrev_test',
    },
    task: workdayTask,
  });
  assert.equal(exactApprovalConfigured.allowed, true);
  assert.equal(exactApprovalConfigured.submitAllowed, true);

  const submitEnabled = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: { CAREER_OS_EXECUTION_MODE: 'submit_enabled' },
    task: workdayTask,
  });
  assert.equal(submitEnabled.allowed, false);
});

test('Workday-first policy allows standing-authorized submit mode without canary id', () => {
  const workdayTask = task();
  const policy = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' },
    task: workdayTask,
  });
  assert.equal(policy.allowed, true);
  assert.equal(policy.submitAllowed, true);
});

test('Workday page classifier distinguishes auth, email, expired, CAPTCHA, and app states', () => {
  assert.equal(classifyWorkdayPageText('Sign In Username Password').status, 'waiting_for_sign_in');
  assert.equal(classifyWorkdayPageText('Sign in or create account to continue').status, 'waiting_for_account_creation');
  assert.equal(classifyWorkdayPageText('Create Account or Sign In with your email').status, 'waiting_for_account_creation');
  assert.equal(classifyWorkdayPageText('Enter the verification code sent to your email').status, 'waiting_for_email_code');
  assert.equal(classifyWorkdayPageText('Please verify your email before continuing').status, 'waiting_for_email_verification');
  assert.equal(classifyWorkdayPageText('This job is no longer accepting applications').status, 'not_qualified');
  assert.equal(classifyWorkdayPageText('Verify you are human CAPTCHA').category, 'captcha');
  assert.equal(classifyWorkdayPageText('My Information Application Questions Review Submit').state, 'application');
});

test('Workday canary stops at review without exact job approval', async () => {
  const workdayTask = task();
  const policy = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: {
      CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
      CAREER_OS_WORKDAY_CANARY_ID: workdayTask.applicationId,
      CAREER_OS_WORKDAY_CANARY_URL: workdayTask.applicationUrl,
    },
    task: workdayTask,
  });
  const testRuntime = runtime();
  const page = reviewPage();
  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, {
    env: {
      CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
      CAREER_OS_WORKDAY_CANARY_ID: workdayTask.applicationId,
      CAREER_OS_WORKDAY_CANARY_URL: workdayTask.applicationUrl,
    },
  });
  assert.equal(result, true);
  assert.equal(testRuntime.submitSafetyChecks, 0);
  assert.deepEqual(page.clicked, []);
  const review = testRuntime.reports.find((report) => report.status === 'review_ready');
  assert.ok(review);
  assert.match(review.details.reviewFingerprint, /^wdrev_/);
  assert.equal(review.details.submitBlocked, true);
});

test('Workday canary opens the Apply flow from a live job posting before classifying the next page', async () => {
  const workdayTask = task();
  const env = {
    CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
    CAREER_OS_WORKDAY_CANARY_ID: workdayTask.applicationId,
    CAREER_OS_WORKDAY_CANARY_URL: workdayTask.applicationUrl,
  };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    applyOpened: false,
    clicked: [],
    currentUrl: '',
    async clickActionLabel(label) {
      this.clicked.push(label);
      this.applyOpened = true;
      return true;
    },
    async evaluate() {
      return {
        actions: this.applyOpened ? [] : [{ enabled: true, label: 'Apply', tagName: 'button' }],
        errors: [],
        fields: [],
      };
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async textContent() {
      return this.applyOpened ? 'Sign In Username Password' : 'Product Manager Apply';
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = runtime();
  await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });
  assert.deepEqual(page.clicked, ['Apply']);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_apply_flow_opened'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'waiting_for_sign_in'));
});

test('Workday-first mode reopens Apply when authentication returns to the job posting', async () => {
  const workdayTask = task({
    applicationUrl: 'https://verizon.wd12.myworkdayjobs.com/en-US/frontier_career_site/job/Livingston-New-Jersey/Sr-Director---National-Dispatch---Customer-Operations_R-1097901',
    employer: 'Verizon',
    position: 'Sr. Director - National Dispatch & Customer Operations',
  });
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const protectedSentinel = 'DO_NOT_LEAK_POST_AUTH_APPLY_VALUE';
  const page = {
    clicked: [],
    currentUrl: '',
    emailValue: '',
    passwordFilled: false,
    state: 'sign_in',
    submitted: false,
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/sign in/i.test(label)) this.state = 'posting';
      if (/^apply/i.test(label)) this.state = 'review';
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (this.state === 'sign_in') {
        return {
          actions: [{ enabled: true, label: 'Sign In', tagName: 'button' }],
          errors: [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      if (this.state === 'posting') {
        return {
          actions: [{ enabled: true, label: 'Apply', tagName: 'button' }],
          errors: [],
          fields: [],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [
          { currentValue: 'Tomas', filled: true, label: 'Legal First Name', required: true, tagName: 'input', type: 'text' },
        ],
      };
    },
    async fillAccountField(_patterns, value) {
      this.emailValue = value;
      return true;
    },
    async fillAccountPassword(value) {
      this.passwordFilled = value === protectedSentinel;
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return this.state === 'sign_in';
    },
    async textContent() {
      if (this.submitted) return 'Application submitted. Thank you.';
      if (this.state === 'sign_in') return 'Sign In Email Address Password';
      if (this.state === 'posting') return 'Sr. Director - National Dispatch & Customer Operations Apply';
      return 'Review Submit';
    },
    async waitForTimeout() {},
    url() {
      if (this.state === 'posting') return 'https://verizon.wd12.myworkdayjobs.com/en-US/frontier_career_site/job/Livingston-New-Jersey/Sr-Director---National-Dispatch---Customer-Operations_R-1097901';
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata() {
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: false,
        ok: true,
        password: protectedSentinel,
        reference: 'macos-keychain service=career-os-workday:verizon-wd12; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.deepEqual(page.clicked, ['Sign In', 'Apply', 'Submit']);
  assert.equal(page.emailValue, 'tomas@example.com');
  assert.equal(page.passwordFilled, true);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_post_auth_apply_flow_reopened'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_POST_AUTH_APPLY_VALUE/);
});

test('Workday production flow selects the safe start-application resume option before classifying the page', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const resumePath = '/tmp/career-os-workday-start-modal-resume.txt';
  fs.writeFileSync(resumePath, 'approved resume fixture', 'utf8');
  const page = {
    applyOpened: false,
    clicked: [],
    currentUrl: '',
    startSelected: false,
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/^apply$/i.test(label)) this.applyOpened = true;
      if (/autofill with resume/i.test(label)) this.startSelected = true;
      return true;
    },
    async evaluate() {
      if (!this.applyOpened) {
        return { actions: [{ enabled: true, label: 'Apply', tagName: 'button' }], errors: [], fields: [] };
      }
      if (!this.startSelected) {
        return {
          actions: [
            { enabled: true, label: 'Autofill with Resume', tagName: 'button' },
            { enabled: true, label: 'Apply Manually', tagName: 'button' },
            { enabled: true, label: 'Use My Last Application', tagName: 'button' },
          ],
          errors: [],
          fields: [],
        };
      }
      return { actions: [], errors: [], fields: [] };
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async textContent() {
      if (!this.applyOpened) return 'Product Manager Apply';
      if (!this.startSelected) return 'Start Your Application Autofill with Resume Apply Manually Use My Last Application';
      return 'Sign In Username Password';
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  let genericHumanGateChecks = 0;
  const testRuntime = {
    ...runtime(),
    async detectCommonHumanGate() {
      genericHumanGateChecks += 1;
      return true;
    },
    async ensureResumeFile() {
      return resumePath;
    },
  };

  await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.deepEqual(page.clicked, ['Apply', 'Autofill with Resume']);
  const startReport = testRuntime.reports.find((report) => report.details?.classification === 'workday_start_application_option_selected');
  assert.ok(startReport);
  assert.equal(startReport.details.startOption, 'Autofill with Resume');
  assert.equal(startReport.details.resumeFileName, 'career-os-workday-start-modal-resume.txt');
  assert.ok(testRuntime.reports.some((report) => report.status === 'waiting_for_sign_in'));
  assert.equal(genericHumanGateChecks, 0);
});

test('Workday production flow clicks exact start option card controls', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const workdayTask = task();
    const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
    const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
    const resumePath = '/tmp/career-os-workday-card-option-resume.txt';
    fs.writeFileSync(resumePath, 'approved resume fixture', 'utf8');
    let currentUrl = workdayTask.applicationUrl;
    page.goto = async (url) => {
      currentUrl = url;
      await page.setContent(`
        <main>
          <h1>Product Manager</h1>
          <button type="button" id="apply">Apply</button>
        </main>
        <script>
          window.__startSelected = false;
          document.addEventListener('click', (event) => {
            const control = event.target.closest('#apply, [data-automation-id="autofill-card"], button');
            if (!control) return;
            if (control.id === 'apply') {
              document.body.innerHTML = '<main><section role="dialog"><h2>Start Your Application</h2><div tabindex="0" data-automation-id="autofill-card">Autofill with Resume</div><button type="button">Apply Manually</button><button type="button">Use My Last Application</button></section></main>';
            }
            if (control.getAttribute('data-automation-id') === 'autofill-card') {
              window.__startSelected = true;
              document.body.innerHTML = '<main><h1>Sign In</h1><button type="button">Sign In</button></main>';
            }
          });
        </script>
      `);
      return null;
    };
    page.url = () => currentUrl;
    page.textContent = async () => page.evaluate(() => document.body.innerText);
    const testRuntime = {
      ...runtime(),
      async detectCommonHumanGate() {
        return true;
      },
      async ensureResumeFile() {
        return resumePath;
      },
    };

    await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });
    const selected = await page.evaluate(() => window.__startSelected);

    assert.equal(selected, true);
    assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_start_application_option_selected'));
    assert.ok(testRuntime.reports.some((report) => report.status === 'waiting_for_sign_in'));
  } finally {
    await browser.close();
  }
});

test('Workday canary uses exact review approval for one submit click and confirmation capture', async () => {
  const workdayTask = task();
  const identity = parseWorkdayJobUrl(workdayTask.applicationUrl);
  const inspection = {
    actions: [{ enabled: true, label: 'Submit' }],
    fields: [
      { currentValue: 'Tomas', filled: true, label: 'Legal First Name', required: true, tagName: 'input', type: 'text' },
      { currentValue: 'Nieves', filled: true, label: 'Legal Last Name', required: true, tagName: 'input', type: 'text' },
    ],
  };
  const fingerprint = buildWorkdayReviewFingerprint(workdayTask, identity, inspection);
  const env = {
    CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
    CAREER_OS_WORKDAY_CANARY_ID: workdayTask.applicationId,
    CAREER_OS_WORKDAY_CANARY_URL: workdayTask.applicationUrl,
    CAREER_OS_WORKDAY_SUBMIT_APPROVAL: fingerprint,
  };
  const policy = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env,
    task: workdayTask,
  });
  const testRuntime = runtime();
  const page = reviewPage({ afterSubmitConfirmation: true });
  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });
  assert.equal(result, true);
  assert.equal(testRuntime.submitSafetyChecks, 1);
  assert.deepEqual(page.clicked, ['Submit']);
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
});

test('Workday-first mode submits once at review under standing authorization', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env,
    task: workdayTask,
  });
  const testRuntime = runtime();
  const page = reviewPage({ afterSubmitConfirmation: true });
  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });
  assert.equal(result, true);
  assert.equal(testRuntime.submitSafetyChecks, 1);
  assert.deepEqual(page.clicked, ['Submit']);
  const confirmation = testRuntime.reports.find((report) => report.status === 'submitted_confirmed');
  assert.ok(confirmation);
  assert.equal(confirmation.details.submission_method, 'workday_first_standing_authorization');
});

test('Workday-first mode handles authorized account creation before submission without leaking protected values', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const protectedSentinel = 'DO_NOT_LEAK_ACCOUNT_VALUE_123';
  const accountMetadata = [];
  const page = {
    accountSubmitted: false,
    acknowledgements: [],
    clicked: [],
    currentUrl: '',
    emailValue: '',
    protectedValueFilled: false,
    submitted: false,
    async acceptOrdinaryAccountAcknowledgements() {
      this.acknowledgements = ['Candidate Privacy Notice'];
      return this.acknowledgements;
    },
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/create account/i.test(label)) this.accountSubmitted = true;
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (!this.accountSubmitted) {
        return {
          actions: [{ enabled: true, label: 'Create Account', tagName: 'button' }],
          errors: [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
            { currentValue: '', filled: false, label: 'Verify New Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [
          { currentValue: 'Tomas', filled: true, label: 'Legal First Name', required: true, tagName: 'input', type: 'text' },
          { currentValue: 'Nieves', filled: true, label: 'Legal Last Name', required: true, tagName: 'input', type: 'text' },
        ],
      };
    },
    async fillAccountField(_patterns, value) {
      this.emailValue = value;
      return true;
    },
    async fillAccountPassword(value, options) {
      this.protectedValueFilled = value === protectedSentinel && options.verify === true;
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return !this.accountSubmitted;
    },
    async textContent() {
      if (this.submitted) return 'Thank you for applying. Your application has been submitted.';
      if (this.accountSubmitted) return 'My Information Review Submit';
      return 'Create Account Email Address Password Verify New Password Candidate Privacy Notice';
    },
    async visiblePasswordFieldCount() {
      return this.accountSubmitted ? 0 : 2;
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata(payload) {
      accountMetadata.push(payload);
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: true,
        ok: true,
        password: protectedSentinel,
        reference: 'macos-keychain service=career-os-workday:acme-wd5; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.deepEqual(page.clicked, ['Create Account', 'Submit']);
  assert.equal(page.emailValue, 'tomas@example.com');
  assert.equal(page.protectedValueFilled, true);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_authorized_account_handled'));
  assert.equal(testRuntime.reports.some((report) => report.status === 'waiting_for_account_creation'), false);
  assert.ok(accountMetadata.some((entry) => entry.accountState === 'created_or_attempted'));
  assert.ok(accountMetadata.some((entry) => entry.accountState === 'created'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_ACCOUNT_VALUE_123/);
});

test('Workday-first mode uses existing-account link instead of header sign-in on create-account forms', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const workdayTask = task({
      applicationUrl: 'https://web.wd1.myworkdayjobs.com/en-US/ExternalCareerSite/job/United-States---Remote/Principal-Product-Manager---AI-Websites_R14652-1/apply/autofillWithResume',
      employer: 'Newfold Digital',
      position: 'Principal Product Manager - AI Websites',
    });
    const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
    const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
    let currentUrl = workdayTask.applicationUrl;
    page.goto = async (url) => {
      currentUrl = url;
      await page.setContent(`
        <header>
          <button type="button" id="header-sign-in">Sign In</button>
        </header>
        <main>
          <h1>Create Account</h1>
          <label for="email">Email Address *</label>
          <input id="email" type="text" autocomplete="email">
          <label for="password">Password *</label>
          <input id="password" type="password" autocomplete="new-password">
          <label for="verify">Verify New Password *</label>
          <input id="verify" type="password" autocomplete="new-password">
          <label for="privacy">
            <input id="privacy" type="checkbox">
            By Clicking "I Agree" you are agreeing to the statement above.
          </label>
          <button type="button" id="create-account">Create Account</button>
          <p>Already have an account? <button type="button" id="existing-account-sign-in">Sign In</button></p>
        </main>
        <script>
          window.__wrongHeaderSignInClicked = false;
          window.__emailValue = '';
          window.__passwordValue = '';
          window.__submitted = false;
          document.addEventListener('click', (event) => {
            const control = event.target.closest('button');
            if (!control) return;
            if (control.id === 'header-sign-in') {
              window.__wrongHeaderSignInClicked = true;
              return;
            }
            if (control.id === 'existing-account-sign-in') {
              document.body.innerHTML = '<main><h1>Sign In</h1><label for="account-email">Email Address *</label><input id="account-email" type="text" autocomplete="email"><label for="account-password">Password *</label><input id="account-password" type="password" autocomplete="current-password"><button type="button" id="account-sign-in">Sign In</button></main>';
              return;
            }
            if (control.id === 'account-sign-in') {
              window.__emailValue = document.querySelector('#account-email').value;
              window.__passwordValue = document.querySelector('#account-password').value;
              document.body.innerHTML = '<main><h1>Review</h1><button type="button" id="submit">Submit</button></main>';
              return;
            }
            if (control.id === 'submit') {
              window.__submitted = true;
              document.body.innerHTML = '<main>Application submitted. Thank you.</main>';
            }
          });
        </script>
      `);
    };
    page.url = () => currentUrl;
    page.textContent = async () => page.evaluate(() => document.body.innerText);
    const testRuntime = {
      ...runtime(),
      async recordEmployerAccountMetadata() {
        return { ok: true };
      },
      async resolveEmployerAccountCredential() {
        return {
          createdNow: false,
          ok: true,
          password: 'DO_NOT_LEAK_EXISTING_ACCOUNT_VALUE',
          reference: 'macos-keychain service=career-os-workday:web-wd1; account=tomas@example.com',
          store: 'macos_keychain',
        };
      },
    };

    const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });
    const state = await page.evaluate(() => ({
      emailValue: window.__emailValue,
      passwordValue: window.__passwordValue,
      submitted: window.__submitted,
      wrongHeaderSignInClicked: window.__wrongHeaderSignInClicked,
    }));

    assert.equal(result, true);
    assert.equal(state.wrongHeaderSignInClicked, false);
    assert.equal(state.emailValue, 'tomas@example.com');
    assert.equal(state.passwordValue, 'DO_NOT_LEAK_EXISTING_ACCOUNT_VALUE');
    assert.equal(state.submitted, true);
    assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
    assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_EXISTING_ACCOUNT_VALUE/);
  } finally {
    await browser.close();
  }
});

test('Workday-first account creation clicks accessible Workday overlay controls', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    accountSubmitted: false,
    clicked: [],
    currentUrl: '',
    submitted: false,
    async acceptOrdinaryAccountAcknowledgements() {
      return ['Candidate Privacy Notice'];
    },
    async evaluate() {
      if (!this.accountSubmitted) {
        return {
          actions: [{ enabled: true, label: 'Create Account', tagName: 'button' }],
          errors: [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
            { currentValue: '', filled: false, label: 'Verify New Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [],
      };
    },
    async fillAccountField() {
      return true;
    },
    async fillAccountPassword() {
      return true;
    },
    getByRole(_role, options) {
      const owner = this;
      return {
        first() {
          return this;
        },
        async count() {
          const label = owner.accountSubmitted ? 'Submit' : 'Create Account';
          return options.name.test(label) ? 1 : 0;
        },
        async click() {
          const label = owner.accountSubmitted ? 'Submit' : 'Create Account';
          owner.clicked.push(`role:${label}`);
          if (/create account/i.test(label)) owner.accountSubmitted = true;
          if (/submit/i.test(label)) owner.submitted = true;
        },
      };
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return !this.accountSubmitted;
    },
    async textContent() {
      if (this.submitted) return 'Application submitted. Thank you for applying.';
      if (this.accountSubmitted) return 'My Information Review Submit';
      return 'Create Account Email Address Password Verify New Password';
    },
    async visiblePasswordFieldCount() {
      return this.accountSubmitted ? 0 : 2;
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata() {
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: true,
        ok: true,
        password: 'DO_NOT_LEAK_OVERLAY_VALUE',
        reference: 'macos-keychain service=career-os-workday:acme-wd5; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.deepEqual(page.clicked, ['role:Create Account', 'role:Submit']);
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_OVERLAY_VALUE/);
});

test('Workday-first mode waits for Workday shell hydration after account creation', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    accountSubmitted: false,
    clicked: [],
    currentUrl: '',
    hydrated: false,
    submitted: false,
    async acceptOrdinaryAccountAcknowledgements() {
      return ['Candidate Privacy Notice'];
    },
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/create account/i.test(label)) {
        this.accountSubmitted = true;
        this.currentUrl = workdayTask.applicationUrl;
      }
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (!this.accountSubmitted) {
        return {
          actions: [{ enabled: true, label: 'Create Account', tagName: 'button' }],
          errors: [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
            { currentValue: '', filled: false, label: 'Verify New Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      if (!this.hydrated) {
        return {
          actions: [
            { enabled: true, label: 'Skip to main content', tagName: 'a' },
            { enabled: true, label: 'Search for Jobs', tagName: 'a' },
            { enabled: true, label: 'Introduce Yourself', tagName: 'a' },
          ],
          errors: [],
          fields: [],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [],
      };
    },
    async fillAccountField() {
      return true;
    },
    async fillAccountPassword() {
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return !this.accountSubmitted;
    },
    async textContent() {
      if (this.submitted) return 'Thank you for applying. Your application has been submitted.';
      if (this.accountSubmitted && !this.hydrated) return 'Skip to main content Search for Jobs Introduce Yourself';
      if (this.hydrated) return 'My Information Review Submit';
      return 'Create Account Email Address Password Verify New Password';
    },
    async visiblePasswordFieldCount() {
      return this.accountSubmitted ? 0 : 2;
    },
    async waitForTimeout(ms = 0) {
      if (this.accountSubmitted && !this.hydrated && Number(ms) >= 6000) this.hydrated = true;
    },
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata() {
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: true,
        ok: true,
        password: 'DO_NOT_LEAK_HYDRATION_VALUE',
        reference: 'macos-keychain service=career-os-workday:acme-wd5; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_hydration_wait'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_HYDRATION_VALUE/);
});

test('Workday-first mode waits for blank application step hydration before declaring unsupported', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    clicked: [],
    currentUrl: '',
    hydrated: false,
    submitted: false,
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (!this.hydrated) {
        return {
          actions: [{ enabled: false, label: 'Continue', tagName: 'button' }],
          errors: [],
          fields: [],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [],
      };
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async textContent() {
      if (this.submitted) return 'Thank you for applying. Your application has been submitted.';
      if (!this.hydrated) return 'Autofill with Resume * Indicates a required field Continue';
      return 'Review Submit';
    },
    async waitForTimeout(ms = 0) {
      if (!this.hydrated && Number(ms) >= 6000) this.hydrated = true;
    },
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = runtime();

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_hydration_wait' && report.details?.hydrationKind === 'blank_application_step'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
});

test('Workday-first mode waits for blank classified application pages before unsupported handling', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    clicked: [],
    currentUrl: '',
    hydrated: false,
    submitted: false,
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (!this.hydrated) {
        return {
          actions: [{ enabled: false, label: 'Save and Continue', tagName: 'button' }],
          errors: [],
          fields: [],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [],
      };
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async textContent() {
      if (this.submitted) return 'Thank you for applying. Your application has been submitted.';
      if (!this.hydrated) return 'My Information * Indicates a required field Save and Continue';
      return 'Review Submit';
    },
    async waitForTimeout(ms = 0) {
      if (!this.hydrated && Number(ms) >= 6000) this.hydrated = true;
    },
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = runtime();

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_hydration_wait' && report.details?.hydrationKind === 'blank_application_step'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
});

test('Workday-first mode detects sign-in gates from action labels when body text is generic', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    accountSubmitted: false,
    clicked: [],
    currentUrl: '',
    emailPathSelected: false,
    submitted: false,
    async acceptOrdinaryAccountAcknowledgements() {
      return ['Candidate Privacy Notice'];
    },
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/sign in with email/i.test(label)) this.emailPathSelected = true;
      if (/create account/i.test(label)) this.accountSubmitted = true;
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (!this.emailPathSelected) {
        return {
          actions: [
            { enabled: true, label: 'Search for Jobs', tagName: 'a' },
            { enabled: true, label: 'Introduce Yourself', tagName: 'a' },
            { enabled: true, label: 'Sign in with email', tagName: 'button' },
          ],
          errors: [],
          fields: [],
        };
      }
      if (!this.accountSubmitted) {
        return {
          actions: [{ enabled: true, label: 'Create Account', tagName: 'button' }],
          errors: [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
            { currentValue: '', filled: false, label: 'Verify New Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [],
      };
    },
    async fillAccountField() {
      return true;
    },
    async fillAccountPassword() {
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return this.emailPathSelected && !this.accountSubmitted;
    },
    async textContent() {
      if (this.submitted) return 'Thank you for applying. Your application has been submitted.';
      if (!this.emailPathSelected) return 'Search for Jobs Introduce Yourself';
      if (!this.accountSubmitted) return 'Create Account Email Address Password Verify New Password';
      return 'My Information Review Submit';
    },
    async visiblePasswordFieldCount() {
      return this.emailPathSelected && !this.accountSubmitted ? 2 : 0;
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata() {
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: true,
        ok: true,
        password: 'DO_NOT_LEAK_ACTION_LABEL_VALUE',
        reference: 'macos-keychain service=career-os-workday:acme-wd5; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.deepEqual(page.clicked, ['Sign in with email', 'Create Account', 'Submit']);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_authorized_account_path'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_ACTION_LABEL_VALUE/);
});

test('Workday-first mode reopens original apply URL after post-auth userHome redirect', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    accountSubmitted: false,
    clicked: [],
    currentUrl: '',
    submitted: false,
    async acceptOrdinaryAccountAcknowledgements() {
      return [];
    },
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/create account/i.test(label)) {
        this.accountSubmitted = true;
        this.currentUrl = 'https://acme.wd5.myworkdayjobs.com/en-US/External/userHome';
      }
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (!this.accountSubmitted) {
        return {
          actions: [{ enabled: true, label: 'Create Account', tagName: 'button' }],
          errors: [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
            { currentValue: '', filled: false, label: 'Verify New Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      if (/userHome/i.test(this.currentUrl)) {
        return {
          actions: [
            { enabled: true, label: 'Search for Jobs', tagName: 'a' },
            { enabled: true, label: 'Introduce Yourself', tagName: 'a' },
            { enabled: true, label: 'Sign in with email', tagName: 'button' },
          ],
          errors: [],
          fields: [],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [],
      };
    },
    async fillAccountField() {
      return true;
    },
    async fillAccountPassword() {
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return !this.accountSubmitted;
    },
    async textContent() {
      if (this.submitted) return 'Thank you for applying. Your application has been submitted.';
      if (!this.accountSubmitted) return 'Create Account Email Address Password Verify New Password';
      if (/userHome/i.test(this.currentUrl)) return 'Search for Jobs Introduce Yourself Sign in with email';
      return 'My Information Review Submit';
    },
    async visiblePasswordFieldCount() {
      return this.accountSubmitted ? 0 : 2;
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata() {
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: true,
        ok: true,
        password: 'DO_NOT_LEAK_REPLAY_VALUE',
        reference: 'macos-keychain service=career-os-workday:acme-wd5; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.equal(page.currentUrl, workdayTask.applicationUrl);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_post_auth_replay'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_REPLAY_VALUE/);
});

test('Workday-first mode stops after one rejected password and starts reset email handoff', async () => {
  const workdayTask = task({ employer: 'Newfold Digital' });
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const protectedSentinel = 'DO_NOT_LEAK_REJECTED_PASSWORD';
  const accountMetadata = [];
  const page = {
    clicked: [],
    currentUrl: '',
    emailValue: '',
    resetEmailValue: '',
    signInAttempted: false,
    stage: 'sign_in',
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/^sign in$/i.test(label)) this.signInAttempted = true;
      if (/forgot/i.test(label)) this.stage = 'reset';
      if (/reset password/i.test(label)) this.stage = 'reset_sent';
      return true;
    },
    async evaluate() {
      if (this.stage === 'reset') {
        return {
          actions: [{ enabled: true, label: 'Reset Password', tagName: 'button' }],
          errors: [],
          fields: [{ currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' }],
        };
      }
      if (this.stage === 'reset_sent') {
        return { actions: [], errors: [], fields: [] };
      }
      return {
        actions: [
          { enabled: true, label: 'Sign In', tagName: 'button' },
          { enabled: true, label: 'Forgot your password?', tagName: 'a' },
        ],
        errors: [],
        fields: [
          { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
          { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
        ],
      };
    },
    async fillAccountField(_patterns, value) {
      if (this.stage === 'reset') this.resetEmailValue = value;
      else this.emailValue = value;
      return true;
    },
    async fillAccountPassword(value) {
      this.protectedValueFilled = value === protectedSentinel;
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return this.stage === 'sign_in';
    },
    async textContent() {
      if (this.stage === 'reset_sent') return 'Check your email for password reset instructions.';
      if (this.stage === 'reset') return 'Forgot your password? Email Address Reset Password';
      if (this.signInAttempted) return 'You may have entered the wrong email address or password or your account might be locked. Forgot your password?';
      return 'Sign In Email Address Password Forgot your password?';
    },
    async visiblePasswordFieldCount() {
      return this.stage === 'sign_in' ? 1 : 0;
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata(payload) {
      accountMetadata.push(payload);
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: false,
        ok: true,
        password: protectedSentinel,
        reference: 'macos-keychain service=career-os-workday:web-wd1; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.deepEqual(page.clicked, ['Sign In', 'Forgot your password?', 'Reset Password']);
  assert.equal(page.emailValue, 'tomas@example.com');
  assert.equal(page.resetEmailValue, 'tomas@example.com');
  assert.ok(testRuntime.reports.some((report) => report.status === 'waiting_for_email_verification'));
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_password_reset_email_required'));
  assert.ok(accountMetadata.some((entry) => ['password_rejected_reset_available', 'account_locked_reset_available'].includes(entry.verificationStatus)));
  assert.ok(accountMetadata.some((entry) => entry.verificationStatus === 'password_reset_email_required'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_REJECTED_PASSWORD/);
});

test('Workday-first mode retries repeated email account path once before gating', async () => {
  const workdayTask = task({ employer: 'Yahoo' });
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const accountMetadata = [];
  const page = {
    clicked: [],
    currentUrl: '',
    async clickActionLabel(label) {
      this.clicked.push(label);
      return true;
    },
    async evaluate() {
      return {
        actions: [
          { enabled: true, label: 'Search for Jobs', tagName: 'a' },
          { enabled: true, label: 'Sign in with email', tagName: 'button' },
        ],
        errors: [],
        fields: [],
      };
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return false;
    },
    async textContent() {
      return 'Search for Jobs Sign in with email';
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata(payload) {
      accountMetadata.push(payload);
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: false,
        ok: true,
        password: 'DO_NOT_LEAK_EMAIL_PATH_PASSWORD',
        reference: 'macos-keychain service=career-os-workday:ouryahoo-wd5; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.deepEqual(page.clicked, ['Sign in with email', 'Sign in with email']);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_authorized_account_path_retried'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'waiting_for_sign_in'));
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_email_account_path_not_advancing'));
  assert.ok(accountMetadata.some((entry) => entry.verificationStatus === 'email_path_not_advancing'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_EMAIL_PATH_PASSWORD/);
});

test('Workday-first mode waits for delayed email-password fields after selecting email sign-in', async () => {
  const workdayTask = task({ employer: 'Verizon' });
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const protectedSentinel = 'DO_NOT_LEAK_DELAYED_EMAIL_PATH_PASSWORD';
  const page = {
    clicked: [],
    currentUrl: '',
    emailClicked: false,
    emailValue: '',
    passwordFilled: false,
    signInAttempted: false,
    submitted: false,
    waitCalls: 0,
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/sign in with email/i.test(label)) this.emailClicked = true;
      if (/^sign in$/i.test(label)) this.signInAttempted = true;
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (this.signInAttempted) {
        return {
          actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
          errors: [],
          fields: [],
        };
      }
      if (this.emailClicked && this.waitCalls >= 3) {
        return {
          actions: [{ enabled: true, label: 'Sign In', tagName: 'button' }],
          errors: [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'text' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      return {
        actions: [
          { enabled: true, label: 'Sign in with Google', tagName: 'button' },
          { enabled: true, label: 'Sign in with LinkedIn', tagName: 'button' },
          { enabled: true, label: 'Sign in with email', tagName: 'button' },
        ],
        errors: [],
        fields: [],
      };
    },
    async fillAccountField(_patterns, value) {
      this.emailValue = value;
      return true;
    },
    async fillAccountPassword(value) {
      this.passwordFilled = value === protectedSentinel;
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return this.emailClicked && this.waitCalls >= 3 && !this.signInAttempted;
    },
    async textContent() {
      if (this.submitted) return 'Thank you for applying. Your application has been submitted.';
      if (this.signInAttempted) return 'Review Submit';
      if (this.emailClicked && this.waitCalls >= 3) return 'Sign In Email Address Password';
      return 'Sign In Sign in with Google Sign in with LinkedIn Sign in with email';
    },
    async visiblePasswordFieldCount() {
      return await this.hasVisiblePasswordField() ? 1 : 0;
    },
    async waitForTimeout() {
      this.waitCalls += 1;
    },
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata() {
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: false,
        ok: true,
        password: protectedSentinel,
        reference: 'macos-keychain service=career-os-workday:verizon-wd12; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.equal(page.emailValue, 'tomas@example.com');
  assert.equal(page.passwordFilled, true);
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
  assert.ok(!testRuntime.reports.some((report) => report.details?.classification === 'workday_email_account_path_not_advancing'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_DELAYED_EMAIL_PATH_PASSWORD/);
});

test('Workday-first mode fills account form behind an inputless account-choice overlay', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const workdayTask = task({ employer: 'Verizon' });
    const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
    const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
    let currentUrl = workdayTask.applicationUrl;
    page.goto = async (url) => {
      currentUrl = url;
      await page.setContent(`
        <main>
          <h1>Sign In</h1>
          <label for="account-email">Email Address *</label>
          <input id="account-email" autocomplete="email" type="text">
          <label for="account-password">Password *</label>
          <input id="account-password" autocomplete="current-password" type="password">
          <button id="account-sign-in" type="button">Sign In</button>
        </main>
        <section id="choice-overlay" role="dialog" aria-modal="true" aria-label="Sign In">
          <button type="button" aria-label="Close">×</button>
          <h2>Sign In</h2>
          <button type="button">Sign in with Google</button>
          <button type="button">Sign in with LinkedIn</button>
          <button id="email-choice" type="button">Sign in with email</button>
        </section>
        <script>
          window.__submitted = false;
          window.__emailValue = '';
          window.__passwordValue = '';
          document.addEventListener('click', (event) => {
            const control = event.target.closest('button');
            if (!control) return;
            if (control.getAttribute('aria-label') === 'Close') {
              document.querySelector('#choice-overlay')?.remove();
              return;
            }
            if (control.id === 'account-sign-in') {
              window.__emailValue = document.querySelector('#account-email').value;
              window.__passwordValue = document.querySelector('#account-password').value;
              document.body.innerHTML = '<main><h1>Review</h1><button type="button" id="submit">Submit</button></main>';
              return;
            }
            if (control.id === 'submit') {
              window.__submitted = true;
              document.body.innerHTML = '<main>Application submitted. Thank you.</main>';
            }
          });
        </script>
      `);
      return null;
    };
    page.url = () => currentUrl;
    page.textContent = async () => page.evaluate(() => document.body.innerText);
    const testRuntime = {
      ...runtime(),
      async recordEmployerAccountMetadata() {
        return { ok: true };
      },
      async resolveEmployerAccountCredential() {
        return {
          createdNow: false,
          ok: true,
          password: 'DO_NOT_LEAK_INPUTLESS_OVERLAY_VALUE',
          reference: 'macos-keychain service=career-os-workday:verizon-wd12; account=tomas@example.com',
          store: 'macos_keychain',
        };
      },
    };

    const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });
    const state = await page.evaluate(() => ({
      emailValue: window.__emailValue,
      overlayPresent: Boolean(document.querySelector('#choice-overlay')),
      passwordValue: window.__passwordValue,
      submitted: window.__submitted,
    }));

    assert.equal(result, true);
    assert.equal(state.overlayPresent, false);
    assert.equal(state.emailValue, 'tomas@example.com');
    assert.equal(state.passwordValue, 'DO_NOT_LEAK_INPUTLESS_OVERLAY_VALUE');
    assert.equal(state.submitted, true);
    assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
    assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_INPUTLESS_OVERLAY_VALUE/);
  } finally {
    await browser.close();
  }
});

test('Workday-first mode waits and reloads a completely blank Workday page before gating', async () => {
  const workdayTask = task({ employer: 'Verizon' });
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    currentUrl: '',
    reloaded: false,
    submitted: false,
    async clickActionLabel(label) {
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (!this.reloaded) {
        return { actions: [], errors: [], fields: [] };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [{ currentValue: 'Tomas', filled: true, label: 'Legal First Name', required: true, tagName: 'input', type: 'text' }],
      };
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async reload() {
      this.reloaded = true;
    },
    async textContent() {
      if (this.submitted) return 'Application submitted. Thank you.';
      if (this.reloaded) return 'My Information Review Submit';
      return '';
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = runtime();

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.equal(page.reloaded, true);
  assert.ok(testRuntime.reports.some((report) => report.details?.classification === 'workday_hydration_wait' && report.details?.hydrationKind === 'blank_page'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
});

test('Workday-first mode signs in instead of re-clicking an already selected email path', async () => {
  const workdayTask = task({ employer: 'Yahoo' });
  workdayTask.__workdayEmailPathSelected = true;
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const protectedSentinel = 'DO_NOT_LEAK_ALREADY_SELECTED_PASSWORD';
  const page = {
    clicked: [],
    currentUrl: '',
    emailValue: '',
    passwordFilled: false,
    submitted: false,
    signInAttempted: false,
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/^sign in$/i.test(label)) this.signInAttempted = true;
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (this.signInAttempted) {
        return {
          actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
          errors: [],
          fields: [{ currentValue: 'Tomas', filled: true, label: 'Legal First Name', required: true, tagName: 'input', type: 'text' }],
        };
      }
      return {
        actions: [
          { enabled: true, label: 'Search for Jobs', tagName: 'a' },
          { enabled: true, label: 'Sign in with email', tagName: 'button' },
          { enabled: true, label: 'Sign In', tagName: 'button' },
        ],
        errors: [],
        fields: [
          { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
          { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
        ],
      };
    },
    async fillAccountField(_patterns, value) {
      this.emailValue = value;
      return true;
    },
    async fillAccountPassword(value) {
      this.passwordFilled = value === protectedSentinel;
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return !this.signInAttempted;
    },
    async textContent() {
      if (this.submitted) return 'Thank you for applying. Your application has been submitted.';
      if (this.signInAttempted) return 'My Information Review Submit';
      return 'Search for Jobs Sign in with email Email Address Password Sign In';
    },
    async visiblePasswordFieldCount() {
      return this.signInAttempted ? 0 : 1;
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata() {
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: false,
        ok: true,
        password: protectedSentinel,
        reference: 'macos-keychain service=career-os-workday:ouryahoo-wd5; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.deepEqual(page.clicked.filter((label) => /sign in/i.test(label)), ['Sign In']);
  assert.equal(page.emailValue, 'tomas@example.com');
  assert.equal(page.passwordFilled, true);
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_ALREADY_SELECTED_PASSWORD/);
});

test('Workday bounded selector mappings choose safe semantic options', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <label for="source">How Did You Hear About Us?</label>
        <select id="source" name="source" required>
          <option value="">Select One</option>
          <option value="company">Company Website</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <label for="state">State</label>
        <select id="state" name="state" required>
          <option value="">Select One</option>
          <option value="TX">TX</option>
        </select>
        <label for="phone-code">Country Phone Code</label>
        <select id="phone-code" name="phone-code" required>
          <option value="">Select One</option>
          <option value="+1">United States of America (+1)</option>
        </select>
        <label for="device">Phone Device Type</label>
        <select id="device" name="device" required>
          <option value="">Select One</option>
          <option value="cell">Cellular</option>
        </select>
        <fieldset>
          <legend>Have you previously worked at Zendesk?</legend>
          <label><input type="radio" name="prior-zendesk" value="Yes">Yes</label>
          <label><input type="radio" name="prior-zendesk" value="No">No</label>
        </fieldset>
      </form>
    `);
    const mappings = buildWorkdayQuestionMappings(task({ employer: 'Zendesk' }));
    const results = await applyFieldMappings(page, mappings, task({ employer: 'Zendesk' }));

    assert.equal(results.find((result) => result.key === 'referral_source')?.applied, true);
    assert.equal(results.find((result) => result.key === 'state')?.applied, true);
    assert.equal(results.find((result) => result.key === 'country_phone_code')?.applied, true);
    assert.equal(results.find((result) => result.key === 'phone_device_type')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_employer_employment')?.applied, true);
    assert.equal(await page.locator('#source').inputValue(), 'company');
    assert.equal(await page.locator('#state').inputValue(), 'TX');
    assert.equal(await page.locator('#phone-code').inputValue(), '+1');
    assert.equal(await page.locator('#device').inputValue(), 'cell');
    assert.equal(await page.locator('input[name="prior-zendesk"][value="No"]').isChecked(), true);
  } finally {
    await browser.close();
  }
});

test('Workday bounded selector mappings answer Verizon prior employment and supervisor', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <fieldset>
          <legend>Have you ever worked for Verizon or any of Verizon's predecessor companies (e.g., Alltel, AOL, Bell Atlantic, Cybertrust, Frontier, GTE, MCI, NYNEX, Oath, Yahoo)? *</legend>
          <label><input type="radio" name="prior-verizon" value="Yes">Yes</label>
          <label><input type="radio" name="prior-verizon" value="No">No</label>
        </fieldset>
        <label for="work-location">What was your primary work location?</label>
        <input id="work-location" name="work-location" value="">
        <label for="work-email">What was your work email?</label>
        <input id="work-email" name="work-email" value="">
        <label for="supervisor">Who was your supervisor?</label>
        <input id="supervisor" name="supervisor" value="">
        <label for="employee-id">What was your Employee ID or Enterprise ID?</label>
        <input id="employee-id" name="employee-id" value="">
      </form>
    `);
    const workdayTask = task({
      candidate: {
        ...task().candidate,
        employerSpecificAnswers: {
          previouslyWorkedAtEmployer: 'Yes',
          priorEmployerSupervisorName: 'Edward St. Michael',
          priorEmployerWorkEmail: 'tomas.nieves@example.com',
          priorEmployerWorkLocation: 'Irving, TX',
          priorEmployerEmployeeId: 'VZ123',
        },
      },
      employer: 'Verizon',
    });
    const mappings = buildWorkdayQuestionMappings(workdayTask);
    const results = await applyFieldMappings(page, mappings, workdayTask);

    assert.equal(results.find((result) => result.key === 'prior_employer_employment')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_employer_supervisor_name')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_employer_work_location')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_employer_work_email')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_employer_employee_id')?.applied, true);
    assert.equal(await page.locator('input[name="prior-verizon"][value="Yes"]').isChecked(), true);
    assert.equal(await page.locator('#supervisor').inputValue(), 'Edward St. Michael');
    assert.equal(await page.locator('#work-location').inputValue(), 'Irving, TX');
    assert.equal(await page.locator('#work-email').inputValue(), 'tomas.nieves@example.com');
    assert.equal(await page.locator('#employee-id').inputValue(), 'VZ123');
  } finally {
    await browser.close();
  }
});

test('Workday bounded selector mappings handle Workday unlinked Verizon choice labels', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <div data-automation-id="formField-prior-employer">
          <div>Have you ever worked for Verizon or any of Verizon's predecessor companies (e.g., Alltel, AOL, Bell Atlantic, Cybertrust, Frontier, GTE, MCI, NYNEX, Oath, Yahoo)? *</div>
          <div>
            <input id="yes-option" type="radio" name="prior-verizon" value="yes">
            <span>Yes</span>
          </div>
          <div>
            <input id="no-option" type="radio" name="prior-verizon" value="no">
            <span>No</span>
          </div>
        </div>
        <div>
          <div>What was your primary work location?</div>
          <input id="work-location" name="work-location" value="">
        </div>
        <div>
          <div>What was your work email?</div>
          <input id="work-email" name="work-email" value="">
        </div>
        <div>
          <div>What was the name of your last manager?</div>
          <input id="supervisor" name="supervisor" value="">
        </div>
        <div>
          <div>What was your Employee ID or Enterprise ID?</div>
          <input id="employee-id" name="employee-id" value="">
        </div>
      </form>
    `);
    const workdayTask = task({
      candidate: {
        ...task().candidate,
        employerSpecificAnswers: {
          previouslyWorkedAtEmployer: 'Yes',
          priorEmployerSupervisorName: 'Edward St. Michael',
          priorEmployerWorkEmail: 'tomas.h.nieves@verizon.com',
          priorEmployerWorkLocation: 'Irving',
          priorEmployerEmployeeId: 'V123957',
        },
      },
      employer: 'Verizon',
    });
    const mappings = buildWorkdayQuestionMappings(workdayTask);
    const results = await applyFieldMappings(page, mappings, workdayTask);

    assert.equal(results.find((result) => result.key === 'prior_employer_employment')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_employer_supervisor_name')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_employer_work_location')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_employer_work_email')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_employer_employee_id')?.applied, true);
    assert.equal(await page.locator('#yes-option').isChecked(), true);
    assert.equal(await page.locator('#supervisor').inputValue(), 'Edward St. Michael');
    assert.equal(await page.locator('#work-location').inputValue(), 'Irving');
    assert.equal(await page.locator('#work-email').inputValue(), 'tomas.h.nieves@verizon.com');
    assert.equal(await page.locator('#employee-id').inputValue(), 'V123957');
  } finally {
    await browser.close();
  }
});

test('Workday bounded selector mappings fill Verizon My Experience fields from approved profile', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <div>
          <div>Job Title*</div>
          <input id="job-title" value="">
        </div>
        <div>
          <div>Company*</div>
          <input id="company" value="">
        </div>
        <label><input id="current" type="checkbox"> I currently work here</label>
        <div>
          <div>From*</div>
          <input id="from" placeholder="MM/YYYY" value="">
        </div>
        <div>
          <div>Role Description*</div>
          <textarea id="role-description"></textarea>
        </div>
        <div>
          <div>School or University*</div>
          <input id="school" value="">
        </div>
        <div>
          <div>Degree*</div>
          <select id="degree">
            <option value="">Select One</option>
            <option value="masters">Masters</option>
          </select>
        </div>
        <div>
          <div>Field of Study*</div>
          <input id="field-of-study" value="">
        </div>
      </form>
    `);
    const workdayTask = task({
      candidate: {
        ...task().candidate,
        educationHistory: ['Master of Science (M.S.), Microcomputing - University of Puerto Rico'],
        primaryEmployment: {
          currentEmployer: true,
          datePrecision: 'month_year',
          employer: 'Verizon',
          missingVerifiedFields: [],
          source: 'test',
          startMonth: 'April',
          startYear: 1996,
          title: 'Senior Product Owner/Product Manager',
          verificationState: 'tomas_verified',
        },
      },
      employer: 'Verizon',
      resume: {
        content: `EXPERIENCE
Senior Product Owner/Product Manager | Verizon
Enterprise platform strategy and roadmap execution supporting complex customer and operational journeys.`,
        fileName: 'resume.txt',
      },
    });
    const mappings = buildWorkdayQuestionMappings(workdayTask);
    const results = await applyFieldMappings(page, mappings, workdayTask);

    assert.equal(results.find((result) => result.key === 'employment_job_title')?.applied, true);
    assert.equal(results.find((result) => result.key === 'employment_company')?.applied, true);
    assert.equal(results.find((result) => result.key === 'employment_current_employer')?.applied, true);
    assert.equal(results.find((result) => result.key === 'employment_from')?.applied, true);
    assert.equal(results.find((result) => result.key === 'employment_role_description')?.applied, true);
    assert.equal(results.find((result) => result.key === 'education_school')?.applied, true);
    assert.equal(results.find((result) => result.key === 'education_degree')?.applied, true);
    assert.equal(results.find((result) => result.key === 'education_field_of_study')?.applied, true);
    assert.equal(await page.locator('#job-title').inputValue(), 'Senior Product Owner/Product Manager');
    assert.equal(await page.locator('#company').inputValue(), 'Verizon');
    assert.equal(await page.locator('#current').isChecked(), true);
    assert.equal(await page.locator('#from').inputValue(), '04/1996');
    assert.equal(await page.locator('#role-description').inputValue(), 'Enterprise platform strategy and roadmap execution supporting complex customer and operational journeys.');
    assert.equal(await page.locator('#school').inputValue(), 'University of Puerto Rico');
    assert.equal(await page.locator('#degree').inputValue(), 'masters');
    assert.equal(await page.locator('#field-of-study').inputValue(), 'Microcomputing');
  } finally {
    await browser.close();
  }
});

test('Workday bounded selector mappings handle generated ids that start with digits', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <label for="901be0c6-272b-45c0-9459-75ebf586b304">Legal First Name</label>
        <input id="901be0c6-272b-45c0-9459-75ebf586b304" value="">
        <label for="2f3c2a2a-state">State</label>
        <select id="2f3c2a2a-state" required>
          <option value="">Select One</option>
          <option value="TX">TX</option>
        </select>
      </form>
    `);
    const workdayTask = task();
    const mappings = buildWorkdayQuestionMappings(workdayTask);
    const results = await applyFieldMappings(page, mappings, workdayTask);

    assert.equal(results.find((result) => result.key === 'legal_first_name')?.applied, true);
    assert.equal(results.find((result) => result.key === 'state')?.applied, true);
    assert.equal(await page.locator('[id="901be0c6-272b-45c0-9459-75ebf586b304"]').inputValue(), 'Tomas');
    assert.equal(await page.locator('[id="2f3c2a2a-state"]').inputValue(), 'TX');
  } finally {
    await browser.close();
  }
});

test('Workday text mappings ignore non-editable multiselect wrappers', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <div id="0afe35fc-1b5b-4de4-9d85-c8934d771e51" tabindex="-1" data-automation-id="multiSelectContainer" data-uxi-widget-type="multiselect">
          <div>Legal First Name</div>
          <div>Select One</div>
        </div>
        <label for="legal-first-name-input">Legal First Name</label>
        <input id="legal-first-name-input" value="">
      </form>
    `);
    const workdayTask = task();
    const mappings = buildWorkdayQuestionMappings(workdayTask);
    const results = await applyFieldMappings(page, mappings, workdayTask);

    assert.equal(results.find((result) => result.key === 'legal_first_name')?.applied, true);
    assert.equal(await page.locator('#legal-first-name-input').inputValue(), 'Tomas');
  } finally {
    await browser.close();
  }
});

test('Workday bounded selector mappings handle Workday prompt buttons and role radios', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <div class="field">
          <label id="source-label">How Did You Hear About Us? *</label>
          <button id="source-prompt" type="button" aria-haspopup="listbox" aria-labelledby="source-label source-prompt">Select One</button>
        </div>
        <div class="field" role="group" aria-labelledby="prior-cisco-label">
          <div id="prior-cisco-label">Have you ever been issued a Cisco Employee ID or Cisco email address? This includes individuals who were Interns, Co-Ops, Temporary, and Contractors at Cisco. *</div>
          <div role="radio" aria-checked="false" tabindex="0">Yes</div>
          <div role="radio" aria-checked="false" tabindex="0">No</div>
        </div>
        <div class="field">
          <label id="state-label">State *</label>
          <button id="state-prompt" type="button" aria-haspopup="listbox" aria-labelledby="state-label state-prompt">Select One</button>
        </div>
        <div class="field">
          <label id="device-label">Phone Device Type *</label>
          <button id="device-prompt" type="button" aria-haspopup="listbox" aria-labelledby="device-label device-prompt">Select One</button>
        </div>
        <div class="field">
          <label id="phone-code-label">Country Phone Code *</label>
          <button id="phone-code-prompt" type="button" aria-haspopup="listbox" aria-labelledby="phone-code-label phone-code-prompt">Select One</button>
        </div>
      </form>
      <script>
        const options = {
          'source-prompt': ['Company Website', 'LinkedIn'],
          'state-prompt': ['TX'],
          'device-prompt': ['Cellular'],
          'phone-code-prompt': ['United States of America (+1)'],
        };
        document.addEventListener('click', (event) => {
          const radio = event.target.closest('[role="radio"]');
          if (radio) {
            radio.parentElement.querySelectorAll('[role="radio"]').forEach((node) => node.setAttribute('aria-checked', 'false'));
            radio.setAttribute('aria-checked', 'true');
            return;
          }
          const option = event.target.closest('[role="option"]');
          if (option) {
            const owner = document.getElementById(option.dataset.owner);
            owner.textContent = option.textContent;
            owner.dataset.selectedValue = option.textContent;
            document.querySelector('[role="listbox"]')?.remove();
            return;
          }
          const button = event.target.closest('button[aria-haspopup], [role="button"]');
          if (!button) return;
          document.querySelector('[role="listbox"]')?.remove();
          const list = document.createElement('div');
          list.setAttribute('role', 'listbox');
          for (const label of options[button.id] || []) {
            const item = document.createElement('div');
            item.setAttribute('role', 'option');
            item.dataset.owner = button.id;
            item.textContent = label;
            list.appendChild(item);
          }
          document.body.appendChild(list);
        });
      </script>
    `);
    const mappings = buildWorkdayQuestionMappings(task({ employer: 'Cisco' }));
    const results = await applyFieldMappings(page, mappings, task({ employer: 'Cisco' }));

    assert.equal(results.find((result) => result.key === 'referral_source')?.applied, true);
    assert.equal(results.find((result) => result.key === 'prior_cisco_identity')?.applied, true);
    assert.equal(results.find((result) => result.key === 'state')?.applied, true);
    assert.equal(results.find((result) => result.key === 'phone_device_type')?.applied, true);
    assert.equal(results.find((result) => result.key === 'country_phone_code')?.applied, true);
    assert.equal(await page.locator('#source-prompt').textContent(), 'Company Website');
    assert.equal(await page.locator('[role="radio"]').filter({ hasText: /^No$/ }).getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('#state-prompt').textContent(), 'TX');
    assert.equal(await page.locator('#device-prompt').textContent(), 'Cellular');
    assert.equal(await page.locator('#phone-code-prompt').textContent(), 'United States of America (+1)');
  } finally {
    await browser.close();
  }
});

test('Workday prompt mappings scope protected options and avoid contact-field collisions', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <div class="field">
          <label id="source-label">How Did You Hear About Us? *</label>
          <button id="source-prompt" type="button" aria-haspopup="listbox" aria-labelledby="source-label source-prompt">Select One</button>
        </div>
        <div class="field">
          <label id="state-label">State *</label>
          <button id="state-prompt" type="button" aria-haspopup="listbox" aria-labelledby="state-label state-prompt">Alabama</button>
        </div>
        <div class="field">
          <label id="phone-code-label">Country Phone Code *</label>
          <button id="phone-code-prompt" type="button" aria-haspopup="listbox" aria-labelledby="phone-code-label phone-code-prompt">Albania (+355)</button>
        </div>
        <label for="phone-number">Phone Number</label>
        <input id="phone-number" value="">
        <label for="phone-extension">Phone Extension</label>
        <input id="phone-extension" value="">
      </form>
      <script>
        const options = {
          'source-prompt': ['LinkedIn', 'Internet Search'],
          'state-prompt': ['Alabama', 'Texas'],
          'phone-code-prompt': ['Albania (+355)', 'United States of America (+1)'],
        };
        function renderList(items, owner, stale = false) {
          const list = document.createElement('div');
          list.setAttribute('role', 'listbox');
          list.dataset.owner = owner;
          if (stale) list.dataset.stale = 'true';
          for (const label of items) {
            const item = document.createElement('div');
            item.setAttribute('role', 'option');
            item.dataset.owner = owner;
            item.textContent = label;
            list.appendChild(item);
          }
          document.body.appendChild(list);
        }
        document.addEventListener('click', (event) => {
          const option = event.target.closest('[role="option"]');
          if (option) {
            const owner = document.getElementById(option.dataset.owner);
            owner.textContent = option.textContent;
            owner.dataset.selectedValue = option.textContent;
            document.querySelectorAll('[role="listbox"]').forEach((node) => node.remove());
            return;
          }
          const button = event.target.closest('button[aria-haspopup]');
          if (!button) return;
          document.querySelectorAll('[role="listbox"]').forEach((node) => node.remove());
          if (button.id === 'state-prompt') renderList(['Alabama'], 'phone-code-prompt', true);
          if (button.id === 'phone-code-prompt') renderList(['Albania (+355)'], 'state-prompt', true);
          renderList(options[button.id] || [], button.id);
        });
      </script>
    `);
    const workdayTask = task({
      candidate: {
        ...task().candidate,
        referralSource: 'Internet search',
      },
    });
    const mappings = buildWorkdayQuestionMappings(workdayTask);
    const results = await applyFieldMappings(page, mappings, workdayTask);

    assert.equal(results.find((result) => result.key === 'state')?.applied, true);
    assert.equal(results.find((result) => result.key === 'country_phone_code')?.applied, true);
    assert.equal(results.find((result) => result.key === 'phone_number')?.applied, true);
    assert.equal(results.find((result) => result.key === 'referral_source')?.applied, true);
    assert.equal(await page.locator('#state-prompt').textContent(), 'Texas');
    assert.equal(await page.locator('#phone-code-prompt').textContent(), 'United States of America (+1)');
    assert.equal(await page.locator('#source-prompt').textContent(), 'Internet Search');
    assert.equal(await page.locator('#phone-number').inputValue(), '5555550100');
    assert.equal(await page.locator('#phone-extension').inputValue(), '');
  } finally {
    await browser.close();
  }
});

test('Workday protected prompt mappings use typeahead when search input is absent', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <div class="field">
          <label id="phone-code-label">Country Phone Code *</label>
          <button id="phone-code-prompt" type="button" aria-haspopup="listbox" aria-labelledby="phone-code-label phone-code-prompt">Select One</button>
        </div>
      </form>
      <script>
        let typed = '';
        function renderList(items, owner) {
          document.querySelector('[role="listbox"]')?.remove();
          const list = document.createElement('div');
          list.setAttribute('role', 'listbox');
          list.setAttribute('tabindex', '-1');
          for (const label of items) {
            const item = document.createElement('div');
            item.setAttribute('role', 'option');
            item.dataset.owner = owner;
            item.textContent = label;
            list.appendChild(item);
          }
          document.body.appendChild(list);
          list.focus();
        }
        document.addEventListener('keydown', (event) => {
          if (!document.querySelector('[role="listbox"]')) return;
          if (event.key.length !== 1) return;
          typed += event.key;
          if (/united states/i.test(typed)) {
            renderList(['United States of America (+1)'], 'phone-code-prompt');
          }
        });
        document.addEventListener('click', (event) => {
          const option = event.target.closest('[role="option"]');
          if (option) {
            const owner = document.getElementById(option.dataset.owner);
            owner.textContent = option.textContent;
            owner.dataset.selectedValue = option.textContent;
            document.querySelector('[role="listbox"]')?.remove();
            return;
          }
          const button = event.target.closest('button[aria-haspopup]');
          if (!button) return;
          typed = '';
          renderList(['Austria (+43)'], button.id);
        });
      </script>
    `);
    const workdayTask = task();
    const mappings = buildWorkdayQuestionMappings(workdayTask);
    const results = await applyFieldMappings(page, mappings, workdayTask);

    assert.equal(results.find((result) => result.key === 'country_phone_code')?.applied, true);
    assert.equal(await page.locator('#phone-code-prompt').textContent(), 'United States of America (+1)');
  } finally {
    await browser.close();
  }
});

test('Workday protected prompt failure stops before later mappings continue', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <div class="field">
          <label id="state-label">State *</label>
          <button id="state-prompt" type="button" aria-haspopup="listbox" aria-labelledby="state-label state-prompt">Alabama</button>
        </div>
        <div class="field">
          <label id="phone-code-label">Country Phone Code *</label>
          <button id="phone-code-prompt" type="button" aria-haspopup="listbox" aria-labelledby="phone-code-label phone-code-prompt">Select One</button>
        </div>
        <label for="phone-number">Phone Number</label>
        <input id="phone-number" value="">
      </form>
      <script>
        document.addEventListener('click', (event) => {
          const option = event.target.closest('[role="option"]');
          if (option) {
            const owner = document.getElementById(option.dataset.owner);
            owner.textContent = option.textContent;
            document.querySelector('[role="listbox"]')?.remove();
            return;
          }
          const button = event.target.closest('button[aria-haspopup]');
          if (!button) return;
          document.querySelector('[role="listbox"]')?.remove();
          const list = document.createElement('div');
          list.setAttribute('role', 'listbox');
          const items = button.id === 'state-prompt'
            ? ['Alabama']
            : ['United States of America (+1)'];
          for (const label of items) {
            const item = document.createElement('div');
            item.setAttribute('role', 'option');
            item.dataset.owner = button.id;
            item.textContent = label;
            list.appendChild(item);
          }
          document.body.appendChild(list);
        });
      </script>
    `);
    const workdayTask = task();
    const mappings = buildWorkdayQuestionMappings(workdayTask);
    const results = await applyFieldMappings(page, mappings, workdayTask);
    const stateResult = results.find((result) => result.key === 'state');

    assert.equal(stateResult?.applied, false);
    assert.equal(stateResult?.reason, 'protected_prompt_commit_failed');
    assert.equal(results.some((result) => result.key === 'country_phone_code'), false);
    assert.equal(await page.locator('#phone-code-prompt').textContent(), 'Select One');
    assert.equal(await page.locator('#phone-number').inputValue(), '');
  } finally {
    await browser.close();
  }
});

test('Workday bounded selector mappings handle nested LinkedIn source prompts and mobile phone type', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <div class="field">
          <label id="source-label">How Did You Hear About Us? *</label>
          <button id="source-prompt" type="button" aria-haspopup="listbox" aria-labelledby="source-label source-prompt">0 items selected</button>
        </div>
        <div class="field">
          <label id="device-label">Phone Device Type *</label>
          <button id="device-prompt" type="button" aria-haspopup="listbox" aria-labelledby="device-label device-prompt">Landline</button>
        </div>
      </form>
      <script>
        const sourceParents = ['Campus', 'Corporate Website', 'DirectEmployers', 'Job Board', 'Recruiting Event', 'Social Network'];
        const sourceChildren = ['LinkedIn', 'Facebook', 'Instagram'];
        const deviceOptions = ['Landline', 'Mobile'];
        function renderList(items, owner, child = false) {
          document.querySelector('[role="listbox"]')?.remove();
          const list = document.createElement('div');
          list.setAttribute('role', 'listbox');
          for (const label of items) {
            const item = document.createElement('div');
            item.setAttribute('role', 'option');
            item.dataset.owner = owner;
            if (!child && owner === 'source-prompt') item.dataset.parent = label;
            item.textContent = label;
            list.appendChild(item);
          }
          document.body.appendChild(list);
        }
        document.addEventListener('click', (event) => {
          const option = event.target.closest('[role="option"]');
          if (option?.dataset.parent === 'Social Network') {
            renderList(sourceChildren, 'source-prompt', true);
            return;
          }
          if (option?.dataset.owner) {
            const owner = document.getElementById(option.dataset.owner);
            owner.textContent = option.textContent;
            owner.dataset.selectedValue = option.textContent;
            document.querySelector('[role="listbox"]')?.remove();
            return;
          }
          const button = event.target.closest('button[aria-haspopup], [role="button"]');
          if (!button) return;
          if (button.id === 'source-prompt') renderList(sourceParents, button.id);
          if (button.id === 'device-prompt') renderList(deviceOptions, button.id);
        });
      </script>
    `);
    const workdayTask = task({
      candidate: {
        ...task().candidate,
        referralSource: 'LinkedIn',
      },
      employer: 'Sedgwick',
    });
    const mappings = buildWorkdayQuestionMappings(workdayTask);
    const results = await applyFieldMappings(page, mappings, workdayTask);

    assert.equal(results.find((result) => result.key === 'referral_source')?.applied, true);
    assert.equal(results.find((result) => result.key === 'phone_device_type')?.applied, true);
    assert.equal(await page.locator('#source-prompt').textContent(), 'LinkedIn');
    assert.equal(await page.locator('#device-prompt').textContent(), 'Mobile');
  } finally {
    await browser.close();
  }
});

test('Workday bounded selector mappings handle Cisco application-question prompts', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <form>
        <div class="field">
          <label id="authorized-label">Are you legally authorized to work in any of the posted location for this requisition? *</label>
          <div id="authorized-prompt" role="button" tabindex="0" aria-labelledby="authorized-label authorized-prompt">Select One</div>
        </div>
        <div class="field">
          <label id="sponsor-label">Will you now or in the future require sponsorship for an employment visa for any of the posted locations (for example, if you are on a temporary visa)? *</label>
          <div id="sponsor-prompt" role="button" tabindex="0" aria-labelledby="sponsor-label sponsor-prompt">Select One</div>
        </div>
        <div class="field">
          <label id="years-label">How many years of relevant work experience related to this position do you have? *</label>
          <div id="years-prompt" role="button" tabindex="0" aria-labelledby="years-label years-prompt">Select One</div>
        </div>
        <div class="field">
          <label id="gov-label">Are you currently or previously appointed as a U.S. Government Official, or employed by a U.S. Government or Foreign Government entity in any capacity? *</label>
          <div id="gov-prompt" role="button" tabindex="0" aria-labelledby="gov-label gov-prompt">Select One</div>
        </div>
        <div class="field">
          <label id="gov-family-label">Do you have a family relationship (biological, adopted, marriage, domestic partnership, civil union, or some other arrangement) with, or are you a close personal contact (a regular and ongoing close connection that may be personal, romantic, financial, or any other type of relationship that could be perceived as more than general acquaintance) of U.S. Government or Foreign Government Official? *</label>
          <div id="gov-family-prompt" role="button" tabindex="0" aria-labelledby="gov-family-label gov-family-prompt">Select One</div>
        </div>
      </form>
      <script>
        const options = {
          'authorized-prompt': ['Yes', 'No'],
          'sponsor-prompt': ['Yes', 'No'],
          'years-prompt': ['0-2 years', '3-5 years', '6-9 years', '10+ years'],
          'gov-prompt': ['Yes', 'No'],
          'gov-family-prompt': ['Yes', 'No'],
        };
        document.addEventListener('click', (event) => {
          const option = event.target.closest('[role="option"]');
          if (option) {
            const owner = document.getElementById(option.dataset.owner);
            owner.textContent = option.textContent;
            owner.dataset.selectedValue = option.textContent;
            document.querySelector('[role="listbox"]')?.remove();
            return;
          }
          const button = event.target.closest('button[aria-haspopup], [role="button"]');
          if (!button) return;
          document.querySelector('[role="listbox"]')?.remove();
          const list = document.createElement('div');
          list.setAttribute('role', 'listbox');
          for (const label of options[button.id] || []) {
            const item = document.createElement('div');
            item.setAttribute('role', 'option');
            item.dataset.owner = button.id;
            item.textContent = label;
            list.appendChild(item);
          }
          document.body.appendChild(list);
        });
      </script>
    `);
    const baseTask = task();
    const ciscoTask = task({
      employer: 'Cisco',
      candidate: {
        ...baseTask.candidate,
        employerSpecificAnswers: {
          currentOrFormerGovernmentOfficial: 'No',
          governmentOfficialFamilyOrCloseContact: 'No',
        },
        primaryEmployment: {
          employer: 'Verizon',
          endYear: 2026,
          startYear: 1996,
          title: 'Senior Product Owner/Product Manager',
        },
        sponsorshipFuture: 'No',
        sponsorshipNow: 'No',
      },
    });
    const mappings = buildWorkdayQuestionMappings(ciscoTask);
    const results = await applyFieldMappings(page, mappings, ciscoTask);

    assert.equal(results.find((result) => result.key === 'work_authorization_posted_location')?.applied, true);
    assert.equal(results.find((result) => result.key === 'sponsorship_employment_visa_posted_locations')?.applied, true);
    assert.equal(results.find((result) => result.key === 'relevant_work_experience_years')?.applied, true);
    assert.equal(results.find((result) => result.key === 'government_official_status')?.applied, true);
    assert.equal(results.find((result) => result.key === 'government_official_family_contact')?.applied, true);
    assert.equal(await page.locator('#authorized-prompt').textContent(), 'Yes');
    assert.equal(await page.locator('#sponsor-prompt').textContent(), 'No');
    assert.equal(await page.locator('#years-prompt').textContent(), '10+ years');
    assert.equal(await page.locator('#gov-prompt').textContent(), 'No');
    assert.equal(await page.locator('#gov-family-prompt').textContent(), 'No');
  } finally {
    await browser.close();
  }
});

test('Workday account modal switches reused Keychain credentials to sign-in path', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    clicked: [],
    currentUrl: '',
    signedIn: false,
    signInMode: false,
    submitted: false,
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/^sign in$/i.test(label) && !this.signInMode) this.signInMode = true;
      else if (/^sign in$/i.test(label) && this.signInMode) this.signedIn = true;
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (!this.signInMode) {
        return {
          actions: [
            { enabled: true, label: 'Create Account', tagName: 'button' },
            { enabled: true, label: 'Sign In', tagName: 'button' },
          ],
          errors: [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
            { currentValue: '', filled: false, label: 'Verify New Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      if (!this.signedIn) {
        return {
          actions: [{ enabled: true, label: 'Sign In', tagName: 'button' }],
          errors: [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [],
      };
    },
    async fillAccountField() {
      return true;
    },
    async fillAccountPassword() {
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return !this.signedIn;
    },
    async textContent() {
      if (this.submitted) return 'Thank you for applying. Your application has been submitted.';
      if (!this.signInMode) return 'Create Account Email Address Password Verify New Password Sign In';
      if (!this.signedIn) return 'Sign In Email Address Password';
      return 'Review Submit';
    },
    async visiblePasswordFieldCount() {
      if (!this.signInMode) return 2;
      return this.signedIn ? 0 : 1;
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata() {
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: false,
        ok: true,
        password: 'DO_NOT_LEAK_NEWFOLD_VALUE',
        reference: 'macos-keychain service=career-os-workday:web-wd1; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.deepEqual(page.clicked, ['Sign In', 'Sign In', 'Submit']);
  assert.ok(testRuntime.reports.some((report) => report.details?.accountHandling === 'existing_credential_switched_to_sign_in'));
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_NEWFOLD_VALUE/);
});

test('Workday account modal fills sign-in after one switch when create controls remain visible', async () => {
  const workdayTask = task();
  const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    clicked: [],
    currentUrl: '',
    emailIntent: '',
    emailValue: '',
    passwordFilled: false,
    passwordIntent: '',
    signedIn: false,
    signInSwitchClicks: 0,
    submitted: false,
    verifyRequested: true,
    async clickActionLabel(label) {
      this.clicked.push(label);
      if (/^sign in$/i.test(label) && !this.emailValue) {
        this.signInSwitchClicks += 1;
        return true;
      }
      if (/^sign in$/i.test(label) && this.emailValue && this.passwordFilled) this.signedIn = true;
      if (/submit/i.test(label)) this.submitted = true;
      return true;
    },
    async evaluate() {
      if (!this.signedIn) {
        return {
          actions: [
            { enabled: true, label: 'Create Account', tagName: 'button' },
            { enabled: true, label: 'Sign In', tagName: 'button' },
          ],
          errors: this.signInSwitchClicks ? ['Error: Please enter a valid email', 'Error: Please enter your password'] : [],
          fields: [
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
            { currentValue: '', filled: false, label: 'Verify New Password', required: true, tagName: 'input', type: 'password' },
            { currentValue: '', filled: false, label: 'Email Address', required: true, tagName: 'input', type: 'email' },
            { currentValue: '', filled: false, label: 'Password', required: true, tagName: 'input', type: 'password' },
          ],
        };
      }
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [],
      };
    },
    async fillAccountField(_patterns, value, options) {
      this.emailIntent = options.intent;
      this.emailValue = value;
      return true;
    },
    async fillAccountPassword(_value, options) {
      this.passwordFilled = true;
      this.passwordIntent = options.intent;
      this.verifyRequested = options.verify;
      return true;
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async hasVisiblePasswordField() {
      return !this.signedIn;
    },
    async textContent() {
      if (this.submitted) return 'Application submitted. Thank you for applying.';
      if (!this.signedIn) return 'Create Account Email Address Password Verify New Password Sign In Email Address Password';
      return 'Review Submit';
    },
    async visiblePasswordFieldCount() {
      return this.signedIn ? 0 : 3;
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = {
    ...runtime(),
    async recordEmployerAccountMetadata() {
      return { ok: true };
    },
    async resolveEmployerAccountCredential() {
      return {
        createdNow: false,
        ok: true,
        password: 'DO_NOT_LEAK_STICKY_MODAL_VALUE',
        reference: 'macos-keychain service=career-os-workday:cisco-wd5; account=tomas@example.com',
        store: 'macos_keychain',
      };
    },
  };

  const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });

  assert.equal(result, true);
  assert.deepEqual(page.clicked, ['Sign In', 'Sign In', 'Submit']);
  assert.equal(page.signInSwitchClicks, 1);
  assert.equal(page.emailIntent, 'sign_in');
  assert.equal(page.passwordIntent, 'sign_in');
  assert.equal(page.verifyRequested, false);
  assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
  assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_STICKY_MODAL_VALUE/);
});

test('Workday account modal targets active sign-in dialog when background create fields remain visible', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const workdayTask = task({ applicationId: 'app-auto-workday-cisco-2010550', employer: 'Cisco' });
    const env = { CAREER_OS_EXECUTION_MODE: 'workday_first_submit' };
    const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
    let currentUrl = workdayTask.applicationUrl;
    page.goto = async (url) => {
      currentUrl = url;
      await page.setContent(`
        <style>
          .background { display: block; }
          .modal { background: white; left: 200px; padding: 20px; position: fixed; top: 80px; width: 360px; z-index: 1000; }
        </style>
        <main class="background">
          <h1>Create Account</h1>
          <label for="create-email">Email Address <span>*</span></label>
          <input id="create-email" type="email" required>
          <label for="create-password">Password <span>*</span></label>
          <input id="create-password" type="password" required>
          <label for="create-verify">Verify New Password <span>*</span></label>
          <input id="create-verify" type="password" required>
          <button type="button">Create Account</button>
        </main>
        <section class="modal" role="dialog" aria-modal="true" aria-label="Sign In">
          <h2>Sign In</h2>
          <label for="modal-email">Email Address <span>*</span></label>
          <input id="modal-email" type="email" required>
          <div id="modal-email-error" role="alert"></div>
          <label for="modal-password">Password <span>*</span></label>
          <input id="modal-password" type="password" required>
          <button id="modal-sign-in" type="button">Sign In</button>
          <button type="button">Create Account</button>
          <a href="#forgot">Forgot your password?</a>
        </section>
        <script>
          window.__clicks = [];
          window.__lastEmailValue = '';
          window.__submitted = false;
          document.addEventListener('click', (event) => {
            const control = event.target.closest('button, a');
            if (!control) return;
            const label = control.textContent.trim();
            window.__clicks.push(label);
            if (label === 'Sign In') {
              const email = document.querySelector('#modal-email')?.value || '';
              const password = document.querySelector('#modal-password')?.value || '';
              window.__lastEmailValue = email;
              if (email && password) {
                document.body.innerHTML = '<main><h1>Review</h1><button type="button">Submit</button></main>';
              } else {
                document.querySelector('#modal-email-error').textContent = 'Error: Please enter a valid email';
              }
            }
            if (label === 'Submit') {
              window.__submitted = true;
              document.body.innerHTML = '<main>Thank you for applying. Your application has been submitted.</main>';
            }
          });
        </script>
      `);
      return null;
    };
    page.url = () => currentUrl;
    const testRuntime = {
      ...runtime(),
      async recordEmployerAccountMetadata() {
        return { ok: true };
      },
      async resolveEmployerAccountCredential() {
        return {
          createdNow: false,
          ok: true,
          password: 'DO_NOT_LEAK_ACTIVE_DIALOG_VALUE',
          reference: 'macos-keychain service=career-os-workday:cisco-wd5; account=tomas@example.com',
          store: 'macos_keychain',
        };
      },
    };

    const result = await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });
    const browserState = await page.evaluate(() => ({
      clicks: window.__clicks,
      lastEmailValue: window.__lastEmailValue,
      submitted: window.__submitted,
    }));

    assert.equal(result, true);
    assert.equal(browserState.lastEmailValue, 'tomas@example.com');
    assert.equal(browserState.submitted, true);
    assert.deepEqual(browserState.clicks, ['Sign In', 'Sign In', 'Submit']);
    assert.ok(testRuntime.reports.some((report) => report.status === 'submitted_confirmed'));
    assert.doesNotMatch(JSON.stringify(testRuntime.reports), /DO_NOT_LEAK_ACTIVE_DIALOG_VALUE/);
  } finally {
    await browser.close();
  }
});

test('Workday auth gate report does not leak credentials or codes', async () => {
  const workdayTask = task();
  const env = {
    CAREER_OS_EXECUTION_MODE: 'workday_single_canary',
    CAREER_OS_WORKDAY_CANARY_ID: workdayTask.applicationId,
    CAREER_OS_WORKDAY_CANARY_URL: workdayTask.applicationUrl,
  };
  const policy = resolveProductionExecutionPolicy({ adapterId: 'workday', env, task: workdayTask });
  const page = {
    currentUrl: '',
    async evaluate() {
      return { actions: [], errors: [], fields: [] };
    },
    async goto(url) {
      this.currentUrl = url;
    },
    async textContent() {
      return 'Sign In Username Password';
    },
    async waitForTimeout() {},
    url() {
      return this.currentUrl || workdayTask.applicationUrl;
    },
  };
  const testRuntime = runtime();
  await runWorkdayProductionFlow(page, workdayTask, testRuntime, policy, { env });
  const gate = testRuntime.reports.find((report) => report.status === 'waiting_for_sign_in');
  assert.ok(gate);
  const serialized = JSON.stringify(gate);
  assert.doesNotMatch(serialized, /password value|verification code \d|secret|token/i);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getATSAdapter } from '../../scripts/lib/career-os-ats-adapters.mjs';
import {
  loadAtsProductionCapabilities,
  resolveProductionExecutionPolicy,
} from '../../scripts/lib/career-os-production-controls.mjs';
import {
  classifyPhaseTwoWorkdayBlocker,
} from '../../scripts/lib/career-os-phase-two-blockers.mjs';
import { loadTsModule } from '../helpers/load-ts-module.mjs';

function task(overrides = {}) {
  return {
    applicationId: 'app-greenhouse-canary',
    applicationUrl: 'https://job-boards.greenhouse.io/answerbrief/jobs/123456',
    candidate: {},
    companionId: 'test-companion',
    employer: 'AnswerBrief',
    legal: { approvedAcknowledgements: [] },
    ownerEmail: 'tomas@example.com',
    platform: 'greenhouse',
    position: 'Product Manager',
    questionCatalog: [],
    resume: { fileName: 'resume.txt' },
    ...overrides,
  };
}

function forbiddenPage() {
  return new Proxy({}, {
    get() {
      throw new Error('production guard must not access the page');
    },
  });
}

test('production capability matrix declares controlled launch boundaries', () => {
  const matrix = loadAtsProductionCapabilities({ reload: true });
  assert.equal(matrix.adapters.greenhouse.capabilityTier, 'production_submit_guarded');
  assert.equal(matrix.adapters.greenhouse.implementationStatus, 'guarded_submit_canary');
  assert.deepEqual(matrix.adapters.greenhouse.allowedModes, ['inspect_only', 'submit_enabled']);
  assert.deepEqual(matrix.adapters.workday.allowedModes, ['inspect_only', 'assisted_apply', 'workday_single_canary', 'workday_first_submit']);
  assert.equal(matrix.adapters.workday.submitPolicy.submitEnabled, true);
  assert.equal(matrix.adapters.workday.submitPolicy.standingAuthorizationMode, 'workday_first_submit');
  assert.equal(matrix.adapters.unsupported.supported, false);
  assert.ok(matrix.outcomeStatuses.includes('submitted_confirmed'));
  assert.ok(matrix.outcomeStatuses.includes('submitted_email_confirmation_pending'));
  assert.ok(matrix.outcomeStatuses.includes('review_ready'));
  assert.ok(matrix.outcomeStatuses.includes('deferred_phase_two_greenhouse'));
  assert.ok(matrix.outcomeStatuses.includes('canary_stopped'));
  assert.ok(matrix.claimPolicy.forbiddenAdapters.includes('oracle'));
  assert.equal(matrix.adapters.oracle, undefined);
});

test('Workday-first scheduler uses the approved three daily Central run windows', () => {
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const dailyCycleSource = fs.readFileSync('lib/career-os-daily-cycle.ts', 'utf8');
  // Vercel Hobby allows one daily cron only. The three daily production runs are
  // enforced by Codex automations; this Vercel cron remains a deploy-safe 8 AM
  // Central fallback.
  assert.deepEqual(vercel.crons, [
    {
      path: '/api/career-os/daily-run',
      schedule: '0 13 * * *',
    },
  ]);
  assert.match(dailyCycleSource, /DAILY_CRON_SCHEDULE = '0 1,13,19 \* \* \*'/);
  assert.match(dailyCycleSource, /timeCentral: '08:00'/);
  assert.match(dailyCycleSource, /timeCentral: '14:00'/);
  assert.match(dailyCycleSource, /timeCentral: '20:00'/);
});

test('execution mode policy fails closed, defers Greenhouse, and allows Workday-first submit', () => {
  const greenhouseTask = task();
  const missing = resolveProductionExecutionPolicy({
    adapterId: 'greenhouse',
    env: {},
    task: greenhouseTask,
  });
  assert.equal(missing.allowed, false);
  assert.equal(missing.outcomeStatus, 'terminal_failure');

  const invalid = resolveProductionExecutionPolicy({
    adapterId: 'greenhouse',
    env: { CAREER_OS_EXECUTION_MODE: 'autopilot' },
    task: greenhouseTask,
  });
  assert.equal(invalid.allowed, false);

  const greenhouseMissingCanary = resolveProductionExecutionPolicy({
    adapterId: 'greenhouse',
    env: {
      CAREER_OS_EXECUTION_MODE: 'submit_enabled',
      CAREER_OS_SUBMIT_RUN_AUTHORIZATION: 'test',
    },
    task: greenhouseTask,
  });
  assert.equal(greenhouseMissingCanary.allowed, false);
  assert.equal(greenhouseMissingCanary.outcomeStatus, 'canary_stopped');

  const greenhouseCanary = resolveProductionExecutionPolicy({
    adapterId: 'greenhouse',
    env: {
      CAREER_OS_EXECUTION_MODE: 'submit_enabled',
      CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID: 'app-greenhouse-canary',
      CAREER_OS_SUBMIT_RUN_AUTHORIZATION: 'test',
    },
    task: greenhouseTask,
  });
  assert.equal(greenhouseCanary.allowed, true);
  assert.equal(greenhouseCanary.submitAllowed, true);

  const workdayFirst = resolveProductionExecutionPolicy({
    adapterId: 'workday',
    env: {
      CAREER_OS_EXECUTION_MODE: 'workday_first_submit',
    },
    task: task({
      applicationId: 'app-workday-first',
      applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123',
      platform: 'workday',
    }),
  });
  assert.equal(workdayFirst.allowed, true);
  assert.equal(workdayFirst.submitAllowed, true);
});

test('Workday-first inventory has concrete direct CXS sources beyond T-Mobile', () => {
  const { buildCareerOsDiscoveryPlan } = loadTsModule('lib/career-os-market-universe.ts');
  const plan = buildCareerOsDiscoveryPlan();
  const sources = plan.workdaySources;
  const sourceByEmployer = new Map(sources.map((source) => [source.employer, source]));

  assert.ok(sources.length >= 10);
  for (const employer of ['T-Mobile', 'Verizon', 'Cox Communications', 'NVIDIA', 'Workday', 'Adobe', 'Salesforce', 'Wells Fargo', 'USAA', 'PayPal']) {
    const source = sourceByEmployer.get(employer);
    assert.ok(source, `${employer} should have a direct Workday source`);
    assert.match(source.sourceUrl, /^https:\/\/.+\.myworkdayjobs\.com\/en-US\/.+/);
  }
});

test('Workday-first inventory excludes Phase 2 blocker employers from dynamic sources', () => {
  const { buildCareerOsDiscoveryPlan } = loadTsModule('lib/career-os-market-universe.ts');
  const plan = buildCareerOsDiscoveryPlan({
    applications: [
      {
        employer: 'Cisco',
        raw_record: {
          application_url: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/San-Jose/Director_2010550/apply',
        },
      },
      {
        employer: 'Adobe',
        raw_record: {
          application_url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Director_R123456',
        },
      },
    ],
  });
  const employers = new Set(plan.workdaySources.map((source) => source.employer));

  assert.equal(employers.has('Cisco'), false);
  assert.equal(employers.has('Adobe'), true);
});

test('Workday Phase 2 blocker classifier parks known account, selector, and decision loops', () => {
  const yahoo = classifyPhaseTwoWorkdayBlocker({
    id: 'app-auto-workday-yahoo-jr0027137',
    employer: 'Yahoo',
    position: 'Director, Product Management - Corporate Finance Systems',
    lifecycle_stage: 'waiting_for_sign_in',
    raw_record: {
      ats_platform: 'workday',
      application_url: 'https://ouryahoo.wd5.myworkdayjobs.com/en-US/careers/job/Director_JR0027137/apply/autofillWithResume',
      production_outcome: 'workday_email_account_path_not_advancing',
    },
  });
  assert.equal(yahoo.classification, 'phase_two_original_apply_replay');
  assert.equal(yahoo.engineeringFixNeeded, true);
  assert.equal(yahoo.eligibleLater, true);

  const newfold = classifyPhaseTwoWorkdayBlocker({
    id: 'app-auto-workday-newfold-digital-r14567',
    employer: 'Newfold Digital',
    position: 'Principal Product Manager, CX Products',
    raw_record: {
      ats_platform: 'workday',
      application_url: 'https://web.wd1.myworkdayjobs.com/en-US/ExternalCareerSite/job/Principal-Product-Manager_R14567/apply/autofillWithResume',
      production_outcome: 'password_reset_started_needs_review',
    },
  });
  assert.equal(newfold.classification, 'phase_two_password_reset');

  const zendesk = classifyPhaseTwoWorkdayBlocker({
    id: 'app-auto-workday-zendesk-r35090',
    employer: 'Zendesk',
    position: 'Senior Director, Product Security',
    raw_record: {
      ats_platform: 'workday',
      application_url: 'https://zendesk.wd1.myworkdayjobs.com/en-US/zendesk/job/Senior-Director_R35090/apply/autofillWithResume',
      production_outcome: 'deferred_hard_workday_selector',
    },
  });
  assert.equal(zendesk.classification, 'phase_two_selector_mapping');

  const cisco = classifyPhaseTwoWorkdayBlocker({
    id: 'app-auto-workday-cisco-2010550',
    employer: 'Cisco',
    position: 'Sr. Director, Product Management - AI Collaboration Experiences',
    raw_record: {
      ats_platform: 'workday',
      application_url: 'https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers/job/Director--Product-Management_2010550/apply',
      production_outcome: 'waiting_for_user_decision',
    },
  });
  assert.equal(cisco.classification, 'phase_two_user_decision');
  assert.equal(cisco.tomasActionNeeded, true);

  const greenhouse = classifyPhaseTwoWorkdayBlocker({
    id: 'app-greenhouse',
    employer: 'Affirm',
    position: 'Director, Product Management',
    raw_record: {
      ats_platform: 'greenhouse',
      application_url: 'https://job-boards.greenhouse.io/affirm/jobs/123',
      production_outcome: 'waiting_for_email_code',
    },
  });
  assert.equal(greenhouse, null);
});

test('browser worker production gate parks Phase 2 Workday blockers before browser execution', () => {
  const source = fs.readFileSync('lib/career-os-browser-worker.ts', 'utf8');
  assert.match(source, /classifyPhaseTwoWorkdayBlocker/);
  assert.match(source, /Phase 2 Workday blocker parked for production run/);
  assert.match(source, /phase_two_classification/);
  assert.match(source, /status: 'unsupported_workday_state'/);
});

test('Workday submit_enabled and unsupported ATS stop before page automation', async () => {
  const workdayTask = task({
    applicationId: 'app-workday',
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123',
    platform: 'workday',
  });
  const workday = getATSAdapter(workdayTask, {
    env: { CAREER_OS_EXECUTION_MODE: 'submit_enabled' },
  });
  const workdayReports = [];
  assert.equal(await workday.execute(forbiddenPage(), workdayTask, {
    async report(payload) {
      workdayReports.push(payload);
    },
  }), true);
  assert.equal(workdayReports[0].status, 'completed_waiting_for_user');
  assert.equal(workdayReports[0].details.outcomeStatus, 'completed_waiting_for_user');

  const unsupportedTask = task({
    applicationId: 'app-unsupported',
    applicationUrl: 'https://example.com/jobs/123',
    platform: 'unknown',
  });
  const unsupported = getATSAdapter(unsupportedTask, {
    env: { CAREER_OS_EXECUTION_MODE: 'inspect_only' },
  });
  const unsupportedReports = [];
  assert.equal(await unsupported.execute(forbiddenPage(), unsupportedTask, {
    async report(payload) {
      unsupportedReports.push(payload);
    },
  }), true);
  assert.equal(unsupportedReports[0].status, 'unsupported_manual_required');
  assert.equal(unsupportedReports[0].details.outcomeStatus, 'unsupported_manual_required');
});

test('missing execution mode blocks Greenhouse before opening employer page', async () => {
  const greenhouseTask = task();
  const adapter = getATSAdapter(greenhouseTask, { env: {} });
  const reports = [];
  assert.equal(await adapter.execute(forbiddenPage(), greenhouseTask, {
    async report(payload) {
      reports.push(payload);
    },
  }), true);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, 'blocked_technical');
  assert.equal(reports[0].details.outcomeStatus, 'terminal_failure');
  assert.ok(reports[0].details.decisionQueue[0].jobIdentity.applicationId);
});

test('Workday assisted mode inspects and stops before submit', async () => {
  const workdayTask = task({
    applicationId: 'app-workday-assisted',
    applicationUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123',
    platform: 'workday',
  });
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
      return 'My Information Work Experience Review Submit';
    },
    async evaluate() {
      return {
        actions: [{ enabled: true, label: 'Submit', tagName: 'button' }],
        errors: [],
        fields: [{ label: 'First Name', required: true, tagName: 'input', type: 'text' }],
      };
    },
  };
  const reports = [];
  let submitSafetyChecks = 0;
  const adapter = getATSAdapter(workdayTask, {
    env: { CAREER_OS_EXECUTION_MODE: 'assisted_apply' },
  });
  const result = await adapter.execute(page, workdayTask, {
    async detectCommonHumanGate() {
      return false;
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
    async assertSafeToSubmit() {
      submitSafetyChecks += 1;
    },
  });

  assert.equal(result, true);
  assert.equal(page.state.navigatedUrl, workdayTask.applicationUrl);
  assert.equal(submitSafetyChecks, 0);
  assert.ok(reports.some((payload) => payload.status === 'inspected_assisted'));
  const inspected = reports.find((payload) => payload.status === 'inspected_assisted');
  assert.equal(inspected.details.outcomeStatus, 'inspected_assisted');
  assert.equal(inspected.details.submitBlocked, true);
  assert.deepEqual(inspected.details.submitControlsDetected, ['Submit']);
});

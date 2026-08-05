import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { applyFieldMappings } from './career-os-field-engine.mjs';
import { buildWorkdayQuestionMappings } from './career-os-question-mappings.mjs';
import {
  answerReportValue,
  loadWorkdayAnswerBank,
  resolveWorkdayAnswerForLabel,
} from './career-os-workday-answer-bank.mjs';
import { createProductionDecisionQueueItem } from './career-os-production-controls.mjs';
import {
  emptyValidationReport,
  runValidationReadbackRepairPipeline,
} from './career-os-workday-validation-pipeline.mjs';

const CONFIRMATION_PATTERN = /thank you for applying|application submitted|application received|your application has been submitted|confirmation/i;
const CAPTCHA_PATTERN = /captcha|verify you are human|bot verification|security challenge|human verification/i;

export function parseWorkdayJobUrl(value = '') {
  const href = clean(value);
  if (!href) return { ok: false, reason: 'missing_url' };
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (!/^https?:$/i.test(parsed.protocol)) return { ok: false, reason: 'invalid_protocol' };
  const host = parsed.hostname.toLowerCase();
  const text = `${host} ${parsed.pathname} ${parsed.search}`.toLowerCase();
  const supported = /myworkdayjobs\.com|workday|phenom|careers\.cisco\.com/.test(text);
  if (!supported) return { ok: false, reason: 'unsupported_ats_url' };
  const tenant = parseWorkdayTenant(host);
  const jobId = clean(
    parsed.searchParams.get('jobSeqNo')
    || parsed.searchParams.get('jobId')
    || parsed.searchParams.get('jobID')
    || parsed.searchParams.get('job')
    || parsed.searchParams.get('jid')
    || parsePathJobId(parsed.pathname),
  );
  if (!tenant || !jobId) return { ok: false, reason: 'ambiguous_workday_identity' };
  return {
    ok: true,
    canonicalUrl: `${parsed.origin}${parsed.pathname}${parsed.search}`,
    host,
    jobId,
    tenant,
    vendor: /careers\.cisco\.com/.test(host) || /phenom/.test(text) ? 'workday_via_phenom' : 'workday',
  };
}

export function validateWorkdayCanaryTask(task = {}, policy = {}, options = {}) {
  const env = options.env || process.env;
  const mode = clean(policy.mode || task.productionExecutionMode);
  const applicationId = clean(task.applicationId);
  const raw = task.rawRecord && typeof task.rawRecord === 'object' ? task.rawRecord : {};
  const canaryId = clean(env.CAREER_OS_WORKDAY_CANARY_ID || env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
  const rawCanaryId = clean(raw.workday_canary_id || raw.workday_canary_application_id);
  const canaryUrl = clean(env.CAREER_OS_WORKDAY_CANARY_URL);
  const taskUrl = clean(task.applicationUrl || raw.application_url || raw.canonical_url || raw.job_url);
  const taskIdentity = parseWorkdayJobUrl(taskUrl);
  const canaryIdentity = canaryUrl ? parseWorkdayJobUrl(canaryUrl) : null;
  const details = {
    applicationId,
    canaryIdConfigured: Boolean(canaryId),
    canaryIdMatchesTask: Boolean(canaryId && (canaryId === applicationId || canaryId === rawCanaryId)),
    canaryUrlConfigured: Boolean(canaryUrl),
    taskIdentity: taskIdentity.ok ? publicIdentity(taskIdentity) : null,
    canaryIdentity: canaryIdentity?.ok ? publicIdentity(canaryIdentity) : null,
  };

  if (mode !== 'workday_single_canary') return { ok: true, details, reason: '' };
  if (!applicationId) return { ok: false, details, reason: 'Workday canary requires a task application id.' };
  if (!canaryId) return { ok: false, details, reason: 'Workday canary requires CAREER_OS_WORKDAY_CANARY_ID.' };
  if (!(canaryId === applicationId || canaryId === rawCanaryId)) return { ok: false, details, reason: 'Workday canary id does not match this task.' };
  if (!taskIdentity.ok) return { ok: false, details, reason: `Workday task URL is not canary-qualified: ${taskIdentity.reason}.` };
  if (canaryIdentity && !canaryIdentity.ok) return { ok: false, details, reason: `CAREER_OS_WORKDAY_CANARY_URL is not canary-qualified: ${canaryIdentity.reason}.` };
  if (canaryIdentity && !sameWorkdayJob(taskIdentity, canaryIdentity)) return { ok: false, details, reason: 'Workday canary URL does not match this task tenant/job.' };
  return { ok: true, details, reason: '' };
}

export function classifyWorkdayPageText(text = '') {
  const value = clean(text);
  if (CAPTCHA_PATTERN.test(value)) return { state: 'captcha', status: 'waiting_on_tomas', category: 'captcha' };
  if (/no longer accepting applications|job is no longer available|job posting is no longer available|position has been filled|posting has expired|this job is closed/i.test(value)) {
    return { state: 'expired_job', status: 'not_qualified', category: 'unknown' };
  }
  if (/session has expired|session expired|session timed out|you have been signed out/i.test(value)) {
    return { state: 'session_expired', status: 'waiting_for_sign_in', category: 'login' };
  }
  if (/verification code|security code|one.time code|enter the code|email code/i.test(value)) {
    return { state: 'email_code_required', status: 'waiting_for_email_code', category: 'email_code' };
  }
  if (/verify your email|email verification|confirm your email|activation email/i.test(value)) {
    return { state: 'email_verification_required', status: 'waiting_for_email_verification', category: 'email_verification' };
  }
  if (/wrong email address or password|wrong password|invalid (?:email|username|user name|password|credentials)|incorrect password|password is incorrect|account (?:might be )?locked|locked out|too many failed|unable to sign in|we couldn't sign you in|could not sign you in/i.test(value)) {
    return { state: 'password_rejected_or_account_locked', status: 'waiting_for_sign_in', category: 'login' };
  }
  if (/check your email|password reset email|reset link|reset instructions|sent (?:you )?(?:an )?email|email has been sent/i.test(value) && /password|reset|verify|verification/i.test(value)) {
    return { state: 'email_verification_required', status: 'waiting_for_email_verification', category: 'email_verification' };
  }
  const hasStrongCredentialForm =
    /(?:email address|username).{0,160}password|password.{0,160}(?:email address|username)/is.test(value);

  if (
    /create account|create an account|new account|register/i.test(value)
    && hasStrongCredentialForm
  ) {
    return { state: 'account_creation_required', status: 'waiting_for_account_creation', category: 'account' };
  }
  if (/create account|create an account|new account|register/i.test(value) && /sign in|log in|login|continue/i.test(value)) {
    return { state: 'account_creation_required', status: 'waiting_for_account_creation', category: 'account' };
  }
  if (/create account|create an account|new account|register/i.test(value) && /sign in with (?:your )?email|email/i.test(value)) {
    return { state: 'account_creation_required', status: 'waiting_for_account_creation', category: 'account' };
  }
  if ((/log in|login|username|password|sign in to your account|already have an account/i.test(value) || isBareSignInShell(value)) && !/my information|my experience|application questions|review/i.test(value)) {
    return { state: 'sign_in_required', status: 'waiting_for_sign_in', category: 'login' };
  }
  if (/my information|my experience|application questions|voluntary disclosures|review|submit|upload resume|work experience/i.test(value)) {
    return { state: 'application', status: 'assisted_in_progress', category: 'review' };
  }
  return { state: 'unknown', status: 'unsupported_workday_state', category: 'unknown' };
}

export async function inspectWorkdayPage(page) {
  const fallback = { actions: [], errors: [], fields: [] };
  if (!page || typeof page.evaluate !== 'function') return fallback;
  const inspection = await page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const groupLabelForChoice = (element) => {
      if (!(element instanceof HTMLInputElement) || !['radio', 'checkbox'].includes(element.type)) return '';
      const group = element.closest('fieldset, [role="radiogroup"], [role="group"]');
      if (!group) return '';
      const legend = group.querySelector('legend');
      const legendText = normalize(legend?.textContent || '');
      if (legendText) return legendText;
      const text = normalize(group.textContent || '');
      return /(\?|\*)/.test(text) ? text : '';
    };
    const labelFor = (element) => {
      const groupLabel = groupLabelForChoice(element);
      if (groupLabel) return groupLabel;
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      if (explicit) return normalize(explicit.textContent);
      const wrapped = element.closest('label');
      if (wrapped) return normalize(wrapped.textContent);
      const field = element.closest('[data-automation-id], [role="group"], fieldset, div');
      const nearby = field?.querySelector?.('label, legend, [data-automation-id*="label" i]');
      return normalize(nearby?.textContent || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || element.id);
    };
    const optionsFor = (element) => {
      if (element instanceof HTMLSelectElement) {
        return Array.from(element.options).map((option) => ({
          label: normalize(option.label || option.textContent),
          value: String(option.value || ''),
        }));
      }
      return [];
    };
    const valueFor = (element) => {
      if (element instanceof HTMLInputElement && element.type === 'radio') {
        const group = element.name
          ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`))
          : Array.from(element.closest('fieldset, [role="radiogroup"], [role="group"]')?.querySelectorAll('input[type="radio"]') || []);
        const checked = group.find((node) => node instanceof HTMLInputElement && node.checked);
        return checked ? String(checked.value || 'checked') : '';
      }
      if (element instanceof HTMLInputElement && element.type === 'checkbox') return element.checked ? String(element.value || 'checked') : '';
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return String(element.value || '');
      return '';
    };
    const fields = Array.from(document.querySelectorAll('input, select, textarea, [role="combobox"]'))
      .filter((element) => visible(element))
      .map((element) => ({
        ariaLabel: normalize(element.getAttribute('aria-label')),
        className: normalize(element.getAttribute('class')),
        currentValue: valueFor(element),
        filled: Boolean(normalize(valueFor(element))),
        id: element.id || '',
        label: labelFor(element),
        name: element.getAttribute('name') || '',
        options: optionsFor(element),
        placeholder: normalize(element.getAttribute('placeholder')),
        required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true' || /\*/.test(labelFor(element)),
        role: normalize(element.getAttribute('role')),
        tagName: element.tagName.toLowerCase(),
        type: element instanceof HTMLInputElement ? String(element.type || '').toLowerCase() : element.tagName.toLowerCase(),
      }))
      .filter((field) => field.label || field.id || field.name || field.ariaLabel)
      .slice(0, 80);
    const actionish = (element) => {
      const tag = element.tagName.toLowerCase();
      return ['button', 'a'].includes(tag)
        || element instanceof HTMLInputElement
        || element.getAttribute('role') === 'button'
        || element.hasAttribute('tabindex')
        || /button|link|radio|checkbox|prompt|select|option|card|tile/i.test(element.getAttribute('data-automation-id') || '');
    };
    const actions = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, [role="button"], [tabindex], [data-automation-id]'))
      .filter((element) => visible(element))
      .filter((element) => actionish(element))
      .map((element) => ({
        enabled: !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true',
        label: normalize(element.textContent || element.getAttribute('value') || element.getAttribute('aria-label')),
        tagName: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || '',
      }))
      .filter((action) => action.label)
      .slice(0, 40);
    return { actions, errors: [], fields };
  }).catch((error) => ({
    actions: [],
    errors: [error instanceof Error ? error.message : String(error)],
    fields: [],
  }));
  return normalizeInspection(inspection);
}

export function buildWorkdayReviewFingerprint(task = {}, identity = {}, inspection = {}) {
  const payload = {
    actionLabels: labels(inspection.actions),
    applicationId: clean(task.applicationId),
    employer: clean(task.employer),
    fieldLabels: labels(inspection.fields),
    jobId: clean(identity.jobId),
    ownerEmail: clean(task.ownerEmail),
    position: clean(task.position),
    requiredFieldLabels: labels((inspection.fields || []).filter((field) => field.required)),
    tenant: clean(identity.tenant),
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 20);
  return `wdrev_${hash}`;
}

export async function runWorkdayProductionFlow(page, task, runtime, policy, options = {}) {
  const env = options.env || process.env;
  const bank = options.answerBank || loadWorkdayAnswerBank();
  const validation = validateWorkdayCanaryTask(task, policy, { env });
  if (!validation.ok) {
    await reportCanaryStop(runtime, task, policy, validation.reason, validation.details);
    return true;
  }

  const identity = parseWorkdayJobUrl(task.applicationUrl);
  await runtime.report({
    status: 'assisted_in_progress',
    currentUrl: task.applicationUrl,
      evidenceText: `Opening ${task.applicationUrl} in Workday ${policy.mode} mode.`,
    details: {
      classification: 'workday_opening',
      outcomeStatus: 'assisted_in_progress',
      workdayCanary: validation.details,
    },
  });
  await page.goto(task.applicationUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForTimeout(page, 2500);
  const openingInspection = await inspectWorkdayPage(page);
  if (
    enabledActions(openingInspection, /^accept cookies$/i).length
    && await clickWorkdayAction(page, 'Accept Cookies')
  ) {
    await runtime.report({
      status: 'heartbeat',
      currentUrl: currentUrl(page),
      evidenceText: 'Accepted the employer Workday cookie notice to continue the application.',
      details: { classification: 'workday_cookie_notice_accepted' },
    });
    await waitForTimeout(page, 2500);
  }
  await maybeOpenWorkdayApplyFromPosting({
    identity,
    inspection: await inspectWorkdayPage(page),
    page,
    runtime,
    step: 0,
  });
  const openingStartOption = await maybeSelectWorkdayStartApplicationOption({
    identity,
    inspection: await inspectWorkdayPage(page),
    page,
    runtime,
    task,
  });
  if (openingStartOption.gated) return true;
  await takeShot(runtime, 'workday-production-opened');
  const replayState = { attempts: 0 };

  const openingClassification = await refineWorkdayClassificationFromInspection(page, classifyWorkdayPageText(await bodyText(page)));
  if (openingClassification.state !== 'application' && openingClassification.state !== 'unknown') {
    const accountHandling = await maybeHandleAuthorizedWorkdayAccountGate({
      classification: openingClassification,
      identity,
      page,
      runtime,
      step: 0,
      task,
    });
    if (accountHandling.gated) return true;
    if (accountHandling.handled) {
      await waitForTimeout(page, 2500);
      const replay = await maybeReplayOriginalWorkdayApplyUrl({ identity, page, replayState, runtime, step: 0, task });
      if (replay.gated) return true;
    } else
    if (await reportWorkdayPageGateIfNeeded({ classification: openingClassification, identity, page, policy, runtime, step: 0, task })) return true;
  }
  if (await detectRuntimeHumanGate(runtime)) return true;

  const maxSteps = Number(policy.capability?.submitPolicy?.maxAutomatedSteps || 20);
  for (let step = 1; step <= maxSteps; step += 1) {
    const startOption = await maybeSelectWorkdayStartApplicationOption({
      identity,
      inspection: await inspectWorkdayPage(page),
      page,
      runtime,
      step,
      task,
    });
    if (startOption.gated) return true;
    if (startOption.clicked) {
      continue;
    }
    const replay = await maybeReplayOriginalWorkdayApplyUrl({ identity, page, replayState, runtime, step, task });
    if (replay.gated) return true;
    if (replay.replayed) continue;
    const postingApply = await maybeOpenWorkdayApplyFromPosting({
      identity,
      inspection: await inspectWorkdayPage(page),
      page,
      runtime,
      step,
    });
    if (postingApply.gated) return true;
    if (postingApply.clicked) continue;
    const text = await bodyText(page);
    const classification = await refineWorkdayClassificationFromInspection(page, classifyWorkdayPageText(text));
    const accountHandling = await maybeHandleAuthorizedWorkdayAccountGate({
      classification,
      identity,
      page,
      runtime,
      step,
      task,
    });
    if (accountHandling.gated) return true;
    if (accountHandling.handled) {
      const replayAfterAccount = await maybeReplayOriginalWorkdayApplyUrl({ identity, page, replayState, runtime, step, task });
      if (replayAfterAccount.gated) return true;
      continue;
    }
    if (classification.state === 'unknown' && await maybeWaitForWorkdayHydration({ page, runtime, step })) {
      continue;
    }
    if (await reportWorkdayPageGateIfNeeded({ classification, identity, page, policy, runtime, step, task })) return true;
    if (await maybeWaitForWorkdayHydration({ page, runtime, step })) {
      continue;
    }

    let inspection = await inspectWorkdayPage(page);
    if (!['workday_single_canary', 'workday_first_submit'].includes(policy.mode)) {
      await reportAssistedInspection({ inspection, page, policy, runtime, task });
      return true;
    }

    const currentIdentity = parseWorkdayJobUrl(currentUrl(page));
    if (currentIdentity.ok && identity.ok && !sameWorkdayJob(identity, currentIdentity)) {
      await reportCanaryStop(runtime, task, policy, 'Workday tenant/job identity changed during the canary run.', {
        expected: publicIdentity(identity),
        current: publicIdentity(currentIdentity),
      });
      return true;
    }

    const resumeResult = await maybeUploadWorkdayResume(page, task, runtime, inspection);
    if (resumeResult.gated) return true;
    const coverLetterResult = await maybeUploadWorkdayCoverLetter(page, task, runtime, inspection);
    if (coverLetterResult.gated) return true;

    const fillResult = await autofillWorkdayFields(page, task, runtime, bank, inspection, {
      standingLegalAuthorization: policy.mode === 'workday_first_submit',
    });
    if (fillResult.gates.length) {
      await runtime.report({
        status: 'waiting_for_user_decision',
        currentUrl: currentUrl(page),
        evidenceText: `Workday requires Tomas to decide ${fillResult.gates.length} required field(s) before continuing.`,
        screenshotPath: await safeShot(runtime, `workday-required-decision-${step}`),
        details: {
          classification: 'workday_required_decision',
          gates: fillResult.gates.map(publicGate),
          outcomeStatus: 'waiting_for_user_decision',
          step,
          workdayIdentity: identity.ok ? publicIdentity(identity) : null,
          decisionQueue: fillResult.gates.map((gate) => decisionItemForResolution({ gate, identity, policy, task, url: currentUrl(page) })),
        },
      });
      return true;
    }

    if (fillResult.validation && !fillResult.validation.ok) {
      const { mismatchCount = 0, unreadableCount = 0 } = fillResult.validation;
      const unresolvedFields = fillResult.validation.fieldReports.filter(
        (report) => report.status === 'mismatch' || report.status === 'unreadable',
      );
      await runtime.report({
        status: 'waiting_for_user_decision',
        currentUrl: currentUrl(page),
        evidenceText: `Workday field validation detected ${mismatchCount} mismatched and ${unreadableCount} unreadable field(s) (${unresolvedFields.length} total) after fill and repair attempts. Submission is blocked until Tomas reviews.`,
        screenshotPath: await safeShot(runtime, `workday-validation-mismatch-${step}`),
        details: {
          classification: 'workday_validation_pipeline_failed',
          outcomeStatus: 'waiting_for_user_decision',
          step,
          workdayIdentity: identity.ok ? publicIdentity(identity) : null,
          validation: fillResult.validation,
        },
      });
      return true;
    }

    inspection = await inspectWorkdayPage(page);
    const submitControls = enabledActions(inspection, /^(submit|submit application)$/i);
    if (submitControls.length && await isWorkdayReviewStep(page)) {
      return await reportReviewOrSubmit({ env, identity, inspection, page, policy, runtime, task, validation: fillResult.validation });
    }

    const reviewControls = enabledActions(inspection, /^review$/i);
    if (reviewControls.length) {
      const clicked = await clickWorkdayAction(page, reviewControls[0].label);
      if (!clicked) {
        await reportUnsupportedState({ identity, inspection, page, policy, runtime, task, reason: 'Review control was visible but could not be clicked safely.', step });
        return true;
      }
      await runtime.report({
        status: 'heartbeat',
        currentUrl: currentUrl(page),
        evidenceText: `Advanced Workday canary to review step ${step}.`,
        details: { classification: 'workday_review_navigation', step },
      });
      await waitForTimeout(page, 2500);
      continue;
    }

    const nextControls = enabledActions(inspection, /^(next|continue|save and continue)$/i);
    if (nextControls.length) {
      const clicked = await clickWorkdayAction(page, nextControls[0].label);
      if (!clicked) {
        await reportUnsupportedState({ identity, inspection, page, policy, runtime, task, reason: 'Next control was visible but could not be clicked safely.', step });
        return true;
      }
      await runtime.report({
        status: 'heartbeat',
        currentUrl: currentUrl(page),
        evidenceText: `Advanced Workday canary to step ${step + 1}.`,
        details: { classification: 'workday_next_navigation', step },
      });
      await waitForTimeout(page, 2500);
      if (await detectRuntimeHumanGate(runtime)) return true;
      continue;
    }

    await reportUnsupportedState({ identity, inspection, page, policy, runtime, task, reason: 'No supported Workday next, review, or submit control was available.', step });
    return true;
  }

  await reportUnsupportedState({
    identity,
    inspection: await inspectWorkdayPage(page),
    page,
    policy,
    runtime,
    task,
    reason: `Workday canary exceeded the ${maxSteps}-step budget without reaching review or confirmation.`,
    step: maxSteps,
  });
  return true;
}

async function maybeSelectWorkdayStartApplicationOption({ identity, inspection, page, runtime, step = 0, task }) {
  const currentSurfaceText = `${await bodyText(page)} ${labels(inspection.actions).join(' ')}`;
  if (
    /drop file here|select file|select files|upload either|make completing your job application easier/i.test(currentSurfaceText)
    && enabledActions(inspection, /^(continue|next|save and continue)$/i).length
  ) {
    return { clicked: false, gated: false };
  }
  const modalOptionsResult = await visibleWorkdayStartApplicationOptions(page);
  const modalOptions = Array.isArray(modalOptionsResult) ? modalOptionsResult : [];
  const autofill = enabledActions(inspection, /^autofill with resume$/i)[0]
    || modalOptions.find((option) => /^autofill with resume$/i.test(option.label));
  const manual = enabledActions(inspection, /^apply manually$/i)[0]
    || modalOptions.find((option) => /^apply manually$/i.test(option.label));
  const lastApplication = enabledActions(inspection, /^use my last application$/i)[0]
    || modalOptions.find((option) => /^use my last application$/i.test(option.label));
  if (!autofill && !manual && !lastApplication) return { clicked: false, gated: false };

  let selected = '';
  let resumeFileName = '';
  const startCandidates = [];
  if (autofill && typeof runtime.ensureResumeFile === 'function') {
    try {
      const resumePath = await runtime.ensureResumeFile();
      if (resumePath && fs.existsSync(resumePath)) {
        startCandidates.push({ label: autofill.label, resumeFileName: path.basename(resumePath) });
        resumeFileName = path.basename(resumePath);
      }
    } catch {
      resumeFileName = '';
    }
  }
  if (manual) startCandidates.push({ label: manual.label, resumeFileName: '' });
  if (!startCandidates.length) {
    await reportUnsupportedState({
      identity,
      inspection,
      page,
      runtime,
      task,
      reason: 'Workday start-application modal did not present a safe Autofill with Resume or Apply Manually option.',
      step,
    });
    return { clicked: false, gated: true };
  }

  for (const candidate of startCandidates) {
    if (!await hasVisibleWorkdayStartOption(page, candidate.label)) {
      await reopenWorkdayStartApplicationModal({ identity, page, runtime, step });
    }
    const beforeUrl = currentUrl(page);
    const clicked = await clickWorkdayStartApplicationOption(page, candidate.label)
      || await clickWorkdayAction(page, candidate.label);
    const advanced = await waitForWorkdayStartOptionTransition(page, beforeUrl);
    if (!clicked && !advanced) continue;
    if (!advanced) continue;
    selected = candidate.label;
    resumeFileName = candidate.resumeFileName;
    await runtime.report({
      status: 'heartbeat',
      currentUrl: currentUrl(page),
      evidenceText: `Selected Workday start-application option: ${selected}.`,
      screenshotPath: await safeShot(runtime, 'workday-start-application-option-selected'),
      details: {
        classification: 'workday_start_application_option_selected',
        resumeFileName,
        startOption: selected,
        step,
        workdayIdentity: identity.ok ? publicIdentity(identity) : null,
      },
    });
    await waitForTimeout(page, 2500);
    return { clicked: true, gated: false };
  }

  await reportUnsupportedState({
    identity,
    inspection,
    page,
    runtime,
    task,
    reason: `Workday start-application options were visible (${startCandidates.map((candidate) => candidate.label).join(', ')}) but none advanced the application flow.`,
    step,
  });
  return { clicked: false, gated: true };
}

async function hasVisibleWorkdayStartOption(page, label) {
  const options = await visibleWorkdayStartApplicationOptions(page);
  return Array.isArray(options) && options.some((option) => clean(option.label).toLowerCase() === clean(label).toLowerCase());
}

async function reopenWorkdayStartApplicationModal({ identity, page, runtime, step }) {
  if (await hasVisibleWorkdayStartOption(page, 'Autofill with Resume') || await hasVisibleWorkdayStartOption(page, 'Apply Manually')) {
    return true;
  }
  const inspection = await inspectWorkdayPage(page);
  const opened = await maybeOpenWorkdayApplyFromPosting({ identity, inspection, page, runtime, step });
  return Boolean(opened.clicked);
}

async function waitForWorkdayStartOptionTransition(page, beforeUrl) {
  for (let index = 0; index < 5; index += 1) {
    await waitForTimeout(page, 1200);
    const url = currentUrl(page);
    if (clean(url) !== clean(beforeUrl) && /\/apply(?:\/|$)|autofillwithresume|usemylastapplication|manual/i.test(url)) return true;
    const text = `${await bodyText(page)} ${labels((await inspectWorkdayPage(page)).actions).join(' ')}`;
    if (/upload (?:your )?(?:resume|cv)|select file|drop file here|my information|my experience|application questions|voluntary disclosures|self identify|review|create account|sign in with email|sign in\s+(?:username|email address)?.*password|username\s+password|email address\s+password/i.test(text) || isBareSignInShell(text)) {
      return true;
    }
  }
  return false;
}

function isBareSignInShell(value = '') {
  const text = clean(value).toLowerCase();
  return Boolean(text) && /^(?:sign in\s*){1,8}$/.test(text);
}

async function maybeOpenWorkdayApplyFromPosting({ identity, inspection, page, runtime, step = 0 }) {
  const applyControls = enabledActions(inspection, /^apply(?: now)?$/i);
  if (!applyControls.length) return { clicked: false, gated: false };
  const currentIdentity = parseWorkdayJobUrl(currentUrl(page));
  if (identity?.ok && currentIdentity.ok && !sameWorkdayJob(identity, currentIdentity)) {
    return { clicked: false, gated: true };
  }
  const clicked = await clickWorkdayApplyFromPosting(page, applyControls[0].label);
  if (!clicked) return { clicked: false, gated: false };
  await runtime.report({
    status: 'heartbeat',
    currentUrl: currentUrl(page),
    evidenceText: step > 0
      ? 'Reopened the employer Workday application flow after authentication returned to the live job posting.'
      : 'Opened the employer Workday application flow from the live job posting.',
    details: {
      classification: step > 0 ? 'workday_post_auth_apply_flow_reopened' : 'workday_apply_flow_opened',
      step,
      workdayIdentity: identity?.ok ? publicIdentity(identity) : null,
    },
  });
  await waitForTimeout(page, 2500);
  await takeShot(runtime, 'workday-apply-flow-opened');
  return { clicked: true, gated: false };
}

async function clickWorkdayStartApplicationOption(page, label) {
  const text = clean(label);
  if (!text) return false;
  if (typeof page.clickActionLabel === 'function') return Boolean(await page.clickActionLabel(text));
  if (!page?.locator) return false;
  const escaped = escapeRegExp(text);
  const exact = new RegExp(`^\\s*${escaped}\\s*$`, 'i');
  const automationPattern = /autofill with resume/i.test(text)
    ? /autofill|resume/i
    : /apply manually/i.test(text)
      ? /manual|apply/i
      : /last|previous|application/i;
  const candidates = [
    typeof page.getByRole === 'function' ? page.getByRole('button', { name: exact }).first() : null,
    page.locator('button, [role="button"], [tabindex], [data-automation-id]').filter({ hasText: exact }).first(),
    page.locator('[data-automation-id]').filter({ hasText: exact }).first(),
  ].filter(Boolean);
  for (const locator of candidates) {
    if (!await locatorCount(locator)) continue;
    if (await clickWorkdayLocator(locator, { forceFallback: true })) return true;
  }
  return Boolean(await page.evaluate(({ targetLabel, automationSource }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const exactText = normalize(targetLabel).toLowerCase();
    const automation = new RegExp(automationSource, 'i');
    const controls = Array.from(document.querySelectorAll('button, a, [role="button"], [tabindex], [data-automation-id]'))
      .filter((element) => visible(element))
      .map((element) => {
        const label = normalize(element.textContent || element.getAttribute('value') || element.getAttribute('aria-label'));
        const modal = element.closest('[role="dialog"], [aria-modal="true"], [data-automation-id*="modal" i]');
        const action = element.closest('button, a, [role="button"], [tabindex], [data-automation-id]') || element;
        const automationId = element.getAttribute('data-automation-id') || action.getAttribute?.('data-automation-id') || '';
        let score = modal ? 50 : 0;
        if (label.toLowerCase() === exactText) score += 100;
        if (automation.test(automationId)) score += 25;
        if (element.tagName.toLowerCase() === 'button') score += 10;
        return { action, label, score };
      })
      .filter((entry) => entry.label.toLowerCase() === exactText || (automation.test(entry.label) && automation.test(entry.action.getAttribute?.('data-automation-id') || '')))
      .sort((left, right) => right.score - left.score);
    const selected = controls[0]?.action;
    if (!(selected instanceof HTMLElement)) return false;
    selected.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    selected.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    selected.click();
    return true;
  }, { targetLabel: text, automationSource: automationPattern.source }).catch(() => false));
}

async function visibleWorkdayStartApplicationOptions(page) {
  if (!page || typeof page.evaluate !== 'function') return [];
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const roots = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-automation-id*="modal" i], section, main'))
      .filter((element) => visible(element) && /start your application|autofill with resume|apply manually|use my last application/i.test(normalize(element.textContent)));
    const searchRoots = roots.length ? roots : [document.body];
    const labels = [];
    for (const root of searchRoots) {
      for (const element of Array.from(root.querySelectorAll('button, input[type="button"], input[type="submit"], a, [role="button"], [tabindex], [data-automation-id]'))) {
        if (!visible(element)) continue;
        const label = normalize(element.textContent || element.getAttribute('value') || element.getAttribute('aria-label'));
        if (/^(autofill with resume|apply manually|use my last application)$/i.test(label)) {
          labels.push({ enabled: !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true', label });
        }
      }
    }
    return [...new Map(labels.map((entry) => [entry.label.toLowerCase(), entry])).values()];
  }).catch(() => []);
}

async function clickWorkdayApplyFromPosting(page, label) {
  const text = clean(label);
  if (!text) return false;
  if (typeof page.clickActionLabel === 'function') return Boolean(await page.clickActionLabel(text));
  if (!page?.locator) return false;
  const beforeUrl = currentUrl(page);
  const applyPattern = /^apply(?: now)?$/i;
  const candidates = [
    page.locator('[data-automation-id="jobPostingApplyButton"]').first(),
    typeof page.getByRole === 'function' ? page.getByRole('button', { name: applyPattern }).first() : null,
    page.locator('button, input[type="button"], input[type="submit"], a, [role="button"]').filter({ hasText: applyPattern }).first(),
  ].filter(Boolean);
  for (const locator of candidates) {
    if (!await locatorCount(locator)) continue;
    if (await clickAndConfirmWorkdayApplyTransition(page, locator, beforeUrl)) return true;
  }
  return false;
}

async function clickAndConfirmWorkdayApplyTransition(page, locator, beforeUrl) {
  const target = typeof locator.first === 'function' ? locator.first() : locator;
  const attempts = [
    async () => {
      if (typeof target.scrollIntoViewIfNeeded === 'function') await target.scrollIntoViewIfNeeded().catch(() => {});
      await target.click();
    },
    async () => {
      if (typeof target.scrollIntoViewIfNeeded === 'function') await target.scrollIntoViewIfNeeded().catch(() => {});
      await target.click({ force: true });
    },
    async () => {
      await target.evaluate((element) => {
        if (element instanceof HTMLElement) element.click();
      });
    },
  ];
  for (const attempt of attempts) {
    try {
      await attempt();
    } catch {
      continue;
    }
    if (await waitForWorkdayApplyTransition(page, beforeUrl)) return true;
  }
  return false;
}

async function waitForWorkdayApplyTransition(page, beforeUrl) {
  for (let index = 0; index < 4; index += 1) {
    await waitForTimeout(page, 1250);
    const url = currentUrl(page);
    if (clean(url) !== clean(beforeUrl) && /\/apply(?:\/|$)|autofillwithresume|usemylastapplication|manual/i.test(url)) return true;
    const inspection = await inspectWorkdayPage(page);
    const actionText = labels(inspection.actions).join(' ');
    const text = `${await bodyText(page)} ${actionText}`;
    if (/start your application|autofill with resume|apply manually|use my last application|my information|my experience|application questions|voluntary disclosures|self identify|review|create account|sign in with email|email address\\s+password/i.test(text)) {
      return true;
    }
    if (!enabledActions(inspection, /^apply(?: now)?$/i).length) return true;
  }
  return false;
}

async function reportAssistedInspection({ inspection, page, policy, runtime, task }) {
  const submitControls = enabledActions(inspection, /submit/i);
  await runtime.report({
    status: 'inspected_assisted',
    currentUrl: currentUrl(page),
    evidenceText: `Workday inspected in ${policy.mode}; no submit was attempted. Detected ${inspection.fields.length} field(s) and ${inspection.actions.length} action control(s).`,
    screenshotPath: await safeShot(runtime, 'workday-controlled-inspection'),
    details: {
      actionLabels: labels(inspection.actions).slice(0, 12),
      classification: 'workday_controlled_inspection',
      executionMode: policy.mode,
      fieldLabels: labels(inspection.fields).slice(0, 25),
      inspectionErrors: inspection.errors,
      outcomeStatus: 'inspected_assisted',
      submitBlocked: true,
      submitControlsDetected: submitControls.map((control) => control.label),
      decisionQueue: [
        createProductionDecisionQueueItem({
          ats: 'workday',
          category: submitControls.length ? 'review' : 'low_confidence',
          confidence: inspection.fields.length || inspection.actions.length ? 0.78 : 0.52,
          fieldLabel: submitControls.length ? 'Workday submit control' : 'Workday application surface',
          reason: submitControls.length
            ? 'Workday presented a submit control, and production policy requires Tomas to complete or approve this step manually.'
            : 'Workday live inspection completed without a production-proven submit path.',
          requiredAction: 'Review the Workday application manually; Career OS will not submit without exact Workday canary review approval.',
          resumePoint: 'After Tomas completes or approves the Workday step, resume this canary from Career OS.',
          routing: policy.details?.routing,
          sensitivity: 'operational',
          task,
          tenant: policy.details?.routing?.tenant,
          url: currentUrl(page),
        }),
      ],
    },
  });
}

async function maybeUploadWorkdayResume(page, task, runtime, inspection) {
  const resumeField = (inspection.fields || []).find((field) => {
    const label = `${field.label || ''} ${field.name || ''} ${field.id || ''} ${field.ariaLabel || ''}`.toLowerCase();
    return field.type === 'file' && /resume|cv/.test(label);
  });
  const text = await bodyText(page);
  if (/resume\/cv|resume cv|resume|cv/i.test(text) && /successfully uploaded/i.test(text)) {
    const duplicateUploadsRemoved = await cleanupDuplicateWorkdayResumeUploads(page);
    await runtime.report({
      status: 'heartbeat',
      currentUrl: currentUrl(page),
      evidenceText: duplicateUploadsRemoved > 0
        ? `Workday already shows an uploaded resume artifact; removed ${duplicateUploadsRemoved} duplicate upload(s).`
        : 'Workday already shows an uploaded resume artifact on this page.',
      details: {
        classification: 'workday_resume_already_uploaded',
        duplicateUploadsRemoved,
      },
    });
    return { uploaded: true };
  }
  if (!resumeField && !/upload resume|attach resume|resume upload|upload cv|attach cv|resume\/cv|resume cv|drop files here|select files/i.test(text)) return { uploaded: false };
  let resumePath = '';
  try {
    resumePath = await runtime.ensureResumeFile();
  } catch (error) {
    await runtime.report({
      status: 'waiting_for_manual_upload',
      currentUrl: currentUrl(page),
      evidenceText: 'Workday asks for a resume, but no approved local resume file or approved inline resume content was available.',
      screenshotPath: await safeShot(runtime, 'workday-manual-resume-upload'),
      details: {
        classification: 'workday_resume_upload_gate',
        error: error instanceof Error ? error.message : String(error),
        outcomeStatus: 'waiting_for_manual_upload',
        decisionQueue: [
          createProductionDecisionQueueItem({
            ats: 'workday',
            category: 'resume_upload',
            confidence: 0.98,
            fieldLabel: 'Resume upload',
            reason: 'Approved resume artifact could not be resolved for Workday upload.',
            requiredAction: 'Attach the approved resume manually or restore the approved resume artifact, then resume the canary.',
            resumePoint: 'Resume the Workday canary from this upload step after the approved resume is present.',
            sensitivity: 'operational',
            task,
            url: currentUrl(page),
          }),
        ],
      },
    });
    return { gated: true };
  }
  if (!fs.existsSync(resumePath)) {
    await runtime.report({
      status: 'waiting_for_manual_upload',
      currentUrl: currentUrl(page),
      evidenceText: `Approved resume path does not exist: ${path.basename(resumePath)}.`,
      screenshotPath: await safeShot(runtime, 'workday-missing-resume-artifact'),
      details: {
        classification: 'workday_resume_artifact_missing',
        outcomeStatus: 'waiting_for_manual_upload',
      },
    });
    return { gated: true };
  }
  if (!page?.locator) return { uploaded: false };
  const uploadResult = await uploadWorkdayFile(page, resumePath, {
    buttonPatterns: [/select files/i, /upload from pc/i, /upload resume/i, /upload cv/i, /attach resume/i, /attach cv/i],
    fieldPattern: /resume|cv/i,
  });
  if (uploadResult.uploaded) {
    await runtime.report({
      status: 'heartbeat',
      currentUrl: currentUrl(page),
      evidenceText: `Uploaded approved Workday resume artifact ${path.basename(resumePath)}.`,
      details: {
        classification: 'workday_resume_uploaded',
        uploadMethod: uploadResult.method,
        resumeFileName: path.basename(resumePath),
        visibleAfterUpload: uploadResult.visibleAfterUpload,
      },
    });
    return { uploaded: true };
  }
  await runtime.report({
    status: 'waiting_for_manual_upload',
    currentUrl: currentUrl(page),
    evidenceText: uploadResult.error
      ? `Workday asks for a resume, but the browser could not attach the approved file: ${uploadResult.error}.`
      : 'Workday asks for a resume, but the upload control is not automatable on this page.',
    screenshotPath: await safeShot(runtime, 'workday-upload-control-unsupported'),
    details: {
      classification: uploadResult.error ? 'workday_resume_upload_runtime_failed' : 'workday_resume_upload_control_unsupported',
      uploadMethodAttempted: uploadResult.method,
      uploadError: uploadResult.error,
      outcomeStatus: 'waiting_for_manual_upload',
    },
  });
  return { gated: true };
}

async function cleanupDuplicateWorkdayResumeUploads(page) {
  if (!page?.locator) return 0;
  const resumeSection = page.locator('body').filter({ hasText: /resume\/cv|resume cv|resume/i }).first();
  const root = await locatorCount(resumeSection) ? resumeSection : page.locator('body');
  const deleteControls = root.locator([
    'button[aria-label*="delete" i]',
    '[role="button"][aria-label*="delete" i]',
    'button[title*="delete" i]',
    '[role="button"][title*="delete" i]',
    '[data-automation-id*="delete" i]',
  ].join(', '));
  const count = await locatorCount(deleteControls);
  if (count <= 1) return 0;
  let removed = 0;
  for (let index = count - 1; index >= 1; index -= 1) {
    const control = deleteControls.nth(index);
    await control.click({ force: true }).catch(() => null);
    await waitForTimeout(page, 250);
    const confirm = page.locator('button, [role="button"]').filter({ hasText: /^(delete|remove|ok|yes)$/i }).first();
    if (await locatorCount(confirm)) {
      await confirm.click({ force: true }).catch(() => null);
      await waitForTimeout(page, 250);
    }
    removed += 1;
  }
  return removed;
}

async function maybeUploadWorkdayCoverLetter(page, task, runtime, inspection) {
  if (typeof runtime.ensureCoverLetterFile !== 'function' || !task.coverLetter) return { uploaded: false };
  const coverLetterField = (inspection.fields || []).find((field) => {
    const label = `${field.label || ''} ${field.name || ''} ${field.id || ''} ${field.ariaLabel || ''}`.toLowerCase();
    return field.type === 'file' && /cover/.test(label) && !/resume|\bcv\b/.test(label);
  });
  const text = await bodyText(page);
  if (!coverLetterField && !/cover letter/i.test(text)) return { uploaded: false };

  const coverLetterPath = await runtime.ensureCoverLetterFile();
  if (!coverLetterPath) {
    await runtime.report({
      status: 'heartbeat',
      currentUrl: currentUrl(page),
      evidenceText: 'Workday showed a cover-letter area, but no approved cover letter artifact was available.',
      details: {
        classification: 'workday_cover_letter_not_available',
        coverLetterSupported: true,
        coverLetterUploaded: false,
      },
    });
    return { uploaded: false };
  }
  if (!fs.existsSync(coverLetterPath)) {
    await runtime.report({
      status: 'heartbeat',
      currentUrl: currentUrl(page),
      evidenceText: `Approved cover letter path does not exist: ${path.basename(coverLetterPath)}.`,
      details: {
        classification: 'workday_cover_letter_artifact_missing',
        coverLetterSupported: true,
        coverLetterUploaded: false,
      },
    });
    return { uploaded: false };
  }
  if (!page?.locator) return { uploaded: false };
  const fileInput = await selectWorkdayCoverLetterFileInput(page);
  let uploadResult = null;
  if (fileInput) {
    uploadResult = await uploadWorkdayFileInput(page, fileInput, coverLetterPath);
  } else {
    uploadResult = await uploadWorkdayFile(page, coverLetterPath, {
      buttonPatterns: [/select files/i, /upload from pc/i, /upload cover/i, /attach cover/i, /supporting document/i],
      fieldPattern: /cover|supporting/i,
    });
  }
  if (!uploadResult.uploaded) {
    await runtime.report({
      status: 'heartbeat',
      currentUrl: currentUrl(page),
      evidenceText: uploadResult.error
        ? `Workday showed a cover-letter area, but the browser could not attach the approved file: ${uploadResult.error}.`
        : 'Workday showed cover-letter text, but no supported cover letter upload control was visible.',
      details: {
        classification: uploadResult.error ? 'workday_cover_letter_upload_runtime_failed' : 'workday_cover_letter_upload_control_unavailable',
        coverLetterSupported: false,
        coverLetterUploaded: false,
        uploadMethodAttempted: uploadResult.method,
        uploadError: uploadResult.error,
      },
    });
    return { uploaded: false };
  }
  await runtime.report({
    status: 'heartbeat',
    currentUrl: currentUrl(page),
    evidenceText: `Uploaded approved Workday cover letter artifact ${path.basename(coverLetterPath)}.`,
    details: {
      classification: 'workday_cover_letter_uploaded',
      coverLetterFileName: path.basename(coverLetterPath),
      coverLetterSupported: true,
      coverLetterUploaded: true,
      uploadMethod: uploadResult.method,
      visibleAfterUpload: uploadResult.visibleAfterUpload,
    },
  });
  return { uploaded: true };
}

async function uploadWorkdayFile(page, filePath, options = {}) {
  const fieldPattern = options.fieldPattern || /resume|cv|cover|supporting/i;
  const directInput = await selectWorkdayFileInput(page, fieldPattern);
  if (directInput) return uploadWorkdayFileInput(page, directInput, filePath);

  const chooserResult = await uploadWorkdayFileWithChooser(page, filePath, options.buttonPatterns || []);
  if (chooserResult.uploaded || chooserResult.error) return chooserResult;

  const followUpInput = await selectWorkdayFileInput(page, fieldPattern);
  if (followUpInput) return uploadWorkdayFileInput(page, followUpInput, filePath);

  return {
    uploaded: false,
    method: chooserResult.method || 'none',
    error: chooserResult.error || '',
    visibleAfterUpload: false,
  };
}

async function uploadWorkdayFileInput(page, fileInput, filePath) {
  try {
    await fileInput.setInputFiles(filePath);
    await waitForTimeout(page, 1500);
    return {
      uploaded: true,
      method: 'input[type=file].setInputFiles',
      error: '',
      visibleAfterUpload: await isUploadedFileVisible(page, filePath),
    };
  } catch (error) {
    return {
      uploaded: false,
      method: 'input[type=file].setInputFiles',
      error: error instanceof Error ? error.message : String(error),
      visibleAfterUpload: false,
    };
  }
}

async function uploadWorkdayFileWithChooser(page, filePath, buttonPatterns = []) {
  if (!page || typeof page.waitForEvent !== 'function') {
    return { uploaded: false, method: 'filechooser_unavailable', error: '', visibleAfterUpload: false };
  }
  const controls = [
    page.locator('[data-automation-id="select-files"]').first(),
    page.locator('[data-automation-id*="upload" i]').first(),
    page.locator('button, [role="button"]').filter({ hasText: /select files|upload from pc|upload resume|upload cv|attach resume|attach cv|upload cover|attach cover|supporting document/i }).first(),
  ];
  for (const pattern of buttonPatterns) {
    controls.push(page.locator('button, [role="button"]').filter({ hasText: pattern }).first());
  }

  for (const control of controls) {
    if (!(await locatorCount(control))) continue;
    try {
      const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
      await control.click({ force: true });
      const chooser = await chooserPromise;
      await chooser.setFiles(filePath);
      await waitForTimeout(page, 1500);
      return {
        uploaded: true,
        method: 'filechooser.setFiles',
        error: '',
        visibleAfterUpload: await isUploadedFileVisible(page, filePath),
      };
    } catch (error) {
      return {
        uploaded: false,
        method: 'filechooser.setFiles',
        error: error instanceof Error ? error.message : String(error),
        visibleAfterUpload: false,
      };
    }
  }

  return { uploaded: false, method: 'filechooser.setFiles', error: '', visibleAfterUpload: false };
}

async function selectWorkdayFileInput(page, fieldPattern) {
  const inputs = page.locator('input[type="file"]');
  const count = await locatorCount(inputs);
  if (!count) return null;
  let bestIndex = -1;
  let bestScore = -1;
  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    const score = await input.evaluate((node, source) => {
      const pattern = new RegExp(source, 'i');
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const attrs = [
        node.getAttribute('name'),
        node.getAttribute('id'),
        node.getAttribute('aria-label'),
        node.getAttribute('data-automation-id'),
        node.getAttribute('data-testid'),
        node.getAttribute('accept'),
      ].map(normalize).join(' ');
      let current = node;
      const context = [];
      for (let depth = 0; current && depth < 5; depth += 1) {
        context.push(normalize(current.textContent));
        current = current.parentElement;
      }
      const text = `${attrs} ${context.join(' ')}`;
      let points = pattern.test(text) ? 10 : 0;
      if (/resume|cv|cover|supporting|upload|attach|select files/i.test(text)) points += 2;
      if (/pdf|doc|docx|text|plain/i.test(attrs)) points += 1;
      return points;
    }, fieldPattern.source).catch(() => 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  if (bestIndex < 0) return null;
  return inputs.nth(bestIndex);
}

async function isUploadedFileVisible(page, filePath) {
  const name = path.basename(filePath);
  const text = await bodyText(page);
  return text.includes(name) || /successfully uploaded/i.test(text);
}

async function selectWorkdayCoverLetterFileInput(page) {
  const index = await page.locator('input[type="file"]').evaluateAll((nodes) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const score = (node) => {
      const attrs = [
        node.getAttribute('name'),
        node.getAttribute('id'),
        node.getAttribute('aria-label'),
        node.getAttribute('data-automation-id'),
        node.getAttribute('data-testid'),
        node.className,
        node.parentElement?.textContent,
        node.closest('[data-automation-id], section, fieldset, div, label')?.textContent,
      ].map(normalize).join(' ');
      if (/resume|\bcv\b/.test(attrs)) return -100;
      let points = 0;
      if (/cover letter/.test(attrs)) points += 8;
      if (/\bcover\b/.test(attrs)) points += 5;
      if (/attach|upload/.test(attrs)) points += 1;
      return points;
    };
    let bestIndex = -1;
    let bestScore = -101;
    nodes.forEach((node, currentIndex) => {
      if (!(node instanceof HTMLInputElement) || node.type !== 'file') return;
      const points = score(node);
      if (points > bestScore) {
        bestIndex = currentIndex;
        bestScore = points;
      }
    });
    return bestScore > 0 ? bestIndex : -1;
  }).catch(() => -1);
  if (!Number.isInteger(index) || index < 0) return null;
  return page.locator('input[type="file"]').nth(index);
}

export async function autofillWorkdayFields(page, task, runtime, bank, inspection, options = {}) {
  const raw = task?.rawRecord || {};
  const rawReferralValue = clean(raw.workday_referral_source || raw.referral_source_answer);
  const referralValue = rawReferralValue || clean(task?.candidate?.referralSource) || inferWorkdayReferralValue(task);
  const boundedMappings = buildWorkdayQuestionMappings(task, {
    referralStrategy: referralValue ? 'match_value' : 'first_available',
    referralValue: referralValue || 'Company Website',
  });
  const mappingResults = page?.locator
    ? await applyFieldMappings(page, boundedMappings, task)
    : [];
  const mappedApplied = mappingResults.filter((result) => result.applied);
  const mappingGateResults = mappingResults.filter((result) => result.matched && !result.applied && criticalWorkdayMappingKey(result.key));
  const activeInspection = mappedApplied.length ? await inspectWorkdayPage(page) : inspection;
  const decisions = [];
  const gates = mappingGateResults.map((result) => ({
    field: {
      label: clean(result.field || result.key),
      required: true,
      tagName: '',
      type: 'select',
    },
    resolution: {
      action: 'gate',
      answer: null,
      canonicalField: clean(result.key),
      reason: `No safe Workday option or selector matched the authorized value ${clean(result.value)}.`,
      safeToAutoFill: false,
      sensitivity: 'operational',
      status: 'missing_safe_option',
    },
  }));
  const mappings = [];
  for (const field of activeInspection.fields || []) {
    if (field.type === 'file' || field.type === 'hidden' || ['submit', 'button'].includes(field.type)) continue;
    const label = clean(field.label || field.ariaLabel || field.placeholder || field.name || field.id);
    if (!label) continue;
    const resolution = resolveWorkdayAnswerForLabel(label, {
      bank,
      currentValue: field.currentValue,
      field,
      standingLegalAuthorization: options.standingLegalAuthorization === true,
      task,
    });
    decisions.push({ field, resolution });
    if (resolution.safeToAutoFill) {
      mappings.push({
        key: resolution.canonicalField,
        kind: resolution.action === 'select' ? 'select' : 'text',
        matchers: [field.label || field.ariaLabel || field.name || field.id],
        strategy: resolution.strategy,
        value: resolution.answer,
      });
    } else if (field.required && resolution.action === 'gate') {
      gates.push({ field, resolution });
    }
  }
  if (!mappings.length || !page?.locator) {
    // Even when there is no second (answer-bank) fill pass, the bounded
    // mappings above may have applied fields -- those must still go through
    // readback. Only skip validation entirely when there is no real page to
    // read back from; that path can only ever have zero applied results
    // (mappingResults is [] whenever !page?.locator, see above), so ok:true
    // there is accurate, not a bypass.
    const validation = page?.locator
      ? await runValidationReadbackRepairPipeline(page, boundedMappings, mappingResults, task)
      : emptyValidationReport();
    if (mappedApplied.length) {
      await runtime.report({
        status: 'heartbeat',
        currentUrl: currentUrl(page),
        evidenceText: `Filled ${mappedApplied.length} authorized Workday selector/control field(s) from bounded production mappings.`,
        details: {
          appliedFields: mappingResults.map((result) => ({
            applied: Boolean(result.applied),
            field: clean(result.field),
            key: clean(result.key),
            reason: clean(result.reason),
          })),
          classification: 'workday_bounded_mapping_fill',
          validationSummary: {
            mismatchCount: validation.mismatchCount,
            ok: validation.ok,
            repairedCount: validation.repairedCount,
            unreadableCount: validation.unreadableCount,
            verifiedCount: validation.verifiedCount,
          },
        },
      });
    }
    return { applied: mappingResults, decisions, gates, validation };
  }
  const results = await applyFieldMappings(page, mappings, task);
  const applied = [...mappedApplied, ...results.filter((result) => result.applied)];
  const validation = await runValidationReadbackRepairPipeline(
    page,
    [...boundedMappings, ...mappings],
    [...mappingResults, ...results],
    task,
  );
  if (applied.length) {
    await runtime.report({
      status: 'heartbeat',
      currentUrl: currentUrl(page),
      evidenceText: `Filled ${applied.length} authorized Workday field(s) from the canonical answer bank.`,
      details: {
        appliedFields: [...mappingResults, ...results].map((result) => ({
          applied: Boolean(result.applied),
          field: clean(result.field),
          key: clean(result.key),
          reason: clean(result.reason),
        })),
        classification: 'workday_answer_bank_fill',
        proposedAllowedAnswers: decisions
          .filter((decision) => decision.resolution.safeToAutoFill)
          .map((decision) => ({
            canonicalField: decision.resolution.canonicalField,
            fieldLabel: publicFieldLabel(decision.field),
            proposedAllowedAnswer: answerReportValue(decision.resolution),
            provenance: decision.resolution.provenance,
            sensitivity: decision.resolution.sensitivity,
          })),
        validationSummary: {
          mismatchCount: validation.mismatchCount,
          ok: validation.ok,
          repairedCount: validation.repairedCount,
          unreadableCount: validation.unreadableCount,
          verifiedCount: validation.verifiedCount,
        },
      },
    });
  }
  return { applied: [...mappingResults, ...results], decisions, gates, validation };
}

function inferWorkdayReferralValue(task = {}) {
  const raw = task?.rawRecord || {};
  const text = [
    raw.source,
    raw.source_board,
    raw.source_name,
    raw.discovery_source,
    raw.discovered_by,
    raw.job_source,
    raw.source_url,
    raw.referrer_url,
    raw.linkedin_url,
    raw.linkedin_job_url,
    task?.source,
    task?.sourceBoard,
  ].map(clean).join(' ');
  if (/linkedin/i.test(text)) return 'LinkedIn';
  return '';
}

function criticalWorkdayMappingKey(key) {
  return /address_line_1|referral_source|state|phone_device_type|country_phone_code|prior_cisco_identity|prior_employer_employment|work_authorization_posted_location|sponsorship_employment_visa_posted_locations|relevant_work_experience_years|basic_qualifications|preferred_qualifications|age_18_or_over|essential_functions|background_check_willingness|employer_relative|employer_close_personal_relationship|senior_government_official|second_job_or_outside_business|noncompete_non_solicit_restriction|military_service|military_spouse_or_partner|outside_business_ethics_acknowledgement|independent_accounting_firm_ey|government_official_status|government_official_family_contact/i.test(clean(key));
}

async function reportReviewOrSubmit({ env, identity, inspection, page, policy, runtime, task, validation }) {
  const fingerprint = buildWorkdayReviewFingerprint(task, identity.ok ? identity : {}, inspection);
  const approval = clean(env.CAREER_OS_WORKDAY_SUBMIT_APPROVAL);
  const exactTokens = [
    fingerprint,
    `workday:${clean(task.applicationId)}:${clean(identity.jobId)}:${fingerprint}`,
  ].filter(Boolean);
  const standingAuthorized = policy.mode === 'workday_first_submit';
  const approved = standingAuthorized || exactTokens.includes(approval);
  if (!approved) {
    await runtime.report({
      status: 'review_ready',
      currentUrl: currentUrl(page),
      evidenceText: 'Workday canary is at final review/submit. Submit is blocked until Tomas approves this exact job fingerprint.',
      screenshotPath: await safeShot(runtime, 'workday-review-ready'),
      details: {
        actionLabels: labels(inspection.actions).slice(0, 12),
        classification: 'workday_review_ready',
        fieldLabels: labels(inspection.fields).slice(0, 40),
        outcomeStatus: 'review_ready',
        reviewFingerprint: fingerprint,
        submitBlocked: true,
        submitControlsDetected: enabledActions(inspection, /submit/i).map((control) => control.label),
        validationSummary: validation ? {
          mismatchCount: validation.mismatchCount,
          ok: validation.ok,
          repairedCount: validation.repairedCount,
          unreadableCount: validation.unreadableCount,
          verifiedCount: validation.verifiedCount,
        } : null,
        workdayIdentity: identity.ok ? publicIdentity(identity) : null,
        decisionQueue: [
          createProductionDecisionQueueItem({
            ats: 'workday',
            category: 'review',
            confidence: 0.98,
            fieldLabel: 'Workday final review',
            reason: 'Final submit requires exact application-specific approval after Tomas reviews the live Workday page.',
            requiredAction: `Review this Workday application. To permit one submit click, set CAREER_OS_WORKDAY_SUBMIT_APPROVAL=${fingerprint} and rerun only this canary.`,
            resumePoint: 'Resume the Workday canary after setting the exact approval token, or complete manually.',
            sensitivity: 'operational',
            task,
            tenant: identity.ok ? identity.tenant : '',
            url: currentUrl(page),
          }),
        ],
      },
    });
    return true;
  }

  if (!policy.submitAllowed) {
    await runtime.report({
      status: 'canary_stopped',
      currentUrl: currentUrl(page),
      evidenceText: 'Workday reached final review, but the active production policy does not permit submit.',
      details: { classification: 'workday_submit_policy_blocked', outcomeStatus: 'canary_stopped', reviewFingerprint: fingerprint },
    });
    return true;
  }

  if (typeof runtime.assertSafeToSubmit !== 'function') {
    await runtime.report({
      status: 'canary_stopped',
      currentUrl: currentUrl(page),
      evidenceText: 'Workday submit approval was present, but duplicate/terminal submit safety was unavailable.',
      details: { classification: 'workday_submit_safety_missing', outcomeStatus: 'canary_stopped', reviewFingerprint: fingerprint },
    });
    return true;
  }
  await runtime.assertSafeToSubmit();
  const clicked = await clickWorkdayAction(page, enabledActions(inspection, /submit/i)[0]?.label || 'Submit');
  if (!clicked) {
    await runtime.report({
      status: 'submission_uncertain',
      currentUrl: currentUrl(page),
      evidenceText: 'Workday submit approval was present, but the submit control could not be clicked safely.',
      screenshotPath: await safeShot(runtime, 'workday-submit-click-uncertain'),
      details: { classification: 'workday_submit_click_uncertain', outcomeStatus: 'submission_uncertain', reviewFingerprint: fingerprint },
    });
    return true;
  }
  await waitForTimeout(page, 4000);
  const confirmationText = await bodyText(page);
  if (CONFIRMATION_PATTERN.test(confirmationText)) {
    await runtime.report({
      status: 'submitted_confirmed',
      currentUrl: currentUrl(page),
      evidenceText: standingAuthorized
        ? 'Workday application submitted once under standing Workday-first authorization and confirmation evidence was detected.'
        : 'Workday application submitted and confirmation evidence was detected.',
      screenshotPath: await safeShot(runtime, 'workday-submitted-confirmed'),
      details: {
        classification: 'workday_submitted_confirmed',
        outcomeStatus: 'submitted_confirmed',
        reviewFingerprint: fingerprint,
        submission_method: standingAuthorized ? 'workday_first_standing_authorization' : 'single_canary_exact_review_approval',
        workdayIdentity: identity.ok ? publicIdentity(identity) : null,
      },
    });
    return true;
  }
  await runtime.report({
    status: 'submission_uncertain',
    currentUrl: currentUrl(page),
    evidenceText: standingAuthorized
      ? 'Workday submit was clicked once under standing Workday-first authorization, but confirmation evidence was not detected.'
      : 'Workday submit was clicked once with exact approval, but confirmation evidence was not detected.',
    screenshotPath: await safeShot(runtime, 'workday-submission-uncertain'),
    details: {
      classification: 'workday_submission_uncertain',
      outcomeStatus: 'submission_uncertain',
      reviewFingerprint: fingerprint,
      submission_method: standingAuthorized ? 'workday_first_standing_authorization' : 'single_canary_exact_review_approval',
      workdayIdentity: identity.ok ? publicIdentity(identity) : null,
    },
  });
  return true;
}

async function reportWorkdayPageGateIfNeeded({ classification, identity, page, policy, runtime, step, task }) {
  if (classification.state === 'application') return false;
  if (classification.state === 'unknown') {
    if (await detectRuntimeHumanGate(runtime)) return true;
    await reportUnsupportedState({
      identity,
      inspection: await inspectWorkdayPage(page),
      page,
      policy,
      runtime,
      task,
      reason: 'Workday page state was not recognized.',
      step,
    });
    return true;
  }
  await runtime.report({
    status: classification.status,
    currentUrl: currentUrl(page),
    evidenceText: evidenceForClassification(classification),
    screenshotPath: await safeShot(runtime, `workday-${classification.state}`),
    details: {
      classification: classification.state,
      outcomeStatus: classification.status,
      step,
      workdayIdentity: identity.ok ? publicIdentity(identity) : null,
      decisionQueue: [
        createProductionDecisionQueueItem({
          ats: 'workday',
          category: classification.category,
          confidence: 0.94,
          fieldLabel: fieldLabelForClassification(classification),
          reason: evidenceForClassification(classification),
          requiredAction: requiredActionForClassification(classification),
          resumePoint: 'Resume this exact Workday canary after the human-only gate is complete.',
          sensitivity: ['captcha', 'login', 'account', 'email_code', 'email_verification'].includes(classification.category) ? 'human_only' : 'operational',
          task,
          tenant: identity.ok ? identity.tenant : '',
          url: currentUrl(page),
        }),
      ],
    },
  });
  return true;
}

async function refineWorkdayClassificationFromInspection(page, classification) {
  if (classification.state !== 'unknown') return classification;
  const inspection = await inspectWorkdayPage(page);
  if (enabledActions(inspection, /sign in with email|continue with email|use email|^sign in$|^log in$|login/i).length) {
    return { state: 'sign_in_required', status: 'waiting_for_sign_in', category: 'login' };
  }
  const publicApplyActions = enabledActions(
    inspection,
    /^apply$|apply manually|autofill with resume/i,
  );

  const accountCreationActions = enabledActions(
    inspection,
    /create account|create an account|register|sign up/i,
  );

  // A public Workday job posting can contain global Sign In or account text.
  // Do not classify it as an account gate while a real Apply action is present.
  if (!publicApplyActions.length && accountCreationActions.length) {
    return { state: 'account_creation_required', status: 'waiting_for_account_creation', category: 'account' };
  }
  return classification;
}

async function maybeWaitForWorkdayHydration({ page, runtime, step }) {
  const inspection = await inspectWorkdayPage(page);
  const actionText = labels(inspection.actions).join(' ');
  const body = await bodyText(page);
  const text = `${body} ${actionText}`;
  const hasCompletelyBlankSurface = !clean(body)
    && !clean(actionText)
    && !(inspection.fields || []).length
    && !(inspection.actions || []).length;
  const hasTransientWorkdayError = /something went wrong|please refresh the page and then try again/i.test(text);
  const hasOnlyShellNavigation = /skip to main content|search for jobs|introduce yourself/i.test(text)
    && !(inspection.fields || []).length
    && !enabledActions(inspection, /apply|create account|sign in|log in|login|next|continue|review|submit/i).length;
  const hasBlankApplicationStep = /autofill with resume|my information|my experience|application questions|voluntary disclosures|self identify|review/i.test(text)
    && /indicates a required field|continue|loading/i.test(text)
    && !(inspection.fields || []).length
    && !enabledActions(inspection, /^(next|continue|save and continue|review|submit)$/i).length;
  if (!/workdayjobs/i.test(currentUrl(page)) || (!hasOnlyShellNavigation && !hasBlankApplicationStep && !hasCompletelyBlankSurface && !hasTransientWorkdayError)) return false;
  await runtime.report({
    status: 'heartbeat',
    currentUrl: currentUrl(page),
    evidenceText: hasTransientWorkdayError
      ? 'Workday displayed a transient refresh error; reloading once before classifying the page state.'
      : 'Workday shell is still hydrating; waiting before classifying the page state.',
    details: {
      actionLabels: labels(inspection.actions).slice(0, 8),
      classification: 'workday_hydration_wait',
      hydrationKind: hasTransientWorkdayError
        ? 'transient_refresh_error'
        : hasCompletelyBlankSurface
        ? 'blank_page'
        : hasBlankApplicationStep
          ? 'blank_application_step'
          : 'navigation_shell',
      step,
    },
  });
  if ((hasTransientWorkdayError || hasCompletelyBlankSurface) && step >= 2 && typeof page.reload === 'function') {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
    await waitForTimeout(page, 3000);
  } else {
    await waitForTimeout(page, 6000);
  }
  return true;
}

async function maybeReplayOriginalWorkdayApplyUrl({ identity, page, replayState, runtime, step, task }) {
  if (!identity?.ok || !task?.applicationUrl) return { replayed: false, gated: false };
  const inspection = await inspectWorkdayPage(page);
  const current = currentUrl(page);
  if (!isWorkdayHomeOrSignInShell(current, inspection)) return { replayed: false, gated: false };
  const currentTenant = workdayTenantFromUrl(current);
  if (currentTenant && currentTenant !== identity.tenant) {
    await reportCanaryStop(runtime, task, {}, 'Workday replay redirected to a different tenant before resuming.', {
      currentTenant,
      currentUrl: current,
      expectedTenant: identity.tenant,
    });
    return { replayed: false, gated: true };
  }
  if (clean(current) === clean(task.applicationUrl)) return { replayed: false, gated: false };
  replayState.attempts += 1;
  if (replayState.attempts > 2) {
    await reportUnsupportedState({
      identity,
      inspection,
      page,
      policy: {},
      runtime,
      task,
      reason: 'Post-auth Workday replay returned to candidate home/sign-in shell after two bounded attempts.',
      step,
    });
    return { replayed: false, gated: true };
  }
  await runtime.report({
    status: 'heartbeat',
    currentUrl: current,
    evidenceText: 'Workday redirected to candidate home after authentication; reopening the original apply URL for the same tenant and requisition.',
    details: {
      classification: 'workday_post_auth_replay',
      originalApplyUrl: task.applicationUrl,
      replayAttempt: replayState.attempts,
      step,
      workdayIdentity: publicIdentity(identity),
    },
  });
  await page.goto(task.applicationUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForTimeout(page, 3000);
  return { replayed: true, gated: false };
}

function isWorkdayHomeOrSignInShell(url, inspection = {}) {
  const href = clean(url).toLowerCase();
  if (!/myworkdayjobs\.com/.test(href)) return false;
  if (/\/(?:userhome|candidatehome)(?:[/?#]|$)/i.test(href)) return true;
  return false;
}

function workdayTenantFromUrl(value) {
  try {
    return parseWorkdayTenant(new URL(clean(value)).hostname.toLowerCase());
  } catch {
    return '';
  }
}

async function maybeHandleAuthorizedWorkdayAccountGate({ classification, identity, page, runtime, step, task }) {
  if (!['account_creation_required', 'sign_in_required', 'session_expired'].includes(classification.state)) {
    return { gated: false, handled: false };
  }
  if (!runtime || typeof runtime.resolveEmployerAccountCredential !== 'function') {
    await reportAuthorizedAccountGateBlocked({
      classification,
      identity,
      page,
      reason: 'Workday account automation is authorized, but the secure credential store integration is unavailable in this runtime.',
      runtime,
      step,
      task,
    });
    return { gated: true, handled: false };
  }

  const inspection = await inspectWorkdayPage(page);
  const email = clean(task?.candidate?.email || task?.ownerEmail);
  if (!email || !/@/.test(email)) {
    await reportAuthorizedAccountGateBlocked({
      classification,
      identity,
      page,
      reason: 'Workday account automation is authorized, but no approved account email was available from the candidate profile.',
      runtime,
      step,
      task,
    });
    return { gated: true, handled: false };
  }

  const emailChoice = enabledActions(inspection, /sign in with email|continue with email|use email/i)[0];
  if (emailChoice) {
    if (task.__workdayEmailPathSelected) {
      if (!await hasVisiblePasswordField(page)) {
        if (await waitForVisiblePasswordField(page, 8000)) {
          await runtime.report({
            status: 'heartbeat',
            currentUrl: currentUrl(page),
            evidenceText: 'Workday email sign-in form appeared after a bounded wait.',
            details: {
              accountEmail: email,
              accountHandling: 'email_account_form_ready_after_wait',
              classification: 'workday_authorized_account_form_ready',
              step,
              workdayIdentity: identity.ok ? publicIdentity(identity) : null,
            },
          });
        } else {
        task.__workdayEmailPathNoPasswordCount = Number(task.__workdayEmailPathNoPasswordCount || 0) + 1;
        if (task.__workdayEmailPathNoPasswordCount <= 1 && await clickWorkdayAction(page, emailChoice.label)) {
          await runtime.report({
            status: 'heartbeat',
            currentUrl: currentUrl(page),
            evidenceText: 'Retried the authorized employer Workday email account path once after Workday kept the sign-in choice visible.',
            details: {
              accountEmail: email,
              accountHandling: 'email_account_path_retried',
              classification: 'workday_authorized_account_path_retried',
              retryCount: task.__workdayEmailPathNoPasswordCount,
              step,
              workdayIdentity: identity.ok ? publicIdentity(identity) : null,
            },
          });
          await waitForVisiblePasswordField(page, 8000);
          return { gated: false, handled: true };
        }
        await runtime.recordEmployerAccountMetadata?.({
          accountEmail: email,
          accountState: 'email_path_not_advancing',
          applicationsAssociated: [task.applicationId],
          employer: task.employer,
          identity: identity.ok ? publicIdentity(identity) : null,
          portalUrl: currentUrl(page) || task.applicationUrl,
          verificationStatus: 'email_path_not_advancing',
        });
        await reportAccountRecoveryGate({
          category: 'login',
          classification: 'workday_email_account_path_not_advancing',
          confidence: 0.86,
          fieldLabel: 'Workday email sign-in path',
          identity,
          outcomeStatus: 'workday_email_account_path_not_advancing',
          page,
          reason: 'Workday showed the authorized email sign-in path again after it was already selected once; Career OS stopped instead of looping.',
          requiredAction: 'Open or complete the employer Workday sign-in path once, then resume this exact application.',
          runtime,
          sensitivity: 'human_only',
          status: 'waiting_for_sign_in',
          step,
          task,
        });
        return { gated: true, handled: true };
        }
      }
    } else if (await clickWorkdayAction(page, emailChoice.label)) {
      task.__workdayEmailPathSelected = true;
      task.__workdayEmailPathNoPasswordCount = 0;
      await runtime.report({
        status: 'heartbeat',
        currentUrl: currentUrl(page),
        evidenceText: 'Selected the authorized employer Workday email account path.',
        details: {
          accountEmail: email,
          accountHandling: 'email_account_path_selected',
          classification: 'workday_authorized_account_path',
          step,
          workdayIdentity: identity.ok ? publicIdentity(identity) : null,
        },
      });
      await waitForVisiblePasswordField(page, 8000);
      return { gated: false, handled: true };
    }
  }

  const hasPassword = await hasVisiblePasswordField(page);
  const hasMultiplePasswords = await hasMultipleVisiblePasswordFields(page);
  const hasActiveAccountDialog = await hasVisibleInputAccountDialog(page);
  const hasCreateAction = Boolean(enabledActions(inspection, /create account|register|sign up/i)[0]);
  const hasSignInAction = Boolean(enabledActions(inspection, /^sign in$|^log in$|login/i)[0]);
  if (!hasPassword && (hasCreateAction || hasSignInAction)) {
    const signInFormAction = enabledActions(inspection, /^sign in$|^log in$|login/i)[0];
    const createFormAction = enabledActions(inspection, /create account|register|sign up/i)[0];
    const shouldPreferSignIn = Boolean(task.__workdayAccountSignInSwitchAttempted || task.__workdayAccountAlreadyExistsDetected);
    const selectedAction = shouldPreferSignIn && signInFormAction
      ? signInFormAction
      : createFormAction || signInFormAction;
    const selectedFlow = selectedAction === signInFormAction ? 'sign-in' : 'account creation';
    const label = selectedAction.label;
    if (await clickWorkdayAction(page, label)) {
      await runtime.report({
        status: 'heartbeat',
        currentUrl: currentUrl(page),
        evidenceText: `Opened the authorized employer Workday ${selectedFlow} form.`,
        details: {
          accountEmail: email,
          accountHandling: selectedFlow === 'account creation' ? 'create_account_form_opened' : 'sign_in_form_opened',
          classification: 'workday_authorized_account_form_opened',
          step,
          workdayIdentity: identity.ok ? publicIdentity(identity) : null,
        },
      });
      await waitForTimeout(page, 2500);
      return { gated: false, handled: true };
    }
  }

  if (!hasPassword) return { gated: false, handled: false };

  await maybeCloseInputlessAccountChoiceOverlay(page);

  const credential = await runtime.resolveEmployerAccountCredential({
    accountEmail: email,
    employer: task.employer,
    identity: identity.ok ? publicIdentity(identity) : null,
    task,
  });
  if (!credential?.ok) {
    await reportAuthorizedAccountGateBlocked({
      classification,
      identity,
      page,
      reason: credential?.reason || 'Workday account automation is authorized, but secure credential retrieval or storage failed.',
      runtime,
      step,
      task,
    });
    return { gated: true, handled: false };
  }

  const signInSwitchCanTargetAccountForm = !page?.locator || hasActiveAccountDialog || !hasMultiplePasswords;
  const existingCredentialSignInReady = credential.createdNow === false
    && hasSignInAction
    && task.__workdayAccountSignInSwitchAttempted
    && signInSwitchCanTargetAccountForm;
  const isCreateFlow = existingCredentialSignInReady
    ? false
    : hasMultiplePasswords
      || classification.state === 'account_creation_required'
      || hasCreateAction
      || hasMultiplePasswords;
  const signInLink = enabledActions(inspection, /already have.*account|sign in instead|log in instead/i)[0];
  if (isCreateFlow && credential.createdNow === false && hasSignInAction && !task.__workdayAccountSignInSwitchAttempted) {
    const genericSignInAction = enabledActions(inspection, /^sign in$|^log in$|login/i)[0];
    const switched = await clickExistingAccountSignIn(page)
      || (signInLink && await clickWorkdayAction(page, signInLink.label))
      || (signInSwitchCanTargetAccountForm && genericSignInAction && await clickWorkdayAction(page, genericSignInAction.label));
    if (switched) {
      task.__workdayAccountSignInSwitchAttempted = true;
      await runtime.report({
        status: 'heartbeat',
        currentUrl: currentUrl(page),
        evidenceText: 'Existing Workday credential was found in Keychain, so Career OS switched from account creation to sign-in.',
        details: {
          accountEmail: email,
          accountHandling: 'existing_credential_switched_to_sign_in',
          classification: 'workday_authorized_account_form_opened',
          credentialReference: credential.reference,
          credentialStored: true,
          credentialStore: credential.store,
          protectedValuesPersisted: false,
          step,
          workdayIdentity: identity.ok ? publicIdentity(identity) : null,
        },
      });
      await waitForTimeout(page, 2500);
      return { gated: false, handled: true };
    }
  }
  if (!isCreateFlow && credential.createdNow && signInLink && await clickWorkdayAction(page, signInLink.label)) {
    await waitForTimeout(page, 2000);
    return { gated: false, handled: true };
  }

  const accountIntent = isCreateFlow ? 'create' : 'sign_in';
  const emailFilled = await fillAccountInput(page, ['email', 'username', 'user name'], email, { intent: accountIntent, type: 'email_or_text' })
    || await fillAccountEmailDirect(page, email, { intent: accountIntent });
  const passwordFilled = await fillAccountPassword(page, credential.password, { intent: accountIntent, verify: isCreateFlow });
  if (!emailFilled || !passwordFilled) {
    await reportAuthorizedAccountGateBlocked({
      classification,
      identity,
      page,
      reason: 'Workday account form was visible, but Career OS could not safely fill the email and secure account fields.',
      runtime,
      step,
      task,
    });
    return { gated: true, handled: false };
  }

  const acknowledgements = isCreateFlow ? await acceptOrdinaryAccountAcknowledgements(page) : [];
  const actionPattern = isCreateFlow ? /create account|register|sign up/i : /^sign in$|^log in$|login/i;
  const nextInspection = await inspectWorkdayPage(page);
  const action = enabledActions(nextInspection, actionPattern)[0] || enabledActions(nextInspection, /continue|next/i)[0];
  if (!action || !await clickAccountFormAction(page, action.label)) {
    await reportAuthorizedAccountGateBlocked({
      classification,
      identity,
      page,
      reason: 'Workday account form was filled from the secure credential store, but no safe submit/continue control was available.',
      runtime,
      step,
      task,
    });
    return { gated: true, handled: false };
  }

  await runtime.recordEmployerAccountMetadata?.({
    accountEmail: email,
    accountState: isCreateFlow ? 'created_or_attempted' : 'reused_or_attempted',
    applicationsAssociated: [task.applicationId],
    credentialReference: credential.reference,
    employer: task.employer,
    identity: identity.ok ? publicIdentity(identity) : null,
    portalUrl: currentUrl(page) || task.applicationUrl,
    verificationStatus: 'pending_post_submit_check',
  });
  await runtime.report({
    status: 'heartbeat',
    currentUrl: currentUrl(page),
    evidenceText: isCreateFlow
      ? 'Created or attempted an authorized employer Workday applicant account using a Keychain-stored credential.'
      : 'Signed in or attempted sign-in to the employer Workday applicant account using a Keychain-stored credential.',
    details: {
      accountEmail: email,
      accountHandling: isCreateFlow ? 'account_creation_attempted' : 'account_sign_in_attempted',
      acknowledgementsAccepted: acknowledgements,
      classification: 'workday_authorized_account_handled',
      credentialReference: credential.reference,
      credentialStored: true,
      credentialStore: credential.store,
      createdNow: Boolean(credential.createdNow),
      protectedValuesPersisted: false,
      step,
      workdayIdentity: identity.ok ? publicIdentity(identity) : null,
    },
  });
  await waitForTimeout(page, 3500);

  const afterText = await bodyText(page);
  const afterClassification = classifyWorkdayPageText(afterText);
  const afterInspection = await inspectWorkdayPage(page);
  const existingAccountAction = enabledActions(afterInspection, /^sign in$|^log in$|login/i)[0];
  const accountRecovery = classifyWorkdayAccountRecovery(afterText, afterInspection);
  if (!isCreateFlow && accountRecovery.blocked) {
    await runtime.recordEmployerAccountMetadata?.({
      accountEmail: email,
      accountState: accountRecovery.accountState,
      applicationsAssociated: [task.applicationId],
      credentialReference: credential.reference,
      employer: task.employer,
      identity: identity.ok ? publicIdentity(identity) : null,
      portalUrl: currentUrl(page) || task.applicationUrl,
      verificationStatus: accountRecovery.verificationStatus,
    });
    if (accountRecovery.resetAvailable) {
      const reset = await maybeStartWorkdayPasswordReset({
        accountRecovery,
        credential,
        email,
        identity,
        page,
        runtime,
        step,
        task,
      });
      if (reset.gated) return { gated: true, handled: true };
    }
    await reportAccountRecoveryGate({
      category: 'login',
      classification: accountRecovery.classification,
      confidence: accountRecovery.locked ? 0.92 : 0.88,
      credentialReference: credential.reference,
      fieldLabel: accountRecovery.locked ? 'Workday account locked' : 'Workday password rejected',
      identity,
      outcomeStatus: accountRecovery.outcomeStatus,
      page,
      reason: accountRecovery.reason,
      requiredAction: accountRecovery.locked
        ? 'Recover or unlock the employer Workday account, then resume this exact application.'
        : 'Complete employer Workday password recovery or update the secure credential, then resume this exact application.',
      runtime,
      sensitivity: 'human_only',
      status: 'waiting_for_sign_in',
      step,
      task,
    });
    return { gated: true, handled: true };
  }
  if (isCreateFlow && /already (?:have|exists)|account already|email already|already registered/i.test(afterText) && existingAccountAction) {
    if (await clickWorkdayAction(page, existingAccountAction.label)) {
      task.__workdayAccountAlreadyExistsDetected = true;
      task.__workdayAccountSignInSwitchAttempted = true;
      await runtime.report({
        status: 'heartbeat',
        currentUrl: currentUrl(page),
        evidenceText: 'Workday indicated the account already exists; Career OS switched to the authorized sign-in path.',
        details: {
          accountEmail: email,
          accountHandling: 'email_already_exists_switched_to_sign_in',
          classification: 'workday_authorized_account_form_opened',
          credentialReference: credential.reference,
          credentialStored: true,
          credentialStore: credential.store,
          protectedValuesPersisted: false,
          step,
          workdayIdentity: identity.ok ? publicIdentity(identity) : null,
        },
      });
      await waitForTimeout(page, 2500);
      return { gated: false, handled: true };
    }
  }
  if (['email_code_required', 'email_verification_required', 'captcha'].includes(afterClassification.state)) {
    await runtime.recordEmployerAccountMetadata?.({
      accountEmail: email,
      accountState: 'verification_required',
      applicationsAssociated: [task.applicationId],
      credentialReference: credential.reference,
      employer: task.employer,
      identity: identity.ok ? publicIdentity(identity) : null,
      portalUrl: currentUrl(page) || task.applicationUrl,
      verificationStatus: afterClassification.state,
    });
    await reportWorkdayPageGateIfNeeded({ classification: afterClassification, identity, page, policy: {}, runtime, step, task });
    return { gated: true, handled: true };
  }
  if (afterClassification.state === 'application' || afterClassification.state === 'unknown') {
    await runtime.recordEmployerAccountMetadata?.({
      accountEmail: email,
      accountState: isCreateFlow ? 'created' : 'reused',
      applicationsAssociated: [task.applicationId],
      credentialReference: credential.reference,
      employer: task.employer,
      identity: identity.ok ? publicIdentity(identity) : null,
      lastSuccessfulLogin: new Date().toISOString(),
      portalUrl: currentUrl(page) || task.applicationUrl,
      verificationStatus: 'not_required_or_already_satisfied',
    });
  }
  if (isCreateFlow && await hasVisiblePasswordField(page)) {
    const validationMessages = await extractAccountValidationMessages(page);
    await reportUnsupportedState({
      identity,
      inspection: afterInspection,
      page,
      policy: {},
      runtime,
      task,
      reason: validationMessages.length
        ? `Workday account modal remained unresolved after authorized credential fill: ${validationMessages.join(' | ')}`
        : 'Workday account modal remained unresolved after authorized credential fill with no visible validation message.',
      step,
    });
    return { gated: true, handled: true };
  }
  return { gated: false, handled: true };
}

async function extractAccountValidationMessages(page) {
  if (!page?.evaluate) return [];
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const nodes = Array.from(document.querySelectorAll('[role="alert"], [aria-live], [data-automation-id*="error"], .error, .errors, [class*="error"], [id*="error"]'));
    return [...new Set(nodes
      .filter(visible)
      .map((node) => normalize(node.textContent))
      .filter((text) => text && /required|invalid|password|email|already|verify|match|agree|error/i.test(text))
      .map((text) => text.replace(/password\s*[:=]?\s*\S+/gi, 'password [redacted]'))
      .slice(0, 5))];
  }).catch(() => []);
}

function classifyWorkdayAccountRecovery(text = '', inspection = {}) {
  const value = clean(text);
  const actionText = labels(inspection.actions).join(' ');
  const resetAvailable = /forgot (?:your )?password|reset password|password reset|trouble signing in/i.test(`${value} ${actionText}`);
  const locked = /account (?:might be )?locked|account is locked|locked out|too many failed|too many sign.?in attempts/i.test(value);
  const rejected = /wrong email address or password|wrong password|invalid (?:email|username|user name|password|credentials)|incorrect password|password is incorrect|unable to sign in|we couldn't sign you in|could not sign you in/i.test(value);
  if (!locked && !rejected) return { blocked: false, resetAvailable };
  const reason = locked
    ? `Workday rejected the sign-in and indicated the account may be locked${resetAvailable ? '; password reset is available.' : '; no reset control was confirmed on the page.'}`
    : `Workday rejected the stored credential${resetAvailable ? '; password reset is available.' : '; no reset control was confirmed on the page.'}`;
  return {
    accountState: locked ? 'account_locked_or_password_rejected' : 'password_rejected',
    blocked: true,
    classification: locked ? 'workday_account_locked_or_password_rejected' : 'workday_password_rejected',
    locked,
    outcomeStatus: locked ? 'account_locked_requiring_recovery' : 'password_reset_required',
    reason,
    resetAvailable,
    verificationStatus: locked
      ? resetAvailable ? 'account_locked_reset_available' : 'account_locked_reset_unavailable'
      : resetAvailable ? 'password_rejected_reset_available' : 'password_rejected_reset_unavailable',
  };
}

async function maybeStartWorkdayPasswordReset({ accountRecovery, credential, email, identity, page, runtime, step, task }) {
  const beforeInspection = await inspectWorkdayPage(page);
  const resetAction = enabledActions(beforeInspection, /forgot (?:your )?password|reset password|password reset|trouble signing in/i)[0];
  if (!resetAction || !await clickWorkdayAction(page, resetAction.label)) {
    return { gated: false };
  }
  await runtime.report({
    status: 'heartbeat',
    currentUrl: currentUrl(page),
    evidenceText: 'Started the employer Workday password reset flow after one rejected credential attempt.',
    details: {
      accountEmail: email,
      accountHandling: 'password_reset_started',
      classification: 'workday_password_reset_started',
      credentialReference: credential.reference,
      protectedValuesPersisted: false,
      resetReason: accountRecovery.classification,
      step,
      workdayIdentity: identity.ok ? publicIdentity(identity) : null,
    },
  });
  await waitForTimeout(page, 2000);

  await fillAccountInput(page, ['email', 'username', 'user name'], email, { intent: 'password_reset', type: 'email_or_text' });
  const resetInspection = await inspectWorkdayPage(page);
  const submitReset = enabledActions(resetInspection, /^(submit|continue|next|send|reset password|email me|send email)$/i)[0]
    || enabledActions(resetInspection, /send|reset|continue|submit/i)[0];
  if (submitReset) {
    await clickWorkdayAction(page, submitReset.label);
    await waitForTimeout(page, 2500);
  }

  const afterText = await bodyText(page);
  const afterClassification = classifyWorkdayPageText(afterText);
  const resetRequiresEmailAction = ['email_code_required', 'email_verification_required'].includes(afterClassification.state)
    || /check your email|reset link|reset instructions|email has been sent|sent (?:you )?(?:an )?email/i.test(afterText);
  await runtime.recordEmployerAccountMetadata?.({
    accountEmail: email,
    accountState: 'password_reset_handoff_required',
    applicationsAssociated: [task.applicationId],
    credentialReference: credential.reference,
    employer: task.employer,
    identity: identity.ok ? publicIdentity(identity) : null,
    portalUrl: currentUrl(page) || task.applicationUrl,
    verificationStatus: resetRequiresEmailAction ? 'password_reset_email_required' : 'password_reset_started_needs_review',
  });
  await reportAccountRecoveryGate({
    category: resetRequiresEmailAction ? 'email_verification' : 'login',
    classification: resetRequiresEmailAction ? 'workday_password_reset_email_required' : 'workday_password_reset_started_needs_review',
    confidence: resetRequiresEmailAction ? 0.94 : 0.82,
    credentialReference: credential.reference,
    fieldLabel: resetRequiresEmailAction ? 'Password reset email' : 'Password reset',
    identity,
    outcomeStatus: resetRequiresEmailAction ? 'password_reset_email_required' : 'password_reset_started_needs_review',
    page,
    reason: resetRequiresEmailAction
      ? `${task.employer} Workday password reset was started and now requires Tomas to complete the reset email/code/link.`
      : `${task.employer} Workday password reset was started, but Career OS could not confirm the next reset step safely.`,
    requiredAction: resetRequiresEmailAction
      ? `Tomas, ${task.employer} Workday sent a password reset or verification email. Complete the code/link in the open browser window, then tell Codex: ${task.employer} verification complete.`
      : `Review the ${task.employer} Workday password reset page, complete any employer-controlled step, then resume this exact application.`,
    runtime,
    sensitivity: 'human_only',
    status: resetRequiresEmailAction ? 'waiting_for_email_verification' : 'waiting_for_sign_in',
    step,
    task,
  });
  return { gated: true };
}

async function reportAccountRecoveryGate({
  category,
  classification,
  confidence,
  credentialReference,
  fieldLabel,
  identity,
  outcomeStatus,
  page,
  reason,
  requiredAction,
  runtime,
  sensitivity,
  status,
  step,
  task,
}) {
  await runtime.report({
    status,
    currentUrl: currentUrl(page),
    evidenceText: reason,
    screenshotPath: await safeShot(runtime, classification),
    details: {
      accountAutomationAuthorized: true,
      classification,
      credentialReference: clean(credentialReference),
      outcomeStatus,
      protectedValuesPersisted: false,
      step,
      workdayIdentity: identity.ok ? publicIdentity(identity) : null,
      decisionQueue: [
        createProductionDecisionQueueItem({
          ats: 'workday',
          category,
          confidence,
          fieldLabel,
          reason,
          requiredAction,
          resumePoint: 'Resume this exact Workday application after the account recovery step is complete.',
          sensitivity,
          task,
          tenant: identity.ok ? identity.tenant : '',
          url: currentUrl(page),
        }),
      ],
    },
  });
}

async function reportAuthorizedAccountGateBlocked({ classification, identity, page, reason, runtime, step, task }) {
  await runtime.report({
    status: classification.status,
    currentUrl: currentUrl(page),
    evidenceText: reason,
    screenshotPath: await safeShot(runtime, `workday-${classification.state}-authorized-blocked`),
    details: {
      accountAutomationAuthorized: true,
      classification: `${classification.state}_authorized_blocked`,
      outcomeStatus: classification.status,
      protectedValuesPersisted: false,
      reason,
      step,
      workdayIdentity: identity.ok ? publicIdentity(identity) : null,
      decisionQueue: [
        createProductionDecisionQueueItem({
          ats: 'workday',
          category: classification.category,
          confidence: 0.94,
          fieldLabel: fieldLabelForClassification(classification),
          reason,
          requiredAction: 'Resolve this true account automation blocker, then resume this exact Workday application.',
          resumePoint: 'Resume this exact Workday canary after the true account blocker is resolved.',
          sensitivity: 'human_only',
          task,
          tenant: identity.ok ? identity.tenant : '',
          url: currentUrl(page),
        }),
      ],
    },
  });
}

async function clickExistingAccountSignIn(page) {
  if (!page?.locator) return false;
  const controls = page.locator('button, input[type="button"], input[type="submit"], [role="button"], a');
  const index = await controls.evaluateAll((nodes) => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const scoreFor = (element) => {
      const label = normalize(element.textContent || element.getAttribute('value') || element.getAttribute('aria-label'));
      if (!/^(sign in|log in|login)$/.test(label)) return 0;
      let score = 1;
      let current = element.parentElement;
      for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
        const text = normalize(current.textContent);
        if (/already have (?:an? )?account|have an account/.test(text)) score += 100 - depth;
        if (/create account/.test(text)) score += 10;
      }
      return score;
    };
    let best = { index: -1, score: 0 };
    nodes.forEach((node, index) => {
      if (!(node instanceof HTMLElement) || !visible(node)) return;
      const score = scoreFor(node);
      if (score > best.score) best = { index, score };
    });
    return best.score >= 50 ? best.index : -1;
  }).catch(() => -1);
  if (!Number.isInteger(index) || index < 0) return false;
  return await clickWorkdayLocator(controls.nth(index), { forceFallback: true });
}

async function fillAccountInput(page, labelPatterns, value, options = {}) {
  if (!value) return false;
  if (typeof page.fillAccountField === 'function') return Boolean(await page.fillAccountField(labelPatterns, value, options));
  if (!page?.locator) return false;
  const index = await page.locator('input, textarea').evaluateAll((nodes, args) => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element) => {
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      const wrapped = element.closest('label');
      const container = element.closest('[data-automation-id], fieldset, section, div');
      return normalize([
        explicit?.textContent,
        wrapped?.textContent,
        element.getAttribute('autocomplete'),
        element.getAttribute('aria-label'),
        element.getAttribute('placeholder'),
        element.getAttribute('name'),
        element.id,
        container?.textContent,
      ].filter(Boolean).join(' '));
    };
    const patterns = (args.patterns || []).map(normalize);
    const typeMode = String(args.typeMode || '');
    const accountIntent = normalize(args.intent || '');
    const accountContainer = (element) => {
      let best = null;
      let current = element.parentElement;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        const text = normalize(current.textContent);
        const hasPassword = Boolean(current.querySelector('input[type="password"]'));
        const hasAccountAction = /sign in|log in|login|create account|register|sign up/.test(text);
        if (hasPassword && hasAccountAction) {
          best = current;
          break;
        }
      }
      return best || element.closest('form, [role="dialog"], section, div');
    };
    const activeDialog = () => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-automation-id*="modal" i], .modal'))
        .filter(visible)
        .filter((element) => Array.from(element.querySelectorAll('input, textarea')).some(visible))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return {
            element,
            score: (Number.parseInt(style.zIndex || '0', 10) || 0) + Math.round(rect.width * rect.height / 1000),
          };
        })
        .sort((left, right) => right.score - left.score);
      return dialogs[0]?.element || null;
    };
    const modal = activeDialog();
    const scoreFor = (node, descriptor) => {
      const container = accountContainer(node);
      const text = normalize(container?.textContent || '');
      let score = 0;
      if (patterns.some((pattern) => descriptor.includes(pattern))) score += 50;
      if (typeMode === 'email_or_text' && /\bemail\b/.test(descriptor)) score += 30;
      if (typeMode === 'email_or_text' && descriptor.includes('username')) score += 20;
      if (modal) score += modal.contains(node) ? 100 : -100;
      if (accountIntent === 'sign_in') {
        if (/(^|\s)(sign in|log in|login)(\s|$)/.test(text)) score += 25;
        if (/forgot password/.test(text)) score += 15;
        if (/verify new password|confirm password|re-enter password/.test(text)) score -= 30;
        if (/create account|register|sign up/.test(text) && !/forgot password/.test(text)) score -= 8;
      }
      if (accountIntent === 'create') {
        if (/create account|register|sign up/.test(text)) score += 25;
        if (/verify new password|confirm password|re-enter password/.test(text)) score += 12;
      }
      return score;
    };
    let best = { index: -1, score: -1 };
    nodes.forEach((node, index) => {
      if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || !visible(node)) return false;
      const type = normalize(node.getAttribute('type') || node.type || '');
      if (typeMode === 'email_or_text' && !['email', 'text', ''].includes(type)) return false;
      if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(type)) return false;
      const descriptor = labelFor(node);
      const score = scoreFor(node, descriptor);
      if (score > best.score) best = { index, score };
    });
    return best.score >= 50 ? best.index : -1;
  }, { intent: options.intent, patterns: labelPatterns, typeMode: options.type }).catch(() => -1);
  if (!Number.isInteger(index) || index < 0) return false;
  const locator = page.locator('input, textarea').nth(index);
  await locator.fill(String(value));
  await locator.evaluate((element) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }).catch(() => null);
  const committed = await locator.inputValue().catch(() => '');
  return clean(committed) === clean(value);
}

async function fillAccountEmailDirect(page, email, { intent = '' } = {}) {
  if (!email || !page?.locator) return false;
  const inputs = page.locator('input, textarea');
  const index = await inputs.evaluateAll((nodes, args) => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element) => {
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      const wrapped = element.closest('label');
      const ancestors = [];
      let current = element.parentElement;
      for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
        ancestors.push(current.textContent);
      }
      return normalize([
        explicit?.textContent,
        wrapped?.textContent,
        element.getAttribute('autocomplete'),
        element.getAttribute('aria-label'),
        element.getAttribute('placeholder'),
        element.getAttribute('name'),
        element.id,
        ...ancestors,
      ].filter(Boolean).join(' '));
    };
    const accountIntent = normalize(args.intent || '');
    let best = { index: -1, score: 0 };
    nodes.forEach((node, index) => {
      if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || !visible(node)) return;
      const type = normalize(node.getAttribute('type') || node.type || '');
      if (!['email', 'text', ''].includes(type)) return;
      if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(type)) return;
      const descriptor = labelFor(node);
      let score = 0;
      if (/\bemail(?: address)?\b/.test(descriptor)) score += 100;
      if (/\buser(?:name| name)\b/.test(descriptor)) score += 60;
      if (type === 'email') score += 40;
      if (/create account|register|sign up/.test(descriptor) && accountIntent === 'create') score += 20;
      if (/(^|\s)(sign in|log in|login)(\s|$)/.test(descriptor) && accountIntent === 'sign_in') score += 20;
      if (/search|keyword|location|job alert/.test(descriptor)) score -= 80;
      if (score > best.score) best = { index, score };
    });
    return best.score >= 80 ? best.index : -1;
  }, { intent }).catch(() => -1);
  if (!Number.isInteger(index) || index < 0) return false;
  const locator = inputs.nth(index);
  await locator.fill(String(email));
  await locator.evaluate((element) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }).catch(() => null);
  const committed = await locator.inputValue().catch(() => '');
  return clean(committed) === clean(email);
}

async function fillAccountPassword(page, password, { intent = '', verify = false } = {}) {
  if (!password) return false;
  if (typeof page.fillAccountPassword === 'function') return Boolean(await page.fillAccountPassword(password, { intent, verify }));
  if (!page?.locator) return false;
  const passwords = page.locator('input[type="password"]');
  const count = await locatorCount(passwords);
  if (!count) return false;
  if (intent === 'sign_in') {
    const signInIndex = await passwords.evaluateAll((nodes) => {
      const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const accountContainer = (element) => {
        let best = null;
        let current = element.parentElement;
        for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
          const text = normalize(current.textContent);
          const hasAccountAction = /sign in|log in|login|create account|register|sign up/.test(text);
          if (hasAccountAction) {
            best = current;
            break;
          }
        }
        return best || element.closest('form, [role="dialog"], section, div');
      };
      const activeDialog = () => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-automation-id*="modal" i], .modal'))
          .filter(visible)
          .filter((element) => Array.from(element.querySelectorAll('input[type="password"]')).some(visible))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return {
              element,
              score: (Number.parseInt(style.zIndex || '0', 10) || 0) + Math.round(rect.width * rect.height / 1000),
            };
          })
          .sort((left, right) => right.score - left.score);
        return dialogs[0]?.element || null;
      };
      const modal = activeDialog();
      let best = { index: -1, score: -1 };
      nodes.forEach((node, index) => {
        if (!(node instanceof HTMLInputElement) || !visible(node)) return;
        const containerText = normalize(accountContainer(node)?.textContent || '');
        const ownText = normalize([
          node.getAttribute('aria-label'),
          node.getAttribute('placeholder'),
          node.getAttribute('name'),
          node.id,
        ].filter(Boolean).join(' '));
        let score = 10;
        if (modal) score += modal.contains(node) ? 100 : -100;
        if (/(^|\s)(sign in|log in|login)(\s|$)/.test(containerText)) score += 30;
        if (/forgot password/.test(containerText)) score += 15;
        if (/verify new password|confirm password|re-enter password/.test(`${containerText} ${ownText}`)) score -= 40;
        if (/create account|register|sign up/.test(containerText) && !/forgot password/.test(containerText)) score -= 8;
        if (score > best.score) best = { index, score };
      });
      return best.index;
    }).catch(() => -1);
    if (Number.isInteger(signInIndex) && signInIndex >= 0) {
      if (await fillPasswordLocator(passwords.nth(signInIndex), password)) return true;
      const visiblePassword = page.locator('input[type="password"]:visible').first();
      if (await locatorCount(visiblePassword) && await fillPasswordLocator(visiblePassword, password)) return true;
    }
  }
  const visibleIndexes = await passwords.evaluateAll((nodes) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    return nodes
      .map((node, index) => node instanceof HTMLInputElement && visible(node) ? index : -1)
      .filter((index) => index >= 0);
  }).catch(() => []);
  const targetIndexes = (Array.isArray(visibleIndexes) ? visibleIndexes : []).slice(0, verify ? 2 : 1);
  if (!targetIndexes.length) return false;
  if (verify && targetIndexes.length < 2) return false;
  for (const index of targetIndexes) {
    if (!await fillPasswordLocator(passwords.nth(index), password)) return false;
  }
  const values = await Promise.all(targetIndexes.map((index) => passwords.nth(index).inputValue().catch(() => '')));
  return values.every((value) => clean(value) === clean(password));
}

async function fillPasswordLocator(locator, password) {
  if (!locator || !await locatorCount(locator)) return false;
  await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
  const visible = await locator.evaluate((element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  }).catch(() => false);
  if (!visible) return false;
  await locator.fill(String(password));
  await locator.evaluate((element) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }).catch(() => null);
  const committed = await locator.inputValue().catch(() => '');
  return clean(committed) === clean(password);
}

async function hasVisiblePasswordField(page) {
  if (typeof page.hasVisiblePasswordField === 'function') return Boolean(await page.hasVisiblePasswordField());
  if (!page?.locator) return false;
  return (await locatorCount(page.locator('input[type="password"]'))) > 0;
}

async function maybeCloseInputlessAccountChoiceOverlay(page) {
  if (!page || typeof page.evaluate !== 'function') return false;
  return Boolean(await page.evaluate(() => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const accountFormVisible = Array.from(document.querySelectorAll('input[type="password"]')).some(visible)
      && Array.from(document.querySelectorAll('input, textarea')).some((element) => {
        if (!visible(element)) return false;
        const text = normalize([
          element.getAttribute('autocomplete'),
          element.getAttribute('aria-label'),
          element.getAttribute('placeholder'),
          element.getAttribute('name'),
          element.id,
          element.closest('label')?.textContent,
          element.parentElement?.textContent,
        ].filter(Boolean).join(' '));
        return /email|username|user name/.test(text);
      });
    if (!accountFormVisible) return false;
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-automation-id*="modal" i], .modal'))
      .filter(visible)
      .filter((element) => !Array.from(element.querySelectorAll('input, textarea')).some(visible))
      .filter((element) => /sign in with email|sign in with google|sign in with linkedin/.test(normalize(element.textContent)));
    for (const dialog of dialogs) {
      const close = Array.from(dialog.querySelectorAll('button, [role="button"], a'))
        .filter(visible)
        .find((element) => /^(close|x|×)$/i.test(String(element.textContent || element.getAttribute('aria-label') || '').trim()));
      if (close instanceof HTMLElement) {
        close.click();
        return true;
      }
    }
    return false;
  }).catch(() => false));
}

async function hasVisibleInputAccountDialog(page) {
  if (!page?.locator) return false;
  return Boolean(await page.locator('[role="dialog"], [aria-modal="true"], [data-automation-id*="modal" i], .modal').evaluateAll((nodes) => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    return nodes.some((node) => {
      if (!(node instanceof HTMLElement) || !visible(node)) return false;
      const text = normalize(node.textContent);
      const hasPassword = Array.from(node.querySelectorAll('input[type="password"]')).some(visible);
      const hasEmail = Array.from(node.querySelectorAll('input, textarea')).some((element) => {
        if (!visible(element)) return false;
        const descriptor = normalize([
          element.getAttribute('autocomplete'),
          element.getAttribute('aria-label'),
          element.getAttribute('placeholder'),
          element.getAttribute('name'),
          element.id,
          element.closest('label')?.textContent,
          element.parentElement?.textContent,
        ].filter(Boolean).join(' '));
        return /email|username|user name/.test(descriptor);
      });
      return hasPassword && hasEmail && /sign in|log in|login/.test(text);
    });
  }).catch(() => false));
}

async function clickAccountFormAction(page, label) {
  if (await clickExactVisibleWorkdayControl(page, label)) return true;
  if (typeof page.clickAccountFormAction === 'function') return Boolean(await page.clickAccountFormAction(label));
  if (page?.locator) {
    const selector = 'button, input[type="button"], input[type="submit"], [role="button"], a';
    const controls = page.locator(selector);
    const index = await controls.evaluateAll((nodes, targetLabel) => {
      const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const exact = normalize(targetLabel);
      const accountContainerScore = (control) => {
        let current = control.parentElement;
        for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
          const hasPassword = Array.from(current.querySelectorAll('input[type="password"]')).some(visible);
          const hasEmail = Array.from(current.querySelectorAll('input, textarea')).some((element) => {
            if (!visible(element)) return false;
            const text = normalize([
              element.getAttribute('autocomplete'),
              element.getAttribute('aria-label'),
              element.getAttribute('placeholder'),
              element.getAttribute('name'),
              element.id,
              element.closest('label')?.textContent,
              element.parentElement?.textContent,
            ].filter(Boolean).join(' '));
            return /email|username|user name/.test(text);
          });
          if (hasPassword && hasEmail) return 100 - depth;
        }
        return 0;
      };
      const controls = Array.from(nodes)
        .filter(visible)
        .map((element) => {
          const label = normalize(element.textContent || element.getAttribute('value') || element.getAttribute('aria-label'));
          return { element, label, score: label === exact ? accountContainerScore(element) : 0 };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score);
      const target = controls[0]?.element;
      return target ? nodes.indexOf(target) : -1;
    }, label).catch(() => -1);
    if (Number.isInteger(index) && index >= 0 && await clickWorkdayLocator(controls.nth(index), { forceFallback: true })) return true;
  }
  return await clickWorkdayAction(page, label);
}

async function waitForVisiblePasswordField(page, timeoutMs = 8000) {
  if (await hasVisiblePasswordField(page)) return true;
  if (typeof page?.waitForSelector === 'function') {
    await page.waitForSelector('input[type="password"]:visible', { timeout: timeoutMs }).catch(() => null);
    return await hasVisiblePasswordField(page);
  }
  const attempts = Math.max(1, Math.ceil(timeoutMs / 1000));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await waitForTimeout(page, 1000);
    if (await hasVisiblePasswordField(page)) return true;
  }
  return false;
}

async function hasMultipleVisiblePasswordFields(page) {
  if (typeof page.visiblePasswordFieldCount === 'function') return Number(await page.visiblePasswordFieldCount()) > 1;
  if (!page?.locator) return false;
  return (await locatorCount(page.locator('input[type="password"]'))) > 1;
}

async function acceptOrdinaryAccountAcknowledgements(page) {
  if (typeof page.acceptOrdinaryAccountAcknowledgements === 'function') return await page.acceptOrdinaryAccountAcknowledgements();
  if (!page?.locator) return [];
  const accepted = await page.locator('input[type="checkbox"]').evaluateAll((nodes) => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element) => {
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      const wrapped = element.closest('label');
      const container = element.closest('[data-automation-id], fieldset, section, div');
      return normalize([explicit?.textContent, wrapped?.textContent, container?.textContent, element.getAttribute('aria-label')].filter(Boolean).join(' '));
    };
    const allowed = /privacy|terms|conditions|notice|acknowledge|acknowledgement|agreement|electronic communication|data processing/i;
    const labels = [];
    for (const node of nodes) {
      if (!(node instanceof HTMLInputElement) || !visible(node) || node.checked) continue;
      const label = labelFor(node);
      if (!allowed.test(label)) continue;
      node.click();
      labels.push(label.slice(0, 160));
    }
    return labels;
  }).catch(() => []);
  return Array.isArray(accepted) ? accepted.map(clean).filter(Boolean) : [];
}

async function reportCanaryStop(runtime, task, policy, reason, details = {}) {
  await runtime.report({
    status: 'canary_stopped',
    currentUrl: task.applicationUrl,
    evidenceText: reason,
    details: {
      classification: 'workday_canary_gate',
      outcomeStatus: 'canary_stopped',
      policyMode: policy.mode,
      workdayCanary: details,
      decisionQueue: [
        createProductionDecisionQueueItem({
          ats: 'workday',
          category: 'unknown',
          confidence: 0.96,
          fieldLabel: 'Workday canary gate',
          reason,
          requiredAction: 'Configure exactly one Workday canary id and URL before running the browser companion.',
          resumePoint: 'Rerun only after the Workday canary configuration matches this application.',
          sensitivity: 'operational',
          task,
          url: task.applicationUrl,
        }),
      ],
    },
  });
}

async function reportUnsupportedState({ identity, inspection, page, reason, runtime, step, task }) {
  await runtime.report({
    status: 'unsupported_workday_state',
    currentUrl: currentUrl(page),
    evidenceText: reason,
    screenshotPath: await safeShot(runtime, `workday-unsupported-state-${step}`),
    details: {
      classification: 'workday_unsupported_state',
      outcomeStatus: 'unsupported_workday_state',
      step,
      surface: publicInspection(inspection),
      workdayIdentity: identity.ok ? publicIdentity(identity) : null,
      decisionQueue: [
        createProductionDecisionQueueItem({
          ats: 'workday',
          category: 'unknown',
          confidence: 0.72,
          fieldLabel: 'Workday page state',
          reason,
          requiredAction: 'Inspect this Workday page manually before extending automation.',
          resumePoint: 'Resume only after this page state has explicit production support.',
          sensitivity: 'operational',
          task,
          tenant: identity.ok ? identity.tenant : '',
          url: currentUrl(page),
        }),
      ],
    },
  });
}

function decisionItemForResolution({ gate, identity, policy, task, url }) {
  const resolution = gate.resolution;
  return createProductionDecisionQueueItem({
    ats: 'workday',
    category: resolution.category || 'unknown',
    confidence: resolution.confidence || 0.5,
    fieldLabel: publicFieldLabel(gate.field),
    proposedAllowedAnswer: null,
    provenance: {
      source: 'workday_answer_bank',
      status: resolution.status || 'gated',
      canonicalField: resolution.canonicalField || '',
    },
    reason: resolution.reason,
    requiredAction: 'Provide an application-specific answer or complete this Workday field manually.',
    resumePoint: 'Resume this exact Workday canary after Tomas supplies the required decision.',
    routing: policy.details?.routing,
    sensitivity: resolution.sensitivity || 'unknown',
    task,
    tenant: identity.ok ? identity.tenant : '',
    url,
  });
}

function enabledActions(inspection, pattern) {
  return (inspection.actions || []).filter((action) => action.enabled !== false && pattern.test(clean(action.label)));
}

async function isWorkdayReviewStep(page) {
  if (!page?.evaluate) return false;
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    return Array.from(document.querySelectorAll('h1, h2, h3, [data-automation-id*="pageHeader" i], [data-automation-id*="stepTitle" i]'))
      .some((element) => visible(element) && /^review$/i.test(normalize(element.textContent)));
  }).catch(() => false);
}

async function clickWorkdayAction(page, label) {
  const text = clean(label);
  if (!text) return false;
  if (!page?.locator && typeof page?.getByRole !== 'function') {
    return typeof page?.clickActionLabel === 'function'
      ? Boolean(await page.clickActionLabel(text))
      : false;
  }
  if (/^apply(?: now)?$/i.test(text) && page?.locator) {
    const workdayApply = page.locator('[data-automation-id="jobPostingApplyButton"]').first();
    if (await clickWorkdayLocator(workdayApply)) return true;
  }
  if (await clickExactVisibleWorkdayControl(page, text)) return true;
  if (typeof page.clickActionLabel === 'function') return Boolean(await page.clickActionLabel(text));
  const escaped = escapeRegExp(text);
  const pattern = new RegExp(`^\\s*${escaped}\\s*$`, 'i');
  if (typeof page.getByRole === 'function') {
    const roleControl = page.getByRole('button', { name: pattern }).first();
    if (await clickWorkdayLocator(roleControl)) return true;
  }
  if (!page?.locator) return false;
  const control = page.locator('button, input[type="button"], input[type="submit"], a, [role="button"]').filter({ hasText: pattern }).first();
  if (await clickWorkdayLocator(control, { forceFallback: true })) return true;
  if (/^(autofill with resume|apply manually|use my last application)$/i.test(text) && typeof page.getByText === 'function') {
    const exactText = page.getByText(text, { exact: true }).first();
    if (await clickWorkdayLocator(exactText, { forceFallback: true })) return true;
  }
  return await clickWorkdayTextControl(page, text);
}

async function clickExactVisibleWorkdayControl(page, label) {
  if (!page?.locator) return false;
  const controls = page.locator('button, input[type="button"], input[type="submit"], a, [role="button"]');
  const index = await controls.evaluateAll((nodes, targetLabel) => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const target = normalize(targetLabel);
    let best = { index: -1, score: 0 };
    nodes.forEach((node, nodeIndex) => {
      if (!(node instanceof HTMLElement) || !visible(node)) return;
      const label = normalize([
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.getAttribute('value'),
        node.textContent,
      ].filter(Boolean).join(' '));
      if (label !== target) return;
      let score = 10;
      const tag = node.tagName.toLowerCase();
      if (tag === 'button') score += 40;
      if (node.getAttribute('role') === 'button') score += 30;
      const dialog = node.closest('[role="dialog"], [aria-modal="true"], [data-automation-id*="modal" i], .modal');
      if (dialog instanceof HTMLElement && visible(dialog)) score += 100;
      if (node.getAttribute('type') === 'submit') score += 15;
      if (score > best.score) best = { index: nodeIndex, score };
    });
    return best.index;
  }, label).catch(() => -1);
  if (!Number.isInteger(index) || index < 0) return false;
  return await clickWorkdayLocator(controls.nth(index), { forceFallback: true });
}

async function clickWorkdayLocator(locator, options = {}) {
  if (!locator) return false;
  const target = typeof locator.first === 'function' ? locator.first() : locator;
  if (!await locatorCount(target)) return false;
  try {
    await target.click();
    return true;
  } catch {
    if (options.forceFallback) {
      try {
        await target.click({ force: true });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

async function clickWorkdayTextControl(page, label) {
  if (!page?.locator) return false;
  const controls = page.locator('button, input[type="button"], input[type="submit"], a, [role="button"], [tabindex], [data-automation-id]');
  const index = await controls.evaluateAll((nodes, targetLabel) => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const target = normalize(targetLabel);
    const actionish = (element) => {
      const tag = element.tagName.toLowerCase();
      return ['button', 'a'].includes(tag)
        || element.getAttribute('role') === 'button'
        || element.hasAttribute('tabindex')
        || /button|link|radio|checkbox|prompt|select|option|card|tile/i.test(element.getAttribute('data-automation-id') || '');
    };
    let best = { index: -1, score: 0 };
    nodes.forEach((node, index) => {
      if (!(node instanceof HTMLElement) || !visible(node) || !actionish(node)) return;
      const own = normalize([
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.getAttribute('value'),
        node.textContent,
      ].filter(Boolean).join(' '));
      if (own !== target) return;
      let score = 10;
      const tag = node.tagName.toLowerCase();
      if (tag === 'button') score += 50;
      if (node.getAttribute('role') === 'button') score += 45;
      if (node.hasAttribute('tabindex')) score += 20;
      if (/button|prompt|select|option|card|tile/i.test(node.getAttribute('data-automation-id') || '')) score += 20;
      if (score > best.score) best = { index, score };
    });
    return best.index;
  }, label).catch(() => -1);
  if (!Number.isInteger(index) || index < 0) return false;
  if (await clickWorkdayLocator(controls.nth(index), { forceFallback: true })) return true;
  return Boolean(await controls.evaluateAll((nodes, targetLabel) => {
    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const target = normalize(targetLabel);
    const matches = Array.from(nodes)
      .filter((node) => node instanceof HTMLElement && visible(node))
      .filter((node) => normalize([
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.getAttribute('value'),
        node.textContent,
      ].filter(Boolean).join(' ')) === target);
    const candidate = matches[0];
    if (!(candidate instanceof HTMLElement)) return false;
    candidate.click();
    return true;
  }, label).catch(() => false));
}

function normalizeInspection(inspection) {
  return {
    actions: Array.isArray(inspection?.actions) ? inspection.actions.map((action) => ({
      enabled: action.enabled !== false,
      label: clean(action.label),
      tagName: clean(action.tagName),
      type: clean(action.type),
    })).filter((action) => action.label) : [],
    errors: Array.isArray(inspection?.errors) ? inspection.errors.map(clean).filter(Boolean) : [],
    fields: Array.isArray(inspection?.fields) ? inspection.fields.map((field) => ({
      ariaLabel: clean(field.ariaLabel),
      currentValue: clean(field.currentValue),
      filled: Boolean(field.filled || clean(field.currentValue)),
      id: clean(field.id),
      label: clean(field.label),
      name: clean(field.name),
      options: Array.isArray(field.options) ? field.options.map((option) => ({
        label: clean(option.label),
        value: clean(option.value),
      })) : [],
      placeholder: clean(field.placeholder),
      required: Boolean(field.required),
      role: clean(field.role),
      tagName: clean(field.tagName),
      type: clean(field.type),
    })).filter((field) => field.label || field.id || field.name || field.ariaLabel) : [],
  };
}

function publicInspection(inspection) {
  return {
    actions: (inspection.actions || []).map((action) => ({ enabled: action.enabled, label: action.label })).slice(0, 20),
    errors: inspection.errors || [],
    fields: (inspection.fields || []).map((field) => ({
      filled: Boolean(field.filled || clean(field.currentValue)),
      label: publicFieldLabel(field),
      required: Boolean(field.required),
      tagName: field.tagName,
      type: field.type,
    })).slice(0, 40),
  };
}

function publicGate(gate) {
  return {
    canonicalField: clean(gate.resolution.canonicalField),
    fieldLabel: publicFieldLabel(gate.field),
    reason: clean(gate.resolution.reason),
    sensitivity: clean(gate.resolution.sensitivity),
    status: clean(gate.resolution.status),
  };
}

function publicFieldLabel(field) {
  return clean(field.label || field.ariaLabel || field.placeholder || field.name || field.id || 'Unknown field');
}

function publicIdentity(identity) {
  return {
    host: clean(identity.host),
    jobId: clean(identity.jobId),
    tenant: clean(identity.tenant),
    vendor: clean(identity.vendor),
  };
}

function sameWorkdayJob(left, right) {
  return clean(left?.tenant).toLowerCase() === clean(right?.tenant).toLowerCase()
    && clean(left?.jobId).toLowerCase() === clean(right?.jobId).toLowerCase();
}

function parseWorkdayTenant(host) {
  if (/careers\.cisco\.com$/i.test(host)) return 'cisco';
  if (/myworkdayjobs\.com$/i.test(host)) return host.replace(/\.myworkdayjobs\.com$/i, '');
  return host.split('.')[0] || host;
}

function parsePathJobId(pathname) {
  const segments = decodeURIComponent(clean(pathname)).split('/').map(clean).filter(Boolean);
  const jobIndex = segments.findIndex((segment) => segment.toLowerCase() === 'job');
  const jobSegments = jobIndex >= 0 ? segments.slice(jobIndex + 1) : segments;
  const actionIndex = jobSegments.findIndex((segment) => /^(apply|usemylastapplication|autofillwithresume|manual)$/i.test(segment));
  const identitySegments = actionIndex >= 0 ? jobSegments.slice(0, actionIndex) : jobSegments;
  const candidate = identitySegments.slice().reverse().find((segment) => !/^(en-us|external|apply|job)$/i.test(segment));
  if (!candidate || /^(en-us|external|apply|job)$/i.test(candidate)) return '';
  return clean(candidate.match(/[_-]([A-Z]*\d[A-Z0-9-]*)$/i)?.[1] || candidate);
}

function labels(items = []) {
  return items.map((item) => clean(item.label)).filter(Boolean);
}

async function bodyText(page) {
  if (!page || typeof page.textContent !== 'function') return '';
  return clean(await page.textContent('body').catch(() => ''));
}

function currentUrl(page) {
  try {
    return clean(typeof page?.url === 'function' ? page.url() : '');
  } catch {
    return '';
  }
}

async function waitForTimeout(page, ms) {
  if (page && typeof page.waitForTimeout === 'function') await page.waitForTimeout(ms);
}

async function takeShot(runtime, label) {
  if (runtime && typeof runtime.takeShot === 'function') return runtime.takeShot(label);
  return '';
}

async function safeShot(runtime, label) {
  if (runtime && typeof runtime.safeShot === 'function') return runtime.safeShot(label);
  if (runtime && typeof runtime.takeShot === 'function') {
    try {
      return await runtime.takeShot(label);
    } catch {
      return '';
    }
  }
  return '';
}

async function detectRuntimeHumanGate(runtime) {
  if (runtime && typeof runtime.detectCommonHumanGate === 'function') return Boolean(await runtime.detectCommonHumanGate());
  return false;
}

async function locatorCount(locator) {
  if (!locator || typeof locator.count !== 'function') return 0;
  return Number(await locator.count().catch(() => 0)) || 0;
}

function evidenceForClassification(classification) {
  const map = {
    account_creation_required: 'Workday requires account creation or account selection before continuing.',
    captcha: 'Workday presented CAPTCHA or bot verification.',
    email_code_required: 'Workday requires an email or security code before continuing.',
    email_verification_required: 'Workday requires email verification before continuing.',
    expired_job: 'Workday indicates the job is expired or no longer accepting applications.',
    password_rejected_or_account_locked: 'Workday rejected the stored credential or indicated the account may be locked.',
    session_expired: 'Workday session expired; Tomas must sign in again before resuming.',
    sign_in_required: 'Workday requires sign-in before continuing.',
  };
  return map[classification.state] || 'Workday reached a human-controlled gate.';
}

function fieldLabelForClassification(classification) {
  const map = {
    account_creation_required: 'Workday account',
    captcha: 'CAPTCHA',
    email_code_required: 'Email code',
    email_verification_required: 'Email verification',
    expired_job: 'Job availability',
    password_rejected_or_account_locked: 'Workday account recovery',
    session_expired: 'Workday session',
    sign_in_required: 'Workday sign-in',
  };
  return map[classification.state] || 'Workday page';
}

function requiredActionForClassification(classification) {
  const map = {
    account_creation_required: 'Create or sign into the employer Workday account, then resume the single canary.',
    captcha: 'Complete CAPTCHA manually in the controlled browser, then resume the canary.',
    email_code_required: 'Enter the employer email code manually, then resume the canary.',
    email_verification_required: 'Complete the employer email verification, then resume the canary.',
    expired_job: 'Do not run this canary; mark the application inactive or select a fresh Workday URL.',
    password_rejected_or_account_locked: 'Complete password reset or account unlock, then resume the exact canary.',
    session_expired: 'Sign into Workday again, then resume the exact canary.',
    sign_in_required: 'Sign into the employer Workday account, then resume the exact canary.',
  };
  return map[classification.state] || 'Review this Workday page manually.';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clean(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}

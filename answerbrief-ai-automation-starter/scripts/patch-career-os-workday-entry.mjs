#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const runtimeRoot = process.argv[2]
  || process.env.CAREER_OS_RUNTIME
  || path.join(process.env.HOME || '', 'Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter');
const target = path.join(runtimeRoot, 'scripts/lib/career-os-ats-adapters.mjs');
const markerV1 = 'CAREER_OS_WORKDAY_ENTRY_FLOW_V1';
const markerV2 = 'CAREER_OS_WORKDAY_ENTRY_FLOW_V2';

if (!fs.existsSync(target)) {
  throw new Error(`Career OS ATS adapter not found: ${target}`);
}

let source = fs.readFileSync(target, 'utf8');
if (source.includes(markerV2)) {
  console.log(`Workday entry-flow V2 patch already present in ${target}`);
  process.exit(0);
}

const helperAnchor = 'async function maybeUploadWorkdayResume(page, task, runtime) {';
const helper = `// ${markerV2}
async function workdayApplicationFormVisible(page) {
  const text = await bodyText(page);
  if (/you are applying for|my information|my experience|application questions|voluntary disclosures|review your application/i.test(text)) return true;
  const signals = [
    'input[type="file"]',
    '[data-automation-id="legalNameSection"]',
    '[data-automation-id="contactInformationSection"]',
    '[data-automation-id="workExperienceSection"]',
    '[data-automation-id="educationSection"]',
  ];
  for (const selector of signals) {
    if (await page.locator(selector).first().count().catch(() => 0)) return true;
  }
  return false;
}

async function workdayProgressFingerprint(page) {
  const text = (await bodyText(page)).replace(/\\s+/g, ' ').trim().slice(0, 1200);
  return JSON.stringify({ url: page.url(), text });
}

async function clickExactWorkdayEntryChoice(page, pattern) {
  const candidates = [
    page.getByRole('button', { name: pattern, exact: true }).first(),
    page.getByRole('link', { name: pattern, exact: true }).first(),
    page.locator('[data-automation-id="applyManually"], [data-automation-id="autofillWithResume"]').filter({ hasText: pattern }).first(),
    page.locator('button, a, [role="button"]').filter({ hasText: pattern }).first(),
  ];
  for (const locator of candidates) {
    if (!await locator.count().catch(() => 0)) continue;
    if (!await locator.isVisible().catch(() => false)) continue;
    if (!await locator.isEnabled().catch(() => false)) continue;
    const label = (await locator.textContent().catch(() => ''))?.replace(/\\s+/g, ' ').trim() || String(pattern);
    await locator.click({ timeout: 10000 }).catch(() => null);
    return { clicked: true, selectorType: 'workday_exact_accessible', selectorValue: label };
  }
  return { clicked: false, reason: 'No exact Workday entry choice was clickable.' };
}

async function waitForWorkdayEntryProgress(page, beforeFingerprint, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(500);
    if (await workdayApplicationFormVisible(page)) return true;
    const current = await workdayProgressFingerprint(page);
    if (current !== beforeFingerprint && /my information|my experience|application questions|upload.*resume|you are applying for/i.test(current)) return true;
  }
  return false;
}

async function maybeOpenWorkdayApplication(page, task, runtime) {
  if (await workdayApplicationFormVisible(page)) return true;

  const choices = [
    { pattern: /^apply manually$/i, label: 'Apply Manually' },
    { pattern: /autofill with resume/i, label: 'Autofill with Resume' },
    { pattern: /^start application$/i, label: 'Start Application' },
    { pattern: /^apply now$/i, label: 'Apply Now' },
    { pattern: /^apply$/i, label: 'Apply' },
  ];

  for (const choice of choices) {
    const beforeFingerprint = await workdayProgressFingerprint(page);
    let result = await clickExactWorkdayEntryChoice(page, choice.pattern);
    if (!result.clicked) result = await clickSubmitControl(page, [choice.pattern]);
    if (!result.clicked) continue;

    await runtime.report({
      status: 'heartbeat',
      currentUrl: page.url(),
      evidenceText: \`Advanced Workday entry flow using \${result.selectorType}: \${result.selectorValue}.\`,
      details: {
        classification: 'workday_entry_transition',
        preferredChoice: choice.label,
        selectorType: result.selectorType,
        selectorValue: result.selectorValue,
      },
    });

    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);
    if (await waitForWorkdayEntryProgress(page, beforeFingerprint)) return true;

    await runtime.report({
      status: 'heartbeat',
      currentUrl: page.url(),
      evidenceText: \`Workday entry choice \${choice.label} was clicked but no recognized application progress followed.\`,
      screenshotPath: await runtime.safeShot(\`workday-entry-no-progress-\${choice.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}\`),
      details: { classification: 'workday_entry_no_progress', attemptedChoice: choice.label },
    });
  }

  return workdayApplicationFormVisible(page);
}

`;

if (!source.includes(helperAnchor)) {
  throw new Error(`Patch anchor missing: ${helperAnchor}`);
}

if (source.includes(markerV1)) {
  const start = source.indexOf(`// ${markerV1}`);
  const end = source.indexOf(helperAnchor, start);
  if (start < 0 || end < 0) throw new Error('Could not locate existing Workday entry-flow V1 helper block.');
  source = `${source.slice(0, start)}${helper}${source.slice(end)}`;
} else {
  source = source.replace(helperAnchor, `${helper}${helperAnchor}`);
}

const executeAnchor = `    if (await runtime.detectCommonHumanGate()) return true;\n    if (await detectWorkdayAccountGate(page, task, runtime)) return true;\n\n    for (let step = 1; step <= 8; step += 1) {`;
const executeReplacement = `    if (await runtime.detectCommonHumanGate()) return true;\n\n    const workdayEntryOpened = await maybeOpenWorkdayApplication(page, task, runtime);\n    if (await runtime.detectCommonHumanGate()) return true;\n    if (await detectWorkdayAccountGate(page, task, runtime)) return true;\n    if (!workdayEntryOpened) {\n      await runtime.report({\n        status: 'blocked_technical',\n        currentUrl: page.url(),\n        evidenceText: 'Workday adapter could not advance from the public job or start-application screen into the application form.',\n        screenshotPath: await runtime.safeShot('workday-entry-not-opened'),\n        details: { classification: 'workday_entry_transition' },\n      });\n      return true;\n    }\n\n    await runtime.takeShot('workday-application-opened');\n\n    for (let step = 1; step <= 12; step += 1) {`;

if (source.includes(executeAnchor)) {
  source = source.replace(executeAnchor, executeReplacement);
} else {
  source = source.replace('for (let step = 1; step <= 8; step += 1) {', 'for (let step = 1; step <= 12; step += 1) {');
}

const oldAccountGate = `async function detectWorkdayAccountGate(page, task, runtime) {\n  const text = await bodyText(page);\n  if (!/sign in|login|create account|create an account|forgot password/i.test(text)) return false;\n  if (/you are applying for|my information|my experience|application questions/i.test(text)) return false;\n  await runtime.report({\n    status: 'waiting_on_tomas',\n    currentUrl: page.url(),\n    evidenceText: 'Employer presented a Workday account or sign-in gate.',\n    screenshotPath: await runtime.safeShot('workday-account-gate'),\n  });\n  return true;\n}`;
const newAccountGate = `async function detectWorkdayAccountGate(page, task, runtime) {\n  const text = await bodyText(page);\n  if (/you are applying for|my information|my experience|application questions/i.test(text)) return false;\n\n  const checkpoint = /reset your password|password reset|forgot password/i.test(text)\n    ? 'password_reset'\n    : /verification code|verify your email|email verification|check your email/i.test(text)\n      ? 'email_verification'\n      : /multi-factor|two-factor|authentication code|security code/i.test(text)\n        ? 'mfa'\n        : /create account|create an account/i.test(text)\n          ? 'account_creation'\n          : /sign in|login/i.test(text)\n            ? 'sign_in'\n            : '';\n  if (!checkpoint) return false;\n\n  const messages = {\n    password_reset: 'Employer requires completion of a Workday password reset before automation can resume.',\n    email_verification: 'Employer requires Workday email verification before automation can resume.',\n    mfa: 'Employer requires Workday multi-factor authentication before automation can resume.',\n    account_creation: 'Employer requires a Workday account to be created before automation can resume.',\n    sign_in: 'Employer presented a Workday sign-in gate.',\n  };\n  await runtime.report({\n    status: 'waiting_on_tomas',\n    currentUrl: page.url(),\n    evidenceText: messages[checkpoint],\n    screenshotPath: await runtime.safeShot(\`workday-\${checkpoint.replace(/_/g, '-')}\`),\n    details: { classification: checkpoint, employer: task?.company || task?.employer || '' },\n  });\n  return true;\n}`;

if (source.includes(oldAccountGate)) {
  source = source.replace(oldAccountGate, newAccountGate);
}

const backup = `${target}.pre-workday-entry-v2-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
fs.copyFileSync(target, backup);
fs.writeFileSync(target, source, 'utf8');

console.log(`Patched Workday entry flow V2: ${target}`);
console.log(`Backup: ${backup}`);

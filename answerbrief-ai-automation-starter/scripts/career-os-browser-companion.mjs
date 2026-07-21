#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { detectVisibleCaptchaEvidence, getATSAdapter } from './lib/career-os-ats-adapters.mjs';

const root = process.cwd();
const companionId = clean(process.env.CAREER_OS_COMPANION_ID) || `${os.hostname()}-career-os-companion`;
const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
const baseUrl = clean(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000');
const workerToken = clean(process.env.CAREER_OS_BROWSER_WORKER_TOKEN);
const stateDir = path.join(root, '.career-os-browser-worker');
const userDataDir = path.join(stateDir, 'chrome-profile');
const screenshotDir = path.join(stateDir, 'screenshots');
const tempDir = path.join(stateDir, 'tmp');
const pollIntervalMs = Number(process.env.CAREER_OS_WORKER_POLL_MS || '15000');

for (const dir of [stateDir, userDataDir, screenshotDir, tempDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const mode = process.argv[2] || 'start';

if (!workerToken) {
  console.error('CAREER_OS_BROWSER_WORKER_TOKEN is required.');
  process.exit(1);
}

if (mode === 'pair') {
  await printPairingStatus();
  process.exit(0);
}

if (mode === 'health') {
  await printHealth();
  process.exit(0);
}

if (mode === 'run-once') {
  const claimed = await claimAndRunTask();
  console.log(JSON.stringify({ claimed }, null, 2));
  process.exit(0);
}

if (mode === 'start') {
  while (true) {
    try {
      await claimAndRunTask();
    } catch (error) {
      console.error(`[worker] loop error: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    }
    await delay(pollIntervalMs);
  }
}

console.error(`Unsupported mode: ${mode}`);
process.exit(1);

async function printPairingStatus() {
  const health = await workerGet('/api/career-os/worker/health');
  console.log(JSON.stringify({
    baseUrl,
    companionId,
    configured: health.configured,
    eligible: health.eligible,
    running: health.running,
  }, null, 2));
}

async function printHealth() {
  const health = await workerGet('/api/career-os/worker/health');
  console.log(JSON.stringify({
    baseUrl,
    companionId,
    stateDir,
    ...health,
  }, null, 2));
}

async function claimAndRunTask() {
  const claim = await workerPost('/api/career-os/worker/claim', {
    companionId,
    ownerEmail,
  });
  const task = claim.task;
  if (!task) {
    console.log('[worker] no task available');
    return false;
  }

  console.log(`[worker] claimed ${task.applicationId} ${task.employer} :: ${task.position}`);
  const adapter = getATSAdapter(task);
  if (!adapter) {
    await report(task, {
      status: 'blocked_technical',
      evidenceText: `Browser companion does not yet have an ATS adapter for platform ${task.platform}.`,
      details: { platform: task.platform },
    });
    return true;
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    acceptDownloads: true,
    headless: clean(process.env.CAREER_OS_PLAYWRIGHT_HEADLESS || 'true') !== 'false',
    viewport: { width: 1440, height: 1400 },
  });
  const page = context.pages()[0] || await context.newPage();

  try {
    await report(task, {
      status: 'heartbeat',
      evidenceText: `Detected ${adapter.id} adapter for ${task.employer}.`,
      details: { adapter: adapter.id, platform: task.platform },
    });
    await adapter.execute(page, task, {
      detectCommonHumanGate: () => detectHumanGate(page, task),
      ensureResumeFile: () => ensureResumeFile(task),
      fillByLabel: (labelPattern, value) => fillByLabel(page, labelPattern, value),
      report: (payload) => report(task, {
        ...payload,
        details: {
          adapter: adapter.id,
          ...(payload.details || {}),
        },
      }),
      assertSafeToSubmit: () => assertSafeToSubmit(task),
      safeShot: (label) => safeShot(page, task, label),
      selectValue: (labelPattern, value) => selectValue(page, labelPattern, value),
      takeShot: (label) => takeShot(page, task, label),
    });
    return true;
  } catch (error) {
    const screenshotPath = await safeShot(page, task, 'error');
    await report(task, {
      status: 'failed',
      currentUrl: page.url(),
      evidenceText: error instanceof Error ? error.message : String(error),
      screenshotPath,
    });
    return true;
  } finally {
    await context.close();
  }
}

async function fillByLabel(page, labelPattern, value) {
  if (!value) return;
  const label = page.locator('label').filter({ hasText: labelPattern }).first();
  if (!await label.count()) return;
  const forId = await label.getAttribute('for');
  if (forId) {
    const input = page.locator(`#${cssEscape(forId)}`).first();
    if (await input.count()) {
      await input.fill(String(value));
      return;
    }
  }
  const input = label.locator('input,textarea').first();
  if (await input.count()) {
    await input.fill(String(value));
  }
}

async function selectValue(page, labelPattern, value) {
  if (!value) return;
  const label = page.locator('label').filter({ hasText: labelPattern }).first();
  if (!await label.count()) return;
  const forId = await label.getAttribute('for');
  if (forId) {
    const select = page.locator(`#${cssEscape(forId)}`).first();
    if (await select.count()) {
      await select.selectOption({ label: String(value) }).catch(async () => {
        await select.selectOption({ value: String(value) }).catch(() => null);
      });
      return;
    }
  }

  const field = label.locator('select').first();
  if (await field.count()) {
    await field.selectOption({ label: String(value) }).catch(async () => {
      await field.selectOption({ value: String(value) }).catch(() => null);
    });
    return;
  }

  const radio = page.locator('label').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(String(value))}\\s*$`, 'i') }).locator('input[type="radio"],input[type="checkbox"]').first();
  if (await radio.count()) {
    await radio.check();
  }
}

async function detectHumanGate(page, task) {
  const currentUrl = page.url();
  const snapshot = await page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const selectorFor = (node) => {
      if (!(node instanceof HTMLElement)) return '';
      if (node.id) return `#${node.id}`;
      const className = String(node.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      return className ? `${node.tagName.toLowerCase()}.${className}` : node.tagName.toLowerCase();
    };
    const elements = Array.from(document.querySelectorAll('iframe, .g-recaptcha, .grecaptcha-badge, .h-captcha, [data-sitekey], [id*="captcha" i], [class*="captcha" i], [aria-label*="captcha" i], [title*="captcha" i], [title*="challenge" i]'))
      .map((node) => {
        if (!(node instanceof HTMLElement) || !visible(node)) return null;
        return {
          selector: selectorFor(node),
          tagName: node.tagName.toLowerCase(),
          title: String(node.getAttribute('title') || ''),
          src: String(node.getAttribute('src') || ''),
          className: String(node.className || ''),
          text: String(node.textContent || '').replace(/\s+/g, ' ').trim(),
          visible: true,
        };
      })
      .filter(Boolean);
    return {
      detectedAt: new Date().toISOString(),
      elements,
      visibleText: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim(),
    };
  });
  const captcha = detectVisibleCaptchaEvidence(snapshot);
  if (captcha.detected) {
    await report(task, {
      status: 'waiting_on_tomas',
      currentUrl,
      evidenceText: 'Employer presented CAPTCHA or bot verification.',
      details: {
        classification: 'captcha',
        captchaEvidence: captcha,
      },
      screenshotPath: await safeShot(page, task, 'captcha'),
    });
    return true;
  }
  const body = String(await page.textContent('body') || '');
  if (/multi-factor|mfa|security code sent|verify your identity|sign in/i.test(body) && !/security code/i.test(body)) {
    await report(task, {
      status: 'waiting_on_tomas',
      currentUrl,
      evidenceText: 'Employer presented account, MFA, or identity verification.',
      screenshotPath: await safeShot(page, task, 'identity'),
    });
    return true;
  }
  return false;
}

async function report(task, payload) {
  await workerPost('/api/career-os/worker/report', {
    applicationId: task.applicationId,
    companionId,
    ownerEmail,
    ...payload,
  });
}

async function assertSafeToSubmit(task) {
  const result = await workerPost('/api/career-os/worker/submit-check', {
    applicationId: task.applicationId,
    companionId,
    ownerEmail,
  }, { allowConflict: true });
  if (!result.ok) {
    throw new Error(`duplicate_submission_prevented:${result.status || 'blocked'}`);
  }
  return true;
}

async function workerGet(route) {
  const response = await fetch(new URL(route, baseUrl), {
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  if (!response.ok) throw new Error(`GET ${route} failed with ${response.status}`);
  return response.json();
}

async function workerPost(route, body, options = {}) {
  const response = await fetch(new URL(route, baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (options.allowConflict && response.status === 409) return json;
    throw new Error(`${route} failed with ${response.status}: ${json.error || json.message || 'unknown error'}`);
  }
  return json;
}

async function ensureResumeFile(task) {
  if (task.resume?.localPath && fs.existsSync(task.resume.localPath)) return task.resume.localPath;
  if (!task.resume?.content) throw new Error('No approved resume file or content was available.');
  const ext = path.extname(task.resume.fileName || '') || '.txt';
  const file = path.join(tempDir, `${task.applicationId}-resume${ext}`);
  fs.writeFileSync(file, task.resume.content, 'utf8');
  return file;
}

async function takeShot(page, task, label) {
  const file = path.join(screenshotDir, `${task.applicationId}-${label}-${Date.now()}.png`);
  await page.screenshot({ fullPage: true, path: file });
  return file;
}

async function safeShot(page, task, label) {
  try {
    return await takeShot(page, task, label);
  } catch {
    return '';
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssEscape(value) {
  return value.replace(/([ #;?%&,.+*~\\':"!^$[\]()=>|/@])/g, '\\$1');
}

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

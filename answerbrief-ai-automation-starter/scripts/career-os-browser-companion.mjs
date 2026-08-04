#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { detectVisibleCaptchaEvidence, getATSAdapter } from './lib/career-os-ats-adapters.mjs';

const execFileAsync = promisify(execFile);

const root = process.cwd();
loadDotEnv(path.join(root, '.env.local'));
const companionId = clean(process.env.CAREER_OS_COMPANION_ID) || `${os.hostname()}-career-os-companion`;
const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
const baseUrl = clean(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000');
const staticWorkerToken = clean(process.env.CAREER_OS_BROWSER_WORKER_TOKEN);
const oidcAudience = clean(process.env.CAREER_OS_GITHUB_OIDC_AUDIENCE) || 'answerbrief-career-os';
const stateDir = path.join(root, '.career-os-browser-worker');
const userDataDir = path.join(stateDir, 'chrome-profile');
const screenshotDir = path.join(stateDir, 'screenshots');
const tempDir = path.join(stateDir, 'tmp');
const pollIntervalMs = Number(process.env.CAREER_OS_WORKER_POLL_MS || '15000');
let githubOidcTokenCache = { value: '', expiresAtMs: 0 };

for (const dir of [stateDir, userDataDir, screenshotDir, tempDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const mode = process.argv[2] || 'start';

if (!staticWorkerToken && !canRequestGitHubActionsOidcToken()) {
  console.error('CAREER_OS_BROWSER_WORKER_TOKEN or GitHub Actions OIDC request environment is required.');
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

if (mode === 'run-batch') {
  const limit = boundedPositiveInteger(argValue('--limit', process.env.CAREER_OS_WORKER_BATCH_LIMIT || '5'), 5, 25);
  let claimed = 0;
  let attempts = 0;
  for (; attempts < limit; attempts += 1) {
    const didClaim = await claimAndRunTask();
    if (!didClaim) break;
    claimed += 1;
  }
  console.log(JSON.stringify({ attempts: attempts + (attempts < limit ? 1 : 0), claimed, limit }, null, 2));
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
      ensureCoverLetterFile: () => ensureCoverLetterFile(task),
      ensureResumeFile: () => ensureResumeFile(task),
      fillByLabel: (labelPattern, value) => fillByLabel(page, labelPattern, value),
      recordEmployerAccountMetadata: (payload) => recordEmployerAccountMetadata(task, payload),
      report: (payload) => report(task, {
        ...payload,
        details: {
          adapter: adapter.id,
          ...(payload.details || {}),
        },
      }),
      resolveEmployerAccountCredential: (payload) => resolveEmployerAccountCredential(task, payload),
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
      evidenceText: redactProtectedText(error instanceof Error ? error.message : String(error)),
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
          width: Math.round(node.getBoundingClientRect().width),
          height: Math.round(node.getBoundingClientRect().height),
          visible: true,
        };
      })
      .filter(Boolean);
    return {
      authControlVisible: Array.from(document.querySelectorAll(
        'input[type="password"], input[autocomplete="current-password"], input[autocomplete="one-time-code"], input[name*="verification" i], input[id*="verification" i]',
      )).some((node) => node instanceof HTMLElement && visible(node)),
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
  const explicitIdentityPrompt = /multi-factor|mfa|security code sent|verify your identity|verification code|one[- ]?time code|email code/i.test(snapshot.visibleText);
  const ordinaryWorkdayAccount = /myworkdayjobs\.com|workday/i.test(currentUrl)
    && /sign in|log in|login|create account|password|email/i.test(snapshot.visibleText)
    && !explicitIdentityPrompt;
  if ((snapshot.authControlVisible && !ordinaryWorkdayAccount) || explicitIdentityPrompt) {
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
    ...redactProtectedPayload(payload),
  });
}

function redactProtectedPayload(value, key = '') {
  if (/password|secret|token|cookie/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactProtectedText(value);
  if (Array.isArray(value)) return value.map((item) => redactProtectedPayload(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactProtectedPayload(entryValue, entryKey),
    ]));
  }
  return value;
}

function redactProtectedText(value) {
  return String(value || '')
    .replace(/fill\("[^"]*"\)/g, 'fill("[REDACTED]")')
    .replace(/(<input[^>]*(?:type="password"|data-automation-id="password")[^>]*value=")[^"]*(")/gi, '$1[REDACTED]$2')
    .replace(/(password[^\n]{0,120}value=")[^"]*(")/gi, '$1[REDACTED]$2')
    .replace(/(password\s*[:=]\s*)[^\s"']+/gi, '$1[REDACTED]');
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
  const workerToken = await currentWorkerToken();
  const response = await fetch(new URL(route, baseUrl), {
    headers: { Authorization: `Bearer ${workerToken}` },
  });
  if (!response.ok) throw new Error(`GET ${route} failed with ${response.status}`);
  return response.json();
}

async function workerPost(route, body, options = {}) {
  const attempts = options.retryTransient === false ? 1 : 4;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const workerToken = await currentWorkerToken();
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
        const message = `${route} failed with ${response.status}: ${json.error || json.message || 'unknown error'}`;
        if (response.status === 401 && canRequestGitHubActionsOidcToken() && attempt < attempts) {
          githubOidcTokenCache = { value: '', expiresAtMs: 0 };
          lastError = new Error(message);
          continue;
        }
        if (!isTransientWorkerApiFailure(response.status) || attempt === attempts) throw new Error(message);
        lastError = new Error(message);
      } else {
        return json;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }
    await delay(Math.min(15000, 1000 * attempt * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(`${route} failed`);
}

async function currentWorkerToken() {
  if (canRequestGitHubActionsOidcToken()) return currentGitHubActionsOidcToken();
  if (staticWorkerToken) return staticWorkerToken;
  throw new Error('Browser worker authentication is not configured.');
}

function canRequestGitHubActionsOidcToken() {
  return Boolean(clean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL) && clean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN));
}

async function currentGitHubActionsOidcToken() {
  const now = Date.now();
  if (githubOidcTokenCache.value && githubOidcTokenCache.expiresAtMs - 60_000 > now) {
    return githubOidcTokenCache.value;
  }

  const requestUrl = new URL(clean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL));
  requestUrl.searchParams.set('audience', oidcAudience);
  const response = await fetch(requestUrl, {
    headers: { Authorization: `bearer ${clean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)}` },
  });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed with ${response.status}`);
  const json = await response.json().catch(() => ({}));
  const token = clean(json.value);
  if (!token) throw new Error('GitHub OIDC token request returned an empty token.');
  githubOidcTokenCache = {
    value: token,
    expiresAtMs: jwtExpiresAtMs(token) || Date.now() + 4 * 60_000,
  };
  return token;
}

function jwtExpiresAtMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
    const exp = Number(payload.exp || 0);
    return exp > 0 ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function isTransientWorkerApiFailure(status) {
  return status === 404 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function ensureResumeFile(task) {
  if (task.resume?.localPath && fs.existsSync(task.resume.localPath)) return task.resume.localPath;
  if (!task.resume?.content) throw new Error('No approved resume file or content was available.');
  const ext = path.extname(task.resume.fileName || '') || '.txt';
  const file = path.join(tempDir, `${task.applicationId}-resume${ext}`);
  fs.writeFileSync(file, task.resume.content, 'utf8');
  return file;
}

async function ensureCoverLetterFile(task) {
  if (!task.coverLetter) return '';
  if (task.coverLetter.localPath && fs.existsSync(task.coverLetter.localPath)) return task.coverLetter.localPath;
  if (!task.coverLetter.content) return '';
  const ext = path.extname(task.coverLetter.fileName || '') || '.txt';
  const file = path.join(tempDir, `${task.applicationId}-cover-letter${ext}`);
  fs.writeFileSync(file, task.coverLetter.content, 'utf8');
  return file;
}

async function resolveEmployerAccountCredential(task, input = {}) {
  const accountEmail = clean(input.accountEmail || task.candidate?.email || ownerEmail);
  const tenant = clean(input.identity?.tenant || workdayTenantFromTask(task));
  if (!accountEmail || !tenant) {
    return { ok: false, reason: 'Secure account handling requires an approved account email and Workday tenant.' };
  }
  const service = keychainServiceFor(tenant);
  const reference = keychainReference(service, accountEmail);
  const existing = await readKeychainSecret(service, accountEmail);
  if (existing.ok) {
    await recordEmployerAccountMetadata(task, {
      accountEmail,
      accountState: 'reused',
      applicationsAssociated: [task.applicationId],
      credentialReference: reference,
      employer: task.employer,
      identity: input.identity,
      portalUrl: task.applicationUrl,
      verificationStatus: 'credential_found',
    });
    return {
      createdNow: false,
      ok: true,
      password: existing.value,
      reference,
      store: 'macos_keychain',
    };
  }

  const generated = generateStrongPassword();
  const stored = await writeKeychainSecret(service, accountEmail, generated);
  if (!stored.ok) {
    return { ok: false, reason: 'Secure credential storage is unavailable; account creation is paused before any protected value is entered.' };
  }
  await recordEmployerAccountMetadata(task, {
    accountEmail,
    accountState: 'credential_created_pending_account_submit',
    applicationsAssociated: [task.applicationId],
    credentialReference: reference,
    employer: task.employer,
    identity: input.identity,
    portalUrl: task.applicationUrl,
    verificationStatus: 'credential_stored',
  });
  return {
    createdNow: true,
    ok: true,
    password: generated,
    reference,
    store: 'macos_keychain',
  };
}

async function readKeychainSecret(service, account) {
  try {
    const { stdout } = await execFileAsync('security', ['find-generic-password', '-s', service, '-a', account, '-w'], {
      maxBuffer: 1024 * 32,
      timeout: 10000,
    });
    const value = String(stdout || '').trim();
    return value ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

async function writeKeychainSecret(service, account, value) {
  try {
    await execFileAsync('security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w', value], {
      maxBuffer: 1024 * 32,
      timeout: 10000,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function recordEmployerAccountMetadata(task, input = {}) {
  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !key) return { ok: false, reason: 'supabase_unavailable' };
  const accountEmail = clean(input.accountEmail || task.candidate?.email || ownerEmail);
  const tenant = clean(input.identity?.tenant || workdayTenantFromTask(task));
  const employer = clean(input.employer || task.employer || tenant || 'Workday employer');
  if (!accountEmail || !tenant) return { ok: false, reason: 'missing_account_identity' };
  const now = new Date().toISOString();
  const id = deterministicUuid(`career-os-employer-account:${ownerEmail}:${tenant}:${accountEmail}`);
  const existing = await selectEmployerAccount(id, supabaseUrl, key);
  const previousMetadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
  const applicationsAssociated = Array.from(new Set([
    ...arrayValue(previousMetadata.applications_associated).map(clean).filter(Boolean),
    ...arrayValue(input.applicationsAssociated).map(clean).filter(Boolean),
  ]));
  const verificationStatus = clean(input.verificationStatus || previousMetadata.verification_status || 'unknown');
  const patch = {
    id,
    owner_email: ownerEmail,
    employer,
    portal_url: clean(input.portalUrl || task.applicationUrl),
    account_email: accountEmail,
    status: clean(input.accountState || existing?.status || 'active'),
    notes: 'Career OS Workday account metadata only; protected values are stored outside Supabase.',
    last_verified_at: now,
    created_at: existing?.created_at || now,
    updated_at: now,
    employer_id: clean(existing?.employer_id) || `employer-${slug(employer)}`,
    platform_name: 'workday',
    account_exists: true,
    profile_completeness: clean(existing?.profile_completeness) || 'unknown',
    last_successful_login: clean(input.lastSuccessfulLogin || existing?.last_successful_login) || null,
    mfa_required: /mfa|code|verification|captcha/i.test(verificationStatus),
    recovery_status: verificationStatus,
    approved_resume_version: clean(task.resume?.fileName || existing?.approved_resume_version),
    reusable_profile_completion_status: clean(existing?.reusable_profile_completion_status) || 'pending_candidate_profile_setup',
    credential_reference: clean(input.credentialReference || existing?.credential_reference),
    metadata: {
      ...previousMetadata,
      account_created_or_reused: clean(input.accountState || existing?.status || 'active'),
      account_registry_version: 'career_os_workday_keychain_v1',
      applications_associated: applicationsAssociated,
      credential_store: 'macos_keychain',
      protected_values_persisted_in_career_os: false,
      tenant,
      updated_by: companionId,
      verification_status: verificationStatus,
      workday_identity: input.identity || null,
    },
  };
  const response = await fetch(`${supabaseUrl}/rest/v1/career_os_employer_accounts?on_conflict=id`, {
    body: JSON.stringify(patch),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    method: 'POST',
  });
  return { ok: response.ok, status: response.status };
}

async function selectEmployerAccount(id, supabaseUrl, key) {
  const response = await fetch(`${supabaseUrl}/rest/v1/career_os_employer_accounts?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function generateStrongPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^*-_+=';
  const all = `${upper}${lower}${digits}${symbols}`;
  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];
  while (required.length < 24) required.push(all[crypto.randomInt(all.length)]);
  return required.sort(() => crypto.randomInt(3) - 1).join('');
}

function keychainServiceFor(tenant) {
  return `career-os-workday:${slug(tenant)}`;
}

function keychainReference(service, account) {
  return `macos-keychain service=${service}; account=${account}`;
}

function workdayTenantFromTask(task) {
  try {
    const host = new URL(clean(task.applicationUrl)).hostname.toLowerCase();
    if (/myworkdayjobs\.com$/i.test(host)) return host.replace(/\.myworkdayjobs\.com$/i, '');
    return host.split('.')[0] || '';
  } catch {
    return '';
  }
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

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function deterministicUuid(input) {
  const hash = crypto.createHash('sha256').update(String(input || ''), 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function slug(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'workday';
}

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function boundedPositiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

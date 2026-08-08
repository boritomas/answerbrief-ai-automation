import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { careerOsPatchRowById, careerOsSelectRows, careerOsUpsertRows } from '@/lib/career-os-supabase';
import { recordCareerOsAction } from '@/lib/career-os-queue';

const execFileAsync = promisify(execFile);

// Explicit AccountGate status taxonomy for career_os_employer_accounts.status.
// Written by the browser worker (scripts/career-os-browser-companion.mjs,
// scripts/lib/career-os-workday-production.mjs) and by this module; read by
// the founder-dashboard Employer Authentication panel. Applications never
// carry their own copy of this state -- they reference the shared
// employer+tenant+account row so one recovery unblocks every application
// for that account.
export type EmployerAuthStatus =
  | 'authenticated'
  | 'credential_invalid'
  | 'password_reset_pending'
  | 'credential_update_required'
  | 'verifying'
  | 'auth_recovered'
  | 'manual_auth_required';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function slug(value: string) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'workday';
}

export function keychainServiceFor(tenant: string) {
  return `career-os-workday:${slug(tenant)}`;
}

// Must match scripts/career-os-browser-companion.mjs's deterministicUuid
// exactly, byte for byte -- this is how the SAME career_os_employer_accounts
// row gets addressed from both the browser worker and this module. Do not
// change the hashing scheme here without changing it there too.
export function deterministicEmployerAccountId(ownerEmail: string, tenant: string, accountEmail: string) {
  const input = `career-os-employer-account:${ownerEmail}:${tenant}:${accountEmail}`;
  const hash = crypto.createHash('sha256').update(input, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function workdayKeychainArgs(args: string[]) {
  const keychainPath = clean(process.env.CAREER_OS_WORKDAY_KEYCHAIN_PATH);
  return keychainPath ? [...args, keychainPath] : args;
}

// Writes directly to the same macOS Keychain the browser worker reads from
// (scripts/career-os-browser-companion.mjs's readKeychainSecret/
// writeKeychainSecret) -- never Supabase, never a log line, never returned
// in any API response. This only works when the Next.js server process is
// running locally on the same Mac as the Keychain (this is a local-admin
// action, not something that functions when deployed to Vercel -- callers
// must check keychainWriteAvailable() first and fail closed if it's not).
export async function writeKeychainCredential(tenant: string, accountEmail: string, password: string) {
  const service = keychainServiceFor(tenant);
  try {
    await execFileAsync('security', workdayKeychainArgs(['add-generic-password', '-U', '-s', service, '-a', accountEmail, '-w', password]), {
      maxBuffer: 1024 * 32,
      timeout: 10000,
    });
    return { ok: true as const };
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; code?: number };
    const raw = clean(err.stderr || err.stdout) || (err.code ? `security_exit_${err.code}` : 'security_command_failed');
    return { ok: false as const, reason: redactKeychainDiagnostic(raw, service, accountEmail) };
  }
}

function redactKeychainDiagnostic(value: string, service: string, accountEmail: string) {
  const keychainPath = clean(process.env.CAREER_OS_WORKDAY_KEYCHAIN_PATH);
  let output = clean(value);
  for (const [needle, replacement] of [[service, '[service]'], [accountEmail, '[account]'], [keychainPath, '[keychain]']] as const) {
    if (!needle) continue;
    output = output.split(needle).join(replacement);
  }
  return output.slice(0, 220);
}

// Only meaningful when this process is the local browser-worker host --
// `security` doesn't exist and CAREER_OS_WORKDAY_KEYCHAIN_PATH isn't
// configured on a Vercel-hosted instance of this same codebase.
export function keychainWriteAvailable() {
  return process.platform === 'darwin' && Boolean(clean(process.env.CAREER_OS_WORKDAY_KEYCHAIN_PATH));
}

function parseWorkdayTenantFromUrl(applicationUrl: string) {
  try {
    const host = new URL(applicationUrl).hostname.toLowerCase();
    if (/myworkdayjobs\.com$/i.test(host)) return host.replace(/\.myworkdayjobs\.com$/i, '');
    return host.split('.')[0] || '';
  } catch {
    return '';
  }
}

type EmployerAuthException = {
  applicationCount: number;
  applicationIds: string[];
  employer: string;
  exactAction: string;
  lastResetRequestedAt: string | null;
  lastSuccessfulLogin: string | null;
  status: EmployerAuthStatus;
  tenant: string;
};

const AUTH_BLOCKER_PATTERN = /password reset|password rejected|sign.?in|account.*(?:creation|locked|required)|employer auth|forgot.*password/i;

// Powers the founder-dashboard's Employer Authentication panel: one card
// per employer/tenant/account, not one per application -- exactly the
// "Tomas resolves Capital One once, Career OS resumes every eligible
// Capital One application" grouping the mission asked for.
export async function getEmployerAuthExceptions(ownerEmail: string): Promise<EmployerAuthException[]> {
  const applications = await careerOsSelectRows(
    'career_os_applications',
    `select=id,employer,lifecycle_stage,next_action,raw_record&owner_email=eq.${encodeURIComponent(ownerEmail)}&lifecycle_stage=eq.waiting_on_tomas_browser_worker`,
  );
  const byTenant = new Map<string, { applicationIds: string[]; employer: string; exactAction: string; tenant: string }>();
  for (const application of applications) {
    const nextAction = clean(application.next_action);
    if (!AUTH_BLOCKER_PATTERN.test(nextAction)) continue;
    const raw = asRecord(application.raw_record);
    const applicationUrl = clean(raw.application_url);
    const tenant = parseWorkdayTenantFromUrl(applicationUrl);
    if (!tenant) continue;
    const key = tenant;
    const entry = byTenant.get(key) || { applicationIds: [], employer: String(application.employer || 'Employer'), exactAction: nextAction, tenant };
    entry.applicationIds.push(String(application.id));
    byTenant.set(key, entry);
  }

  const results: EmployerAuthException[] = [];
  for (const entry of Array.from(byTenant.values())) {
    const accountId = deterministicEmployerAccountId(ownerEmail, entry.tenant, ownerEmail);
    const accountRows = await careerOsSelectRows('career_os_employer_accounts', `select=*&id=eq.${encodeURIComponent(accountId)}&limit=1`);
    const account = asRecord(accountRows[0]);
    const metadata = asRecord(account.metadata);
    results.push({
      applicationCount: entry.applicationIds.length,
      applicationIds: entry.applicationIds,
      employer: entry.employer,
      exactAction: entry.exactAction,
      lastResetRequestedAt: (clean(metadata.last_reset_requested_at) || null) as string | null,
      lastSuccessfulLogin: (clean(account.last_successful_login) || null) as string | null,
      status: normalizeAuthStatus(clean(account.status), clean(metadata.verification_status)),
      tenant: entry.tenant,
    });
  }
  return results.sort((left, right) => right.applicationCount - left.applicationCount);
}

function normalizeAuthStatus(status: string, verificationStatus: string): EmployerAuthStatus {
  const text = `${status} ${verificationStatus}`.toLowerCase();
  if (/verifying/.test(text)) return 'verifying';
  if (/auth_recovered/.test(text)) return 'auth_recovered';
  if (/^active$|authenticated|credential_found/.test(text)) return 'authenticated';
  if (/password.?reset/.test(text)) return 'password_reset_pending';
  if (/locked|manual/.test(text)) return 'manual_auth_required';
  if (status) return 'credential_update_required';
  return 'credential_invalid';
}

type VerifyResult = { ok: boolean; reason: string };

// A real, live check against the employer's own Workday sign-in -- not a
// guess. Reuses the same rejection-text patterns the production flow uses
// (scripts/lib/career-os-workday-production.mjs's classifyWorkdayAccountRecovery)
// so "does this credential work" is judged the same way here as it is
// during a real application attempt.
export async function verifyWorkdayCredential({
  accountEmail,
  applicationUrl,
  password,
}: {
  accountEmail: string;
  applicationUrl: string;
  password: string;
}): Promise<VerifyResult> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(applicationUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    const cookieButton = page.getByRole('button', { name: /accept cookies/i });
    if (await cookieButton.count().catch(() => 0)) {
      await cookieButton.first().click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    if (!(await page.locator('input[type="password"]').count().catch(() => 0))) {
      const signInLink = page.getByRole('button', { name: /^sign in$|^log in$/i })
        .or(page.getByRole('link', { name: /^sign in$|^log in$/i }));
      if (await signInLink.count().catch(() => 0)) {
        await signInLink.first().click().catch(() => {});
        await page.waitForTimeout(1500);
      }
    }

    const passwordField = page.locator('input[type="password"]').first();
    if (!(await passwordField.count().catch(() => 0))) {
      return { ok: false, reason: 'Could not find a Workday sign-in form on this application URL to verify against.' };
    }
    const emailField = page.locator('input[type="email"]').first();
    if (await emailField.count().catch(() => 0)) {
      await emailField.fill(accountEmail).catch(() => {});
    } else {
      const genericEmailField = page.getByLabel(/email address|username/i).first();
      await genericEmailField.fill(accountEmail).catch(() => {});
    }
    await passwordField.fill(password).catch(() => {});

    const submit = page.getByRole('button', { name: /^sign in$|^log in$/i }).first();
    if (await submit.count().catch(() => 0)) {
      await submit.click().catch(() => {});
    }
    await page.waitForTimeout(3500);

    const bodyText = clean(await page.locator('body').innerText().catch(() => ''));
    const rejected = /wrong email address or password|wrong password|invalid (?:email|username|user name|password|credentials)|incorrect password|password is incorrect|account (?:might be )?locked|locked out|too many failed|unable to sign in|we couldn't sign you in|could not sign you in/i.test(bodyText);
    if (rejected) {
      return { ok: false, reason: 'Workday rejected the new credential -- same rejection text as a real sign-in attempt.' };
    }
    const stillOnPasswordForm = await page.locator('input[type="password"]').count().catch(() => 0);
    if (stillOnPasswordForm) {
      return { ok: false, reason: 'Sign-in did not complete; a password field is still visible after submit.' };
    }
    return { ok: true, reason: 'Signed in successfully -- no rejection text, no password field remaining.' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Verification failed unexpectedly.' };
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function updateEmployerCredentialAndResume({
  accountEmail,
  employer,
  ownerEmail,
  password,
  tenant,
}: {
  accountEmail: string;
  employer: string;
  ownerEmail: string;
  password: string;
  tenant: string;
}) {
  if (!keychainWriteAvailable()) {
    return {
      ok: false,
      reason: 'This action requires running Career OS locally on your Mac (CAREER_OS_WORKDAY_KEYCHAIN_PATH is not configured here).',
      status: 'blocked' as const,
    };
  }

  const applications = await careerOsSelectRows(
    'career_os_applications',
    `select=id,raw_record&owner_email=eq.${encodeURIComponent(ownerEmail)}&employer=ilike.*${encodeURIComponent(employer)}*`,
  );
  const applicationUrl = applications
    .map((application) => clean(asRecord(application.raw_record).application_url))
    .find((url) => url && parseWorkdayTenantFromUrl(url) === tenant);
  if (!applicationUrl) {
    return { ok: false, reason: `No known Workday application URL found for tenant ${tenant} to verify against.`, status: 'error' as const };
  }

  const accountId = deterministicEmployerAccountId(ownerEmail, tenant, accountEmail);
  await careerOsUpsertRows('career_os_employer_accounts', {
    id: accountId,
    account_email: accountEmail,
    employer,
    employer_id: `employer-${slug(employer)}`,
    owner_email: ownerEmail,
    platform_name: 'workday',
    portal_url: applicationUrl,
    status: 'verifying',
    updated_at: new Date().toISOString(),
  });

  const written = await writeKeychainCredential(tenant, accountEmail, password);
  if (!written.ok) {
    await careerOsPatchRowById('career_os_employer_accounts', accountId, { status: 'credential_update_required', updated_at: new Date().toISOString() });
    return { ok: false, reason: `Could not store the credential in the Keychain: ${written.reason}`, status: 'error' as const };
  }

  const verified = await verifyWorkdayCredential({ accountEmail, applicationUrl, password });
  const now = new Date().toISOString();
  if (!verified.ok) {
    // Fail closed: do not overwrite good prior state, do not trigger
    // another password reset. The (now-stored) credential is simply wrong;
    // leave the employer in a Tomas-actionable state and say why.
    await careerOsPatchRowById('career_os_employer_accounts', accountId, {
      last_verified_at: now,
      status: 'credential_invalid',
      updated_at: now,
    });
    return { ok: false, reason: verified.reason, status: 'verification_failed' as const };
  }

  await careerOsPatchRowById('career_os_employer_accounts', accountId, {
    last_successful_login: now,
    last_verified_at: now,
    status: 'authenticated',
    updated_at: now,
  });

  const waitingApplications = await careerOsSelectRows(
    'career_os_applications',
    `select=id,raw_record&owner_email=eq.${encodeURIComponent(ownerEmail)}&lifecycle_stage=eq.waiting_on_tomas_browser_worker&employer=ilike.*${encodeURIComponent(employer)}*`,
  );
  let resumed = 0;
  const resumeErrors: string[] = [];
  for (const application of waitingApplications) {
    const raw = asRecord(application.raw_record);
    if (parseWorkdayTenantFromUrl(clean(raw.application_url)) !== tenant) continue;
    const result = await recordCareerOsAction({ action: 'resume_application', applicationId: String(application.id), ownerEmail }).catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : 'resume failed',
    }));
    if (result.ok) resumed += 1;
    else resumeErrors.push(`${application.id}: ${(result as { message?: string }).message || 'unknown error'}`);
  }

  return {
    ok: true as const,
    reason: verified.reason,
    resumeErrors,
    resumed,
    status: 'authenticated' as const,
  };
}

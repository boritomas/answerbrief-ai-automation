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

export type EmployerAuthException = {
  applicationCount: number;
  applicationIds: string[];
  employer: string;
  exactAction: string;
  guidance: { reason: string; suggestedActions: string[] };
  lastResetRequestedAt: string | null;
  lastSuccessfulLogin: string | null;
  rejectionClassification: WorkdayAuthRejectionClassification | null;
  status: EmployerAuthStatus;
  tenant: string;
};

// Maps a safe classification enum value to human copy for the dashboard --
// never generic "an error occurred," and never anything derived from raw
// page text (which could theoretically echo back something unexpected).
function guidanceForClassification(classification: WorkdayAuthRejectionClassification | null): { reason: string; suggestedActions: string[] } {
  switch (classification) {
    case 'invalid_credential':
      return { reason: 'Credential rejected', suggestedActions: ['Update Credential', 'Verify Username'] };
    case 'account_locked':
      return { reason: 'Account locked by employer', suggestedActions: ['Resolve with employer support', 'Retry Login later'] };
    case 'account_not_found':
      return { reason: 'No account found for this email', suggestedActions: ['Verify Username', 'Update Credential'] };
    case 'password_reset_required':
      return { reason: 'Employer is forcing a password reset', suggestedActions: ['Reset Password on employer site', 'Update Credential'] };
    case 'recovery_pending':
      return { reason: 'A password recovery is already pending', suggestedActions: ['Complete pending recovery email', 'Retry Login'] };
    case 'sign_in_form_not_found':
      return { reason: 'No sign-in form found at the known URL', suggestedActions: ['Verify Login'] };
    case 'no_change_after_submit':
      return { reason: 'Sign-in did not complete (no error shown)', suggestedActions: ['Retry Login', 'Verify Login'] };
    case 'session_already_authenticated':
      return { reason: 'Session was already signed in (not a proven credential check)', suggestedActions: ['Retry Login'] };
    case 'mfa_required':
      return { reason: 'Multi-factor authentication required', suggestedActions: ['Complete MFA manually'] };
    case 'captcha_required':
      return { reason: 'CAPTCHA challenge required', suggestedActions: ['Complete CAPTCHA manually'] };
    case 'unknown_auth_failure':
      return { reason: 'Unrecognized sign-in failure', suggestedActions: ['Verify Login', 'Update Credential'] };
    case 'unexpected_error':
      return { reason: 'Verification check failed unexpectedly', suggestedActions: ['Retry Login'] };
    default:
      return { reason: 'Employer authentication needs attention', suggestedActions: ['Update Credential'] };
  }
}

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
    const rejectionClassification = (clean(metadata.last_rejection_classification) || null) as WorkdayAuthRejectionClassification | null;
    results.push({
      applicationCount: entry.applicationIds.length,
      applicationIds: entry.applicationIds,
      employer: entry.employer,
      exactAction: entry.exactAction,
      guidance: guidanceForClassification(rejectionClassification),
      lastResetRequestedAt: (clean(metadata.last_reset_requested_at) || null) as string | null,
      lastSuccessfulLogin: (clean(account.last_successful_login) || null) as string | null,
      rejectionClassification,
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

// Diagnostic classification only -- never the credential itself. Lets a
// failed verification say WHICH kind of failure it saw so a human can
// tell a genuinely bad password apart from an employer-side account
// problem without needing to read raw page text.
export type WorkdayAuthRejectionClassification =
  | 'invalid_credential'
  | 'account_locked'
  | 'account_not_found'
  | 'password_reset_required'
  | 'recovery_pending'
  | 'sign_in_form_not_found'
  | 'no_change_after_submit'
  | 'session_already_authenticated'
  | 'mfa_required'
  | 'captcha_required'
  | 'unknown_auth_failure'
  | 'unexpected_error';

type VerifyResult = { ok: boolean; classification?: WorkdayAuthRejectionClassification; reason: string };

// Workday (and most SPAs) render validation/rejection messages inside a
// scoped alert region, not as arbitrary body text -- but a page's
// permanent help/footer copy (e.g. "If your account is locked, contact
// support") can contain the same keywords out of context. Scoping to
// role=alert/aria-live/error-styled regions first, and only falling back
// to whole-body text when no such region is found, is what keeps
// ACCOUNT_LOCKED from over-firing on boilerplate that merely mentions
// "locked" -- confirmed as a real false-positive risk in production
// (multiple employers classified account_locked in the same batch, which
// is far more consistent with a false-positive pattern than five
// simultaneously locked accounts).
async function extractAlertText(page: import('playwright').Page): Promise<string> {
  const alertText = await page.evaluate(() => {
    const normalize = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const nodes = Array.from(document.querySelectorAll('[role="alert"], [aria-live], [data-automation-id*="error" i], .error, .errors, [class*="error" i], [id*="error" i]'));
    return nodes
      .filter((node): node is HTMLElement => node instanceof HTMLElement && visible(node))
      .map((node) => normalize(node.textContent || ''))
      .filter(Boolean)
      .join(' | ');
  }).catch(() => '');
  return clean(alertText);
}

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
      // No password prompt at all after navigating and clicking Sign In:
      // either this URL never has a login gate, or a session cookie was
      // already valid before we ever submitted anything -- neither
      // proves THIS credential works, so it must not be reported as a
      // clean success. Matches the same principle Tomas set for his own
      // manual test: a page that leaves you signed in without a fresh
      // login does not count as verification.
      const authenticatedLooking = /my applications|candidate home|welcome back|application status/i.test(clean(await page.locator('body').innerText().catch(() => '')));
      if (authenticatedLooking) {
        return { classification: 'session_already_authenticated', ok: false, reason: 'No sign-in prompt was shown -- the browser session already appeared authenticated before this credential was ever submitted, which does not prove the credential itself is valid.' };
      }
      return { classification: 'sign_in_form_not_found', ok: false, reason: 'Could not find a Workday sign-in form on this application URL to verify against.' };
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

    const alertText = await extractAlertText(page);
    const bodyText = clean(await page.locator('body').innerText().catch(() => ''));
    // Prefer the scoped alert/error region; only fall back to whole-body
    // text when no such region was found, so permanent help/footer copy
    // that happens to mention these same words can't masquerade as a
    // live rejection message.
    const classificationText = alertText || bodyText;

    if (/captcha|verify you are human|bot verification|security challenge/i.test(classificationText)) {
      return { classification: 'captcha_required', ok: false, reason: 'Workday is showing a CAPTCHA challenge -- this cannot be resolved by an automated check and needs a human to complete it directly.' };
    }
    if (/verification code|security code|one.time (?:code|password)|enter the code|multi-factor|two-factor|2fa|mfa\b/i.test(classificationText)) {
      return { classification: 'mfa_required', ok: false, reason: 'Workday is requesting a multi-factor/verification code -- this account has MFA enabled and needs a human to complete that step directly.' };
    }
    if (/we (?:could not|couldn.t) find an account|no account (?:was )?found|account does not exist|this email (?:is not|isn.t) registered/i.test(classificationText)) {
      return { classification: 'account_not_found', ok: false, reason: 'Workday reports no account exists for this email address on this tenant.' };
    }
    if (/account (?:might be |is )?locked|locked out|too many (?:failed|sign.?in) attempts/i.test(classificationText)) {
      return { classification: 'account_locked', ok: false, reason: `Workday indicates the account may be locked (matched in ${alertText ? 'a scoped alert/error region' : 'page text, no scoped alert region was found'}) -- this is an employer-side account state, not something a different password can fix.` };
    }
    if (/you must (?:reset|change) your password|your password has expired|update your password to continue/i.test(classificationText)) {
      return { classification: 'password_reset_required', ok: false, reason: 'Workday is forcing a password reset before this account can sign in, independent of whether the submitted password was otherwise correct.' };
    }
    if (/reset (?:is |was )?(?:already )?(?:pending|in progress)|check your email (?:for|to) (?:reset|verify)|password reset (?:is )?pending/i.test(classificationText)) {
      return { classification: 'recovery_pending', ok: false, reason: 'Workday indicates a password recovery/reset is already pending on this account.' };
    }
    if (/wrong email address or password|wrong password|invalid (?:email|username|user name|password|credentials)|incorrect password|password is incorrect|unable to sign in|we couldn.t sign you in|could not sign you in/i.test(classificationText)) {
      return { classification: 'invalid_credential', ok: false, reason: 'Workday rejected the credential as invalid -- same rejection text as a real sign-in attempt.' };
    }
    // An alert/error region is showing text that didn't match any known
    // pattern above -- something is wrong, but not a category this
    // classifier recognizes yet. More specific than "no_change" (which
    // means literally nothing happened) whether or not the password
    // field itself is still present.
    if (alertText) {
      return { classification: 'unknown_auth_failure', ok: false, reason: `Sign-in did not complete and an unrecognized alert/error message was shown: "${alertText.slice(0, 200)}"` };
    }
    const stillOnPasswordForm = await page.locator('input[type="password"]').count().catch(() => 0);
    if (stillOnPasswordForm) {
      return { classification: 'no_change_after_submit', ok: false, reason: 'Sign-in did not complete; a password field is still visible after submit, with no visible rejection message.' };
    }
    return { ok: true, reason: 'Signed in successfully -- no rejection text, no password field remaining.' };
  } catch (error) {
    return { classification: 'unexpected_error', ok: false, reason: error instanceof Error ? error.message : 'Verification failed unexpectedly.' };
  } finally {
    await browser.close().catch(() => {});
  }
}

// Persists only safe diagnostic metadata -- tenant, employer, the
// classification enum value, and a timestamp -- never the credential.
// Shared by both the Update Credential and Verify Login actions so the
// dashboard reflects whichever one most recently checked this employer.
// PostgREST PATCH replaces JSONB columns wholesale rather than deep
// merging, so the existing metadata (tenant, applications_associated,
// last_reset_requested_at -- which the employer_auth_blocked eligibility
// gate depends on) must be re-fetched and merged, never overwritten.
export async function recordEmployerAuthVerification({
  accountEmail,
  classification,
  employer,
  ok,
  ownerEmail,
  tenant,
}: {
  accountEmail: string;
  classification?: WorkdayAuthRejectionClassification;
  employer: string;
  ok: boolean;
  ownerEmail: string;
  tenant: string;
}) {
  const accountId = deterministicEmployerAccountId(ownerEmail, tenant, accountEmail);
  const now = new Date().toISOString();
  const existingRows = await careerOsSelectRows('career_os_employer_accounts', `select=metadata&id=eq.${encodeURIComponent(accountId)}&limit=1`);
  const existingMetadata = asRecord(existingRows[0]?.metadata);
  await careerOsUpsertRows('career_os_employer_accounts', {
    id: accountId,
    account_email: accountEmail,
    employer,
    employer_id: `employer-${slug(employer)}`,
    last_successful_login: ok ? now : existingRows[0]?.last_successful_login,
    last_verified_at: now,
    metadata: {
      ...existingMetadata,
      last_rejection_classification: ok ? null : (classification || 'unknown_auth_failure'),
      last_verification_attempt_at: now,
      tenant,
    },
    owner_email: ownerEmail,
    platform_name: 'workday',
    status: ok ? 'authenticated' : 'credential_invalid',
    updated_at: now,
  });
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
  // Fail closed on failure: do not overwrite good prior state beyond the
  // diagnostic classification (never the password), do not trigger
  // another password reset -- recordEmployerAuthVerification() persists
  // only the safe classification/timestamp fields.
  await recordEmployerAuthVerification({ accountEmail, classification: verified.classification, employer, ok: verified.ok, ownerEmail, tenant });
  if (!verified.ok) {
    return { classification: verified.classification, ok: false, reason: verified.reason, status: 'verification_failed' as const };
  }

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

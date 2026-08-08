import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  adminCookieValue,
  authorizeCareerOsAction,
  verifyCareerOsActionToken,
  processCareerOsQueue,
  recordCareerOsAction,
} from '@/lib/career-os-queue';
import { getCareerOsStatus } from '@/lib/career-os-status';
import {
  careerOsPatchRowById,
  careerOsSelectRows,
  careerOsUpsertRows,
} from '@/lib/career-os-supabase';
import {
  FOREGROUND_DISCOVERY_MAX_BOARDS,
  buildDailyOperatingCycleStatus,
  persistDailyCycleReport,
  runDailyGreenhouseDiscovery,
} from '@/lib/career-os-daily-cycle';
import { keychainServiceFor, recordEmployerAuthVerification, updateEmployerCredentialAndResume, verifyWorkdayCredential } from '@/lib/career-os-employer-auth';

export const dynamic = 'force-dynamic';
// Credential verification launches a real browser and waits for a live
// Workday sign-in round-trip; the default 60s can be tight on a slow
// network. Only exercised locally (see keychainWriteAvailable()), never on
// a Vercel-hosted instance of this route.
export const maxDuration = 120;
export const runtime = 'nodejs';

type ActionBody = {
  accountEmail?: string;
  action?: string;
  adminPassword?: string;
  actionToken?: string;
  actionTokenExpiresAt?: string;
  answer?: string;
  applicationId?: string;
  employer?: string;
  ownerEmail?: string;
  opportunityId?: string;
  // Never logged, never persisted to Supabase, never echoed in a response --
  // used only in-memory to write the macOS Keychain entry and to drive one
  // live Playwright sign-in check. See lib/career-os-employer-auth.ts.
  password?: string;
  reviewAction?: 'approve' | 'hide' | 'reject_similar' | 'save' | 'skip' | 'tailor' | 'watch';
  tenant?: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as ActionBody;
  const ownerEmail = body.ownerEmail || process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';

  if (body.action === 'authorize') {
    const password = cleanEnv(process.env.ADMIN_DASHBOARD_PASSWORD || process.env.CAREER_OS_RUN_NOW_PASSWORD);
    if (!password || body.adminPassword !== password) {
      return NextResponse.json({ ok: false, error: 'Unauthorized Career OS action.' }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, status: 'success' });
    response.cookies.set('career_os_admin', adminCookieValue(password), {
      httpOnly: true,
      maxAge: 60 * 60 * 8,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
    return response;
  }

  const tokenAuthorized = verifyCareerOsActionToken({
    action: cleanEnv(body.action),
    expiresAt: cleanEnv(body.actionTokenExpiresAt),
    ownerEmail,
    token: cleanEnv(body.actionToken),
  });
  const auth = tokenAuthorized ? { authorized: true, method: 'signed_action_token' as const } : authorizeCareerOsAction(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized Career OS action.' }, { status: 401 });
  }

  if (body.action === 'run_now') {
    try {
      const status = await getCareerOsStatus();
      if (status.environment !== 'production') {
        return NextResponse.json({
          error: status.blocker || 'Career OS live database is unavailable. Automation is blocked until live state can be read safely.',
          ok: false,
          status: 'blocked',
        }, { status: 503 });
      }
      const queueResult = await processCareerOsQueue({ ownerEmail, trigger: 'run_now' });
      return NextResponse.json({ ok: true, queueResult, status: queueResult.errors.length ? 'error' : 'success' });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Career OS Run Now failed.',
        ok: false,
        status: 'error',
      }, { status: 502 });
    }
  }

  if (body.action === 'refresh_discovery') {
    try {
      const before = await getCareerOsStatus();
      if (before.environment !== 'production') {
        return NextResponse.json({
          error: before.blocker || 'Career OS live database is unavailable. Discovery refresh is blocked until Supabase access is restored.',
          ok: false,
          status: 'blocked',
        }, { status: 503 });
      }
      const discovery = await runDailyGreenhouseDiscovery(ownerEmail, before.evidence, { maxBoards: FOREGROUND_DISCOVERY_MAX_BOARDS });
      const afterDiscovery = await getCareerOsStatus();
      const dailyCycle = buildDailyOperatingCycleStatus(afterDiscovery.evidence, {
        activeQualifiedOpportunities: afterDiscovery.activeQualifiedOpportunities,
        duplicateRecordsRemoved: afterDiscovery.duplicateRecordsRemoved,
        inactive: afterDiscovery.inactive,
        ineligible: afterDiscovery.ineligible,
        inProgress: afterDiscovery.inProgress,
        readyForAutomation: afterDiscovery.readyForAutomation,
        releaseCompletionPercentage: afterDiscovery.releaseCompletionPercentage,
        submittedApplications: afterDiscovery.submittedApplications,
        totalPackages: afterDiscovery.totalPackages,
        totalUniqueOpportunities: afterDiscovery.totalUniqueOpportunities,
        waitingOnTomas: afterDiscovery.waitingOnTomas,
      });
      const persisted = await persistDailyCycleReport(ownerEmail, dailyCycle, {
        activeQualifiedOpportunities: afterDiscovery.activeQualifiedOpportunities,
        duplicateRecordsRemoved: afterDiscovery.duplicateRecordsRemoved,
        inactive: afterDiscovery.inactive,
        ineligible: afterDiscovery.ineligible,
        inProgress: afterDiscovery.inProgress,
        readyForAutomation: afterDiscovery.readyForAutomation,
        releaseCompletionPercentage: afterDiscovery.releaseCompletionPercentage,
        submittedApplications: afterDiscovery.submittedApplications,
        totalPackages: afterDiscovery.totalPackages,
        totalUniqueOpportunities: afterDiscovery.totalUniqueOpportunities,
        waitingOnTomas: afterDiscovery.waitingOnTomas,
      }, discovery);

      return NextResponse.json({
        dailyDiscovery: {
          errors: discovery.errors,
          postingsAccepted: discovery.postingsAccepted,
          postingsPersisted: discovery.postingsPersisted,
          postingsReviewed: discovery.postingsReviewed,
        },
        ok: true,
        persisted: {
          automationRunId: persisted.automationRun.id,
          dailyReportId: persisted.report.id,
        },
        status: discovery.errors.length ? 'error' : 'success',
      });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Career OS discovery refresh failed.',
        ok: false,
        status: 'error',
      }, { status: 502 });
    }
  }

  if (body.action === 'inspect_application' || body.action === 'resume_application' || body.action === 'save_answer') {
    if (!body.applicationId) {
      return NextResponse.json({ ok: false, error: 'Missing application id.' }, { status: 400 });
    }
    const result = await recordCareerOsAction({
      action: body.action,
      answer: body.answer,
      applicationId: body.applicationId,
      ownerEmail,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : result.status === 'blocked' ? 409 : 400 });
  }

  if (body.action === 'update_employer_credential') {
    if (!body.employer || !body.tenant || !body.accountEmail || !body.password) {
      return NextResponse.json({ ok: false, error: 'Missing employer, tenant, accountEmail, or password.' }, { status: 400 });
    }
    try {
      const result = await updateEmployerCredentialAndResume({
        accountEmail: body.accountEmail,
        employer: body.employer,
        ownerEmail,
        password: body.password,
        tenant: body.tenant,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : result.status === 'blocked' ? 503 : 400 });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Credential update failed.',
        ok: false,
        status: 'error',
      }, { status: 502 });
    }
  }

  if (body.action === 'verify_employer_login') {
    if (!body.applicationId || !body.accountEmail) {
      return NextResponse.json({ ok: false, error: 'Missing applicationId or accountEmail.' }, { status: 400 });
    }
    const rows = await careerOsSelectRows('career_os_applications', `select=employer,raw_record&owner_email=eq.${encodeURIComponent(ownerEmail)}&id=eq.${encodeURIComponent(body.applicationId)}&limit=1`);
    const employer = String(rows[0]?.employer || 'Employer');
    const raw = (rows[0]?.raw_record || {}) as Record<string, unknown>;
    const applicationUrl = String(raw.application_url || '');
    if (!applicationUrl) {
      return NextResponse.json({ ok: false, error: 'Application has no known Workday URL to verify against.' }, { status: 400 });
    }
    // Re-verifies against whatever password is CURRENTLY stored in the
    // Keychain (does not accept a password in this action) -- this is the
    // "check if the existing credential still works" button, distinct from
    // "store a new one." Reads the current secret only long enough to run
    // the check; never returns it.
    const tenant = new URL(applicationUrl).hostname.replace(/\.myworkdayjobs\.com$/i, '');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const keychainPath = process.env.CAREER_OS_WORKDAY_KEYCHAIN_PATH;
    try {
      const args = ['find-generic-password', '-s', keychainServiceFor(tenant), '-a', body.accountEmail, '-w', ...(keychainPath ? [keychainPath] : [])];
      const { stdout } = await execFileAsync('security', args, { maxBuffer: 1024 * 32, timeout: 10000 });
      const password = String(stdout || '').trim();
      if (!password) {
        return NextResponse.json({ ok: false, error: 'No credential is currently stored in the Keychain for this employer account.' }, { status: 400 });
      }
      const verified = await verifyWorkdayCredential({ accountEmail: body.accountEmail, applicationUrl, password });
      await recordEmployerAuthVerification({ accountEmail: body.accountEmail, classification: verified.classification, employer, ok: verified.ok, ownerEmail, tenant });
      return NextResponse.json(
        { classification: verified.classification, ok: verified.ok, reason: verified.reason, status: verified.ok ? 'authenticated' : 'credential_invalid' },
        { status: verified.ok ? 200 : 400 },
      );
    } catch {
      return NextResponse.json({ ok: false, error: 'No credential is currently stored in the Keychain for this employer account, or it is locked/unavailable.' }, { status: 400 });
    }
  }

  if (body.action === 'resume_employer_applications') {
    if (!body.employer) {
      return NextResponse.json({ ok: false, error: 'Missing employer.' }, { status: 400 });
    }
    const rows = await careerOsSelectRows(
      'career_os_applications',
      `select=id&owner_email=eq.${encodeURIComponent(ownerEmail)}&lifecycle_stage=eq.waiting_on_tomas_browser_worker&employer=ilike.*${encodeURIComponent(body.employer)}*`,
    );
    let resumed = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const result = await recordCareerOsAction({ action: 'resume_application', applicationId: String(row.id), ownerEmail });
      if (result.ok) resumed += 1;
      else errors.push(`${row.id}: ${result.message || 'unknown error'}`);
    }
    return NextResponse.json({ ok: true, resumed, errors, status: 'success' });
  }

  if (body.action === 'review_opportunity') {
    if (!body.opportunityId || !body.reviewAction) {
      return NextResponse.json({ ok: false, error: 'Missing review opportunity id or action.' }, { status: 400 });
    }
    const result = await recordOpportunityReviewDecision({
      employer: body.employer,
      opportunityId: body.opportunityId,
      ownerEmail,
      reviewAction: body.reviewAction,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : result.status === 'blocked' ? 409 : 400 });
  }

  return NextResponse.json({ ok: false, error: 'Unsupported Career OS action.' }, { status: 400 });
}

function cleanEnv(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

async function recordOpportunityReviewDecision({
  employer,
  opportunityId,
  ownerEmail,
  reviewAction,
}: {
  employer?: string;
  opportunityId: string;
  ownerEmail: string;
  reviewAction: 'approve' | 'hide' | 'reject_similar' | 'save' | 'skip' | 'tailor' | 'watch';
}) {
  const rows = await careerOsSelectRows('career_os_job_postings', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&id=eq.${encodeURIComponent(opportunityId)}&limit=1`);
  const posting = rows[0] as Record<string, unknown> | undefined;
  if (!posting) {
    return { ok: false, status: 'error', message: 'Review opportunity not found.' };
  }

  const raw = asRecord(posting.raw_record);
  const now = new Date().toISOString();
  const normalizedReviewAction = reviewAction === 'hide' ? 'reject_similar' : reviewAction;
  await careerOsPatchRowById('career_os_job_postings', String(posting.id), {
    raw_record: {
      ...raw,
      review_actioned_at: now,
      review_decision: normalizedReviewAction,
      review_employer: employer || posting.company || 'Employer',
    },
    updated_at: now,
  });

  if (reviewAction === 'save' || reviewAction === 'watch' || reviewAction === 'tailor') {
    const messages = {
      save: 'Saved. Career OS will keep this role in your shortlist.',
      tailor: 'Tailor request saved. Career OS will prioritize resume/package preparation for this role.',
      watch: 'Watch saved. Career OS will keep an eye on this role and company.',
    } as const;
    return {
      ok: true,
      status: 'success',
      message: messages[reviewAction],
    };
  }

  if (reviewAction === 'skip' || reviewAction === 'hide' || reviewAction === 'reject_similar') {
    if (reviewAction === 'hide' || reviewAction === 'reject_similar') {
      const profiles = await careerOsSelectRows('career_os_profiles', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&limit=1`);
      const profile = profiles[0] as Record<string, unknown> | undefined;
      if (profile) {
        const verifiedProfile = asRecord(profile.verified_profile);
        const existing = Array.isArray(verifiedProfile.review_preferences_hidden_keys) ? verifiedProfile.review_preferences_hidden_keys.map(String) : [];
        const next = Array.from(new Set(existing.concat([similarityKey(posting)])));
        await careerOsPatchRowById('career_os_profiles', String(profile.id), {
          updated_at: now,
          verified_profile: {
            ...verifiedProfile,
            review_preferences_hidden_keys: next,
          },
        });
      }
    }
    return {
      ok: true,
      status: 'success',
      message: reviewAction === 'skip' ? 'Role skipped.' : 'Hidden. Career OS will suppress similar low-signal roles.',
    };
  }

  const canonicalUrl = String(posting.canonical_url || '');
  const requisition = String(posting.external_requisition_id || '');
  const existingOpportunity = await findExistingOpportunity({
    canonicalUrl,
    opportunityId,
    ownerEmail,
    requisition,
  });
  const resolvedOpportunityId = String(existingOpportunity?.id || opportunityId);
  if (!existingOpportunity) {
    await careerOsUpsertRows('career_os_opportunities', {
      id: resolvedOpportunityId,
      owner_email: ownerEmail,
      employer: String(posting.company || employer || 'Employer'),
      position: String(posting.title || 'Role'),
      requisition: requisition || null,
      source: String(posting.ats_platform || asRecord(posting.raw_record).ats_platform || 'Career OS review queue'),
      job_url: canonicalUrl || null,
      match_score: Number(posting.fit_score || 0) || null,
      recommendation: 'Review',
      status: 'approved_pending_application',
      next_action: 'Tomas approved this review-queue role. Career OS will reuse or generate the package before autonomous submission.',
      discovered_at: posting.created_at || now,
      updated_at: now,
      raw_record: {
        canonical_job_posting_id: opportunityId,
        execution_status: 'qualified',
        review_approved_at: now,
        review_source: 'my_review_queue',
      },
    });
  }

  const applications = await careerOsSelectRows('career_os_applications', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&opportunity_id=eq.${encodeURIComponent(opportunityId)}&limit=1`);
  const existing = applications[0] as Record<string, unknown> | undefined;
  const applicationId = String(existing?.id || `app-review-${opportunityId}`);
  const rawRecord = {
    ...raw,
    canonical_job_posting_id: opportunityId,
    execution_status: 'qualified',
    review_approved_at: now,
    review_source: 'my_review_queue',
  };
  const applicationRow = {
    id: applicationId,
    owner_email: ownerEmail,
    opportunity_id: resolvedOpportunityId,
    employer: String(posting.company || employer || 'Employer'),
    position: String(posting.title || 'Role'),
    lifecycle_stage: 'qualified_pending_application',
    next_action: 'Tomas approved this review-queue role. Career OS will reuse or generate the package before autonomous submission.',
    raw_record: rawRecord,
    updated_at: now,
    created_at: existing?.created_at || now,
  };
  await careerOsUpsertRows('career_os_applications', applicationRow);
  await careerOsUpsertRows('career_os_employer_workflow_events', {
    id: deterministicUuid(`review-queue:${opportunityId}:${reviewAction}:${now}`),
    owner_email: ownerEmail,
    application_id: applicationId,
    opportunity_id: opportunityId,
    employer: String(posting.company || employer || 'Employer'),
    platform: String(posting.ats_platform || asRecord(posting.raw_record).ats_platform || 'Career OS'),
    event_type: 'review_queue_approved',
    status: 'approved',
    evidence_text: 'Tomas approved this role from My Review Queue.',
    occurred_at: now,
    created_at: now,
    metadata: {
      review_action: reviewAction,
      source: 'my_review_queue',
    },
  });
  const queueResult = await processCareerOsQueue({ allowPausedForApplication: true, applicationId, ownerEmail, trigger: 'blocker_resolution' });
  return {
    ok: true,
    queueResult,
    status: 'success',
    message: 'Role approved. Career OS created or updated the application record and resumed queue processing.',
  };
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function similarityKey(posting: Record<string, unknown>) {
  const employer = String(posting.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const title = String(posting.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${employer}:${title}`;
}

async function findExistingOpportunity({
  canonicalUrl,
  opportunityId,
  ownerEmail,
  requisition,
}: {
  canonicalUrl: string;
  opportunityId: string;
  ownerEmail: string;
  requisition: string;
}) {
  const byId = await careerOsSelectRows('career_os_opportunities', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&id=eq.${encodeURIComponent(opportunityId)}&limit=1`);
  if (byId[0]) return byId[0] as Record<string, unknown>;

  if (requisition) {
    const byRequisition = await careerOsSelectRows('career_os_opportunities', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&requisition=eq.${encodeURIComponent(requisition)}&limit=1`);
    if (byRequisition[0]) return byRequisition[0] as Record<string, unknown>;
  }

  if (canonicalUrl) {
    const byUrl = await careerOsSelectRows('career_os_opportunities', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&job_url=eq.${encodeURIComponent(canonicalUrl)}&limit=1`);
    if (byUrl[0]) return byUrl[0] as Record<string, unknown>;
  }

  return undefined;
}

function deterministicUuid(input: string) {
  const hash = crypto.createHash('sha1').update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

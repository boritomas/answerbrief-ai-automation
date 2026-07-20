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
  FOREGROUND_DISCOVERY_MAX_BOARDS,
  buildDailyOperatingCycleStatus,
  persistDailyCycleReport,
  runDailyGreenhouseDiscovery,
} from '@/lib/career-os-daily-cycle';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

type ActionBody = {
  action?: string;
  adminPassword?: string;
  actionToken?: string;
  actionTokenExpiresAt?: string;
  answer?: string;
  applicationId?: string;
  ownerEmail?: string;
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
    const queueResult = await processCareerOsQueue({ ownerEmail, trigger: 'run_now' });
    return NextResponse.json({ ok: true, queueResult, status: queueResult.errors.length ? 'error' : 'success' });
  }

  if (body.action === 'refresh_discovery') {
    try {
      const before = await getCareerOsStatus();
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

  return NextResponse.json({ ok: false, error: 'Unsupported Career OS action.' }, { status: 400 });
}

function cleanEnv(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

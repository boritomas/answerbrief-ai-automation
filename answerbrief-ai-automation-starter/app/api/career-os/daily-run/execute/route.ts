import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getCareerOsStatus } from '@/lib/career-os-status';
import {
  buildDailyOperatingCycleStatus,
  persistDailyCycleReport,
  runDailyGreenhouseDiscovery,
} from '@/lib/career-os-daily-cycle';
import { careerOsQueuePaused, processCareerOsQueue, type QueueProcessorResult } from '@/lib/career-os-queue';

// This route holds the real discovery/scoring/persistence work formerly run
// directly by Vercel Cron in ../route.ts. It routinely exceeds Vercel's
// 60-second serverless limit (confirmed in production: "Vercel Runtime
// Timeout Error: Task timed out after 60 seconds" on GET /api/career-os/
// daily-run) because runDailyGreenhouseDiscovery's Workday branch makes a
// fully sequential per-tenant, per-search-term, per-posting-detail fetch
// chain (lib/career-os-daily-cycle.ts, fetchWorkdayJobs). It is intentionally
// invoked ONLY from the self-hosted GitHub Actions Mac runner, over
// localhost, against `next start` (no serverless duration cap) -- never
// from Vercel. Auth is a separate, local-only secret (CAREER_OS_CRON_SECRET)
// so this expensive endpoint isn't reachable with the public Vercel Cron
// secret even if something mistakenly routes to it on Vercel.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const executeSecret = process.env.CAREER_OS_CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!executeSecret || authHeader !== `Bearer ${executeSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized Career OS daily-run execute invocation.' }, { status: 401 });
  }

  let before: Awaited<ReturnType<typeof getCareerOsStatus>> | undefined;
  let discovery: Awaited<ReturnType<typeof runDailyGreenhouseDiscovery>> | undefined;
  let queueProcessor: Awaited<ReturnType<typeof runSubmissionQueueAfterDiscovery>> | undefined;

  try {
    before = await getCareerOsStatus();
    discovery = await runDailyGreenhouseDiscovery(before.evidence.ownerEmail, before.evidence);
    queueProcessor = await runSubmissionQueueAfterDiscovery(before.evidence.ownerEmail);

    const afterDiscovery = await getCareerOsStatus();
    const releaseMetrics = {
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
    };
    const dailyCycle = buildDailyOperatingCycleStatus(afterDiscovery.evidence, releaseMetrics);
    const persisted = await persistDailyCycleReport(afterDiscovery.evidence.ownerEmail, dailyCycle, releaseMetrics, discovery);

    return NextResponse.json({
      ok: true,
      before: compactStatusForResponse(before),
      dailyCycle: compactDailyCycleForResponse(dailyCycle),
      discovery: compactDiscoveryForResponse(discovery),
      persisted: {
        automationRunId: persisted.automationRun.id,
        dailyReportId: persisted.report.id,
      },
      queueProcessor,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: 'daily_cycle_completed_with_error',
      error: errorMessage(error),
      before: before ? compactStatusForResponse(before) : null,
      discovery: discovery ? compactDiscoveryForResponse(discovery) : null,
      queueProcessor: queueProcessor || null,
    });
  }
}

function compactStatusForResponse(status: Awaited<ReturnType<typeof getCareerOsStatus>>) {
  return {
    activeQualifiedOpportunities: status.activeQualifiedOpportunities,
    submittedApplications: status.submittedApplications,
    waitingOnTomas: status.waitingOnTomas,
  };
}

function compactDiscoveryForResponse(discovery: Awaited<ReturnType<typeof runDailyGreenhouseDiscovery>>) {
  return {
    errors: discovery.errors,
    postingsAccepted: discovery.postingsAccepted,
    postingsPersisted: discovery.postingsPersisted,
    postingsReviewed: discovery.postingsReviewed,
    sourceRunId: discovery.sourceRun.id,
  };
}

function compactDailyCycleForResponse(dailyCycle: Awaited<ReturnType<typeof buildDailyOperatingCycleStatus>>) {
  return {
    actionQueueStatus: dailyCycle.actionQueueStatus,
    applicationAutomationStatus: dailyCycle.applicationAutomationStatus,
    applicationResponseTrackingStatus: dailyCycle.applicationResponseTrackingStatus,
    dailyReportStatus: dailyCycle.dailyReportStatus,
    immediateQueueProcessor: dailyCycle.immediateQueueProcessor,
    dailyFunnel: {
      applicationExecutionToday: dailyCycle.dailyFunnel.applicationExecutionToday,
      qualificationToday: dailyCycle.dailyFunnel.qualificationToday,
      rawActivityToday: dailyCycle.dailyFunnel.rawActivityToday,
    },
    pipelineHealth: {
      readyForAutomation: dailyCycle.pipelineHealth.readyForAutomation,
      waitingOnTomas: dailyCycle.pipelineHealth.waitingOnTomas,
      applicationsSubmittedToday: dailyCycle.pipelineHealth.applicationsSubmittedToday,
      totalSubmitted: dailyCycle.pipelineHealth.totalSubmitted,
    },
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Career OS daily cycle failed.';
}

async function runSubmissionQueueAfterDiscovery(ownerEmail: string): Promise<QueueProcessorResult | { errors: string[]; skipped: true; trigger: 'cron' }> {
  if (careerOsQueuePaused()) {
    return {
      errors: ['career_os_queue_paused'],
      skipped: true,
      trigger: 'cron',
    };
  }

  try {
    return await processCareerOsQueue({ ownerEmail, trigger: 'cron' });
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : 'Career OS queue processor failed after discovery.'],
      skipped: true,
      trigger: 'cron',
    };
  }
}

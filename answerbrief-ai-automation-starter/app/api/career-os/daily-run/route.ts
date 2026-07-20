import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getCareerOsStatus } from '@/lib/career-os-status';
import {
  buildDailyOperatingCycleStatus,
  persistDailyCycleReport,
  runDailyGreenhouseDiscovery,
} from '@/lib/career-os-daily-cycle';
import { processCareerOsQueue } from '@/lib/career-os-queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.CAREER_OS_CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized Career OS daily cron invocation.' }, { status: 401 });
  }

  const before = await getCareerOsStatus();
  const discovery = await runDailyGreenhouseDiscovery(before.evidence.ownerEmail);
  const queueProcessor = await processCareerOsQueue({ ownerEmail: before.evidence.ownerEmail, trigger: 'cron' });
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
  const persisted = await persistDailyCycleReport(afterDiscovery.evidence.ownerEmail, dailyCycle, {
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
    ok: true,
    before: {
      activeQualifiedOpportunities: before.activeQualifiedOpportunities,
      submittedApplications: before.submittedApplications,
      waitingOnTomas: before.waitingOnTomas,
    },
    dailyCycle,
    discovery: {
      errors: discovery.errors,
      postingsAccepted: discovery.postingsAccepted,
      postingsPersisted: discovery.postingsPersisted,
      postingsReviewed: discovery.postingsReviewed,
      sourceRunId: discovery.sourceRun.id,
    },
    persisted: {
      automationRunId: persisted.automationRun.id,
      dailyReportId: persisted.report.id,
    },
    queueProcessor,
  });
}

import { NextResponse } from 'next/server';
import { browserWorkerHealth } from '@/lib/career-os-browser-worker';
import {
  careerOsSelectRows,
  getCareerOsTransportHealth,
} from '@/lib/career-os-supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const runtime = 'nodejs';

type JsonRecord = Record<string, unknown>;

export async function GET() {
  const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
  const startedAt = Date.now();
  const diagnostics: string[] = [];

  const [
    dailyReports,
    automationRuns,
    applications,
    jobPostings,
    opportunities,
    tasks,
    artifacts,
    worker,
  ] = await Promise.all([
    safeSelect('career_os_daily_operating_reports', `select=id,generated_at,payload,prepared_for_review,auto_apply_eligible,blocked,opportunities_reviewed&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=generated_at.desc&limit=1`, diagnostics),
    safeSelect('career_os_automation_runs', `select=id,status,started_at,finished_at,summary&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=started_at.desc&limit=5`, diagnostics),
    safeSelect('career_os_applications', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc&limit=500`, diagnostics),
    safeSelect('career_os_job_postings', `select=id,company,title,status,posting_validation_status,fit_score,updated_at,last_checked_at&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=fit_score.desc.nullslast,last_checked_at.desc&limit=500`, diagnostics),
    safeSelect('career_os_opportunities', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc&limit=500`, diagnostics),
    safeSelect('career_os_tasks', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc&limit=100`, diagnostics),
    safeSelect('career_os_artifacts', `select=id,artifact_type,approval_status,validation_status,application_id,opportunity_id,created_at&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=created_at.desc&limit=200`, diagnostics),
    safeWorkerHealth(ownerEmail, diagnostics),
  ]);

  const dailyReport = dailyReports[0];
  const reportPayload = asRecord(dailyReport?.payload);
  const reportCycle = asRecord(reportPayload.daily_operating_cycle);
  const reportRelease = asRecord(reportPayload.release_progress_20260719);
  const pipelineHealth = asRecord(reportCycle.pipelineHealth);
  const marketCoverage = asRecord(reportCycle.marketCoverage);
  const dailyFunnel = asRecord(reportCycle.dailyFunnel);
  const applicationExecution = summarizeApplicationExecution(applications);
  const activeOpportunities = jobPostings.filter((row) => !isInactive(row.status) && !isInactive(row.posting_validation_status));
  const strongOpportunities = activeOpportunities.filter((row) => numberValue(row.fit_score) >= 85);
  const openTasks = tasks.filter((row) => !['approved', 'rejected', 'deferred', 'completed', 'dismissed'].includes(stringValue(row.status).toLowerCase()));
  const submittedApplications = firstPositiveNumber(
    reportRelease.submitted_applications,
    pipelineHealth.totalSubmitted,
    applicationExecution.submitted,
  );
  const waitingOnTomas = firstPositiveNumber(
    reportRelease.waiting_on_tomas,
    pipelineHealth.waitingOnTomas,
    openTasks.length,
    applicationExecution.waitingOnTomas,
  );
  const readyForAutomation = firstPositiveNumber(
    reportRelease.ready_for_automation,
    pipelineHealth.readyForAutomation,
    applicationExecution.queueStates.queued,
  );
  const activeQualifiedOpportunities = firstPositiveNumber(
    reportRelease.active_qualified_opportunities,
    marketCoverage.qualifiedMatches,
    strongOpportunities.length,
  );
  const totalUniqueOpportunities = firstPositiveNumber(
    reportRelease.total_unique_opportunities,
    activeOpportunities.length,
    opportunities.length,
  );
  const durationMs = Date.now() - startedAt;
  const transport = getCareerOsTransportHealth();
  const productionEvidenceReady = diagnostics.length === 0 && Boolean(dailyReport);

  return NextResponse.json(
    {
      ok: productionEvidenceReady,
      mode: productionEvidenceReady ? 'live' : 'degraded',
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      generatedAt: new Date().toISOString(),
      blocker: productionEvidenceReady ? null : diagnostics[0] || 'Career OS production evidence is temporarily unavailable.',
      durationMs,
      deployment: {
        commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
        deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_BASE_URL || null,
        region: process.env.VERCEL_REGION || null,
        vercelEnv: process.env.VERCEL_ENV || null,
      },
      counts: {
        activeOpportunities: activeOpportunities.length,
        activeQualifiedOpportunities,
        artifacts: artifacts.length,
        humanOnlyGates: waitingOnTomas,
        readyForAutomation,
        remainingQualifiedApplications: Math.max(activeQualifiedOpportunities - submittedApplications, 0),
        reviewQueueCount: Math.max(activeQualifiedOpportunities - submittedApplications - waitingOnTomas - readyForAutomation, 0),
        submittedApplications,
        totalUniqueOpportunities,
        waitingOnTomas,
        worthApplyingToday: activeQualifiedOpportunities,
      },
      data: {
        applications: applications.length,
        artifacts: artifacts.length,
        automationRuns: automationRuns.length,
        jobPostings: jobPostings.length,
        opportunities: opportunities.length,
        tasks: tasks.length,
      },
      latestAutomationRun: automationRuns[0] ? {
        finishedAt: automationRuns[0].finished_at || null,
        id: automationRuns[0].id || null,
        startedAt: automationRuns[0].started_at || null,
        status: automationRuns[0].status || null,
      } : null,
      latestSnapshot: dailyReport ? {
        generatedAt: dailyReport.generated_at || null,
        id: dailyReport.id || null,
      } : null,
      applicationExecution,
      workdayFirst: {
        mode: 'workday_first',
        plainEnglish: stringValue(reportCycle.workdayFirstPlainEnglish)
          || 'Career OS is prioritizing supported Workday applications before deferred ATS phases.',
        workdayReadyToProcess: readyForAutomation,
        workdaySubmitted: submittedApplications,
        workdayWaitingOnHumanCode: waitingOnTomas,
        workdayWaitingOnMissingAnswer: numberValue(pipelineHealth.missingAnswerGates),
      },
      dailyWorkflow: {
        status: stringValue(reportCycle.status) || (dailyReport ? 'configured' : 'snapshot_unavailable'),
        dailyFunnel,
        marketCoverage,
        pipelineHealth,
      },
      supabase: {
        connectivity: diagnostics.length ? 'degraded' : 'ok',
        diagnostics,
        transport,
      },
      worker,
      productionEvidenceReady,
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  );
}

async function safeSelect(table: string, query: string, diagnostics: string[]) {
  try {
    return await careerOsSelectRows(table, query);
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : `Supabase ${table} query failed.`);
    return [];
  }
}

async function safeWorkerHealth(ownerEmail: string, diagnostics: string[]) {
  try {
    return await browserWorkerHealth(ownerEmail);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker health failed.';
    diagnostics.push(message);
    return {
      configured: false,
      eligible: 0,
      error: message,
      running: 0,
    };
  }
}

function summarizeApplicationExecution(applications: JsonRecord[]) {
  const queueStates = {
    blocked_technical: 0,
    confirmed: 0,
    duplicate: 0,
    failed: 0,
    queued: 0,
    running: 0,
    submitted: 0,
    waiting_on_tomas: 0,
  };

  for (const application of applications) {
    const statusText = `${application.lifecycle_stage || ''} ${application.next_action || ''} ${JSON.stringify(application.raw_record || {})} ${JSON.stringify(application.browser_worker || {})}`.toLowerCase();
    if (application.confirmation_number || application.submission_evidence || hasAny(statusText, ['submitted', 'confirmed'])) {
      queueStates.confirmed += 1;
    } else if (hasAny(statusText, ['running'])) {
      queueStates.running += 1;
    } else if (hasAny(statusText, ['queued', 'ready', 'resume'])) {
      queueStates.queued += 1;
    } else if (hasAny(statusText, ['human', 'tomas', 'legal', 'privacy', 'account', 'compensation', 'missing'])) {
      queueStates.waiting_on_tomas += 1;
    } else if (hasAny(statusText, ['technical', 'blocked', 'failed'])) {
      queueStates.blocked_technical += 1;
    }
  }

  return {
    confirmed: queueStates.confirmed,
    failedWithError: queueStates.failed,
    queueStates,
    runningNow: queueStates.running,
    submitted: queueStates.confirmed,
    submittedToday: 0,
    technicallyBlocked: queueStates.blocked_technical,
    waitingOnTomas: queueStates.waiting_on_tomas,
  };
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return stringValue(value).replace(/^"|"$/g, '');
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numberValue(value);
    if (number > 0) return number;
  }
  return 0;
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function isInactive(value: unknown) {
  return hasAny(stringValue(value).toLowerCase(), ['inactive', 'closed', 'expired', 'unavailable', 'ineligible']);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value: unknown) {
  return String(value || '').trim();
}

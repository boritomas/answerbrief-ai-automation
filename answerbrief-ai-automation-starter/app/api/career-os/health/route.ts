import { NextResponse } from 'next/server';
import { browserWorkerHealth } from '@/lib/career-os-browser-worker';
import {
  careerOsSelectRows,
  getCareerOsTransportHealth,
  type CareerOsTransportStatus,
} from '@/lib/career-os-supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const runtime = 'nodejs';

export async function GET() {
  const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
  const startedAt = Date.now();
  const diagnostics: string[] = [];

  const [readCheck, snapshotCheck, worker] = await Promise.all([
    timedRead(ownerEmail, diagnostics),
    timedSnapshot(ownerEmail, diagnostics),
    safeWorkerHealth(ownerEmail, diagnostics),
  ]);
  const totalDurationMs = Date.now() - startedAt;
  const transport = getCareerOsTransportHealth();
  const healthState = determineHealthState(readCheck.ok, transport.status, totalDurationMs);
  const healthy = healthState === 'healthy';
  const candidateMessage = candidateMessageForState(healthState);

  return NextResponse.json({
    ok: healthy,
    mode: healthy ? 'live' : 'degraded',
    candidateMessage,
    admin: {
      diagnostics,
      currentSystemState: healthState,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_BASE_URL || null,
      incidentCount: transport.incidents.filter((incident) => !incident.resolvedAt).length,
      lastAutomationRun: snapshotCheck.lastAutomationRun || null,
      lastSnapshotRefresh: snapshotCheck.lastSnapshotRefresh || null,
      liveStatusEnvironment: readCheck.ok ? 'production' : 'degraded',
      queryDurationMs: readCheck.durationMs,
      totalDurationMs,
      writeAccess: 'incident_logging_in_memory_only',
    },
    supabase: {
      connectivity: readCheck.ok ? 'ok' : 'error',
      durationMs: readCheck.durationMs,
      error: readCheck.error || null,
      readAccess: readCheck.ok,
      transport,
    },
    snapshot: {
      available: Boolean(snapshotCheck.lastSnapshotRefresh),
      generatedAt: snapshotCheck.lastSnapshotRefresh || null,
    },
    worker,
  });
}

async function timedRead(ownerEmail: string, diagnostics: string[]) {
  const startedAt = Date.now();
  try {
    await careerOsSelectRows(
      'career_os_daily_operating_reports',
      `select=id,generated_at&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=generated_at.desc&limit=1`,
    );
    return { durationMs: Date.now() - startedAt, error: '', ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Health read failed.';
    diagnostics.push(message);
    return { durationMs: Date.now() - startedAt, error: message, ok: false };
  }
}

async function timedSnapshot(ownerEmail: string, diagnostics: string[]) {
  const startedAt = Date.now();
  try {
    const [dailyReportRows, automationRunRows] = await Promise.all([
      careerOsSelectRows(
        'career_os_daily_operating_reports',
        `select=generated_at&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=generated_at.desc&limit=1`,
      ),
      careerOsSelectRows(
        'career_os_automation_runs',
        `select=started_at,finished_at&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=started_at.desc&limit=1`,
      ),
    ]);
    const latestRun = automationRunRows[0] || {};
    return {
      durationMs: Date.now() - startedAt,
      lastAutomationRun: String(latestRun.finished_at || latestRun.started_at || '') || null,
      lastSnapshotRefresh: String(dailyReportRows[0]?.generated_at || '') || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Snapshot read failed.';
    diagnostics.push(message);
    return {
      durationMs: Date.now() - startedAt,
      lastAutomationRun: null,
      lastSnapshotRefresh: null,
    };
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

function determineHealthState(readOk: boolean, transportStatus: CareerOsTransportStatus, totalDurationMs: number) {
  if (transportStatus === 'configuration_error') return 'maintenance';
  if (!readOk || transportStatus === 'database_unavailable') return 'infrastructure_recovery_required';
  if (transportStatus === 'rest_fallback_active') return 'database_fallback';
  if (totalDurationMs > 2000) return 'performance_degraded';
  return 'healthy';
}

function candidateMessageForState(state: string) {
  if (state === 'healthy') return 'Career OS is healthy. Automation remains paused until explicit restart approval.';
  if (state === 'performance_degraded') return 'Career OS is operational, but response time is above the preferred target. Automation remains paused.';
  if (state === 'database_fallback') return 'Career OS is operating on the verified REST fallback. Automation remains paused until recovery checks pass.';
  if (state === 'maintenance') return 'Career OS configuration is incomplete. Automation is paused.';
  return 'System temporarily unavailable. Automation is paused to protect your applications.';
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

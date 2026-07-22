import { NextResponse } from 'next/server';
import { browserWorkerHealth } from '@/lib/career-os-browser-worker';
import { getCareerOsStatus } from '@/lib/career-os-status';
import { careerOsSelectRows } from '@/lib/career-os-supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const runtime = 'nodejs';

export async function GET() {
  const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
  const candidateMessage = 'System temporarily unavailable. Automation is paused to protect your applications.';
  const startedAt = Date.now();
  const diagnostics: string[] = [];

  const [readCheck, status, worker] = await Promise.all([
    timedRead(ownerEmail, diagnostics),
    getCareerOsStatus(),
    safeWorkerHealth(ownerEmail, diagnostics),
  ]);

  return NextResponse.json({
    ok: readCheck.ok && status.environment === 'production',
    mode: status.environment === 'production' ? 'live' : 'degraded',
    candidateMessage,
    admin: {
      diagnostics,
      lastAutomationRun: status.dailyWorkflow.immediateQueueProcessor.lastExecutionTime || null,
      lastSnapshotRefresh: status.evidence.dailyReport?.generated_at || null,
      liveStatusEnvironment: status.environment,
      queryDurationMs: readCheck.durationMs,
      totalDurationMs: Date.now() - startedAt,
      writeAccess: 'not_performed_no_dedicated_health_table',
    },
    supabase: {
      connectivity: readCheck.ok ? 'ok' : 'error',
      durationMs: readCheck.durationMs,
      error: readCheck.error || null,
      readAccess: readCheck.ok,
    },
    snapshot: {
      available: Boolean(status.evidence.dailyReport),
      generatedAt: status.evidence.dailyReport?.generated_at || null,
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

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  processCareerOsQueue,
  verifyCareerOsActionToken,
} from '@/lib/career-os-queue';
import { careerOsSelectRows } from '@/lib/career-os-supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

type ActionBody = {
  actionToken?: string;
  actionTokenExpiresAt?: string;
  ownerEmail?: string;
};

type JsonRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as ActionBody;
  const ownerEmail = body.ownerEmail || process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
  const authorized = verifyCareerOsActionToken({
    action: 'run_now',
    expiresAt: clean(body.actionTokenExpiresAt),
    ownerEmail,
    token: clean(body.actionToken),
  });

  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized Career OS action.' }, { status: 401 });
  }

  try {
    const rows = await careerOsSelectRows(
      'career_os_applications',
      `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc&limit=100`,
    ) as JsonRecord[];

    const candidate = rows.find(isRunnableCandidate);
    if (!candidate) {
      return NextResponse.json({
        ok: false,
        status: 'blocked',
        error: 'No single eligible application is currently ready. Open Career OS to resolve a waiting checkpoint or approve a qualified role.',
      }, { status: 409 });
    }

    const applicationId = String(candidate.id || '');
    const queueResult = await processCareerOsQueue({
      allowPausedForApplication: true,
      applicationId,
      ownerEmail,
      trigger: 'run_now',
    });

    return NextResponse.json({
      ok: true,
      status: queueResult.errors.length ? 'error' : 'success',
      applicationId,
      employer: String(candidate.employer || ''),
      position: String(candidate.position || ''),
      queueResult,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Single-application production run failed.',
    }, { status: 502 });
  }
}

function isRunnableCandidate(application: JsonRecord) {
  const lifecycle = String(application.lifecycle_stage || '').toLowerCase();
  const nextAction = String(application.next_action || '').toLowerCase();
  const raw = asRecord(application.raw_record);
  const execution = String(raw.execution_status || '').toLowerCase();
  const hasPackage = Boolean(
    application.exact_resume
    || raw.resume_path
    || raw.package_status
    || raw.package_ready
    || raw.browser_worker,
  );
  const runnableState = [
    lifecycle,
    execution,
    nextAction,
  ].some((value) => /queued|package_ready|ready_for_automation|qualified_pending_application|resumable/.test(value));
  const blocked = /captcha|mfa|identity|legal|privacy|compensation|technical blocker|upload_gate|waiting_on_tomas/.test(
    `${lifecycle} ${execution} ${nextAction}`,
  );
  const terminal = /submitted|confirmed|duplicate|inactive|ineligible/.test(`${lifecycle} ${execution}`);
  return Boolean(application.id && hasPackage && runnableState && !blocked && !terminal);
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^\"|\"$/g, '');
}

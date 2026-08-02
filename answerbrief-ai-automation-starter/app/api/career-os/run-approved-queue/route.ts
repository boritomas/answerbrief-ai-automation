import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { processCareerOsQueue, verifyCareerOsActionToken } from '@/lib/career-os-queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const runtime = 'nodejs';

type ActionBody = {
  actionToken?: string;
  actionTokenExpiresAt?: string;
  ownerEmail?: string;
};

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
    const queueResult = await processCareerOsQueue({
      ownerEmail,
      trigger: 'run_now',
    });

    return NextResponse.json({
      ok: queueResult.errors.length === 0,
      accepted: true,
      status: queueResult.errors.length ? 'error' : 'success',
      runId: queueResult.runId,
      applicationsAudited: queueResult.applicationsAudited,
      automaticallyQueued: queueResult.automaticallyQueued,
      processed: queueResult.processed,
      waitingOnTomas: queueResult.waitingOnTomas,
      technical: queueResult.technical,
      submitted: queueResult.submitted,
      confirmed: queueResult.confirmed,
      errors: queueResult.errors,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      accepted: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Approved queue execution failed.',
    }, { status: 502 });
  }
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^\"|\"$/g, '');
}

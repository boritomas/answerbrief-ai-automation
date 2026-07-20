import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeBrowserWorker, checkBrowserWorkerSubmitSafety } from '@/lib/career-os-browser-worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

type SubmitCheckBody = {
  applicationId?: string;
  ownerEmail?: string;
};

export async function POST(request: NextRequest) {
  const auth = authorizeBrowserWorker(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as SubmitCheckBody;
  const applicationId = clean(body.applicationId);
  const ownerEmail = clean(body.ownerEmail) || clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
  if (!applicationId) {
    return NextResponse.json({ ok: false, error: 'Missing application id.' }, { status: 400 });
  }

  const result = await checkBrowserWorkerSubmitSafety({ applicationId, ownerEmail });
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

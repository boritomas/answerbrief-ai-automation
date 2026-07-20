import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeBrowserWorker, claimNextBrowserWorkerTask } from '@/lib/career-os-browser-worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

type ClaimBody = {
  companionId?: string;
  ownerEmail?: string;
};

export async function POST(request: NextRequest) {
  const auth = authorizeBrowserWorker(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as ClaimBody;
  const companionId = clean(body.companionId) || 'career-os-local-companion';
  const ownerEmail = clean(body.ownerEmail) || clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
  const task = await claimNextBrowserWorkerTask({ companionId, ownerEmail });
  return NextResponse.json({ ok: true, task });
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

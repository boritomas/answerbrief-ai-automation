import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeBrowserWorker, reportBrowserWorkerProgress } from '@/lib/career-os-browser-worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = authorizeBrowserWorker(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  await reportBrowserWorkerProgress(body as never);
  return NextResponse.json({ ok: true });
}

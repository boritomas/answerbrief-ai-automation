import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { claimNextBrowserWorkerTask } from '@/lib/career-os-browser-worker';
import { authorizeBrowserWorker } from '@/lib/career-os-worker-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

type ClaimBody = {
  companionId?: string;
  ownerEmail?: string;
};

export async function POST(request: NextRequest) {
  const auth = await authorizeBrowserWorker(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as ClaimBody;
  const companionId = clean(body.companionId) || 'career-os-local-companion';
  const ownerEmail = clean(body.ownerEmail) || clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
  try {
    const task = await claimNextBrowserWorkerTask({ companionId, ownerEmail });
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error('Career OS browser worker claim failed', { message });
    return NextResponse.json({ ok: false, error: `claim_failed: ${message}` }, { status: 500 });
  }
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const secrets = [
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    clean(process.env.CAREER_OS_BROWSER_WORKER_TOKEN),
  ].filter(Boolean);
  return secrets
    .reduce((current, secret) => current.split(secret).join('[redacted]'), message)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .slice(0, 500);
}

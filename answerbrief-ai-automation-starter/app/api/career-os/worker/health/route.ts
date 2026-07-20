import { NextResponse } from 'next/server';
import { browserWorkerHealth, browserWorkerConfigured } from '@/lib/career-os-browser-worker';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
  const health = await browserWorkerHealth(ownerEmail);
  return NextResponse.json({
    ok: true,
    configured: browserWorkerConfigured(),
    ...health,
  });
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

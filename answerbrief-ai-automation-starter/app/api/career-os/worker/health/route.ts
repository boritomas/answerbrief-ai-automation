import { NextResponse } from 'next/server';
import { browserWorkerHealth } from '@/lib/career-os-browser-worker';
import { browserWorkerGateDiagnostics } from '@/lib/career-os-worker-diagnostics';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
  const [health, diagnostics] = await Promise.all([
    browserWorkerHealth(ownerEmail),
    browserWorkerGateDiagnostics(ownerEmail),
  ]);

  return NextResponse.json({
    ok: true,
    ...health,
    diagnostics,
  });
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

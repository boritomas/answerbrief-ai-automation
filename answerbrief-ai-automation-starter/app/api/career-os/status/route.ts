import { NextResponse } from 'next/server';
import { getCareerOsStatus, summarizeCareerOsStatus } from '@/lib/career-os-status';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await getCareerOsStatus();

  return NextResponse.json({
    status,
    summary: summarizeCareerOsStatus(status),
  });
}

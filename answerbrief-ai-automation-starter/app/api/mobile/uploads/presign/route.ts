import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedMobileEmail, unauthorizedMobileResponse } from '@/lib/mobile-api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  return NextResponse.json(
    {
      error: 'Mobile direct upload storage is not configured yet.',
      uploadMode: 'web-intake-or-future-object-storage',
    },
    { status: 501 }
  );
}

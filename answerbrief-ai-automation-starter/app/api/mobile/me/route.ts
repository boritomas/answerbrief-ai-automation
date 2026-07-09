import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedMobileEmail, unauthorizedMobileResponse } from '@/lib/mobile-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  return NextResponse.json({
    user: {
      email,
      role: 'customer',
    },
  });
}

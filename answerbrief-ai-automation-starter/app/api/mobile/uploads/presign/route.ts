import { NextRequest } from 'next/server';
import { mobileError, getAuthenticatedMobileEmail, unauthorizedMobileResponse } from '@/lib/mobile-api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  return mobileError('Mobile direct upload storage is not configured yet.', 501);
}

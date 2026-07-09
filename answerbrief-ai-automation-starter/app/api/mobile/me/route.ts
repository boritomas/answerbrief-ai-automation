import { NextRequest } from 'next/server';
import { getAuthenticatedMobileEmail, mobileJson, unauthorizedMobileResponse } from '@/lib/mobile-api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  return mobileJson({
    user: {
      email,
      role: 'customer',
    },
  });
}

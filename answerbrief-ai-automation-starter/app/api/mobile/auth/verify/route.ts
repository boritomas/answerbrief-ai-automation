import { NextRequest, NextResponse } from 'next/server';
import {
  createMobileSessionToken,
  getMobileAuthConfiguration,
  isValidEmail,
  verifyMobileOtp,
} from '@/lib/mobile-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
  const configuration = getMobileAuthConfiguration();

  if (!configuration.configured) {
    return NextResponse.json(
      { error: 'Mobile authentication is not configured yet.' },
      { status: 503 }
    );
  }

  if (!isValidEmail(email) || !verifyMobileOtp(otp)) {
    return NextResponse.json({ error: 'Invalid sign-in code.' }, { status: 401 });
  }

  return NextResponse.json({
    token: createMobileSessionToken(email),
    tokenType: 'Bearer',
  });
}

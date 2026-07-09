import { NextRequest, NextResponse } from 'next/server';
import { getMobileAuthConfiguration, isValidEmail } from '@/lib/mobile-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  const configuration = getMobileAuthConfiguration();

  return NextResponse.json({
    email,
    ok: true,
    otpDeliveryConfigured: configuration.otpDeliveryConfigured,
    message: configuration.otpDeliveryConfigured
      ? 'If the email matches an AnswerBrief AI account, a sign-in code will be sent.'
      : 'Mobile OTP delivery is not configured yet. This endpoint is ready for the future mobile app.',
  });
}

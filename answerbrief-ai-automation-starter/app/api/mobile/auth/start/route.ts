import { NextRequest } from 'next/server';
import { mobileError, mobileJson, readMobileJson } from '@/lib/mobile-api';
import { sendMobileOtpEmail } from '@/lib/answerbrief-emails';
import { generateMobileOtp, getMobileAuthConfiguration, isValidEmail } from '@/lib/mobile-auth';
import { checkMobileRateLimit, getMobileRateLimitIdentity } from '@/lib/mobile-rate-limit';
import { recordOrderEvent } from '@/lib/orders';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rateLimit = checkMobileRateLimit(`auth:start:${getMobileRateLimitIdentity(request.headers)}`, {
    limit: 10,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return mobileError(`Too many sign-in attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`, 429);
  }

  const body = await readMobileJson(request);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!isValidEmail(email)) {
    return mobileError('A valid email is required.', 400);
  }

  const configuration = getMobileAuthConfiguration();

  if (!configuration.configured) {
    return mobileError('Mobile authentication is not configured yet.', 503);
  }

  if (!configuration.otpDeliveryConfigured) {
    return mobileError('Mobile OTP delivery is not configured yet.', 503);
  }

  await sendMobileOtpEmail({
    otp: generateMobileOtp(email),
    to: email,
  });

  await recordOrderEvent({
    event: 'auth_started',
    message: `Mobile sign-in started for ${email}.`,
  }).catch(() => undefined);

  return mobileJson({
    email,
    otpDeliveryConfigured: true,
    message: 'If the email matches an AnswerBrief AI account, a sign-in code will be sent.',
  });
}

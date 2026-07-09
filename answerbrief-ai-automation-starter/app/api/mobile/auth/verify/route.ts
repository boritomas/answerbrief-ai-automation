import { NextRequest } from 'next/server';
import { mobileError, mobileJson, readMobileJson } from '@/lib/mobile-api';
import {
  createMobileSessionToken,
  getMobileAuthConfiguration,
  isValidEmail,
  verifyMobileOtp,
} from '@/lib/mobile-auth';
import { checkMobileRateLimit, getMobileRateLimitIdentity } from '@/lib/mobile-rate-limit';
import { recordOrderEvent } from '@/lib/orders';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rateLimit = checkMobileRateLimit(`auth:verify:${getMobileRateLimitIdentity(request.headers)}`, {
    limit: 10,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return mobileError(`Too many verification attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`, 429);
  }

  const body = await readMobileJson(request);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
  const configuration = getMobileAuthConfiguration();

  if (!configuration.configured) {
    return mobileError('Mobile authentication is not configured yet.', 503);
  }

  if (!isValidEmail(email) || !verifyMobileOtp(otp)) {
    return mobileError('Invalid sign-in code.', 401);
  }

  await recordOrderEvent({
    event: 'auth_verified',
    message: `Mobile sign-in verified for ${email}.`,
  }).catch(() => undefined);

  return mobileJson({
    token: createMobileSessionToken(email),
    tokenType: 'Bearer',
  });
}

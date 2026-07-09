import { NextRequest } from 'next/server';
import { getAuthenticatedMobileEmail, mobileError, mobileJson, readMobileJson, unauthorizedMobileResponse } from '@/lib/mobile-api';
import { checkMobileRateLimit, getMobileRateLimitIdentity } from '@/lib/mobile-rate-limit';
import { recordOrderEvent } from '@/lib/orders';
import { saveMobileSupportRequest } from '@/lib/storage/supabase-mobile-records';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rateLimit = checkMobileRateLimit(`support:${getMobileRateLimitIdentity(request.headers)}`, {
    limit: 5,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return mobileError(`Too many support requests. Try again in ${rateLimit.retryAfterSeconds} seconds.`, 429);
  }

  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  const body = await readMobileJson(request);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : undefined;

  if (!message) {
    return mobileError('Support message is required.', 400);
  }

  const storageConfigured = await saveMobileSupportRequest({ email, message, subject }).catch(() => false);

  await recordOrderEvent({
    event: 'support_requested',
    message: `Mobile support requested by ${email}.`,
  }).catch(() => undefined);

  return mobileJson({
    accepted: true,
    message: storageConfigured
      ? 'Support request received.'
      : 'Support request received by the mobile API stub. Email/helpdesk routing is a future integration.',
    storageConfigured,
    supportEmail: 'support@answer-brief.com',
  });
}

import { NextRequest } from 'next/server';
import { getAuthenticatedMobileEmail, mobileError, mobileJson, readMobileJson, unauthorizedMobileResponse } from '@/lib/mobile-api';
import { recordOrderEvent } from '@/lib/orders';
import { saveMobilePushToken } from '@/lib/storage/supabase-mobile-records';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  const body = await readMobileJson(request);
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim() : 'unknown';

  if (!token) {
    return mobileError('Push token is required.', 400);
  }

  const storageConfigured = await saveMobilePushToken({ email, platform, token }).catch(() => false);

  await recordOrderEvent({
    event: 'push_token_registered',
    message: `Mobile push token registered for ${email}.`,
  }).catch(() => undefined);

  return mobileJson({
    accepted: true,
    storageConfigured,
    message: storageConfigured
      ? 'Push token registered.'
      : 'Push token endpoint is ready; durable push-token storage will be enabled with Supabase.',
  });
}

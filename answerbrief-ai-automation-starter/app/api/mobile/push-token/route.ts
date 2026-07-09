import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedMobileEmail, unauthorizedMobileResponse } from '@/lib/mobile-api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'Push token is required.' }, { status: 400 });
  }

  return NextResponse.json({
    accepted: true,
    storageConfigured: false,
    message: 'Push token endpoint is ready; durable push-token storage will be enabled with the mobile database.',
  });
}

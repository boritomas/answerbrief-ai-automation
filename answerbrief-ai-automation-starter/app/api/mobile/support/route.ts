import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedMobileEmail, unauthorizedMobileResponse } from '@/lib/mobile-api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!message) {
    return NextResponse.json({ error: 'Support message is required.' }, { status: 400 });
  }

  return NextResponse.json({
    accepted: true,
    message: 'Support request received by the mobile API stub. Email/helpdesk routing is a Phase 2 integration.',
    supportEmail: 'support@answer-brief.com',
  });
}

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { approveReviewedJobPosting } from '@/lib/career-os-review-approval';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

type ActionBody = {
  actionToken?: string;
  actionTokenExpiresAt?: string;
  employer?: string;
  opportunityId?: string;
  ownerEmail?: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as ActionBody;
  const ownerEmail = body.ownerEmail || process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';

  const result = await approveReviewedJobPosting({
    actionToken: body.actionToken,
    actionTokenExpiresAt: body.actionTokenExpiresAt,
    employer: body.employer,
    opportunityId: body.opportunityId,
    ownerEmail,
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      status: 'success',
      applicationId: result.applicationId,
      message: result.message,
    });
  }

  const httpStatus = result.status === 'unauthorized' ? 401 : result.status === 'error' && result.error === 'Missing review opportunity id.' ? 400 : result.status === 'not_found' ? 404 : 502;
  return NextResponse.json({ ok: false, status: 'error', error: result.error }, { status: httpStatus });
}

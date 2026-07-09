import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedMobileEmail,
  notFoundMobileResponse,
  unauthorizedMobileResponse,
} from '@/lib/mobile-api';
import { intakeSchema } from '@/lib/intake-schema';
import { getOrderForCustomer, saveAuthenticatedOrderIntake } from '@/lib/orders';

export const runtime = 'nodejs';

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: NextRequest, { params }: RouteContext) {
  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  const order = await getOrderForCustomer(params.id, email);

  if (!order) {
    return notFoundMobileResponse();
  }

  const body = await request.json().catch(() => ({}));
  const result = intakeSchema.safeParse({
    name: body.name,
    email,
    targetRole: body.targetRole,
    targetCompany: body.targetCompany,
    interviewDate: body.interviewDate,
    careerLane: body.careerLane,
    jobPostingText: body.jobPostingText,
    notes: body.notes,
  });

  if (!result.success) {
    return NextResponse.json({ error: 'Invalid intake submission.' }, { status: 400 });
  }

  const updatedOrder = await saveAuthenticatedOrderIntake({
    authenticatedEmail: email,
    intake: result.data,
    orderId: params.id,
  });

  return NextResponse.json({
    order: {
      id: updatedOrder.id,
      status: updatedOrder.status,
      intakeStatus: updatedOrder.intakeStatus,
      briefStatus: updatedOrder.briefStatus,
      deliveryStatus: updatedOrder.deliveryStatus,
    },
  });
}

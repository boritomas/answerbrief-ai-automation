import { NextRequest } from 'next/server';
import {
  assertMobileOrderAccess,
  forbiddenMobileResponse,
  getAuthenticatedMobileEmail,
  mobileError,
  mobileJson,
  notFoundMobileResponse,
  readMobileJson,
  unauthorizedMobileResponse,
} from '@/lib/mobile-api';
import { intakeSchema } from '@/lib/intake-schema';
import { getOrderById, recordOrderEvent, saveAuthenticatedOrderIntake } from '@/lib/orders';

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

  const order = await getOrderById(params.id);

  if (!order) {
    return notFoundMobileResponse();
  }

  if (!assertMobileOrderAccess(order.customerEmail, email)) {
    return forbiddenMobileResponse();
  }

  const body = await readMobileJson(request);
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
    return mobileError('Invalid intake submission.', 400);
  }

  const updatedOrder = await saveAuthenticatedOrderIntake({
    authenticatedEmail: email,
    intake: result.data,
    orderId: params.id,
  });

  await recordOrderEvent({
    event: 'intake_submitted',
    message: `Mobile intake submitted by ${email}.`,
    orderId: updatedOrder.id,
  }).catch(() => undefined);

  return mobileJson({
    order: {
      id: updatedOrder.id,
      status: updatedOrder.status,
      intakeStatus: updatedOrder.intakeStatus,
      briefStatus: updatedOrder.briefStatus,
      deliveryStatus: updatedOrder.deliveryStatus,
    },
  });
}

import { NextRequest } from 'next/server';
import {
  assertMobileOrderAccess,
  forbiddenMobileResponse,
  getAuthenticatedMobileEmail,
  mobileJson,
  notFoundMobileResponse,
  unauthorizedMobileResponse,
} from '@/lib/mobile-api';
import { getOrderById } from '@/lib/orders';

export const runtime = 'nodejs';

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(request: NextRequest, { params }: RouteContext) {
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

  return mobileJson({
    order: {
      id: order.id,
      packageName: order.packageName,
      paymentStatus: order.paymentStatus,
      intakeStatus: order.intakeStatus,
      briefStatus: order.briefStatus,
      deliveryStatus: order.deliveryStatus,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      deliveryDate: order.deliveryDate,
      generatedBriefUrl: order.generatedBriefUrl,
      intakeSubmittedAt: order.intakeSubmittedAt,
    },
  });
}

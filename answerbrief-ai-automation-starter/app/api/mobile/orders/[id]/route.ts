import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedMobileEmail,
  notFoundMobileResponse,
  unauthorizedMobileResponse,
} from '@/lib/mobile-api';
import { getOrderForCustomer } from '@/lib/orders';

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

  const order = await getOrderForCustomer(params.id, email);

  if (!order) {
    return notFoundMobileResponse();
  }

  return NextResponse.json({
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

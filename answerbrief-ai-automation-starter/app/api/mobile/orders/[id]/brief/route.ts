import { NextRequest } from 'next/server';
import {
  assertMobileOrderAccess,
  forbiddenMobileResponse,
  getAuthenticatedMobileEmail,
  mobileJson,
  notFoundMobileResponse,
  unauthorizedMobileResponse,
} from '@/lib/mobile-api';
import { getOrderById, recordOrderEvent } from '@/lib/orders';

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

  await recordOrderEvent({
    event: 'brief_viewed',
    message: `Mobile brief viewed by ${email}.`,
    orderId: order.id,
  }).catch(() => undefined);

  return mobileJson({
    brief: {
      generatedBriefMode: order.generatedBriefMode,
      generatedBriefUrl: order.generatedBriefUrl,
      status: order.briefStatus,
    },
  });
}

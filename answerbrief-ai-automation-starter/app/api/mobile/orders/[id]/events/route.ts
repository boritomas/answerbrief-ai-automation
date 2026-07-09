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
    events: order.logs.map((log, index) => ({
      id: `${order.id}-${index}`,
      at: log.at,
      event: log.event,
      message: log.message,
      severity: log.event.includes('failed') || log.event.includes('rejected') ? 'error' : 'info',
    })),
  });
}

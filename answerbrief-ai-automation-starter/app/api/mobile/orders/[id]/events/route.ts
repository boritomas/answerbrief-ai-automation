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
    events: order.logs.map((log, index) => ({
      id: `${order.id}-${index}`,
      at: log.at,
      event: log.event,
      message: log.message,
      severity: log.event.includes('failed') || log.event.includes('rejected') ? 'error' : 'info',
    })),
  });
}

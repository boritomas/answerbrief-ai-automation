import { NextRequest } from 'next/server';
import { getAuthenticatedMobileEmail, mobileJson, unauthorizedMobileResponse } from '@/lib/mobile-api';
import { listOrdersForCustomer } from '@/lib/orders';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const email = getAuthenticatedMobileEmail(request);

  if (!email) {
    return unauthorizedMobileResponse();
  }

  const orders = await listOrdersForCustomer(email);

  return mobileJson({
    orders: orders.map((order) => ({
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
    })),
  });
}

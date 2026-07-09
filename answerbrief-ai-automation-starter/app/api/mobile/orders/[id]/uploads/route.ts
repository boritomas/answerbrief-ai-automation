import { NextRequest } from 'next/server';
import {
  assertMobileOrderAccess,
  forbiddenMobileResponse,
  getAuthenticatedMobileEmail,
  mobileJson,
  notFoundMobileResponse,
  readMobileJson,
  unauthorizedMobileResponse,
} from '@/lib/mobile-api';
import { appendOrderLogForCustomer, getOrderById, recordOrderEvent } from '@/lib/orders';

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
  const filename = typeof body.filename === 'string' ? body.filename : 'mobile-upload';

  await recordOrderEvent({
    event: 'upload_started',
    message: `Mobile upload metadata started for ${filename}.`,
    orderId: params.id,
  }).catch(() => undefined);

  await appendOrderLogForCustomer({
    customerEmail: email,
    event: 'mobile_upload_metadata_received',
    message: `Mobile upload metadata received for ${filename}. Direct object storage is not configured yet.`,
    orderId: params.id,
  });

  await recordOrderEvent({
    event: 'upload_recorded',
    message: `Mobile upload metadata recorded for ${filename}.`,
    orderId: params.id,
  }).catch(() => undefined);

  return mobileJson({
    accepted: true,
    uploadStatus: 'metadata_received',
    storageConfigured: false,
  });
}

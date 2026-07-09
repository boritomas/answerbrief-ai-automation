import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedMobileEmail,
  notFoundMobileResponse,
  unauthorizedMobileResponse,
} from '@/lib/mobile-api';
import { appendOrderLogForCustomer, getOrderForCustomer } from '@/lib/orders';

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
  const filename = typeof body.filename === 'string' ? body.filename : 'mobile-upload';

  await appendOrderLogForCustomer({
    customerEmail: email,
    event: 'mobile_upload_metadata_received',
    message: `Mobile upload metadata received for ${filename}. Direct object storage is not configured yet.`,
    orderId: params.id,
  });

  return NextResponse.json({
    accepted: true,
    uploadStatus: 'metadata_received',
    storageConfigured: false,
  });
}

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
import { uploadDriveFile } from '@/lib/google-drive';
import { appendOrderLogForCustomer, getOrderById, recordOrderEvent, retryOrderFulfillment } from '@/lib/orders';
import { saveMobileUploadRecord } from '@/lib/storage/supabase-mobile-records';

export const runtime = 'nodejs';

const maxMobileUploadBytes = 8 * 1024 * 1024;

type MobileUploadBody = {
  contentBase64?: unknown;
  contentType?: unknown;
  filename?: unknown;
  size?: unknown;
};

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

  const body = await readMobileJson(request) as MobileUploadBody;
  const filename = typeof body.filename === 'string' ? body.filename : 'mobile-upload';
  const contentType = typeof body.contentType === 'string' ? body.contentType : 'application/octet-stream';
  const size = typeof body.size === 'number' ? body.size : undefined;
  const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64 : '';

  await recordOrderEvent({
    event: 'upload_started',
    message: `Mobile upload metadata started for ${filename}.`,
    orderId: params.id,
  }).catch(() => undefined);

  if (!contentBase64) {
    await appendOrderLogForCustomer({
      customerEmail: email,
      event: 'mobile_upload_metadata_received',
      message: `Mobile upload metadata received for ${filename}. No file content was provided by the client.`,
      orderId: params.id,
    });

    await saveMobileUploadRecord({
      contentType,
      filename,
      orderId: params.id,
      sizeBytes: size,
      uploadStatus: 'pending',
    }).catch(() => false);

    return mobileJson({
      accepted: true,
      uploadStatus: 'metadata_received',
      storageConfigured: false,
    });
  }

  const content = Buffer.from(contentBase64, 'base64');

  if (content.byteLength > maxMobileUploadBytes) {
    await saveMobileUploadRecord({
      contentType,
      filename,
      orderId: params.id,
      sizeBytes: content.byteLength,
      uploadStatus: 'failed',
    }).catch(() => false);

    return mobileError('File is too large. Upload files smaller than 8 MB.', 413);
  }

  if (!order.driveFolderId) {
    await appendOrderLogForCustomer({
      customerEmail: email,
      event: 'mobile_upload_failed',
      message: `Mobile upload failed for ${filename} because no Drive folder is attached to the order.`,
      orderId: params.id,
    });

    await saveMobileUploadRecord({
      contentType,
      filename,
      orderId: params.id,
      sizeBytes: content.byteLength,
      uploadStatus: 'failed',
    }).catch(() => false);

    return mobileError('Upload storage is not ready for this order yet.', 409);
  }

  try {
    const uploaded = await uploadDriveFile({
      content,
      contentType,
      filename,
      folderId: order.driveFolderId,
    });

    await appendOrderLogForCustomer({
      customerEmail: email,
      event: 'mobile_file_uploaded_to_drive',
      message: `Mobile file uploaded to Drive: ${filename}.`,
      orderId: params.id,
    });

    await saveMobileUploadRecord({
      contentType,
      filename,
      orderId: params.id,
      sizeBytes: content.byteLength,
      storageKey: uploaded?.id,
      uploadStatus: 'uploaded',
    }).catch(() => false);

    await recordOrderEvent({
      event: 'upload_recorded',
      message: `Mobile upload stored for ${filename}.`,
      orderId: params.id,
    }).catch(() => undefined);

    if (order.intakeStatus === 'complete') {
      await retryOrderFulfillment(params.id).catch(async (error) => {
        await appendOrderLogForCustomer({
          customerEmail: email,
          event: 'fulfillment_retry_failed_after_upload',
          message: error instanceof Error ? error.message : 'Unknown fulfillment retry error.',
          orderId: params.id,
        });
      });
    }

    return mobileJson({
      accepted: true,
      fileUrl: uploaded?.webViewLink,
      storageConfigured: true,
      uploadStatus: 'uploaded',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown mobile upload error.';

    await appendOrderLogForCustomer({
      customerEmail: email,
      event: 'mobile_upload_failed',
      message,
      orderId: params.id,
    });

    await saveMobileUploadRecord({
      contentType,
      filename,
      orderId: params.id,
      sizeBytes: content.byteLength,
      uploadStatus: 'failed',
    }).catch(() => false);

    await recordOrderEvent({
      event: 'upload_recorded',
      message: `Mobile upload failed for ${filename}.`,
      orderId: params.id,
      severity: 'error',
    }).catch(() => undefined);

    return mobileError('File upload failed. Please try again or contact support.', 502);
  }
}

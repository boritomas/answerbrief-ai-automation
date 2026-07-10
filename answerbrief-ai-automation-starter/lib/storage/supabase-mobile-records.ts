import { isSupabaseOrderStoreConfigured } from './supabase-orders';

type PushTokenInput = {
  email: string;
  platform?: string;
  token: string;
};

type SupportRequestInput = {
  email: string;
  message: string;
  subject?: string;
};

type UploadRecordInput = {
  contentType: string;
  filename: string;
  orderId: string;
  sizeBytes?: number;
  storageKey?: string;
  uploadStatus: 'pending' | 'uploaded' | 'failed';
};

export async function saveMobilePushToken(input: PushTokenInput) {
  if (!isSupabaseOrderStoreConfigured()) {
    return false;
  }

  await supabaseRequest('/rest/v1/push_tokens?on_conflict=token', {
    body: JSON.stringify({
      email: input.email,
      platform: input.platform || 'unknown',
      token: input.token,
    }),
    headers: {
      Prefer: 'resolution=merge-duplicates',
    },
    method: 'POST',
  });

  return true;
}

export async function saveMobileUploadRecord(input: UploadRecordInput) {
  if (!isSupabaseOrderStoreConfigured()) {
    return false;
  }

  await supabaseRequest('/rest/v1/uploads', {
    body: JSON.stringify({
      content_type: input.contentType,
      filename: input.filename,
      order_id: input.orderId,
      size_bytes: input.sizeBytes || null,
      storage_key: input.storageKey || null,
      upload_status: input.uploadStatus,
    }),
    method: 'POST',
  });

  return true;
}

export async function saveMobileSupportRequest(input: SupportRequestInput) {
  if (!isSupabaseOrderStoreConfigured()) {
    return false;
  }

  await supabaseRequest('/rest/v1/support_requests', {
    body: JSON.stringify({
      email: input.email,
      message: input.message,
      subject: input.subject || 'Mobile support request',
    }),
    method: 'POST',
  });

  return true;
}

async function supabaseRequest(path: string, init: RequestInit) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase mobile record request failed with status ${response.status}.`);
  }
}

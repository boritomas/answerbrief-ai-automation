import { isSupabaseOrderStoreConfigured } from './supabase-orders';

type UploadRecordInput = {
  contentType: string;
  filename: string;
  orderId: string;
  sizeBytes?: number;
  storageKey?: string;
  uploadStatus: 'pending' | 'uploaded' | 'failed';
};

type BriefRecordInput = {
  deliveryUrl?: string;
  filename: string;
  generationMode: string;
  orderId: string;
  status: string;
};

export async function saveUploadRecord(input: UploadRecordInput) {
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

export async function saveBriefRecord(input: BriefRecordInput) {
  if (!isSupabaseOrderStoreConfigured()) {
    return false;
  }

  await supabaseRequest('/rest/v1/briefs', {
    body: JSON.stringify({
      delivery_url: input.deliveryUrl || null,
      filename: input.filename,
      generation_mode: input.generationMode,
      order_id: input.orderId,
      status: input.status,
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
    throw new Error(`Supabase artifact request failed with status ${response.status}: ${await response.text()}`);
  }
}

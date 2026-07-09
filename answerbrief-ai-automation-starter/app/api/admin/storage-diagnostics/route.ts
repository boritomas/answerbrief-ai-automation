import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Order } from '@/lib/orders';
import { getOrderStorageDiagnostics, getOrderStore } from '@/lib/storage/orders';
import { getSupabaseOrderStoreConfiguration } from '@/lib/storage/supabase-orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requiredTables = [
  'users',
  'orders',
  'order_events',
  'intake_submissions',
  'uploads',
  'briefs',
  'push_tokens',
  'support_requests',
];

export async function GET(request: NextRequest) {
  const auth = authorizeAdmin(request);

  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const diagnostics = getOrderStorageDiagnostics();
  const url = new URL(request.url);
  const runSmoke = url.searchParams.get('smoke') === '1';

  if (!runSmoke) {
    return NextResponse.json({
      ok: true,
      ...diagnostics,
    });
  }

  try {
    const smoke = await runStorageSmokeTest();

    return NextResponse.json({
      ok: smoke.ok,
      ...diagnostics,
      smoke,
    }, { status: smoke.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      ...diagnostics,
      smoke: {
        ok: false,
        error: error instanceof Error ? error.message : 'Storage smoke test failed.',
      },
    }, { status: 500 });
  }
}

function authorizeAdmin(request: NextRequest) {
  const password = process.env.ADMIN_DASHBOARD_PASSWORD;

  if (!password) {
    return { authorized: false };
  }

  const url = new URL(request.url);
  const queryPassword = url.searchParams.get('password');
  const headerPassword = request.headers.get('x-admin-password');

  return {
    authorized: queryPassword === password || headerPassword === password,
  };
}

async function runStorageSmokeTest() {
  const store = getOrderStore();
  const configuration = getSupabaseOrderStoreConfiguration();

  if (!configuration.configured) {
    throw new Error('Supabase storage is not configured.');
  }

  const now = new Date().toISOString();
  const orderId = randomUUID();
  const email = 'codex-smoke-answerbrief@example.com';
  const order: Order = {
    id: orderId,
    amountPaid: 0,
    briefStatus: 'not_started',
    createdAt: now,
    customerEmail: email,
    customerName: 'Codex Storage Smoke Test',
    deliveryDate: now.slice(0, 10),
    deliveryStatus: 'not_started',
    intake: {
      careerLane: 'operations',
      email,
      jobPostingText: 'Synthetic storage smoke test.',
      name: 'Codex Storage Smoke Test',
      notes: 'source: codex_storage_smoke_test',
      targetCompany: 'AnswerBrief AI',
      targetRole: 'Storage Verification',
    },
    intakeStatus: 'complete',
    intakeSubmittedAt: now,
    logs: [{
      at: now,
      event: 'codex_storage_smoke_test',
      message: 'Synthetic storage smoke test.',
    }],
    packageName: 'Storage Smoke Test',
    paymentStatus: 'unpaid',
    status: 'In Progress',
    updatedAt: now,
  };

  try {
    const existingOrders = await store.listOrders();
    await store.saveOrders([...existingOrders.filter((item) => item.id !== orderId), order]);
    await store.appendOrderEvent?.({
      event: 'codex_storage_smoke_test',
      message: 'Synthetic storage smoke test event.',
      orderId,
    });

    const storedOrders = await store.listOrders();
    const readBackFromStore = storedOrders.some((item) => item.id === orderId);
    const tableChecks = await verifySupabaseTables(orderId);

    return {
      cleanedUp: await cleanupSupabaseSmokeData(orderId),
      orderEventsWrite: tableChecks.orderEventsWrite,
      orderReadBack: readBackFromStore,
      ordersWrite: tableChecks.ordersWrite,
      intakeSubmissionsWrite: tableChecks.intakeSubmissionsWrite,
      ok: readBackFromStore
        && tableChecks.ordersWrite
        && tableChecks.orderEventsWrite
        && tableChecks.intakeSubmissionsWrite,
      source: 'codex_storage_smoke_test',
      tables: tableChecks.tables,
    };
  } catch (error) {
    await cleanupSupabaseSmokeData(orderId).catch(() => false);
    throw error;
  }
}

async function verifySupabaseTables(orderId: string) {
  const tables = await Promise.all(requiredTables.map(async (table) => {
    const ok = await supabaseRequest(`/rest/v1/${table}?select=*&limit=1`).then(() => true).catch(() => false);
    return [table, ok] as const;
  }));

  const orderRows = await supabaseRequest<{ id: string }[]>(`/rest/v1/orders?id=eq.${orderId}&select=id`);
  const eventRows = await supabaseRequest<{ id: string }[]>(`/rest/v1/order_events?order_id=eq.${orderId}&select=id`);
  const intakeRows = await supabaseRequest<{ id: string }[]>(`/rest/v1/intake_submissions?order_id=eq.${orderId}&select=id`);

  return {
    intakeSubmissionsWrite: intakeRows.length > 0,
    orderEventsWrite: eventRows.length > 0,
    ordersWrite: orderRows.length > 0,
    tables: Object.fromEntries(tables),
  };
}

async function cleanupSupabaseSmokeData(orderId: string) {
  await supabaseRequest(`/rest/v1/orders?id=eq.${orderId}`, {
    method: 'DELETE',
  });

  const remaining = await supabaseRequest<{ id: string }[]>(`/rest/v1/orders?id=eq.${orderId}&select=id`);
  return remaining.length === 0;
}

async function supabaseRequest<T = unknown>(path: string, init: RequestInit = {}) {
  const configuration = getSupabaseOrderStoreConfiguration();
  const response = await fetch(`${configuration.supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: configuration.serviceRoleKey,
      Authorization: `Bearer ${configuration.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase diagnostics request failed with status ${response.status}.`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

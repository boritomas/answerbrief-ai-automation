import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createPaidOrder, listOrders, saveOrderIntake } from '@/lib/orders';
import type { Order } from '@/lib/orders';
import { getDriveAuthMode, isDriveConfigured } from '@/lib/google-drive';
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
  const integrationDiagnostics = getIntegrationDiagnostics();
  const url = new URL(request.url);
  const runSmoke = url.searchParams.get('smoke') === '1';
  const runCleanup = url.searchParams.get('cleanup') === '1';
  const runJourney = url.searchParams.get('journey') === '1';

  if (runCleanup) {
    try {
      return NextResponse.json({
        ok: true,
        ...diagnostics,
        integrations: integrationDiagnostics,
        cleanup: await cleanupSyntheticData(),
      });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        ...diagnostics,
        integrations: integrationDiagnostics,
        cleanup: {
          ok: false,
          error: error instanceof Error ? error.message : 'Synthetic cleanup failed.',
        },
      }, { status: 500 });
    }
  }

  if (runJourney) {
    try {
      const journey = await runSyntheticCustomerJourney();

      return NextResponse.json({
        ok: journey.ok,
        ...diagnostics,
        integrations: integrationDiagnostics,
        journey,
      }, { status: journey.ok ? 200 : 500 });
    } catch (error) {
      await cleanupSyntheticData().catch(() => undefined);

      return NextResponse.json({
        ok: false,
        ...diagnostics,
        integrations: integrationDiagnostics,
        journey: {
          ok: false,
          error: error instanceof Error ? error.message : 'Synthetic customer journey failed.',
        },
      }, { status: 500 });
    }
  }

  if (!runSmoke) {
    return NextResponse.json({
      ok: true,
      ...diagnostics,
      integrations: integrationDiagnostics,
    });
  }

  try {
    const smoke = await runStorageSmokeTest();

    return NextResponse.json({
      ok: smoke.ok,
      ...diagnostics,
      integrations: integrationDiagnostics,
      smoke,
    }, { status: smoke.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      ...diagnostics,
      integrations: integrationDiagnostics,
      smoke: {
        ok: false,
        error: error instanceof Error ? error.message : 'Storage smoke test failed.',
      },
    }, { status: 500 });
  }
}

function getIntegrationDiagnostics() {
  return {
    driveConfigured: isDriveConfigured(),
    driveAuthMode: getDriveAuthMode(),
    gmailConfigured: Boolean(
      process.env.GMAIL_CLIENT_ID
      && process.env.GMAIL_CLIENT_SECRET
      && process.env.GMAIL_REFRESH_TOKEN
      && process.env.GMAIL_SENDER_EMAIL
    ),
    gmailRecipientConfigured: Boolean(
      process.env.OWNER_NOTIFICATION_EMAIL
      || process.env.NOTIFICATION_EMAIL
      || process.env.ADMIN_NOTIFICATION_EMAIL
      || process.env.GMAIL_SENDER_EMAIL
    ),
  };
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

async function runSyntheticCustomerJourney() {
  await cleanupSyntheticData();

  const email = 'codex-smoke-answerbrief@example.com';
  const order = await createPaidOrder({
    amountPaid: 14900,
    customerEmail: email,
    customerName: 'Codex E2E Smoke Test',
    packageKey: 'full-interview-brief',
    packageName: 'Interview Professional',
    stripePaymentId: `pi_codex_smoke_${Date.now()}`,
    stripeSessionId: `cs_codex_smoke_${Date.now()}`,
  });

  const updatedOrder = await saveOrderIntake({
    intake: {
      careerLane: 'operations',
      email,
      interviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      jobPostingText: 'Synthetic public job posting for production workflow verification.',
      name: 'Codex E2E Smoke Test',
      notes: 'source: codex_storage_smoke_test',
      targetCompany: 'AnswerBrief AI Verification',
      targetRole: 'Operations Strategy Manager',
    },
    orderId: order.id,
    token: order.intakeToken,
    uploads: [
      {
        content: Buffer.from('Synthetic resume for production verification.', 'utf8'),
        contentType: 'text/plain',
        filename: 'codex-smoke-resume.txt',
      },
      {
        content: Buffer.from('Synthetic job posting upload for production verification.', 'utf8'),
        contentType: 'text/plain',
        filename: 'codex-smoke-job-posting.txt',
      },
    ],
  });

  const storedOrder = (await listOrders()).find((item) => item.id === updatedOrder.id);
  const tableChecks = await verifySupabaseTables(updatedOrder.id);
  const logs = storedOrder?.logs || [];
  const logEvents = new Set(logs.map((log) => log.event));
  const cleanup = await cleanupSyntheticData();

  return {
    adminVisible: Boolean(storedOrder),
    briefWorkflowRan: Boolean(
      logEvents.has('brief_generated')
      || logEvents.has('brief_workflow_failed')
    ),
    cleanup,
    customerConfirmationGenerated: logEvents.has('intake_confirmation_email_sent')
      || logEvents.has('intake_confirmation_email_failed'),
    deliveryWorkflowRan: Boolean(
      logEvents.has('delivery_email_sent')
      || logEvents.has('delivery_email_failed')
    ),
    intakeComplete: storedOrder?.intakeStatus === 'complete',
    logEvents: Array.from(logEvents).sort(),
    needsReviewMessages: logs
      .filter((log) => /failed|skipped|error/i.test(log.event))
      .map((log) => ({
        event: log.event,
        message: log.message,
      })),
    notificationsGenerated: Boolean(
      logEvents.has('owner_payment_notification_sent')
      && logEvents.has('owner_intake_notification_sent')
    ),
    ok: Boolean(
      storedOrder
      && storedOrder.paymentStatus === 'paid'
      && storedOrder.intakeStatus === 'complete'
      && tableChecks.ordersWrite
      && tableChecks.orderEventsWrite
      && tableChecks.intakeSubmissionsWrite
      && cleanup.ok
    ),
    orderEventsWrite: tableChecks.orderEventsWrite,
    orderId: updatedOrder.id,
    ordersWrite: tableChecks.ordersWrite,
    paymentStatus: storedOrder?.paymentStatus,
    source: 'codex_storage_smoke_test',
    status: storedOrder?.status,
    tables: tableChecks.tables,
    uploadLogPresent: logEvents.has('files_uploaded_to_drive')
      || logEvents.has('drive_upload_skipped')
      || logEvents.has('drive_upload_failed'),
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

async function cleanupSyntheticData() {
  const matchingOrders = await supabaseRequest<{ id: string }[]>(
    '/rest/v1/orders?select=id&or=(customer_email.ilike.*codex-smoke*,customer_email.eq.codex-smoke-answerbrief@example.com)'
  );
  const orderIds = matchingOrders.map((order) => order.id);

  if (orderIds.length > 0) {
    const orderIdFilter = `order_id=in.(${orderIds.join(',')})`;

    await supabaseRequest(`/rest/v1/uploads?${orderIdFilter}`, { method: 'DELETE' });
    await supabaseRequest(`/rest/v1/briefs?${orderIdFilter}`, { method: 'DELETE' });
    await supabaseRequest(`/rest/v1/intake_submissions?${orderIdFilter}`, { method: 'DELETE' });
    await supabaseRequest(`/rest/v1/order_events?${orderIdFilter}`, { method: 'DELETE' });
    await supabaseRequest(`/rest/v1/orders?id=in.(${orderIds.join(',')})`, { method: 'DELETE' });
  }

  await supabaseRequest('/rest/v1/order_events?event=eq.codex_storage_smoke_test', { method: 'DELETE' });
  await supabaseRequest('/rest/v1/order_events?message=ilike.*codex-smoke*', { method: 'DELETE' });
  await supabaseRequest('/rest/v1/order_events?message=ilike.*codex_storage_smoke_test*', { method: 'DELETE' });
  await supabaseRequest('/rest/v1/intake_submissions?submitted_by_email=ilike.*codex-smoke*', { method: 'DELETE' });
  await supabaseRequest('/rest/v1/support_requests?email=ilike.*codex-smoke*', { method: 'DELETE' });
  await supabaseRequest('/rest/v1/push_tokens?email=ilike.*codex-smoke*', { method: 'DELETE' });
  await supabaseRequest('/rest/v1/users?email=ilike.*codex-smoke*', { method: 'DELETE' });

  const remainingOrders = await supabaseRequest<{ id: string }[]>(
    '/rest/v1/orders?select=id&or=(customer_email.ilike.*codex-smoke*,customer_email.eq.codex-smoke-answerbrief@example.com)'
  );
  const remainingEvents = await supabaseRequest<{ id: string }[]>(
    '/rest/v1/order_events?select=id&or=(event.eq.codex_storage_smoke_test,message.ilike.*codex-smoke*,message.ilike.*codex_storage_smoke_test*)'
  );
  const remainingIntakeSubmissions = await supabaseRequest<{ id: string }[]>(
    '/rest/v1/intake_submissions?select=id&submitted_by_email=ilike.*codex-smoke*'
  );
  const remainingUsers = await supabaseRequest<{ id: string }[]>('/rest/v1/users?select=id&email=ilike.*codex-smoke*');
  const remainingSupportRequests = await supabaseRequest<{ id: string }[]>(
    '/rest/v1/support_requests?select=id&email=ilike.*codex-smoke*'
  );

  return {
    ok: remainingOrders.length === 0
      && remainingEvents.length === 0
      && remainingIntakeSubmissions.length === 0
      && remainingUsers.length === 0
      && remainingSupportRequests.length === 0,
    removedMatchingOrderCount: orderIds.length,
    remaining: {
      intakeSubmissions: remainingIntakeSubmissions.length,
      orderEvents: remainingEvents.length,
      orders: remainingOrders.length,
      supportRequests: remainingSupportRequests.length,
      users: remainingUsers.length,
    },
  };
}

async function supabaseRequest<T = unknown>(path: string, init: RequestInit = {}) {
  const configuration = getSupabaseOrderStoreConfiguration();
  const response = await fetch(`${configuration.supabaseUrl}${path}`, {
    ...init,
    cache: 'no-store',
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

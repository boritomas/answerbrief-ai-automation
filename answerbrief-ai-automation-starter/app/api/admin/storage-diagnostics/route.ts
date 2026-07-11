import { createHmac, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { listOrders, retryOrderFulfillment, saveOrderIntake } from '@/lib/orders';
import type { Order } from '@/lib/orders';
import { deleteDriveFile, getDriveAuthMode, isDriveConfigured } from '@/lib/google-drive';
import { getOpenAIFulfillmentConfigured } from '@/lib/brief';
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
  const preserveProof = url.searchParams.get('preserve') === '1';
  const proofEmail = url.searchParams.get('testEmail') || 'tomas@nieves.com';

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
      const journey = await runSyntheticCustomerJourney(request, { preserveProof, proofEmail });

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
    openAIConfigured: getOpenAIFulfillmentConfigured(),
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
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

async function runSyntheticCustomerJourney(
  request: NextRequest,
  { preserveProof = false, proofEmail = 'tomas@nieves.com' } = {}
) {
  if (!preserveProof) {
    await cleanupSyntheticData();
  }

  const proofTimestamp = Date.now();
  const email = preserveProof ? proofEmail : 'codex-smoke-answerbrief@example.com';
  const sessionId = `cs_codex_smoke_${Date.now()}`;
  const paymentIntentId = `pi_codex_smoke_${Date.now()}`;
  const webhook = await postSignedStripeWebhook({
    amountTotal: preserveProof ? 4900 : 14900,
    customerEmail: email,
    customerName: preserveProof ? 'AnswerBrief Production Proof Test' : 'Codex E2E Smoke Test',
    packageKey: preserveProof ? 'quick-prep' : 'full-interview-brief',
    packageName: preserveProof ? 'Interview Essentials' : 'Interview Professional',
    proofLabel: preserveProof ? 'PRODUCTION_PROOF_TEST' : 'codex_storage_smoke_test',
    origin: request.nextUrl.origin,
    paymentIntentId,
    sessionId,
  });
  const duplicateWebhook = await postSignedStripeWebhook({
    amountTotal: preserveProof ? 4900 : 14900,
    customerEmail: email,
    customerName: preserveProof ? 'AnswerBrief Production Proof Test' : 'Codex E2E Smoke Test',
    packageKey: preserveProof ? 'quick-prep' : 'full-interview-brief',
    packageName: preserveProof ? 'Interview Essentials' : 'Interview Professional',
    proofLabel: preserveProof ? 'PRODUCTION_PROOF_TEST' : 'codex_storage_smoke_test',
    origin: request.nextUrl.origin,
    paymentIntentId,
    sessionId,
  });

  const order = (await listOrders()).find((item) => item.stripeSessionId === sessionId);

  if (!order) {
    throw new Error('Signed Stripe webhook did not create a durable order.');
  }

  const updatedOrder = await saveOrderIntake({
    authenticatedEmail: email,
    intake: {
      careerLane: 'operations',
      email,
      interviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      jobPostingText: [
        'PRODUCTION_PROOF_TEST synthetic job description.',
        'Role: Operations Strategy Manager.',
        'Needs: workflow automation, executive communication, process improvement, customer readiness, and cross-functional delivery.',
        'This content is intentionally safe and synthetic so Tomas can verify the generated AnswerBrief is personalized.',
      ].join(' '),
      name: preserveProof ? 'AnswerBrief Production Proof Test' : 'Codex E2E Smoke Test',
      notes: preserveProof
        ? `PRODUCTION_PROOF_TEST source: codex_proof_test_${proofTimestamp}. Candidate should emphasize automation, operations strategy, stakeholder communication, and measurable delivery.`
        : 'source: codex_storage_smoke_test',
      targetCompany: 'AnswerBrief AI Verification',
      targetRole: 'Operations Strategy Manager',
    },
    orderId: order.id,
    uploads: [
      {
        content: Buffer.from([
          'PRODUCTION_PROOF_TEST synthetic resume.',
          'Candidate: AnswerBrief Production Proof Test.',
          'Experience: Built workflow dashboards, coordinated customer onboarding, improved operational handoffs, and translated complex process gaps into clear action plans.',
          'Proof points: reduced manual follow-up, organized executive-ready status reports, and supported launch readiness across product, operations, and customer communication.',
        ].join('\n'), 'utf8'),
        contentType: 'text/plain',
        filename: preserveProof ? 'PRODUCTION_PROOF_TEST-resume.txt' : 'codex-smoke-resume.txt',
      },
      {
        content: Buffer.from([
          'PRODUCTION_PROOF_TEST synthetic job posting upload.',
          'Operations Strategy Manager role focused on workflow automation, business process improvement, stakeholder communication, and customer-facing operational readiness.',
          'The interviewer will evaluate prioritization, concise communication, systems thinking, and ability to turn ambiguous requirements into repeatable workflows.',
        ].join('\n'), 'utf8'),
        contentType: 'text/plain',
        filename: preserveProof ? 'PRODUCTION_PROOF_TEST-job-description.txt' : 'codex-smoke-job-posting.txt',
      },
    ],
  });
  await retryOrderFulfillment(updatedOrder.id);

  const storedOrder = (await listOrders()).find((item) => item.id === updatedOrder.id);
  const tableChecks = await verifySupabaseTables(updatedOrder.id);
  const logs = storedOrder?.logs || [];
  const logEvents = new Set(logs.map((log) => log.event));
  const fulfillmentQueueCount = logs.filter((log) => log.event === 'fulfillment_job_queued').length;
  const retryVerified = fulfillmentQueueCount >= 2 || logEvents.has('fulfillment_retry_skipped_existing_delivery');
  const cleanup = preserveProof
    ? {
      ok: true,
      preserved: true,
      removedMatchingOrderCount: 0,
      remaining: {
        intakeSubmissions: 'preserved',
        orderEvents: 'preserved',
        orders: 'preserved',
        supportRequests: 'preserved',
        users: 'preserved',
      },
    }
    : await cleanupSyntheticData();

  return {
    adminVisible: Boolean(storedOrder),
    briefWorkflowRan: Boolean(
      logEvents.has('brief_generated')
      || logEvents.has('brief_workflow_failed')
    ),
    fulfillmentAutomation: {
      automaticTrigger: logEvents.has('fulfillment_job_queued'),
      interviewPrepKnowledgeReused: logEvents.has('interview_prep_kb_reused'),
      openAIExecution: logEvents.has('openai_generation_completed'),
      qaValidation: logEvents.has('qa_validation_passed') || logEvents.has('qa_validation_failed'),
      retryBehaviorVerified: retryVerified,
      retrySafeJobId: Boolean(storedOrder?.fulfillmentJobId) || retryVerified,
      versionedRegistry: Boolean(storedOrder?.promptRegistryVersion || logEvents.has('interview_prep_kb_reused')),
    },
    cleanup,
    customerConfirmationGenerated: logEvents.has('intake_confirmation_email_sent'),
    deliveryWorkflowRan: Boolean(
      logEvents.has('delivery_email_sent')
    ),
    duplicateWebhookIdempotent: Boolean(logEvents.has('payment_duplicate')),
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
      && webhook.ok
      && duplicateWebhook.ok
      && logEvents.has('payment_duplicate')
      && tableChecks.ordersWrite
      && tableChecks.orderEventsWrite
      && tableChecks.intakeSubmissionsWrite
      && tableChecks.uploadsWrite
      && tableChecks.briefsWrite
      && logEvents.has('fulfillment_job_queued')
      && logEvents.has('interview_prep_kb_reused')
      && logEvents.has('resume_analyzed')
      && logEvents.has('job_description_analyzed')
      && logEvents.has('resume_role_alignment_completed')
      && logEvents.has('company_role_research_guidance_generated')
      && logEvents.has('interview_questions_generated')
      && logEvents.has('star_guidance_generated')
      && logEvents.has('strength_risk_analysis_completed')
      && logEvents.has('interview_strategy_generated')
      && logEvents.has('executive_summary_generated')
      && logEvents.has('answerbrief_composed')
      && logEvents.has('openai_generation_completed')
      && (logEvents.has('qa_validation_passed') || logEvents.has('qa_validation_failed'))
      && cleanup.ok
    ),
    orderEventsWrite: tableChecks.orderEventsWrite,
    proofPreserved: preserveProof,
    proofReviewNote: preserveProof
      ? 'Synthetic proof data was intentionally preserved. Run cleanup only after Tomas confirms review.'
      : undefined,
    orderId: updatedOrder.id,
    ordersWrite: tableChecks.ordersWrite,
    paymentStatus: storedOrder?.paymentStatus,
    proofCustomerEmail: preserveProof ? email : undefined,
    driveFolderUrl: preserveProof ? storedOrder?.driveFolderUrl : undefined,
    generatedBriefUrl: preserveProof ? storedOrder?.generatedBriefUrl : undefined,
    signedWebhook: webhook,
    source: preserveProof ? `codex_proof_test_${proofTimestamp}` : 'codex_storage_smoke_test',
    status: storedOrder?.status,
    tables: tableChecks.tables,
    uploadLogPresent: logEvents.has('files_uploaded_to_drive')
      || logEvents.has('drive_upload_skipped')
      || logEvents.has('drive_upload_failed'),
  };
}

async function postSignedStripeWebhook({
  amountTotal,
  customerEmail,
  customerName,
  packageKey,
  packageName,
  proofLabel,
  origin,
  paymentIntentId,
  sessionId,
}: {
  amountTotal: number;
  customerEmail: string;
  customerName: string;
  packageKey: string;
  packageName: string;
  proofLabel: string;
  origin: string;
  paymentIntentId: string;
  sessionId: string;
}) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  }

  const payload = JSON.stringify({
    id: `evt_codex_smoke_${sessionId}`,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        amount_total: amountTotal,
        customer_details: {
          email: customerEmail,
          name: customerName,
        },
        metadata: {
          orderLabel: proofLabel,
          package: packageKey,
          packageName,
          source: proofLabel,
        },
        mode: 'payment',
        payment_intent: paymentIntentId,
        payment_status: 'paid',
      },
    },
    livemode: true,
    pending_webhooks: 1,
    type: 'checkout.session.completed',
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  const response = await fetch(`${origin}/api/stripe/webhook`, {
    body: payload,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    },
    method: 'POST',
  });

  return {
    ok: response.ok,
    status: response.status,
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
  const uploadRows = await supabaseRequest<{ id: string }[]>(`/rest/v1/uploads?order_id=eq.${orderId}&select=id`);
  const briefRows = await supabaseRequest<{ id: string }[]>(`/rest/v1/briefs?order_id=eq.${orderId}&select=id`);

  return {
    briefsWrite: briefRows.length > 0,
    intakeSubmissionsWrite: intakeRows.length > 0,
    orderEventsWrite: eventRows.length > 0,
    ordersWrite: orderRows.length > 0,
    uploadsWrite: uploadRows.length > 0,
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

  for (const order of await supabaseRequest<{ drive_folder_id?: string | null }[]>(
    '/rest/v1/orders?select=drive_folder_id&or=(customer_email.ilike.*codex-smoke*,customer_email.eq.codex-smoke-answerbrief@example.com)'
  )) {
    if (order.drive_folder_id) {
      await deleteDriveFile(order.drive_folder_id).catch(() => false);
    }
  }

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

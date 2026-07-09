import { createHash, randomBytes, randomUUID } from 'crypto';
import { generateInterviewBrief } from './brief';
import {
  sendDeliveryEmail,
  sendIntakeConfirmationEmail,
  sendOwnerIntakeNotification,
  sendOwnerPaymentNotification,
} from './email';
import { Intake } from './intake-schema';
import {
  buildCustomerFolderName,
  buildProvisionalFolderName,
  createCustomerDriveWorkspace,
  renameDriveFolder,
  uploadDriveFile,
} from './google-drive';
import { PackageKey, packages } from './packages';
import { getOrderStore } from './storage/orders';

export type PaymentStatus = 'paid' | 'unpaid' | 'failed' | 'needs_review';
export type IntakeStatus = 'pending' | 'complete';
export type BriefStatus = 'not_started' | 'generating' | 'generated' | 'failed' | 'fallback_generated';
export type DeliveryStatus = 'not_started' | 'sent' | 'failed' | 'skipped';

export type OrderStatus =
  | 'Paid'
  | 'Intake Pending'
  | 'In Progress'
  | 'Delivered'
  | 'Needs Review'
  | 'Failed';

export type OrderLog = {
  at: string;
  event: string;
  message?: string;
};

export type IntakeUpload = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export type Order = {
  id: string;
  customerEmail: string;
  customerName?: string;
  packageKey?: PackageKey;
  packageName: string;
  amountPaid?: number;
  stripeSessionId?: string;
  stripePaymentId?: string;
  paymentStatus: PaymentStatus;
  intakeStatus: IntakeStatus;
  briefStatus: BriefStatus;
  deliveryStatus: DeliveryStatus;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  deliveryDate?: string;
  intakeTokenHash?: string;
  prepWorkspaceUrl?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
  driveError?: string;
  generatedBriefUrl?: string;
  generatedBriefMode?: 'fallback';
  errorMessage?: string;
  intake?: Intake;
  intakeSubmittedAt?: string;
  logs: OrderLog[];
};

type NewOrder = {
  amountPaid?: number;
  customerEmail: string;
  customerName?: string;
  packageKey?: PackageKey;
  packageName: string;
  stripePaymentId?: string;
  stripeSessionId?: string;
};

type PaidOrderResult = Order & {
  intakeToken?: string;
};

async function readOrders(): Promise<Order[]> {
  const orders = await getOrderStore().listOrders();
  return orders.map(normalizeOrder);
}

async function writeOrders(orders: Order[]) {
  await getOrderStore().saveOrders(orders);
}

export async function listOrders() {
  const orders = await readOrders();
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listOrdersForCustomer(customerEmail: string) {
  const normalizedEmail = customerEmail.toLowerCase();
  const orders = await listOrders();
  return orders.filter((order) => order.customerEmail.toLowerCase() === normalizedEmail);
}

export async function getOrderForCustomer(orderId: string, customerEmail: string) {
  const normalizedEmail = customerEmail.toLowerCase();
  const orders = await readOrders();
  return orders.find((order) => {
    return order.id === orderId && order.customerEmail.toLowerCase() === normalizedEmail;
  });
}

export async function getOrderById(orderId: string) {
  const orders = await readOrders();
  return orders.find((order) => order.id === orderId);
}

export async function createPaidOrder(input: NewOrder): Promise<PaidOrderResult> {
  const orders = await readOrders();
  const existingOrder = input.stripeSessionId
    ? orders.find((order) => order.stripeSessionId === input.stripeSessionId)
    : undefined;

  if (existingOrder) {
    addLog(existingOrder, 'payment_duplicate', 'Stripe sent an already-recorded payment event.');
    await writeOrders(orders);
    return existingOrder;
  }

  const now = new Date().toISOString();
  const order: Order = {
    id: randomUUID(),
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    packageKey: input.packageKey,
    packageName: input.packageName,
    amountPaid: input.amountPaid,
    stripePaymentId: input.stripePaymentId,
    stripeSessionId: input.stripeSessionId,
    paymentStatus: 'paid',
    intakeStatus: 'pending',
    briefStatus: 'not_started',
    deliveryStatus: 'not_started',
    status: 'Intake Pending',
    createdAt: now,
    updatedAt: now,
    deliveryDate: estimateDeliveryDate(),
    prepWorkspaceUrl: process.env.PREP_INTERVIEW_WORKSPACE_URL,
    logs: [],
  };

  const intakeToken = createIntakeToken();
  order.intakeTokenHash = hashToken(intakeToken);
  addLog(order, 'payment_received', `Payment received for ${order.packageName}.`);
  addLog(order, 'order_created', 'Order record created and intake token generated.');

  await attachDriveWorkspace(order);
  orders.push(order);
  await writeOrders(orders);
  await recordOrderEvent({
    event: 'order_created',
    message: `Paid order created for ${order.customerEmail}.`,
    orderId: order.id,
  }).catch(() => undefined);
  await notifyOwnerPayment(order).catch((error) => {
    addLog(order, 'owner_payment_notification_failed', getErrorMessage(error));
  });
  await writeOrders(orders);

  return {
    ...order,
    intakeToken,
  };
}

export async function saveOrderIntake({
  authenticatedEmail,
  intake,
  orderId,
  token,
  uploads = [],
}: {
  authenticatedEmail?: string;
  intake: Intake;
  orderId?: string;
  token?: string;
  uploads?: IntakeUpload[];
}) {
  const orders = await readOrders();
  const now = new Date().toISOString();
  let order = orderId ? orders.find((item) => item.id === orderId) : undefined;

  const authenticatedOrderAccess = authenticatedEmail
    && order?.customerEmail.toLowerCase() === authenticatedEmail.toLowerCase();

  if (order?.intakeTokenHash && !authenticatedOrderAccess && hashToken(token || '') !== order.intakeTokenHash) {
    addLog(order, 'intake_token_rejected', 'Intake submission was rejected because the token did not match.');
    order.errorMessage = 'Invalid intake token.';
    order.status = 'Needs Review';
    order.updatedAt = now;
    await writeOrders(orders);
    throw new Error('Invalid intake token.');
  }

  if (!order) {
    order = createManualIntakeOrder(intake, now);
    orders.push(order);
  }

  order.customerEmail = intake.email;
  order.customerName = intake.name;
  order.intake = intake;
  order.intakeSubmittedAt = now;
  order.intakeStatus = 'complete';
  order.status = 'In Progress';
  order.updatedAt = now;
  addLog(order, 'intake_completed', 'Customer intake was submitted.');

  await renameOrderDriveWorkspace(order);
  await uploadIntakeMaterials(order, uploads, intake);
  await notifyOwnerIntake(order, uploads, now).catch((error) => {
    addLog(order, 'owner_intake_notification_failed', getErrorMessage(error));
  });
  await sendIntakeConfirmationEmail({
    deliveryDate: order.deliveryDate,
    packageName: order.packageName,
    to: order.customerEmail,
  }).then((confirmation) => {
    addLog(order, 'intake_confirmation_email_sent', confirmation.skipped
      ? 'Intake confirmation email was logged because Gmail or recipient configuration is missing.'
      : 'Intake confirmation email sent to customer.');
  }).catch((error) => {
    addLog(order, 'intake_confirmation_email_failed', getErrorMessage(error));
  });
  await runBriefWorkflow(order);

  await writeOrders(orders);
  await recordOrderEvent({
    event: 'intake_submitted',
    message: `Intake submitted by ${order.customerEmail}.`,
    orderId: order.id,
  }).catch(() => undefined);

  return order;
}

export async function saveAuthenticatedOrderIntake({
  authenticatedEmail,
  intake,
  orderId,
}: {
  authenticatedEmail: string;
  intake: Intake;
  orderId: string;
}) {
  return saveOrderIntake({
    authenticatedEmail,
    intake,
    orderId,
  });
}

export async function appendOrderLogForCustomer({
  customerEmail,
  event,
  message,
  orderId,
}: {
  customerEmail: string;
  event: string;
  message?: string;
  orderId: string;
}) {
  const orders = await readOrders();
  const order = orders.find((item) => {
    return item.id === orderId && item.customerEmail.toLowerCase() === customerEmail.toLowerCase();
  });

  if (!order) {
    return undefined;
  }

  addLog(order, event, message);
  order.updatedAt = new Date().toISOString();
  await writeOrders(orders);

  return order;
}

export async function recordOrderEvent({
  event,
  message,
  orderId,
  severity,
}: {
  event: string;
  message?: string;
  orderId?: string;
  severity?: 'info' | 'warning' | 'error';
}) {
  const store = getOrderStore();

  if (!store.appendOrderEvent) {
    return;
  }

  await store.appendOrderEvent({
    event,
    message,
    orderId,
    severity,
  });
}

export function getIntakeUrl(orderId: string, customerEmail?: string, token?: string) {
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://www.answer-brief.com';
  const url = new URL('/intake', baseUrl);
  url.searchParams.set('orderId', orderId);

  if (customerEmail) {
    url.searchParams.set('email', customerEmail);
  }

  if (token) {
    url.searchParams.set('token', token);
  }

  return url.toString();
}

function createManualIntakeOrder(intake: Intake, now: string): Order {
  const order: Order = {
    id: randomUUID(),
    customerEmail: intake.email,
    customerName: intake.name,
    packageName: 'Interview Prep Package',
    paymentStatus: 'unpaid',
    intakeStatus: 'pending',
    briefStatus: 'not_started',
    deliveryStatus: 'not_started',
    status: 'Intake Pending',
    createdAt: now,
    updatedAt: now,
    deliveryDate: estimateDeliveryDate(),
    prepWorkspaceUrl: process.env.PREP_INTERVIEW_WORKSPACE_URL,
    logs: [],
  };

  addLog(order, 'manual_intake_created', 'Intake was submitted without a paid order token.');
  return order;
}

async function uploadIntakeMaterials(order: Order, uploads: IntakeUpload[], intake: Intake) {
  if (!order.driveFolderId) {
    addLog(order, 'drive_upload_skipped', 'Drive folder is not configured, so intake files were not uploaded.');
    return;
  }

  try {
    const summary = buildIntakeSummary(intake);
    await uploadDriveFile({
      folderId: order.driveFolderId,
      filename: 'intake-summary.md',
      contentType: 'text/markdown; charset=utf-8',
      content: summary,
    });

    for (const upload of uploads) {
      await uploadDriveFile({
        folderId: order.driveFolderId,
        filename: upload.filename,
        contentType: upload.contentType,
        content: upload.content,
      });
    }

    addLog(order, 'files_uploaded_to_drive', `${uploads.length + 1} intake file(s) uploaded to Drive.`);
  } catch (error) {
    order.driveError = getErrorMessage(error);
    order.errorMessage = order.driveError;
    order.status = 'Needs Review';
    addLog(order, 'drive_upload_failed', order.driveError);
  }
}

async function runBriefWorkflow(order: Order) {
  if (!order.intake) {
    return;
  }

  order.briefStatus = 'generating';
  order.updatedAt = new Date().toISOString();
  addLog(order, 'brief_generation_started', 'Brief workflow started after intake completion.');

  try {
    const brief = await generateInterviewBrief({
      intake: order.intake,
      packageName: order.packageName,
      packageKey: order.packageKey,
    });

    const uploadedBrief = await uploadDriveFile({
      folderId: order.driveFolderId,
      filename: brief.filename,
      contentType: brief.contentType,
      content: brief.content,
    }).catch((error) => {
      order.driveError = getErrorMessage(error);
      addLog(order, 'brief_drive_upload_failed', order.driveError);
      return null;
    });

    order.generatedBriefUrl = uploadedBrief?.webViewLink || undefined;
    order.generatedBriefMode = brief.mode;
    order.briefStatus = brief.mode === 'fallback' ? 'fallback_generated' : 'generated';
    addLog(order, 'brief_generated', `Brief generated using ${brief.mode} mode.`);

    const delivery = await sendDeliveryEmail({
      to: order.customerEmail,
      packageName: order.packageName,
      briefUrl: order.generatedBriefUrl,
    }).catch((error) => {
      addLog(order, 'delivery_email_failed', getErrorMessage(error));
      return { success: false, skipped: false };
    });

    if (delivery.success) {
      order.deliveryStatus = delivery.skipped ? 'skipped' : 'sent';
      order.status = delivery.skipped ? 'Needs Review' : 'Delivered';
      addLog(order, 'delivery_email_sent', delivery.skipped
        ? 'Delivery email was logged because Gmail is not configured.'
        : 'Delivery email sent to customer.');
    } else {
      order.deliveryStatus = 'failed';
      order.status = 'Needs Review';
    }
  } catch (error) {
    order.briefStatus = 'failed';
    order.deliveryStatus = 'failed';
    order.status = 'Needs Review';
    order.errorMessage = getErrorMessage(error);
    addLog(order, 'brief_workflow_failed', order.errorMessage);
  } finally {
    order.updatedAt = new Date().toISOString();
  }
}

async function notifyOwnerPayment(order: Order) {
  const notification = await sendOwnerPaymentNotification({
    adminUrl: getAdminOrdersUrl(),
    amountPaid: order.amountPaid,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    orderId: order.id,
    packageName: order.packageName,
  });

  addLog(order, 'owner_payment_notification_sent', notification.skipped
    ? 'Owner payment notification was logged because Gmail or recipient configuration is missing.'
    : 'Owner payment notification sent.');
}

async function notifyOwnerIntake(order: Order, uploads: IntakeUpload[], submittedAt: string) {
  if (!order.intake) {
    return;
  }

  const resumeUploaded = uploads.some((upload) => /resume/i.test(upload.filename));
  const jobPostingUploaded = uploads.some((upload) => {
    return /job|description|posting/i.test(upload.filename);
  }) || Boolean(order.intake.jobPostingText);

  const notification = await sendOwnerIntakeNotification({
    adminUrl: getAdminOrdersUrl(),
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    interviewDate: order.intake.interviewDate,
    jobPostingUploaded,
    orderId: order.id,
    packageName: order.packageName,
    resumeUploaded,
    submittedAt,
    targetCompany: order.intake.targetCompany,
    targetRole: order.intake.targetRole,
  });

  addLog(order, 'owner_intake_notification_sent', notification.skipped
    ? 'Owner intake notification was logged because Gmail or recipient configuration is missing.'
    : 'Owner intake notification sent.');
}

function getAdminOrdersUrl() {
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://www.answer-brief.com';
  return new URL('/admin/orders', baseUrl).toString();
}

function estimateDeliveryDate() {
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 1);
  return deliveryDate.toISOString().slice(0, 10);
}

async function attachDriveWorkspace(order: Order) {
  try {
    const folderName = buildProvisionalFolderName(
      order.customerEmail,
      order.packageName,
      order.createdAt
    );
    const folder = await createCustomerDriveWorkspace(folderName);

    if (!folder) {
      addLog(order, 'drive_workspace_skipped', 'Google Drive is not configured.');
      return;
    }

    order.driveFolderId = folder.id;
    order.driveFolderUrl = folder.webViewLink;
    order.prepWorkspaceUrl = folder.webViewLink;
    order.driveError = undefined;
    addLog(order, 'drive_folder_created', 'Customer Drive workspace created.');
  } catch (error) {
    order.driveError = getErrorMessage(error);
    order.errorMessage = order.driveError;
    order.status = 'Needs Review';
    addLog(order, 'drive_folder_failed', order.driveError);
  }
}

async function renameOrderDriveWorkspace(order: Order) {
  if (!order.driveFolderId || !order.intake) {
    return;
  }

  try {
    const folderName = buildCustomerFolderName(
      order.intake.name,
      order.intake.targetRole,
      order.createdAt
    );
    const folder = await renameDriveFolder(order.driveFolderId, folderName);

    if (!folder) {
      return;
    }

    order.driveFolderUrl = folder.webViewLink;
    order.prepWorkspaceUrl = folder.webViewLink;
    order.driveError = undefined;
    addLog(order, 'drive_folder_renamed', 'Customer Drive workspace renamed after intake.');
  } catch (error) {
    order.driveError = getErrorMessage(error);
    order.errorMessage = order.driveError;
    order.status = 'Needs Review';
    addLog(order, 'drive_folder_rename_failed', order.driveError);
  }
}

function buildIntakeSummary(intake: Intake) {
  return [
    '# AnswerBrief AI Intake Summary',
    '',
    `Name: ${intake.name}`,
    `Email: ${intake.email}`,
    `Target role: ${intake.targetRole}`,
    intake.targetCompany ? `Target company: ${intake.targetCompany}` : undefined,
    intake.interviewDate ? `Interview date: ${intake.interviewDate}` : undefined,
    `Career lane: ${intake.careerLane}`,
    '',
    '## Job Posting / Role Notes',
    intake.jobPostingText || intake.notes || 'No pasted job posting or role notes provided.',
    '',
    '## Candidate Notes',
    intake.notes || 'No additional notes provided.',
  ].filter(Boolean).join('\n');
}

function addLog(order: Order, event: string, message?: string) {
  order.logs.push({
    at: new Date().toISOString(),
    event,
    message,
  });
}

function createIntakeToken() {
  return randomBytes(24).toString('base64url');
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeOrder(order: Partial<Order>): Order {
  const packageKey = order.packageKey || getPackageKeyFromName(order.packageName);
  const now = order.createdAt || new Date().toISOString();

  return {
    id: order.id || randomUUID(),
    customerEmail: order.customerEmail || '',
    customerName: order.customerName,
    packageKey,
    packageName: order.packageName || (packageKey ? packages[packageKey].name : 'Interview Prep Package'),
    amountPaid: order.amountPaid,
    stripeSessionId: order.stripeSessionId,
    stripePaymentId: order.stripePaymentId,
    paymentStatus: order.paymentStatus || (order.stripeSessionId ? 'paid' : 'unpaid'),
    intakeStatus: order.intakeStatus || (order.intake ? 'complete' : 'pending'),
    briefStatus: order.briefStatus || 'not_started',
    deliveryStatus: order.deliveryStatus || 'not_started',
    status: order.status || 'Intake Pending',
    createdAt: now,
    updatedAt: order.updatedAt || now,
    deliveryDate: order.deliveryDate,
    intakeTokenHash: order.intakeTokenHash,
    prepWorkspaceUrl: order.prepWorkspaceUrl,
    driveFolderId: order.driveFolderId,
    driveFolderUrl: order.driveFolderUrl,
    driveError: order.driveError,
    generatedBriefUrl: order.generatedBriefUrl,
    generatedBriefMode: order.generatedBriefMode,
    errorMessage: order.errorMessage,
    intake: order.intake,
    intakeSubmittedAt: order.intakeSubmittedAt,
    logs: order.logs || [],
  };
}

function getPackageKeyFromName(packageName?: string): PackageKey | undefined {
  return (Object.keys(packages) as PackageKey[]).find((key) => {
    return packages[key].name === packageName;
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown automation error';
}

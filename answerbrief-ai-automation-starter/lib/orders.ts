import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Intake } from './intake-schema';
import {
  buildCustomerFolderName,
  buildProvisionalFolderName,
  createCustomerDriveWorkspace,
  isDriveConfigured,
  renameDriveFolder,
  uploadDriveFile,
} from './google-drive';

export type OrderStatus =
  | 'Paid'
  | 'Intake Pending'
  | 'In Progress'
  | 'Delivered'
  | 'Follow-up Sent';

export type Order = {
  id: string;
  customerEmail: string;
  packageName: string;
  status: OrderStatus;
  createdAt: string;
  deliveryDate?: string;
  stripeSessionId?: string;
  prepWorkspaceUrl?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
  driveError?: string;
  sourceFiles?: SourceFile[];
  intake?: Intake;
  intakeSubmittedAt?: string;
};

export type IntakeUpload = {
  label: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

type SourceFile = {
  label: string;
  name: string;
  id: string;
  webViewLink: string;
};

type NewOrder = {
  customerEmail: string;
  packageName: string;
  stripeSessionId?: string;
};

const ordersFile = path.join(process.cwd(), 'data', 'orders.json');

async function readOrders(): Promise<Order[]> {
  try {
    const raw = await fs.readFile(ordersFile, 'utf8');
    return JSON.parse(raw) as Order[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function writeOrders(orders: Order[]) {
  await fs.mkdir(path.dirname(ordersFile), { recursive: true });
  await fs.writeFile(ordersFile, `${JSON.stringify(orders, null, 2)}\n`);
}

export async function listOrders() {
  const orders = await readOrders();
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPaidOrder({
  customerEmail,
  packageName,
  stripeSessionId,
}: NewOrder) {
  const orders = await readOrders();
  const existingOrder = stripeSessionId
    ? orders.find((order) => order.stripeSessionId === stripeSessionId)
    : undefined;

  if (existingOrder) {
    return existingOrder;
  }

  const order: Order = {
    id: randomUUID(),
    customerEmail,
    packageName,
    status: 'Intake Pending',
    createdAt: new Date().toISOString(),
    deliveryDate: estimateDeliveryDate(),
    stripeSessionId,
    prepWorkspaceUrl: process.env.PREP_INTERVIEW_WORKSPACE_URL,
  };

  await attachDriveWorkspace(order);

  orders.push(order);
  await writeOrders(orders);

  return order;
}

export async function saveOrderIntake(
  orderId: string | undefined,
  intake: Intake,
  packageName = 'Interview Prep Package',
  uploads: IntakeUpload[] = []
) {
  const orders = await readOrders();
  const now = new Date().toISOString();
  let order = orderId ? orders.find((item) => item.id === orderId) : undefined;

  if (!order) {
    order = {
      id: randomUUID(),
      customerEmail: intake.email,
      packageName,
      status: 'Intake Pending',
      createdAt: now,
      deliveryDate: estimateDeliveryDate(),
      prepWorkspaceUrl: process.env.PREP_INTERVIEW_WORKSPACE_URL,
    };
    orders.push(order);
  }

  order.customerEmail = intake.email;
  order.intake = intake;
  order.intakeSubmittedAt = now;
  order.status = 'In Progress';

  if (!order.driveFolderId) {
    await attachDriveWorkspace(order);
  }

  await renameOrderDriveWorkspace(order);
  await attachSourceFiles(order, uploads);

  await writeOrders(orders);

  return order;
}

async function attachSourceFiles(order: Order, uploads: IntakeUpload[]) {
  if (uploads.length === 0) {
    return;
  }

  if (!isDriveConfigured()) {
    order.driveError = 'Google Drive is not configured; uploaded files were not saved.';
    return;
  }

  if (!order.driveFolderId) {
    order.driveError = 'Google Drive folder was not created; uploaded files were not saved.';
    return;
  }

  try {
    const uploadedFiles = await Promise.all(
      uploads.map(async (upload) => {
        const file = await uploadDriveFile(
          order.driveFolderId,
          `${upload.label} - ${upload.fileName}`,
          upload.mimeType,
          upload.bytes
        );

        return file ? {
          label: upload.label,
          name: file.name,
          id: file.id,
          webViewLink: file.webViewLink,
        } : null;
      })
    );

    order.sourceFiles = [
      ...(order.sourceFiles || []),
      ...uploadedFiles.filter((file): file is SourceFile => Boolean(file)),
    ];
    order.driveError = undefined;
  } catch (error) {
    order.driveError = getErrorMessage(error);
  }
}

export function getIntakeUrl(orderId: string, customerEmail?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = new URL('/intake', baseUrl);
  url.searchParams.set('orderId', orderId);

  if (customerEmail) {
    url.searchParams.set('email', customerEmail);
  }

  return url.toString();
}

function estimateDeliveryDate() {
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 3);
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
      return;
    }

    order.driveFolderId = folder.id;
    order.driveFolderUrl = folder.webViewLink;
    order.prepWorkspaceUrl = folder.webViewLink;
    order.driveError = undefined;
  } catch (error) {
    order.driveError = getErrorMessage(error);
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
  } catch (error) {
    order.driveError = getErrorMessage(error);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown Google Drive error';
}

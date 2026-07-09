import type { Intake } from './intake-schema';
import type {
  BriefStatus,
  DeliveryStatus,
  IntakeStatus,
  OrderStatus,
  PaymentStatus,
} from './orders';
import type { PackageKey } from './packages';

export type DatabaseRecord = {
  createdAt: string;
  id: string;
  updatedAt: string;
};

export type UserRecord = DatabaseRecord & {
  email: string;
  lastLoginAt?: string;
  name?: string;
  role: 'customer' | 'admin';
};

export type OrderRecord = DatabaseRecord & {
  amountPaid?: number;
  briefStatus: BriefStatus;
  customerEmail: string;
  customerName?: string;
  deliveryDate?: string;
  deliveryStatus: DeliveryStatus;
  driveFolderId?: string;
  driveFolderUrl?: string;
  generatedBriefUrl?: string;
  intakeStatus: IntakeStatus;
  packageKey?: PackageKey;
  packageName: string;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  stripePaymentId?: string;
  stripeSessionId?: string;
  userId?: string;
};

export type OrderEventRecord = DatabaseRecord & {
  event: string;
  message?: string;
  orderId?: string;
  severity: 'info' | 'warning' | 'error';
};

export type IntakeSubmissionRecord = DatabaseRecord & {
  intake: Intake;
  orderId: string;
  submittedByEmail: string;
};

export type UploadRecord = DatabaseRecord & {
  contentType: string;
  filename: string;
  orderId: string;
  sizeBytes?: number;
  storageKey?: string;
  uploadStatus: 'pending' | 'uploaded' | 'failed';
};

export type BriefRecord = DatabaseRecord & {
  deliveryUrl?: string;
  filename?: string;
  generationMode?: 'fallback' | 'ai';
  orderId: string;
  status: BriefStatus;
};

export type PushTokenRecord = DatabaseRecord & {
  deviceLabel?: string;
  email: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  token: string;
  userId?: string;
};

export type SupportRequestRecord = DatabaseRecord & {
  email: string;
  message: string;
  status: 'open' | 'closed';
  subject?: string;
  userId?: string;
};

import { readFile } from 'fs/promises';
import path from 'path';
import type { Order } from '../lib/orders';

type SupabaseOrderRow = {
  amount_paid?: number;
  brief_status: Order['briefStatus'];
  created_at: string;
  customer_email: string;
  customer_name?: string;
  delivery_date?: string;
  delivery_status: Order['deliveryStatus'];
  drive_error?: string;
  drive_folder_id?: string;
  drive_folder_url?: string;
  error_message?: string;
  generated_brief_mode?: 'fallback';
  generated_brief_url?: string;
  id: string;
  intake?: Order['intake'];
  intake_status: Order['intakeStatus'];
  intake_submitted_at?: string;
  intake_token_hash?: string;
  logs: Order['logs'];
  package_key?: Order['packageKey'];
  package_name: string;
  payment_status: Order['paymentStatus'];
  prep_workspace_url?: string;
  status: Order['status'];
  stripe_payment_id?: string;
  stripe_session_id?: string;
  updated_at: string;
};

const writeEnabled = process.argv.includes('--write');
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const sourcePath = sourceArg
  ? sourceArg.replace('--source=', '')
  : path.join(process.cwd(), 'data', 'orders.json');

async function main() {
  const orders = await readOrders(sourcePath);

  if (orders.length === 0) {
    console.log(`No orders found in ${sourcePath}. Nothing to migrate.`);
    return;
  }

  console.log(`Found ${orders.length} order(s) in ${sourcePath}.`);

  if (!writeEnabled) {
    console.log('Dry run only. Re-run with --write to upsert orders into Supabase.');
    return;
  }

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  await upsertOrders({
    rows: orders.map(orderToRow),
    serviceRoleKey,
    supabaseUrl,
  });

  console.log(`Migrated ${orders.length} order(s) into Supabase. Source JSON was not modified.`);
}

async function readOrders(filePath: string): Promise<Order[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as Order[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function upsertOrders({
  rows,
  serviceRoleKey,
  supabaseUrl,
}: {
  rows: SupabaseOrderRow[];
  serviceRoleKey: string;
  supabaseUrl: string;
}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/orders?on_conflict=id`, {
    body: JSON.stringify(rows),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Supabase migration failed with status ${response.status}.`);
  }
}

function requireEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required for --write migrations.`);
  }

  return value;
}

function orderToRow(order: Order): SupabaseOrderRow {
  return {
    amount_paid: order.amountPaid,
    brief_status: order.briefStatus,
    created_at: order.createdAt,
    customer_email: order.customerEmail,
    customer_name: order.customerName,
    delivery_date: order.deliveryDate,
    delivery_status: order.deliveryStatus,
    drive_error: order.driveError,
    drive_folder_id: order.driveFolderId,
    drive_folder_url: order.driveFolderUrl,
    error_message: order.errorMessage,
    generated_brief_mode: order.generatedBriefMode,
    generated_brief_url: order.generatedBriefUrl,
    id: order.id,
    intake: order.intake,
    intake_status: order.intakeStatus,
    intake_submitted_at: order.intakeSubmittedAt,
    intake_token_hash: order.intakeTokenHash,
    logs: order.logs || [],
    package_key: order.packageKey,
    package_name: order.packageName,
    payment_status: order.paymentStatus,
    prep_workspace_url: order.prepWorkspaceUrl,
    status: order.status,
    stripe_payment_id: order.stripePaymentId,
    stripe_session_id: order.stripeSessionId,
    updated_at: order.updatedAt,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
});

import type { Order } from '@/lib/orders';
import type { OrderStore, StoredOrderEvent } from './orders';

type SupabaseOrderRow = {
  amount_paid?: number | null;
  brief_status: Order['briefStatus'];
  created_at: string;
  customer_email: string;
  customer_name?: string | null;
  delivery_date?: string | null;
  delivery_status: Order['deliveryStatus'];
  drive_error?: string | null;
  drive_folder_id?: string | null;
  drive_folder_url?: string | null;
  error_message?: string | null;
  generated_brief_mode?: 'fallback' | null;
  generated_brief_url?: string | null;
  id: string;
  intake?: Order['intake'] | null;
  intake_status: Order['intakeStatus'];
  intake_submitted_at?: string | null;
  intake_token_hash?: string | null;
  logs?: Order['logs'] | null;
  package_key?: Order['packageKey'] | null;
  package_name: string;
  payment_status: Order['paymentStatus'];
  prep_workspace_url?: string | null;
  status: Order['status'];
  stripe_payment_id?: string | null;
  stripe_session_id?: string | null;
  updated_at: string;
};

class SupabaseOrderStore implements OrderStore {
  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string
  ) {}

  async listOrders(): Promise<Order[]> {
    const rows = await this.request<SupabaseOrderRow[]>('/rest/v1/orders?select=*&order=created_at.desc');
    return rows.map(orderFromRow);
  }

  async saveOrders(orders: Order[]) {
    if (orders.length === 0) {
      return;
    }

    await this.request('/rest/v1/orders?on_conflict=id', {
      body: JSON.stringify(orders.map(orderToRow)),
      headers: {
        Prefer: 'resolution=merge-duplicates',
      },
      method: 'POST',
    });
  }

  async appendOrderEvent(event: StoredOrderEvent) {
    await this.request('/rest/v1/order_events', {
      body: JSON.stringify({
        event: event.event,
        message: event.message,
        order_id: event.orderId || null,
        severity: event.severity || 'info',
      }),
      method: 'POST',
    });
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase order storage request failed with status ${response.status}.`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

export function isSupabaseOrderStoreConfigured() {
  return Boolean(
    process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && process.env.SUPABASE_ANON_KEY
  );
}

export function createSupabaseOrderStore(): OrderStore {
  return new SupabaseOrderStore(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
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
    logs: order.logs,
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

function orderFromRow(row: SupabaseOrderRow): Order {
  return {
    amountPaid: row.amount_paid || undefined,
    briefStatus: row.brief_status,
    createdAt: row.created_at,
    customerEmail: row.customer_email,
    customerName: row.customer_name || undefined,
    deliveryDate: row.delivery_date || undefined,
    deliveryStatus: row.delivery_status,
    driveError: row.drive_error || undefined,
    driveFolderId: row.drive_folder_id || undefined,
    driveFolderUrl: row.drive_folder_url || undefined,
    errorMessage: row.error_message || undefined,
    generatedBriefMode: row.generated_brief_mode || undefined,
    generatedBriefUrl: row.generated_brief_url || undefined,
    id: row.id,
    intake: row.intake || undefined,
    intakeStatus: row.intake_status,
    intakeSubmittedAt: row.intake_submitted_at || undefined,
    intakeTokenHash: row.intake_token_hash || undefined,
    logs: row.logs || [],
    packageKey: row.package_key || undefined,
    packageName: row.package_name,
    paymentStatus: row.payment_status,
    prepWorkspaceUrl: row.prep_workspace_url || undefined,
    status: row.status,
    stripePaymentId: row.stripe_payment_id || undefined,
    stripeSessionId: row.stripe_session_id || undefined,
    updatedAt: row.updated_at,
  };
}

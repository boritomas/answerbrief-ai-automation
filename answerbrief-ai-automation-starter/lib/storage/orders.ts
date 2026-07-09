import { promises as fs } from 'fs';
import path from 'path';
import type { Order } from '@/lib/orders';
import { createSupabaseOrderStore, isSupabaseOrderStoreConfigured } from './supabase-orders';

export type StoredOrderEvent = {
  event: string;
  message?: string;
  orderId?: string;
  severity?: 'info' | 'warning' | 'error';
};

export type OrderStore = {
  appendOrderEvent?(event: StoredOrderEvent): Promise<void>;
  listOrders(): Promise<Order[]>;
  saveOrders(orders: Order[]): Promise<void>;
};

class JsonFileOrderStore implements OrderStore {
  constructor(private readonly filePath: string) {}

  async listOrders(): Promise<Order[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as Order[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async saveOrders(orders: Order[]) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(orders, null, 2)}\n`);
  }
}

export function getOrderStore(): OrderStore {
  if (isSupabaseOrderStoreConfigured()) {
    return createSupabaseOrderStore();
  }

  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    throw new Error('Production order storage requires non-empty Supabase environment variables.');
  }

  return new JsonFileOrderStore(path.join(process.cwd(), 'data', 'orders.json'));
}

export function getOrderStorageDiagnostics() {
  const supabaseAdapterActive = isSupabaseOrderStoreConfigured();
  const productionRuntime = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

  return {
    jsonFallbackActive: !supabaseAdapterActive && !productionRuntime,
    storageProvider: supabaseAdapterActive ? 'supabase' : 'unconfigured',
    supabaseAdapterActive,
    supabaseEnvPresent: supabaseAdapterActive,
    timestamp: new Date().toISOString(),
  };
}

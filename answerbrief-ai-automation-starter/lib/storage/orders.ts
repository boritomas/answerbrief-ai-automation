import { promises as fs } from 'fs';
import path from 'path';
import type { Order } from '@/lib/orders';

export type OrderStore = {
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
  return new JsonFileOrderStore(path.join(process.cwd(), 'data', 'orders.json'));
}

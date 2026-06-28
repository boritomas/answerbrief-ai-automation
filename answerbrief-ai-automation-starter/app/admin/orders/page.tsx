import { unstable_noStore as noStore } from 'next/cache';
import { listOrders } from '@/lib/orders';

export const runtime = 'nodejs';

type OrdersPageProps = {
  searchParams: {
    password?: string;
  };
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  noStore();

  const password = process.env.ADMIN_DASHBOARD_PASSWORD;

  if (!password || searchParams.password !== password) {
    return (
      <main>
        <section className="hero compact">
          <p className="eyebrow">Admin</p>
          <h1>Orders are protected.</h1>
          <p className="subhead">Set `ADMIN_DASHBOARD_PASSWORD` and open this page with the password query string.</p>
        </section>
      </main>
    );
  }

  const orders = await listOrders();

  return (
    <main>
      <section className="hero compact">
        <p className="eyebrow">Admin</p>
        <h1>Order tracker</h1>
        <p className="subhead">Paid orders, intake status, and customer Drive workspaces.</p>
      </section>
      <section>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Package</th>
                <th>Status</th>
                <th>Created</th>
                <th>Delivery</th>
                <th>Drive folder</th>
                <th>Drive status</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7}>No orders yet.</td>
                </tr>
              ) : orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.customerEmail}</td>
                  <td>{order.packageName}</td>
                  <td>{order.status}</td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td>{order.deliveryDate || 'TBD'}</td>
                  <td>
                    {order.driveFolderUrl || order.prepWorkspaceUrl ? (
                      <a href={order.driveFolderUrl || order.prepWorkspaceUrl}>Open</a>
                    ) : 'Not set'}
                  </td>
                  <td>{order.driveError || (order.driveFolderUrl ? 'Ready' : 'Not configured')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

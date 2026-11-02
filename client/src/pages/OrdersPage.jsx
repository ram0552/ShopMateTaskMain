
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import  api  from '../utils/api';

const formatINR = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(Number(amount) || 0);

const formatDate = (value) => {
  if (!value) return 'Date unavailable';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
};

const getOrderStatus = (order) =>
  order.orderStatus ?? order.status ?? 'unknown';

const getOrdersFromResponse = (data) => {
  if (Array.isArray(data?.orders)) return data.orders;
  if (Array.isArray(data?.data?.orders)) return data.data.orders;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;

  return [];
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadOrders = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await api.get('/orders?page=1&limit=20');
        const data = response.data;

        if (data?.success === false) {
          throw new Error(data.message || 'Unable to load orders.');
        }

        const result = getOrdersFromResponse(data);

        if (active) {
          setOrders(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              err.message ||
              'Unable to load your orders. Please try again.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadOrders();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-sm text-neutral-500">Your account</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          My Orders
        </h1>
        <p className="mt-2 text-neutral-500">
          View your purchases and order information.
        </p>
      </div>

      {loading && (
        <div role="status" className="py-12 text-center text-neutral-500">
          Loading your orders...
        </div>
      )}

      {!loading && error && (
        <section
          role="alert"
          className="rounded-xl border border-red-300 p-5"
        >
          <p className="font-medium">Could not load orders</p>
          <p className="mt-2 text-sm text-neutral-500">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg border px-4 py-2 text-sm"
          >
            Try again
          </button>
        </section>
      )}

      {!loading && !error && orders.length === 0 && (
        <section className="rounded-2xl border p-8 text-center">
          <h2 className="text-lg font-medium">No orders yet</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Your completed checkout orders will appear here.
          </p>
          <Link
            to="/home"
            className="mt-5 inline-block rounded-lg bg-neutral-900 px-5 py-3 text-sm text-white"
          >
            Continue shopping
          </Link>
        </section>
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="space-y-4">
          {orders.map((order) => {
            const orderId = order.orderId;
            const status = getOrderStatus(order);
            const items = Array.isArray(order.items) ? order.items : [];

            return (
              <article
                key={orderId}
                className="rounded-2xl border border-neutral-200 p-5 sm:p-6"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-500">Order ID</p>
                    <p className="mt-1 break-all font-mono text-sm">
                      {orderId || 'Unavailable'}
                    </p>
                    <p className="mt-2 text-sm text-neutral-500">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <p className="text-xs text-neutral-500">Total</p>
                    <p className="mt-1 text-xl font-semibold">
                      {formatINR(order.totalAmount)}
                    </p>
                    <span className="mt-2 inline-block rounded-full border px-3 py-1 text-xs capitalize">
                      {String(status).replaceAll('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="mt-5 border-t border-neutral-200 pt-4">
                  <p className="mb-3 text-sm font-medium">Items</p>

                  <ul className="space-y-2">
                    {items.map((item, index) => (
                      <li
                        key={`${item.productId || item.name}-${index}`}
                        className="flex justify-between gap-4 text-sm"
                      >
                        <span className="text-neutral-600">
                          {item.name || 'Product'} × {item.quantity || 1}
                        </span>
                        <span className="shrink-0">
                          {formatINR(item.subtotal)}
                        </span>

                      </li>
                    ))}
                  </ul>

                  <p className="mt-4 text-sm text-neutral-500">
                    Payment: {String(
                      order.paymentMethod || 'Not specified'
                    ).toUpperCase()}
                    {' · '}
                    {String(
                      order.paymentStatus || 'unknown'
                    ).replaceAll('_', ' ')}
                  </p>

                    <p>
                        <Link
                        to={`/orders/${encodeURIComponent(order.orderId)}`}
                        className="mt-4 inline-flex rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-100"
                        >
                        View Order Details →
                        </Link>
                    </p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <Link
          to="/home"
          className="text-sm underline underline-offset-4"
        >
          Continue shopping
        </Link>
      </div>
    </main>
  );
}



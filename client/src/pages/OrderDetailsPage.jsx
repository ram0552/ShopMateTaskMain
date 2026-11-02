
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../utils/api';

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

const statusLabel = (value) =>
  String(value || 'unknown').replaceAll('_', ' ');

const ORDER_STAGES = [
  {
    key: 'placed',
    label: 'Order Placed',
    description: 'Your order has been received.',
  },
  {
    key: 'shipped',
    label: 'Shipped',
    description: 'Your order is on its way.',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    description: 'Your order has been delivered.',
  },
];

const ORDER_STATUS_RANK = {
  placed: 0,
  shipped: 1,
  delivered: 2,
};



export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;

    const loadOrder = async () => {
      setLoading(true);
      setError('');
      setOrder(null);

      try {
        const response = await api.get(
          `/orders/${encodeURIComponent(orderId)}`
        );

        const data = response.data;
        const result = data?.order ?? data?.data?.order ?? data?.data;

        if (data?.success === false || !result?.orderId) {
          throw new Error(data?.message || 'Order not found.');
        }

        if (active) setOrder(result);
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              err.message ||
              'Unable to load this order.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    if (orderId) {
      loadOrder();
    } else {
      setError('Invalid order ID.');
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [orderId]);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <p role="status" className="text-neutral-500">
          Loading order details...
        </p>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Order unavailable</h1>
        <p role="alert" className="mt-3 text-neutral-500">
          {error || 'This order could not be found.'}
        </p>
        <Link
          to="/orders"
          className="mt-6 inline-block underline underline-offset-4"
        >
          Back to My Orders
        </Link>
      </main>
    );
  }

  const status = order.orderStatus ?? order.status;
  const address = order.shippingAddress ?? {};
  const items = Array.isArray(order.items) ? order.items : [];
  const handleCancelOrder = async () => {
  const confirmed = window.confirm(
    'Are you sure you want to cancel this order?'
  );

  if (!confirmed) return;

  try {
    const response = await api.post(
      `/orders/${encodeURIComponent(order.orderId)}/cancel`
    );

    const updatedOrder =
      response.data?.data ??
      response.data?.order;

    if (!updatedOrder) {
      throw new Error('Unable to retrieve the updated order.');
    }

    setOrder(updatedOrder);
    alert('Order cancelled successfully.');
  } catch (error) {
    alert(
      error.response?.data?.message ??
      error.message ??
      'Failed to cancel the order.'
    );
  }
};



  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link
        to="/orders"
        className="text-sm text-neutral-500 underline underline-offset-4"
      >
        ← Back to My Orders
      </Link>

      <header className="mt-6 flex flex-col justify-between gap-4 sm:flex-row">
        <div>
          <p className="text-sm text-neutral-500">Order details</p>
          <h1 className="mt-2 text-3xl font-semibold">
            Your Order
          </h1>
          <p className="mt-3 break-all font-mono text-sm text-neutral-500">
            {order.orderId}
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            Placed on {formatDate(order.createdAt)}
          </p>
        </div>

        <div className="sm:text-right">
          <p className="text-sm text-neutral-500">Order total</p>
          <p className="mt-1 text-2xl font-semibold">
            {formatINR(order.totalAmount)}
          </p>
          
            <span className="mt-3 inline-block rounded-full border px-3 py-1 text-sm capitalize">
            {statusLabel(status)}
            </span>

            {String(status).toLowerCase() === 'placed' && (
            <button
                type="button"
                onClick={handleCancelOrder}
                className="mt-4 block rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
                Cancel Order
            </button>
            )}
        </div>
      </header>
      
        <section className="mt-8 rounded-2xl border p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Order Tracking</h2>

            {String(status).toLowerCase() === 'cancelled' ? (
                <div
                className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
                role="status"
                >
                <p className="font-semibold">Order Cancelled</p>
                <p className="mt-1 text-sm">
                    This order will not proceed to shipping or delivery.
                </p>
                </div>
            ) : (
                <ol className="mt-6 space-y-6">
                {ORDER_STAGES.map((stage, index) => {
                    const currentRank =
                    ORDER_STATUS_RANK[String(status).toLowerCase()] ?? -1;

                    const isComplete = index <= currentRank;
                    const isCurrent = index === currentRank;

                    return (
                    <li key={stage.key} className="flex gap-4">
                        <div className="flex flex-col items-center">
                        <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                            isComplete
                                ? 'border-green-600 bg-green-600 text-white'
                                : 'border-neutral-300 text-neutral-500'
                            }`}
                            aria-label={isCurrent ? 'Current order status' : undefined}
                        >
                            {isComplete ? '✓' : index + 1}
                        </span>

                        {index < ORDER_STAGES.length - 1 && (
                            <span
                            className={`mt-1 min-h-6 w-0.5 flex-1 ${
                                index < currentRank
                                ? 'bg-green-600'
                                : 'bg-neutral-200'
                            }`}
                            />
                        )}
                        </div>

                        <div className="pb-2">
                        <p className="font-medium">
                            {stage.label}
                            {isCurrent && (
                            <span className="ml-2 text-xs font-normal text-green-700">
                                Current
                            </span>
                            )}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                            {stage.description}
                        </p>
                        </div>
                    </li>
                    );
                })}
                </ol>
            )}
        </section>


      <section className="mt-8 rounded-2xl border p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Items ordered</h2>

        <div className="mt-5 divide-y">
          {items.map((item, index) => (
            <div
              key={`${item.productId || item.name}-${index}`}
              className="flex gap-4 py-4 first:pt-0 last:pb-0"
            >
              {item.image && (
                <img
                  src={item.image}
                  alt={item.name || 'Product'}
                  className="h-20 w-20 shrink-0 rounded-lg border object-cover"
                  loading="lazy"
                />
              )}

              <div className="min-w-0 flex-1">
                <h3 className="font-medium">
                  {item.name || 'Product'}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Quantity: {item.quantity}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Unit price: {formatINR(item.unitPrice)}
                </p>
              </div>

              <p className="shrink-0 font-medium">
                {formatINR(item.subtotal)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-neutral-500">Payment method</span>
            <span className="font-medium">
              {String(order.paymentMethod || 'Not specified').toUpperCase()}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-neutral-500">Payment status</span>
            <span className="capitalize">
              {statusLabel(order.paymentStatus)}
            </span>
          </div>

          <div className="flex justify-between gap-4 pt-2 text-base">
            <span className="font-semibold">Total</span>
            <span className="font-semibold">
              {formatINR(order.totalAmount)}
            </span>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Delivery address</h2>

        {address.fullName ? (
          <div className="mt-4 space-y-1 text-sm leading-6 text-neutral-600">
            <p className="font-medium text-neutral-900">
              {address.fullName}
            </p>
            {address.phone && <p>{address.phone}</p>}
            <p>{address.addressLine1}</p>
            {address.addressLine2 && <p>{address.addressLine2}</p>}
            <p>
              {[address.city, address.state, address.postalCode]
                .filter(Boolean)
                .join(', ')}
            </p>
            {address.country && <p>{address.country}</p>}
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">
            Delivery address is unavailable for this order.
          </p>
        )}
      </section>

      {String(status).toLowerCase() === 'cancelled' && (
        <p className="mt-6 rounded-xl border p-4 text-sm">
          This order has been cancelled.
        </p>
      )}
    </main>
  );
}

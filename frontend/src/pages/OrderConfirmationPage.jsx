import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  Sparkles,
  Store,
  Truck,
} from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import { formatPrice, formatTimestamp } from '../utils/formatters';
import VegBadge from '../components/VegBadge';

export default function OrderConfirmationPage() {
  const { orderId } = useParams();
  const { orders, getOrderById } = useOrders();

  const order = useMemo(() => {
    if (orderId) return getOrderById(orderId) || orders[0] || null;
    return orders[0] || null;
  }, [orderId, getOrderById, orders]);

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold text-brand-black">
          No recent order found
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Add dishes from a restaurant and place an order at checkout to view
          your confirmation.
        </p>
        <Link
          to="/restaurants"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primaryDark"
        >
          Browse Restaurants
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Confirmation Banner */}
      <div className="rounded-3xl border border-emerald-200 bg-white p-7 shadow-card sm:p-9">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  Order Confirmed
                </span>
                <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-[11px] font-medium text-neutral-500">
                  Academic Demo Order
                </span>
              </div>
              <h1 className="mt-1.5 font-display text-2xl font-extrabold text-brand-black sm:text-3xl">
                Thank you, {order.customerName || 'Customer'}!
              </h1>
              <p className="mt-0.5 text-xs text-neutral-500">
                Order ID <strong className="font-mono text-brand-black">{order.id}</strong>{' '}
                · Confirmed {formatTimestamp(order.createdAt)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-brand-primarySoft px-4 py-3 text-left sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-primaryDark">
              Estimated Delivery
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 font-display text-2xl font-extrabold text-brand-black tabular-nums sm:justify-end">
              <Clock className="h-5 w-5 text-brand-primary" />
              {order.etaMinutes} min
            </p>
            <p className="text-[11px] text-neutral-600">
              {order.etaSource === 'live-ml'
                ? 'Predicted by Random Forest ML'
                : 'Restaurant baseline estimate'}
            </p>
          </div>
        </div>

        {/* Prominent AI ETA CTA */}
        <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-brand-primaryBorder bg-brand-primarySoft/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-base font-bold text-brand-black">
              Explore live AI delivery prediction for {order.id}
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              View live order progress and fine-tune traffic, weather, and route
              conditions with our Random Forest ETA model.
            </p>
          </div>

          <Link
            to={`/predict/${order.id}`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-primary px-6 py-3.5 text-sm font-bold text-white shadow-soft transition-colors hover:bg-brand-primaryDark"
          >
            <Sparkles className="h-4 w-4" />
            View AI Delivery Prediction
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Order Details Grid */}
        <div className="mt-7 grid gap-6 border-t border-neutral-100 pt-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface-soft p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
                <Store className="h-3.5 w-3.5 text-brand-primary" />
                Restaurant
              </p>
              <p className="mt-1.5 font-display text-sm font-bold text-brand-black">
                {order.restaurant?.name}
              </p>
              {order.restaurant?.address && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  {order.restaurant.address}
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-surface-soft p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500">
                <MapPin className="h-3.5 w-3.5 text-brand-primary" />
                Delivery Address
              </p>
              <p className="mt-1.5 text-sm font-medium text-brand-black">
                {order.deliveryAddress}
              </p>
              {order.instructions && (
                <p className="mt-1 text-xs text-neutral-500">
                  Note: {order.instructions}
                </p>
              )}
            </div>
          </div>

          {/* Items & Total */}
          <div className="rounded-2xl border border-neutral-200 p-4">
            <h2 className="font-display text-sm font-bold text-brand-black">
              Ordered Items ({order.items?.length || 0})
            </h2>
            <ul className="mt-3 divide-y divide-neutral-100 text-xs">
              {(order.items || []).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <span className="flex items-center gap-2 text-neutral-700">
                    <VegBadge isVeg={item.isVeg !== false} />
                    <span>
                      <strong className="text-brand-black">
                        {item.quantity}×
                      </strong>{' '}
                      {item.name}
                    </span>
                  </span>
                  <span className="font-semibold text-brand-black tabular-nums">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 text-sm font-extrabold text-brand-black">
              <span>Total Amount</span>
              <span className="tabular-nums">{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Secondary Actions */}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-5">
          <Link
            to={`/track/${order.id}`}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-semibold text-brand-black hover:bg-surface-soft"
          >
            <Truck className="h-4 w-4 text-brand-primary" />
            Track Order Status
          </Link>
          <Link
            to="/restaurants"
            className="text-xs font-semibold text-neutral-600 hover:text-brand-primary"
          >
            Order more food →
          </Link>
        </div>
      </div>
    </div>
  );
}

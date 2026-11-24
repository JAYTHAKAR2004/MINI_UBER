import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
} from 'lucide-react';
import { ORDER_STAGES, useOrders } from '../context/OrderContext';
import { FINAL_TEST_METRICS } from '../data/analyticsBaseline';
import { formatPrice, formatTimestamp } from '../utils/formatters';
import VegBadge from '../components/VegBadge';
import DeliveryTrackingMap from '../components/maps/DeliveryTrackingMap';

function formatPaymentBadge(order) {
  if (order.paymentStatus === 'RECONCILED') {
    return {
      label: `UPI Payment Reconciled (UTR: ${order.utr || 'Verified'})`,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (order.paymentStatus === 'PENDING_VERIFICATION' || order.paymentStatus === 'UTR_SUBMITTED') {
    return {
      label: `Pending Bank Verification (UTR: ${order.utr || 'Submitted'})`,
      className: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (order.paymentStatus === 'PAID_TEST') {
    return {
      label: `Razorpay Test Verified (${order.razorpayPaymentId || 'Test'})`,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (order.paymentStatus === 'COD_DEMO') {
    return {
      label: 'Cash on Delivery (Demo)',
      className: 'bg-surface-soft text-neutral-700 border-neutral-200',
    };
  }
  return {
    label: 'Demo Checkout Order (No Real Charge)',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  };
}

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

  const paymentBadge = formatPaymentBadge(order);
  const isPendingVerification =
    order.paymentStatus === 'PENDING_VERIFICATION' ||
    order.paymentStatus === 'UTR_SUBMITTED';
  const etaLow = Math.max(
    5,
    Math.round(order.etaMinutes - FINAL_TEST_METRICS.mae)
  );
  const etaHigh = Math.round(order.etaMinutes + FINAL_TEST_METRICS.mae);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Confirmation Card */}
      <div
        className={`rounded-3xl border bg-white p-6 shadow-card sm:p-8 ${
          isPendingVerification ? 'border-amber-200' : 'border-emerald-200'
        }`}
      >
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                isPendingVerification
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {isPendingVerification ? (
                <Clock className="h-8 w-8" />
              ) : (
                <CheckCircle2 className="h-8 w-8" />
              )}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    isPendingVerification
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {isPendingVerification
                    ? 'Awaiting Bank Verification'
                    : 'Order Confirmed'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${paymentBadge.className}`}
                >
                  <ShieldCheck className="h-3 w-3" />
                  {paymentBadge.label}
                </span>
              </div>
              <h1 className="mt-1.5 font-display text-2xl font-extrabold text-brand-black sm:text-3xl">
                {isPendingVerification
                  ? `Order Placed, ${order.customerName || 'Customer'} (Verification Pending)`
                  : `Thank you, ${order.customerName || 'Customer'}!`}
              </h1>
              <p className="mt-0.5 text-xs text-neutral-500">
                Order ID{' '}
                <strong className="font-mono text-brand-black">
                  {order.id}
                </strong>{' '}
                · {isPendingVerification ? 'Placed' : 'Confirmed'} {formatTimestamp(order.createdAt)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-brand-primarySoft px-4 py-3 text-left sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-primaryDark">
              Estimated Arrival
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 font-display text-2xl font-extrabold text-brand-black tabular-nums sm:justify-end">
              <Clock className="h-5 w-5 text-brand-primary" />
              {order.etaMinutes} min
            </p>
            <p className="text-[11px] text-neutral-600">
              Window: {etaLow}–{etaHigh} min ({order.etaSource === 'live-ml' ? 'Random Forest AI' : 'Kitchen Estimate'})
            </p>
          </div>
        </div>

        {/* Interactive Tracking Map Preview */}
        <div className="mt-6">
          <DeliveryTrackingMap
            restaurantName={order.restaurant?.name}
            restaurantCoords={order.restaurantCoordinates || { lat: 12.9716, lng: 77.5946 }}
            deliveryCoords={order.deliveryCoordinates || { lat: 12.9855, lng: 77.6412 }}
            deliveryLabel={order.deliveryAddress}
            etaMinutes={order.etaMinutes}
            stageIndex={order.stageIndex ?? 1}
            stageLabel={ORDER_STAGES[order.stageIndex ?? 1]}
            showPartner
            heightClass="h-64"
          />
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-primaryBorder bg-brand-primarySoft/60 p-4 sm:p-5">
          <div>
            <p className="font-display text-base font-bold text-brand-black">
              Track your delivery in real time
            </p>
            <p className="text-xs text-neutral-600">
              Follow the 7-stage delivery timeline or explore custom traffic &amp; weather ETA scenarios.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to={`/track/${order.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-bold text-white shadow-soft hover:bg-brand-primaryDark"
            >
              <Truck className="h-4 w-4" />
              Track Order
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={`/predict/${order.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-xs font-bold text-brand-black hover:bg-surface-soft"
            >
              <Sparkles className="h-4 w-4 text-brand-primary" />
              AI ETA Controls
            </Link>
          </div>
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
              {order.deliveryInstructions && (
                <p className="mt-1 text-xs text-neutral-500">
                  Instructions: {order.deliveryInstructions}
                </p>
              )}
            </div>
          </div>

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
              <span>
                {order.paymentStatus === 'PAID_TEST'
                  ? 'Total Paid (Test Mode)'
                  : order.paymentStatus === 'COD_DEMO'
                  ? 'Total Payable (COD)'
                  : 'Total Paid'}
              </span>
              <span className="tabular-nums">{formatPrice(order.total)}</span>
            </div>

            <div className="mt-4 rounded-xl bg-surface-soft p-3.5 text-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Payment Details
              </p>
              <dl className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-neutral-500">Method</dt>
                  <dd className="font-semibold text-brand-black">
                    {order.paymentMethod === 'cod'
                      ? 'Cash on Delivery (Demo)'
                      : order.paymentMethod === 'card'
                      ? 'Credit / Debit Card (Razorpay)'
                      : order.paymentMethod === 'netbanking'
                      ? 'Net Banking (Razorpay)'
                      : order.paymentMethod === 'wallet'
                      ? 'Wallets (Razorpay)'
                      : order.paymentMethod === 'razorpay_upi'
                      ? 'UPI ID / Collect (Razorpay)'
                      : order.paymentMethod === 'razorpay'
                      ? 'Razorpay Online'
                      : order.paymentMethod}
                    {(order.paymentMode === 'razorpay_test' || order.paymentStatus === 'PAID_TEST') &&
                      ' · Test Mode'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-neutral-500">Status</dt>
                  <dd className="font-mono font-semibold text-brand-black">
                    {order.paymentStatus}
                  </dd>
                </div>
                {order.razorpayOrderId && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-neutral-500">Razorpay Order ID</dt>
                    <dd className="font-mono text-neutral-700">{order.razorpayOrderId}</dd>
                  </div>
                )}
                {order.razorpayPaymentId && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-neutral-500">Razorpay Payment ID</dt>
                    <dd className="font-mono text-neutral-700">{order.razorpayPaymentId}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CreditCard,
  Loader2,
  MapPin,
  ShieldAlert,
  User,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLocationContext } from '../context/LocationContext';
import { useOrders } from '../context/OrderContext';
import { useToast } from '../context/ToastContext';
import { predictETA } from '../services/etaService';
import {
  areCoordinatesValid,
  calculateHaversineKm,
  CITY_PRESETS,
} from '../utils/haversine';
import { formatPrice } from '../utils/formatters';
import VegBadge from '../components/VegBadge';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const {
    items,
    restaurant,
    subtotal,
    deliveryFee,
    platformFee,
    taxes,
    discount,
    appliedPromo,
    total,
    clearCart,
  } = useCart();
  const { cityId, address } = useLocationContext();
  const { placeOrder, recordPrediction } = useOrders();
  const { showToast } = useToast();

  const [selectedCityId, setSelectedCityId] = useState(cityId);
  const [streetAddress, setStreetAddress] = useState(address);
  const [apartment, setApartment] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [instructions, setInstructions] = useState('Leave at front door');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const activePreset =
    CITY_PRESETS.find((c) => c.id === selectedCityId) || CITY_PRESETS[0];

  const rLat = restaurant?.coordinates?.lat ?? activePreset.restaurantLat;
  const rLon = restaurant?.coordinates?.lng ?? activePreset.restaurantLon;
  const dLat = activePreset.deliveryLat;
  const dLon = activePreset.deliveryLon;
  const computedDistance = calculateHaversineKm(rLat, rLon, dLat, dLon) ?? 5.4;
  const coordsValid = areCoordinatesValid(rLat, rLon, dLat, dLon);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold text-brand-black">
          Your cart is empty
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Add items from a restaurant before checking out.
        </p>
        <Link
          to="/restaurants"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white"
        >
          Browse Restaurants
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const validate = () => {
    const errs = {};
    if (!streetAddress.trim()) {
      errs.streetAddress = 'Delivery address is required.';
    }
    if (!customerName.trim()) {
      errs.customerName = 'Customer name is required.';
    }
    if (!customerPhone.trim() || customerPhone.trim().length < 7) {
      errs.customerPhone = 'Enter a valid phone number.';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!validate() || submitting) return;

    setSubmitting(true);
    const fullAddress = apartment.trim()
      ? `${apartment.trim()}, ${streetAddress.trim()}`
      : streetAddress.trim();

    const now = new Date();
    const jsDay = now.getDay();
    const pythonWeekday = jsDay === 0 ? 6 : jsDay - 1;

    const initialPayload = {
      Delivery_person_Age: 28,
      Delivery_person_Ratings: 4.7,
      Vehicle_condition: 2,
      multiple_deliveries: 0,
      distance_km: computedDistance > 0 ? computedDistance : 4.5,
      coordinates_valid: coordsValid,
      order_time_missing: 0,
      order_hour: now.getHours(),
      order_day: now.getDate(),
      order_month: now.getMonth() + 1,
      order_weekday: pythonWeekday,
      Weather_conditions: 'Cloudy',
      Road_traffic_density: 'Medium',
      Type_of_order: items[0]?.orderType || 'Meal',
      Type_of_vehicle: 'motorcycle',
      Festival: 'No',
      City: restaurant?.modelCity || activePreset.modelCity,
    };

    let etaMinutes = restaurant?.etaMinutes || 25;
    let etaSource = 'restaurant-estimate';
    let predictionTelemetry = null;
    let predictionTimestamp = null;

    try {
      const mlResult = await predictETA(initialPayload);
      recordPrediction(mlResult);
      etaMinutes = mlResult.predicted_eta_minutes;
      etaSource = 'live-ml';
      predictionTelemetry = mlResult;
      predictionTimestamp = new Date().toISOString();
    } catch {
      // Backend unreachable: fall back to restaurant estimate honestly
    }

    const order = placeOrder({
      restaurant: restaurant || {
        name: 'Zomato Kitchen',
        address: activePreset.defaultAddress,
        coordinates: { lat: rLat, lng: rLon },
        modelCity: activePreset.modelCity,
      },
      items,
      subtotal,
      deliveryFee,
      platformFee,
      taxes,
      discount,
      appliedPromoCode: appliedPromo?.code || null,
      total,
      deliveryAddress: fullAddress,
      deliveryCityId: selectedCityId,
      deliveryCoordinates: { lat: dLat, lng: dLon },
      restaurantCoordinates: { lat: rLat, lng: rLon },
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      instructions: instructions.trim(),
      paymentMethod,
      distanceKm: computedDistance,
      etaMinutes,
      etaSource,
      predictionTelemetry,
      predictionTimestamp,
    });

    clearCart();
    setSubmitting(false);
    showToast({
      title: `Order ${order.id} confirmed!`,
      description: `From ${order.restaurant.name}`,
      type: 'success',
    });
    navigate(`/order-confirmation/${order.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-brand-black">
            Checkout
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Enter your delivery details and confirm your food order.
          </p>
        </div>
        <span className="rounded-full border border-neutral-200 bg-surface-soft px-3.5 py-1.5 text-xs font-semibold text-neutral-600">
          Academic Demo Checkout
        </span>
      </div>

      <form
        onSubmit={handlePlaceOrder}
        className="mt-8 grid gap-8 lg:grid-cols-12"
      >
        {/* Left Column */}
        <div className="space-y-6 lg:col-span-7">
          {/* Customer Information */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-soft">
            <div className="flex items-center gap-2.5">
              <User className="h-5 w-5 text-brand-primary" />
              <h2 className="font-display text-lg font-bold text-brand-black">
                Contact Information
              </h2>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter your name"
                  className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                />
                {formErrors.customerName && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.customerName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                />
                {formErrors.customerPhone && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.customerPhone}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Delivery Address */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-soft">
            <div className="flex items-center gap-2.5">
              <MapPin className="h-5 w-5 text-brand-primary" />
              <h2 className="font-display text-lg font-bold text-brand-black">
                Delivery Address
              </h2>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700">
                  City Zone
                </label>
                <select
                  value={selectedCityId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedCityId(nextId);
                    const found = CITY_PRESETS.find((c) => c.id === nextId);
                    if (found) setStreetAddress(found.defaultAddress);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm font-medium focus:border-neutral-400 focus:bg-white focus:outline-none"
                >
                  {CITY_PRESETS.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700">
                  Flat / Floor / Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={apartment}
                  onChange={(e) => setApartment(e.target.value)}
                  placeholder="Flat 4B, near Metro Gate"
                  className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-neutral-700">
                  Street Address *
                </label>
                <input
                  type="text"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="100 Feet Road, Indiranagar"
                  className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                />
                {formErrors.streetAddress && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.streetAddress}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-neutral-700">
                  Delivery Instructions
                </label>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Ring doorbell, leave with security..."
                  className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Payment Method UI */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-soft">
            <div className="flex items-center gap-2.5">
              <CreditCard className="h-5 w-5 text-brand-primary" />
              <h2 className="font-display text-lg font-bold text-brand-black">
                Payment Method
              </h2>
            </div>

            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>Academic Demo Checkout:</strong> No payment gateway or
                external restaurant ordering backend exists. Placing an order
                creates a local demo order so you can experience order
                confirmation and live AI ETA prediction.
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { id: 'upi', label: 'UPI (GPay / PhonePe)' },
                { id: 'card', label: 'Credit / Debit Card' },
                { id: 'cod', label: 'Cash on Delivery' },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3.5 text-xs font-semibold transition-colors ${
                    paymentMethod === opt.id
                      ? 'border-brand-primary bg-brand-primarySoft text-brand-black'
                      : 'border-neutral-200 bg-surface-soft text-neutral-700 hover:bg-surface-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === opt.id}
                    onChange={() => setPaymentMethod(opt.id)}
                    className="accent-brand-primary"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Order Summary */}
        <div className="lg:col-span-5">
          <div className="sticky top-24 rounded-2xl border border-neutral-200 bg-surface-soft p-6 shadow-soft">
            <h2 className="font-display text-lg font-bold text-brand-black">
              Order Summary
            </h2>
            {restaurant && (
              <p className="mt-0.5 text-xs font-medium text-neutral-500">
                {restaurant.name}
              </p>
            )}

            <ul className="mt-4 divide-y divide-neutral-200 text-sm">
              {items.map((item) => (
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
                  <span className="font-medium text-brand-black tabular-nums">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-2 border-t border-neutral-200 pt-4 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Item total</span>
                <span className="tabular-nums">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Delivery charge</span>
                <span className="tabular-nums">
                  {deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Platform fee</span>
                <span className="tabular-nums">{formatPrice(platformFee)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>GST &amp; restaurant charges (5%)</span>
                <span className="tabular-nums">{formatPrice(taxes)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>Discount ({appliedPromo?.code})</span>
                  <span className="tabular-nums">-{formatPrice(discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-neutral-200 pt-2.5 text-base font-extrabold text-brand-black">
                <span>Total Payable</span>
                <span className="tabular-nums">{formatPrice(total)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-primaryDark disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirming Order...
                </>
              ) : (
                <>
                  Place Order · {formatPrice(total)}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

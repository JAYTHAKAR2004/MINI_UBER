import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLocationContext } from '../context/LocationContext';
import { PROMO_OFFERS } from '../data/restaurants';
import { useToast } from '../context/ToastContext';
import { predictETA } from '../services/etaService';
import {
  areCoordinatesValid,
  calculateHaversineKm,
  citiesMatch,
  MAX_DELIVERY_DISTANCE_KM,
  normalizeCitySlug,
} from '../utils/haversine';
import FoodImage from '../components/FoodImage';
import VegBadge from '../components/VegBadge';
import { formatPrice } from '../utils/formatters';

export default function CartPage() {
  const {
    items,
    restaurant,
    itemCount,
    subtotal,
    deliveryFee,
    platformFee,
    taxes,
    discount,
    appliedPromo,
    promoEligible,
    total,
    updateQuantity,
    removeItem,
    clearCart,
    applyPromo,
    removePromo,
  } = useCart();
  const { shortName, lat, lng, modelCity, selectCityPreset } = useLocationContext();
  const { showToast } = useToast();

  const [couponInput, setCouponInput] = useState('');
  const [liveEta, setLiveEta] = useState(null);
  const [etaError, setEtaError] = useState(null);

  const isCityMismatch = Boolean(
    restaurant?.city && !citiesMatch(restaurant.city, shortName)
  );

  useEffect(() => {
    if (!restaurant || items.length === 0) return undefined;
    if (isCityMismatch) {
      setLiveEta(null);
      setEtaError(
        `Selected restaurant delivers in ${restaurant.city}, not ${shortName}.`
      );
      return undefined;
    }

    const rLat = restaurant.coordinates?.lat;
    const rLon = restaurant.coordinates?.lng;
    if (!areCoordinatesValid(rLat, rLon, lat, lng)) {
      setLiveEta(null);
      setEtaError('Valid restaurant and delivery coordinates are required for ETA.');
      return undefined;
    }

    const dist = calculateHaversineKm(rLat, rLon, lat, lng);
    if (dist === null || dist > MAX_DELIVERY_DISTANCE_KM) {
      setLiveEta(null);
      setEtaError(
        `Delivery distance (${dist ?? 'unknown'} km) exceeds ${MAX_DELIVERY_DISTANCE_KM} km.`
      );
      return undefined;
    }

    let active = true;
    setEtaError(null);
    const now = new Date();
    const jsDay = now.getDay();
    const pythonWeekday = jsDay === 0 ? 6 : jsDay - 1;

    predictETA({
      restaurant_id: restaurant.id,
      selected_city: shortName,
      restaurant_lat: rLat,
      restaurant_lon: rLon,
      delivery_lat: lat,
      delivery_lon: lng,
      Delivery_person_Age: 28,
      Delivery_person_Ratings: 4.7,
      Vehicle_condition: 2,
      multiple_deliveries: 0,
      distance_km: dist,
      coordinates_valid: 1,
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
      City: restaurant.modelCity || modelCity || 'Metropolitian',
    })
      .then((res) => {
        if (active && typeof res?.predicted_eta_minutes === 'number') {
          setLiveEta(res.predicted_eta_minutes);
          setEtaError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setLiveEta(null);
          setEtaError(err?.message || 'Unable to calculate live delivery ETA.');
        }
      });

    return () => {
      active = false;
    };
  }, [restaurant, items, shortName, lat, lng, modelCity, isCityMismatch]);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-surface-soft">
          <ShoppingBag className="h-9 w-9 text-neutral-400" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-extrabold text-brand-black">
          Your cart is empty
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Good food is always cooking. Explore restaurants and add dishes to
          your cart.
        </p>
        <Link
          to="/restaurants"
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-primaryDark"
        >
          Browse Restaurants
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const handleApplyCoupon = (codeToApply) => {
    const res = applyPromo(codeToApply);
    showToast({
      title: res.ok ? 'Coupon updated' : 'Invalid coupon',
      description: res.message,
      type: res.ok ? 'success' : 'error',
    });
    if (res.ok) setCouponInput('');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-brand-black">
            Review Your Cart
          </h1>
          {restaurant && (
            <p className="mt-1 text-sm text-neutral-600">
              Ordering from{' '}
              <Link
                to={`/restaurants/${restaurant.slug}`}
                className="font-semibold text-brand-black underline decoration-brand-primary underline-offset-4 hover:text-brand-primary"
              >
                {restaurant.name}
              </Link>
              {restaurant.city ? ` · ${restaurant.city}` : ''}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={clearCart}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear Cart
        </button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        {/* Items */}
        <div className="space-y-4 lg:col-span-7">
          {isCityMismatch && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold">
                    Cross-city cart detected ({restaurant.city} vs {shortName})
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    Your cart contains items from <strong>{restaurant.name}</strong> ({restaurant.city}), while your selected delivery city is <strong>{shortName}</strong>.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => selectCityPreset(normalizeCitySlug(restaurant.city))}
                  className="rounded-xl bg-brand-primary px-3.5 py-2 font-bold text-white hover:bg-brand-primaryDark"
                >
                  Switch to {restaurant.city}
                </button>
                <button
                  type="button"
                  onClick={clearCart}
                  className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 font-bold text-amber-900 hover:bg-amber-100"
                >
                  Clear Cart
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-2xl border border-brand-primaryBorder bg-brand-primarySoft/60 px-4 py-3 text-xs">
            <span className="inline-flex items-center gap-2 font-semibold text-brand-black">
              {liveEta ? (
                <Sparkles className="h-4 w-4 text-brand-primary" />
              ) : (
                <Clock className="h-4 w-4 text-brand-primary" />
              )}
              {liveEta
                ? `Estimated delivery in ~${Math.round(liveEta)} mins (AI Forecast)`
                : etaError || 'Calculating live delivery estimate...'}
            </span>
            {!isCityMismatch && (
              <Link
                to="/checkout"
                className="font-bold text-brand-primary hover:underline"
              >
                Select address →
              </Link>
            )}
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-soft sm:flex-row sm:items-center"
            >
              <div className="flex items-center gap-4">
                <FoodImage
                  src={item.image}
                  alt={item.name}
                  containerClassName="h-20 w-20 shrink-0 rounded-xl"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <VegBadge isVeg={item.isVeg !== false} />
                    <h2 className="font-display text-base font-bold text-brand-black">
                      {item.name}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                    {formatPrice(item.price)} each
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="inline-flex items-center rounded-xl border border-brand-primaryBorder bg-brand-primarySoft px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.id, -1)}
                    aria-label={`Decrease quantity of ${item.name}`}
                    className="rounded-lg p-1.5 text-brand-primaryDark hover:bg-brand-primary hover:text-white"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[2rem] text-center text-sm font-bold text-brand-primaryDark tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.id, 1)}
                    aria-label={`Increase quantity of ${item.name}`}
                    className="rounded-lg p-1.5 text-brand-primaryDark hover:bg-brand-primary hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <span className="min-w-[4.5rem] text-right text-base font-bold text-brand-black tabular-nums">
                  {formatPrice(item.price * item.quantity)}
                </span>

                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.name}`}
                  className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Coupons & Bill Details */}
        <div className="space-y-5 lg:col-span-5">
          {/* Coupons */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-brand-primary" />
              <h2 className="font-display text-sm font-bold text-brand-black">
                Apply Coupon
              </h2>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleApplyCoupon(couponInput);
              }}
              className="mt-3 flex gap-2"
            >
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="Enter promo code (e.g. WELCOME50)"
                className="flex-1 rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs font-medium uppercase text-brand-black placeholder:normal-case focus:border-neutral-400 focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-xl bg-brand-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Apply
              </button>
            </form>

            {appliedPromo && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <span>
                  <strong>{appliedPromo.code}</strong>:{' '}
                  {promoEligible
                    ? `${appliedPromo.title} applied`
                    : `Add ${formatPrice(
                        appliedPromo.minOrder - subtotal
                      )} more to unlock`}
                </span>
                <button
                  type="button"
                  onClick={removePromo}
                  aria-label="Remove coupon"
                  className="rounded p-0.5 hover:bg-emerald-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.values(PROMO_OFFERS).map((offer) => (
                <button
                  key={offer.code}
                  type="button"
                  onClick={() => handleApplyCoupon(offer.code)}
                  className="rounded-lg border border-dashed border-brand-primaryBorder bg-brand-primarySoft px-2.5 py-1 font-mono text-[11px] font-bold text-brand-primaryDark hover:bg-brand-primary hover:text-white"
                >
                  {offer.code}
                </button>
              ))}
            </div>
          </div>

          {/* Bill Details */}
          <div className="sticky top-24 rounded-2xl border border-neutral-200 bg-surface-soft p-6 shadow-soft">
            <h2 className="font-display text-lg font-bold text-brand-black">
              Bill Details
            </h2>

            <div className="mt-5 space-y-2.5 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Item total ({itemCount} items)</span>
                <span className="font-medium text-brand-black tabular-nums">
                  {formatPrice(subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Delivery charge</span>
                <span className="font-medium text-brand-black tabular-nums">
                  {deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Platform fee</span>
                <span className="font-medium text-brand-black tabular-nums">
                  {formatPrice(platformFee)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>GST &amp; restaurant charges (5%)</span>
                <span className="font-medium text-brand-black tabular-nums">
                  {formatPrice(taxes)}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>Promo discount ({appliedPromo?.code})</span>
                  <span className="tabular-nums">-{formatPrice(discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-neutral-200 pt-3 text-base font-extrabold text-brand-black">
                <span>To Pay</span>
                <span className="tabular-nums">{formatPrice(total)}</span>
              </div>
            </div>

            {isCityMismatch ? (
              <button
                type="button"
                disabled
                className="mt-6 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-neutral-300 py-3.5 text-sm font-semibold text-neutral-600"
              >
                Switch City or Clear Cart to Checkout
              </button>
            ) : (
              <Link
                to="/checkout"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-primaryDark"
              >
                Proceed to Checkout
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

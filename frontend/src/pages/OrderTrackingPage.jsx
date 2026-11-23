import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  Loader2,
  MapPin,
  Package,
  Sparkles,
  Store,
} from 'lucide-react';
import { ORDER_STAGES, useOrders } from '../context/OrderContext';
import { useLocationContext } from '../context/LocationContext';
import { RESTAURANTS } from '../data/restaurants';
import { predictETA } from '../services/etaService';
import { formatPrice, formatTimestamp } from '../utils/formatters';
import {
  areCoordinatesValid,
  calculateHaversineKm,
} from '../utils/haversine';
import OrderProgressTracker from '../components/OrderProgressTracker';
import VegBadge from '../components/VegBadge';

export default function OrderTrackingPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const {
    orders,
    getOrderById,
    placeOrder,
    updateOrderStage,
    recordPrediction,
  } = useOrders();
  const { activePreset } = useLocationContext();

  const [autoPlay, setAutoPlay] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);

  const activeOrder = useMemo(() => {
    if (orderId) return getOrderById(orderId) || orders[0] || null;
    return orders[0] || null;
  }, [orderId, getOrderById, orders]);

  useEffect(() => {
    if (!autoPlay || !activeOrder) return undefined;
    if (activeOrder.stageIndex >= ORDER_STAGES.length - 1) {
      setAutoPlay(false);
      return undefined;
    }
    const timer = setInterval(() => {
      updateOrderStage(activeOrder.id, activeOrder.stageIndex + 1);
    }, 2400);
    return () => clearInterval(timer);
  }, [autoPlay, activeOrder, updateOrderStage]);

  const handleLoadSampleOrder = async () => {
    setCreatingDemo(true);
    const sampleRest = RESTAURANTS[0];
    const dist =
      calculateHaversineKm(
        sampleRest.coordinates.lat,
        sampleRest.coordinates.lng,
        activePreset.deliveryLat,
        activePreset.deliveryLon
      ) ?? 5.6;

    const now = new Date();
    const jsDay = now.getDay();
    const pythonWeekday = jsDay === 0 ? 6 : jsDay - 1;

    let etaMinutes = sampleRest.etaMinutes;
    let etaSource = 'restaurant-estimate';
    let telemetry = null;
    let predictionTimestamp = null;

    try {
      const res = await predictETA({
        Delivery_person_Age: 29,
        Delivery_person_Ratings: 4.8,
        Vehicle_condition: 2,
        multiple_deliveries: 0,
        distance_km: dist,
        coordinates_valid: areCoordinatesValid(
          sampleRest.coordinates.lat,
          sampleRest.coordinates.lng,
          activePreset.deliveryLat,
          activePreset.deliveryLon
        ),
        order_time_missing: 0,
        order_hour: now.getHours(),
        order_day: now.getDate(),
        order_month: now.getMonth() + 1,
        order_weekday: pythonWeekday,
        Weather_conditions: 'Cloudy',
        Road_traffic_density: 'Medium',
        Type_of_order: 'Meal',
        Type_of_vehicle: 'motorcycle',
        Festival: 'No',
        City: sampleRest.modelCity,
      });
      recordPrediction(res);
      etaMinutes = res.predicted_eta_minutes;
      etaSource = 'live-ml';
      telemetry = res;
      predictionTimestamp = new Date().toISOString();
    } catch {
      // Backend unavailable: keep restaurant-estimate fallback honestly
    }

    const demoOrder = placeOrder({
      restaurant: {
        name: sampleRest.name,
        address: sampleRest.address,
        coordinates: sampleRest.coordinates,
        modelCity: sampleRest.modelCity,
      },
      items: [
        {
          id: sampleRest.menu[0].id,
          name: sampleRest.menu[0].name,
          price: sampleRest.menu[0].price,
          isVeg: sampleRest.menu[0].isVeg,
          orderType: sampleRest.menu[0].orderType,
          quantity: 1,
        },
        {
          id: sampleRest.menu[2].id,
          name: sampleRest.menu[2].name,
          price: sampleRest.menu[2].price,
          isVeg: sampleRest.menu[2].isVeg,
          orderType: sampleRest.menu[2].orderType,
          quantity: 1,
        },
      ],
      subtotal: 668,
      deliveryFee: sampleRest.deliveryFee,
      platformFee: 6,
      taxes: 33.4,
      discount: 0,
      total: 736.4,
      deliveryAddress: activePreset.defaultAddress,
      deliveryCoordinates: {
        lat: activePreset.deliveryLat,
        lng: activePreset.deliveryLon,
      },
      restaurantCoordinates: sampleRest.coordinates,
      customerName: 'Guest Customer',
      customerPhone: '+91 98765 00000',
      distanceKm: dist,
      etaMinutes,
      etaSource,
      predictionTelemetry: telemetry,
      predictionTimestamp,
    });

    setCreatingDemo(false);
    navigate(`/track/${demoOrder.id}`, { replace: true });
  };

  if (!activeOrder) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-primarySoft">
          <Package className="h-9 w-9 text-brand-primaryDark" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-extrabold text-brand-black">
          No active order to track
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
          Place an order from any restaurant checkout, or load a sample order to
          preview the order tracking flow.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleLoadSampleOrder}
            disabled={creatingDemo}
            className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-brand-primaryDark disabled:opacity-60"
          >
            {creatingDemo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Load Sample Order
          </button>
          <Link
            to="/restaurants"
            className="rounded-full bg-brand-black px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Browse Restaurants
          </Link>
        </div>
      </div>
    );
  }

  const stageIndex = activeOrder.stageIndex ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-brand-black sm:text-3xl">
            Order {activeOrder.id}
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Placed {formatTimestamp(activeOrder.createdAt)} ·{' '}
            {activeOrder.restaurant?.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {orders.length > 1 && (
            <select
              value={activeOrder.id}
              onChange={(e) => navigate(`/track/${e.target.value}`)}
              aria-label="Switch tracked order"
              className="rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-brand-black"
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} — {o.restaurant?.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleLoadSampleOrder}
            disabled={creatingDemo}
            className="rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2 text-xs font-semibold text-brand-black hover:bg-surface-muted"
          >
            + Sample Order
          </button>
        </div>
      </div>

      {/* ETA Highlight Banner */}
      <div className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-brand-primaryBorder bg-brand-primarySoft/60 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-primary text-white">
            <Clock className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-primaryDark">
              {stageIndex === ORDER_STAGES.length - 1
                ? 'Order Delivered'
                : 'Estimated Delivery Time'}
            </p>
            <p className="font-display text-2xl font-extrabold text-brand-black tabular-nums">
              {stageIndex === ORDER_STAGES.length - 1
                ? 'Delivered'
                : `${activeOrder.etaMinutes} minutes`}
            </p>
            <p className="text-xs text-neutral-600">
              {activeOrder.etaSource === 'live-ml'
                ? 'Forecasted by Random Forest ML model'
                : 'Restaurant baseline estimate'}
            </p>
          </div>
        </div>

        <Link
          to={`/predict/${activeOrder.id}`}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-bold text-white shadow-soft hover:bg-brand-primaryDark"
        >
          <Sparkles className="h-4 w-4" />
          View AI Delivery Prediction
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* 5-Stage Progress Tracker */}
      <div className="mt-6">
        <OrderProgressTracker
          stageIndex={stageIndex}
          autoPlay={autoPlay}
          onToggleAutoPlay={() => setAutoPlay((v) => !v)}
          onNextStage={() => updateOrderStage(activeOrder.id, stageIndex + 1)}
          onReset={() => {
            setAutoPlay(false);
            updateOrderStage(activeOrder.id, 0);
          }}
        />
      </div>

      {/* Delivery Info & Items */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
          <h2 className="font-display text-sm font-bold text-brand-black">
            Delivery Details
          </h2>
          <div className="mt-3 space-y-2.5 text-xs text-neutral-600">
            <p className="flex items-start gap-2">
              <Store className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
              <span>
                <strong className="text-brand-black">Restaurant:</strong>{' '}
                {activeOrder.restaurant?.name}
              </span>
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
              <span>
                <strong className="text-brand-black">Address:</strong>{' '}
                {activeOrder.deliveryAddress}
              </span>
            </p>
            {activeOrder.distanceKm && (
              <p>
                <strong className="text-brand-black">Route Distance:</strong>{' '}
                {activeOrder.distanceKm} km
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
          <h2 className="font-display text-sm font-bold text-brand-black">
            Ordered Items ({activeOrder.items?.length || 0})
          </h2>
          <ul className="mt-3 space-y-2 text-xs text-neutral-600">
            {(activeOrder.items || []).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  <VegBadge isVeg={item.isVeg !== false} />
                  {item.quantity}× {item.name}
                </span>
                <span className="font-semibold text-brand-black tabular-nums">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-neutral-100 pt-2.5 text-sm font-extrabold text-brand-black">
            <span>Total</span>
            <span className="tabular-nums">
              {formatPrice(activeOrder.total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

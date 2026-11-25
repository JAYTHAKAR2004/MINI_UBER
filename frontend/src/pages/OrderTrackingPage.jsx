import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Bike,
  Clock,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
} from 'lucide-react';
import { ORDER_STAGES, useOrders } from '../context/OrderContext';
import { useLocationContext } from '../context/LocationContext';
import { useToast } from '../context/ToastContext';
import { fetchRestaurantsByCity } from '../services/restaurantService';
import { FINAL_TEST_METRICS } from '../data/analyticsBaseline';
import { predictETA } from '../services/etaService';
import { formatPrice, formatTimestamp } from '../utils/formatters';
import {
  areCoordinatesValid,
  calculateHaversineKm,
} from '../utils/haversine';
import OrderProgressTracker from '../components/OrderProgressTracker';
import DeliveryTrackingMap from '../components/maps/DeliveryTrackingMap';
import VegBadge from '../components/VegBadge';

export default function OrderTrackingPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const {
    orders,
    getOrderById,
    placeOrder,
    updateOrderStage,
    updateOrderPrediction,
    recordPrediction,
  } = useOrders();
  const { activePreset } = useLocationContext();
  const { showToast } = useToast();

  const [autoPlay, setAutoPlay] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [refreshingEta, setRefreshingEta] = useState(false);

  const activeOrder = useMemo(() => {
    if (orderId) return getOrderById(orderId) || orders[0] || null;
    return orders[0] || null;
  }, [orderId, getOrderById, orders]);

  // Never auto-advance to "Delivered" (stageIndex === ORDER_STAGES.length - 1); stop at "On the way"
  useEffect(() => {
    if (!autoPlay || !activeOrder) return undefined;
    const onTheWayIndex = ORDER_STAGES.length - 2;
    if ((activeOrder.stageIndex ?? 0) >= onTheWayIndex) {
      setAutoPlay(false);
      return undefined;
    }
    const timer = setInterval(() => {
      updateOrderStage(activeOrder.id, (activeOrder.stageIndex ?? 0) + 1);
    }, 2400);
    return () => clearInterval(timer);
  }, [autoPlay, activeOrder, updateOrderStage]);

  const handleRefreshEta = async () => {
    if (!activeOrder || refreshingEta) return;
    setRefreshingEta(true);
    const rCoords = activeOrder.restaurantCoordinates;
    const dCoords = activeOrder.deliveryCoordinates;
    if (!rCoords || !dCoords || areCoordinatesValid(rCoords.lat, rCoords.lng, dCoords.lat, dCoords.lng) !== 1) {
      showToast({
        title: 'Cannot refresh ETA',
        description: 'Order is missing valid restaurant or delivery coordinates.',
        type: 'error',
      });
      setRefreshingEta(false);
      return;
    }
    const dist = calculateHaversineKm(rCoords.lat, rCoords.lng, dCoords.lat, dCoords.lng);

    const now = new Date();
    const jsDay = now.getDay();
    const pythonWeekday = jsDay === 0 ? 6 : jsDay - 1;

    try {
      const res = await predictETA({
        restaurant_id: activeOrder.restaurant?.id,
        selected_city: activeOrder.restaurant?.city,
        restaurant_lat: rCoords.lat,
        restaurant_lon: rCoords.lng,
        delivery_lat: dCoords.lat,
        delivery_lon: dCoords.lng,
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
        Type_of_order: activeOrder.items?.[0]?.orderType || 'Meal',
        Type_of_vehicle: 'motorcycle',
        Festival: 'No',
        City: activeOrder.restaurant?.modelCity || 'Metropolitian',
      });
      recordPrediction(res);
      updateOrderPrediction(activeOrder.id, res);
      showToast({
        title: `Refreshed ETA: ${res.predicted_eta_minutes} min`,
        description: 'Live forecast updated by Random Forest model.',
        type: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Unable to refresh ETA',
        description: err.message,
        type: 'error',
      });
    } finally {
      setRefreshingEta(false);
    }
  };

  const handleLoadSampleOrder = async () => {
    setCreatingDemo(true);
    try {
      const catalog = await fetchRestaurantsByCity({
        city: activePreset.shortName,
        lat: activePreset.deliveryLat,
        lng: activePreset.deliveryLon,
      });
      const sampleRest = catalog.restaurants?.[0];
      if (!sampleRest || !sampleRest.coordinates) {
        throw new Error(`No demo restaurants found in ${activePreset.shortName}.`);
      }
      const dist = calculateHaversineKm(
        sampleRest.coordinates.lat,
        sampleRest.coordinates.lng,
        activePreset.deliveryLat,
        activePreset.deliveryLon
      );

      const now = new Date();
      const jsDay = now.getDay();
      const pythonWeekday = jsDay === 0 ? 6 : jsDay - 1;

      const res = await predictETA({
        restaurant_id: sampleRest.id,
        selected_city: sampleRest.city,
        restaurant_lat: sampleRest.coordinates.lat,
        restaurant_lon: sampleRest.coordinates.lng,
        delivery_lat: activePreset.deliveryLat,
        delivery_lon: activePreset.deliveryLon,
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
      const etaMinutes = res.predicted_eta_minutes;
      const etaSource = 'live-ml';
      const telemetry = res;
      const predictionTimestamp = new Date().toISOString();

      const itemOne = sampleRest.menu[0];
      const itemTwo = sampleRest.menu[2] || sampleRest.menu[0];
      const sub = itemOne.price + itemTwo.price;
      const tax = Math.round(sub * 0.05 * 100) / 100;

      const demoOrder = placeOrder({
        restaurant: {
          id: sampleRest.id,
          name: sampleRest.name,
          city: sampleRest.city,
          address: sampleRest.address,
          coordinates: sampleRest.coordinates,
          modelCity: sampleRest.modelCity,
        },
        items: [
          {
            id: itemOne.id,
            name: itemOne.name,
            price: itemOne.price,
            isVeg: itemOne.isVeg,
            orderType: itemOne.orderType,
            quantity: 1,
          },
          {
            id: itemTwo.id,
            name: itemTwo.name,
            price: itemTwo.price,
            isVeg: itemTwo.isVeg,
            orderType: itemTwo.orderType,
            quantity: 1,
          },
        ],
        subtotal: sub,
        deliveryFee: sampleRest.deliveryFee,
        platformFee: 6,
        taxes: tax,
        discount: 0,
        total: Math.round((sub + sampleRest.deliveryFee + 6 + tax) * 100) / 100,
        deliveryAddress: activePreset.defaultAddress,
        deliveryCoordinates: {
          lat: activePreset.deliveryLat,
          lng: activePreset.deliveryLon,
        },
        restaurantCoordinates: sampleRest.coordinates,
        customerName: 'Guest Customer',
        customerPhone: '+91 98765 00000',
        paymentMethod: 'cod',
        paymentStatus: 'COD_DEMO',
        distanceKm: dist,
        etaMinutes,
        etaSource,
        predictionTelemetry: telemetry,
        predictionTimestamp,
        stageIndex: 3,
        orderStatus: ORDER_STAGES[3],
      });

      navigate(`/track/${demoOrder.id}`, { replace: true });
    } catch (err) {
      showToast({
        title: 'Unable to load sample order',
        description: err?.message || 'Ensure backend API is running and coordinates are valid.',
        type: 'error',
      });
    } finally {
      setCreatingDemo(false);
    }
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
          preview the interactive Leaflet map and 7-stage delivery tracker.
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

  const stageIndex = activeOrder.stageIndex ?? 1;
  const isDelivered = stageIndex === ORDER_STAGES.length - 1;
  const etaLow = Math.max(
    5,
    Math.round(activeOrder.etaMinutes - FINAL_TEST_METRICS.mae)
  );
  const etaHigh = Math.round(activeOrder.etaMinutes + FINAL_TEST_METRICS.mae);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-brand-black sm:text-3xl">
              Order {activeOrder.id}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-surface-soft px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700">
              <ShieldCheck className="h-3 w-3 text-brand-primary" />
              {activeOrder.paymentStatus === 'PAID_TEST'
                ? 'Razorpay Test Paid'
                : activeOrder.paymentStatus === 'COD_DEMO'
                ? 'COD (Demo)'
                : 'Demo Order'}
            </span>
          </div>
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
              {isDelivered ? 'Order Delivered' : 'Estimated Delivery Time'}
            </p>
            <p className="font-display text-2xl font-extrabold text-brand-black tabular-nums">
              {isDelivered ? 'Delivered' : `${activeOrder.etaMinutes} minutes`}
            </p>
            <p className="text-xs text-neutral-600">
              {isDelivered
                ? 'Marked delivered manually in demo tracker'
                : `Arrival window ${etaLow}–${etaHigh} min · ${
                    activeOrder.etaSource === 'live-ml'
                      ? 'Predicted by Random Forest ML'
                      : 'Restaurant baseline estimate'
                  }`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRefreshEta}
            disabled={refreshingEta}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-brand-black hover:bg-surface-soft disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshingEta ? 'animate-spin' : ''}`}
            />
            Refresh Live ETA
          </button>
          <Link
            to={`/predict/${activeOrder.id}`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white shadow-soft hover:bg-brand-primaryDark"
          >
            <Sparkles className="h-4 w-4" />
            Customize Conditions
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Interactive Leaflet Map */}
      <div className="mt-6">
        <DeliveryTrackingMap
          restaurantName={activeOrder.restaurant?.name}
          restaurantCoords={
            activeOrder.restaurantCoordinates || { lat: 12.9716, lng: 77.5946 }
          }
          deliveryCoords={
            activeOrder.deliveryCoordinates || { lat: 12.9855, lng: 77.6412 }
          }
          deliveryLabel={activeOrder.deliveryAddress}
          etaMinutes={activeOrder.etaMinutes}
          stageIndex={stageIndex}
          stageLabel={ORDER_STAGES[stageIndex]}
          showPartner={stageIndex >= 3}
          heightClass="h-80 sm:h-96"
        />
      </div>

      {/* 7-Stage Progress Tracker */}
      <div className="mt-6">
        <OrderProgressTracker
          stageIndex={stageIndex}
          autoPlay={autoPlay}
          onToggleAutoPlay={() => setAutoPlay((v) => !v)}
          onNextStage={() =>
            updateOrderStage(activeOrder.id, stageIndex + 1)
          }
          onMarkDelivered={() => {
            setAutoPlay(false);
            updateOrderStage(activeOrder.id, ORDER_STAGES.length - 1);
          }}
          onReset={() => {
            setAutoPlay(false);
            updateOrderStage(activeOrder.id, 1);
          }}
        />
      </div>

      {/* Partner Card, Delivery Info & Order Summary */}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-brand-black">
              Delivery Partner
            </h2>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              Demo Info
            </span>
          </div>
          {stageIndex < 3 ? (
            <p className="mt-3 text-xs text-neutral-500">
              Partner will be assigned once your order reaches &ldquo;Delivery partner assigned&rdquo;.
            </p>
          ) : (
            <div className="mt-3 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primarySoft text-brand-primary">
                <Bike className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-brand-black">
                  {activeOrder.partnerInfo?.name || 'Rohan Sharma (Demo Partner)'}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-600">
                  <span>{activeOrder.partnerInfo?.vehicle || 'Motorcycle'}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 font-semibold text-brand-rating">
                    {activeOrder.partnerInfo?.rating || 4.8}
                    <Star className="h-3 w-3 fill-brand-rating text-brand-rating" />
                  </span>
                </p>
                <p className="mt-1.5 text-[11px] text-neutral-400">
                  Live courier phone/chat dispatch is unavailable in demo mode.
                </p>
              </div>
            </div>
          )}
        </div>

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
            {activeOrder.deliveryInstructions && (
              <p>
                <strong className="text-brand-black">Instructions:</strong>{' '}
                {activeOrder.deliveryInstructions}
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

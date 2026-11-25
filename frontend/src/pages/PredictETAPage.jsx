import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Store,
} from 'lucide-react';
import { predictETA } from '../services/etaService';
import { ORDER_STAGES, useOrders } from '../context/OrderContext';
import { useToast } from '../context/ToastContext';
import {
  areCoordinatesValid,
  calculateHaversineKm,
  CITY_PRESETS,
} from '../utils/haversine';
import { FINAL_TEST_METRICS } from '../data/analyticsBaseline';
import { formatPrice, formatTimestamp } from '../utils/formatters';
import OrderProgressTracker from '../components/OrderProgressTracker';
import VegBadge from '../components/VegBadge';

const WEATHER_OPTIONS = [
  'Sunny',
  'Cloudy',
  'Windy',
  'Fog',
  'Sandstorms',
  'Stormy',
];
const TRAFFIC_OPTIONS = ['Low', 'Medium', 'High', 'Jam'];
const ORDER_TYPE_OPTIONS = ['Meal', 'Snack', 'Drinks', 'Buffet'];
const VEHICLE_OPTIONS = [
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'scooter', label: 'Scooter' },
  { value: 'electric_scooter', label: 'Electric Scooter' },
  { value: 'bicycle', label: 'Bicycle' },
];
const CITY_OPTIONS = [
  { value: 'Metropolitian', label: 'Metropolitan' },
  { value: 'Urban', label: 'Urban' },
  { value: 'Semi-Urban', label: 'Semi-Urban' },
];
const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function getTimeFields(isoDate) {
  const date = isoDate ? new Date(isoDate) : new Date();
  const jsDay = date.getDay();
  return {
    order_hour: date.getHours(),
    order_day: date.getDate(),
    order_month: date.getMonth() + 1,
    order_weekday: jsDay === 0 ? 6 : jsDay - 1,
    order_time_missing: 0,
  };
}

export default function PredictETAPage() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    orders,
    getOrderById,
    updateOrderStage,
    updateOrderPrediction,
    recordPrediction,
  } = useOrders();
  const { showToast } = useToast();

  const activeOrder = useMemo(() => {
    if (orderId) return getOrderById(orderId) || orders[0] || null;
    return orders[0] || null;
  }, [orderId, getOrderById, orders]);

  const [autoPlay, setAutoPlay] = useState(false);
  const [editTimeFields, setEditTimeFields] = useState(false);

  const buildInitialForm = useCallback(() => {
    const prefill = location.state?.prefill;
    const rLat =
      prefill?.restaurantLat ??
      activeOrder?.restaurantCoordinates?.lat ??
      activeOrder?.restaurant?.coordinates?.lat ??
      12.9716;
    const rLon =
      prefill?.restaurantLon ??
      activeOrder?.restaurantCoordinates?.lng ??
      activeOrder?.restaurant?.coordinates?.lng ??
      77.5946;
    const dLat = activeOrder?.deliveryCoordinates?.lat ?? 12.9855;
    const dLon = activeOrder?.deliveryCoordinates?.lng ?? 77.6412;

    return {
      restaurantLat: rLat,
      restaurantLon: rLon,
      deliveryLat: dLat,
      deliveryLon: dLon,
      Weather_conditions: 'Cloudy',
      Road_traffic_density: 'Medium',
      City: prefill?.City ?? activeOrder?.restaurant?.modelCity ?? 'Metropolitian',
      Festival: 'No',
      Delivery_person_Age: 28,
      Delivery_person_Ratings: 4.7,
      Type_of_vehicle: 'motorcycle',
      Vehicle_condition: 2,
      multiple_deliveries: 0,
      Type_of_order:
        prefill?.Type_of_order ?? activeOrder?.items?.[0]?.orderType ?? 'Meal',
      ...getTimeFields(activeOrder?.createdAt),
    };
  }, [activeOrder, location.state]);

  const [form, setForm] = useState(buildInitialForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(
    () => activeOrder?.predictionTelemetry || null
  );
  const [predictionTime, setPredictionTime] = useState(
    () => activeOrder?.predictionTimestamp || activeOrder?.createdAt || null
  );
  const [apiError, setApiError] = useState(null);

  const activeOrderId = activeOrder?.id ?? null;
  const lastInitializedKeyRef = useRef(null);

  useEffect(() => {
    const initKey = `${activeOrderId ?? 'none'}|${JSON.stringify(
      location.state?.prefill || null
    )}`;
    if (lastInitializedKeyRef.current !== initKey) {
      lastInitializedKeyRef.current = initKey;
      setForm(buildInitialForm());
      setResult(activeOrder?.predictionTelemetry || null);
      setPredictionTime(
        activeOrder?.predictionTimestamp || activeOrder?.createdAt || null
      );
      setApiError(null);
    }
  }, [activeOrderId, activeOrder, location.state, buildInitialForm]);

  useEffect(() => {
    if (!autoPlay || !activeOrder) return undefined;
    if ((activeOrder.stageIndex ?? 0) >= ORDER_STAGES.length - 2) {
      setAutoPlay(false);
      return undefined;
    }
    const timer = setInterval(() => {
      updateOrderStage(activeOrder.id, (activeOrder.stageIndex ?? 0) + 1);
    }, 2400);
    return () => clearInterval(timer);
  }, [autoPlay, activeOrder, updateOrderStage]);

  const derivedDistanceKm = calculateHaversineKm(
    form.restaurantLat,
    form.restaurantLon,
    form.deliveryLat,
    form.deliveryLon
  );
  const derivedCoordinatesValid = areCoordinatesValid(
    form.restaurantLat,
    form.restaurantLon,
    form.deliveryLat,
    form.deliveryLon
  );

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const applyCityPreset = (preset) => {
    setForm((prev) => ({
      ...prev,
      restaurantLat: preset.restaurantLat,
      restaurantLon: preset.restaurantLon,
      deliveryLat: preset.deliveryLat,
      deliveryLon: preset.deliveryLon,
      City: preset.modelCity,
    }));
  };

  const validate = () => {
    const nextErrors = {};
    const isBlank = (v) =>
      v === '' || v === null || v === undefined || String(v).trim() === '';

    if (derivedCoordinatesValid !== 1 || derivedDistanceKm === null || derivedDistanceKm < 0) {
      nextErrors.coordinates = 'Enter valid India coordinates (Lat 6–38, Lon 68–98) before predicting ETA.';
    } else if (derivedDistanceKm > 50) {
      nextErrors.coordinates = `Route distance is ${derivedDistanceKm} km (maximum 50 km within a city).`;
    }

    const age = isBlank(form.Delivery_person_Age)
      ? NaN
      : Number(form.Delivery_person_Age);
    if (!Number.isFinite(age) || age < 15 || age > 65) {
      nextErrors.Delivery_person_Age = 'Courier age must be between 15 and 65.';
    }

    const rating = isBlank(form.Delivery_person_Ratings)
      ? NaN
      : Number(form.Delivery_person_Ratings);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      nextErrors.Delivery_person_Ratings =
        'Courier rating must be between 1.0 and 5.0.';
    }

    const hour = isBlank(form.order_hour) ? NaN : Number(form.order_hour);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      nextErrors.order_hour = 'Hour must be 0–23.';
    }

    const day = isBlank(form.order_day) ? NaN : Number(form.order_day);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      nextErrors.order_day = 'Day must be an integer between 1 and 31.';
    }

    const month = isBlank(form.order_month) ? NaN : Number(form.order_month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      nextErrors.order_month = 'Month must be an integer between 1 and 12.';
    }

    const weekday = isBlank(form.order_weekday)
      ? NaN
      : Number(form.order_weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      nextErrors.order_weekday = 'Weekday must be between 0 and 6.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const executePrediction = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      if (!validate()) return;

      setLoading(true);
      setApiError(null);

      const payload = {
        restaurant_lat: Number(form.restaurantLat),
        restaurant_lon: Number(form.restaurantLon),
        delivery_lat: Number(form.deliveryLat),
        delivery_lon: Number(form.deliveryLon),
        Delivery_person_Age: Number(form.Delivery_person_Age),
        Delivery_person_Ratings: Number(form.Delivery_person_Ratings),
        Vehicle_condition: Number(form.Vehicle_condition),
        multiple_deliveries: Number(form.multiple_deliveries),
        distance_km: derivedDistanceKm,
        coordinates_valid: Math.trunc(Number(derivedCoordinatesValid)),
        order_time_missing: Math.trunc(Number(form.order_time_missing)),
        order_hour: Number(form.order_hour),
        order_day: Math.trunc(Number(form.order_day)),
        order_month: Math.trunc(Number(form.order_month)),
        order_weekday: Math.trunc(Number(form.order_weekday)),
        Weather_conditions: form.Weather_conditions,
        Road_traffic_density: form.Road_traffic_density,
        Type_of_order: form.Type_of_order,
        Type_of_vehicle: form.Type_of_vehicle,
        Festival: form.Festival,
        City: form.City,
      };

      try {
        const data = await predictETA(payload);
        setResult(data);
        setPredictionTime(new Date().toISOString());
        recordPrediction(data);
        if (activeOrder) {
          updateOrderPrediction(activeOrder.id, data);
        }
        showToast({
          title: `ETA Updated: ${data.predicted_eta_minutes} minutes`,
          description: 'Forecast generated by Random Forest ML model.',
          type: 'success',
        });
      } catch (err) {
        setApiError(
          err.message || 'Unable to fetch delivery prediction from backend.'
        );
        showToast({
          title: 'Prediction unavailable',
          description: err.message,
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    },
    [
      form,
      derivedDistanceKm,
      derivedCoordinatesValid,
      activeOrder,
      recordPrediction,
      updateOrderPrediction,
      showToast,
    ]
  );

  // Compute expected range only when we have a real Random Forest prediction (using model's verified test MAE ±3.21 min)
  const predictedVal = result?.predicted_eta_minutes ?? null;
  const rangeLow =
    predictedVal !== null
      ? Math.max(5, Math.round(predictedVal - FINAL_TEST_METRICS.mae))
      : null;
  const rangeHigh =
    predictedVal !== null
      ? Math.round(predictedVal + FINAL_TEST_METRICS.mae)
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primarySoft px-3 py-1 text-xs font-bold text-brand-primaryDark">
            <Sparkles className="h-3.5 w-3.5" />
            AI Delivery ETA Prediction
          </span>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-brand-black sm:text-3xl">
            {activeOrder
              ? `Delivery Forecast for Order ${activeOrder.id}`
              : 'Live Delivery Time Prediction'}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Estimated delivery time calculated using our trained Random Forest
            Machine Learning model.
          </p>
        </div>

        {orders.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-neutral-500">
              Order:
            </label>
            <select
              value={activeOrder?.id || ''}
              onChange={(e) => navigate(`/predict/${e.target.value}`)}
              className="rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-brand-black shadow-soft"
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} — {o.restaurant?.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Order Tracking Progress (when an order exists) */}
      {activeOrder && (
        <div className="mt-6">
          <OrderProgressTracker
            stageIndex={activeOrder.stageIndex ?? 0}
            autoPlay={autoPlay}
            onToggleAutoPlay={() => setAutoPlay((v) => !v)}
            onNextStage={() =>
              updateOrderStage(
                activeOrder.id,
                (activeOrder.stageIndex ?? 0) + 1
              )
            }
            onMarkDelivered={() => {
              setAutoPlay(false);
              updateOrderStage(activeOrder.id, ORDER_STAGES.length - 1);
            }}
            onReset={() => {
              setAutoPlay(false);
              updateOrderStage(activeOrder.id, 0);
            }}
          />
        </div>
      )}

      <div className="mt-7 grid gap-8 lg:grid-cols-12">
        {/* Left: AI ETA Prediction Card + Order Summary */}
        <div className="space-y-6 lg:col-span-5">
          {/* Prominent AI ETA Card */}
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-card sm:p-7">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                Estimated Delivery Time
              </span>
              {loading ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Predicting
                </span>
              ) : apiError ? (
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
                  Prediction Failed
                </span>
              ) : result ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Predicted Live
                </span>
              ) : (
                <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600">
                  Ready
                </span>
              )}
            </div>

            {loading ? (
              <div className="mt-5 space-y-3">
                <div className="h-14 w-44 rounded-xl skeleton-shimmer" />
                <div className="h-4 w-56 rounded skeleton-shimmer" />
                <div className="h-20 w-full rounded-2xl skeleton-shimmer" />
              </div>
            ) : apiError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  <div>
                    <p className="text-sm font-bold text-red-900">
                      Unable to reach prediction service
                    </p>
                    <p className="mt-1 text-xs text-red-700">{apiError}</p>
                    <button
                      type="button"
                      onClick={() => executePrediction()}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry Prediction
                    </button>
                  </div>
                </div>
              </div>
            ) : result ? (
              <>
                <div className="mt-4 flex items-baseline gap-2.5">
                  <span className="font-display text-5xl font-extrabold tracking-tight text-brand-black tabular-nums">
                    {result.predicted_eta_minutes}
                  </span>
                  <span className="text-xl font-bold text-brand-primary">
                    {result.unit || 'minutes'}
                  </span>
                </div>

                {rangeLow !== null && rangeHigh !== null && (
                  <p className="mt-1.5 text-sm font-semibold text-neutral-700">
                    Expected arrival window:{' '}
                    <span className="text-brand-black tabular-nums">
                      {rangeLow} – {rangeHigh} min
                    </span>{' '}
                    <span className="text-xs font-normal text-neutral-500">
                      (based on model MAE ±{FINAL_TEST_METRICS.mae} min)
                    </span>
                  </p>
                )}

                <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-surface-soft p-4 text-xs">
                  <div>
                    <dt className="text-neutral-500">Model</dt>
                    <dd className="mt-0.5 font-bold text-brand-black">
                      {result.model || 'Random Forest'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Order ID</dt>
                    <dd className="mt-0.5 font-mono font-bold text-brand-black">
                      {activeOrder?.id || `Prediction #${result.prediction_id}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Prediction Timestamp</dt>
                    <dd className="mt-0.5 font-semibold text-brand-black">
                      {formatTimestamp(predictionTime)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Derived Distance</dt>
                    <dd className="mt-0.5 font-semibold text-brand-black tabular-nums">
                      {derivedDistanceKm ?? '--'} km
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={() => executePrediction()}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-primaryBorder bg-brand-primarySoft py-3 text-sm font-bold text-brand-primaryDark transition-colors hover:bg-brand-primary hover:text-white"
                >
                  <RefreshCw className="h-4 w-4" />
                  Predict Again
                </button>
              </>
            ) : (
              <div className="mt-4 rounded-2xl bg-surface-soft p-5 text-center">
                <Clock className="mx-auto h-8 w-8 text-brand-primary" />
                <p className="mt-2.5 text-sm font-bold text-brand-black">
                  Click &ldquo;Predict Delivery Time&rdquo; to calculate live ETA
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Adjust delivery conditions on the right to see how traffic,
                  weather, and distance impact your delivery time.
                </p>
              </div>
            )}

            <p className="mt-5 border-t border-neutral-100 pt-4 text-xs leading-relaxed text-neutral-500">
              ETA is generated live by the project&apos;s trained{' '}
              <strong className="text-brand-black">Random Forest</strong>{' '}
              Machine Learning model via FastAPI using actual route and delivery
              features.
            </p>
          </div>

          {/* Order Summary Card */}
          {activeOrder ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-brand-black">
                  Order Summary
                </h2>
                <span className="font-mono text-xs font-bold text-neutral-500">
                  {activeOrder.id}
                </span>
              </div>

              <div className="mt-3 space-y-2 text-xs text-neutral-600">
                <p className="flex items-center gap-2 font-semibold text-brand-black">
                  <Store className="h-4 w-4 text-brand-primary" />
                  {activeOrder.restaurant?.name}
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                  <span>{activeOrder.deliveryAddress}</span>
                </p>
              </div>

              <ul className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100 text-xs">
                {(activeOrder.items || []).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <span className="flex items-center gap-2 text-neutral-700">
                      <VegBadge isVeg={item.isVeg !== false} />
                      {item.quantity}× {item.name}
                    </span>
                    <span className="font-semibold text-brand-black tabular-nums">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-2 flex justify-between border-t border-neutral-200 pt-3 text-sm font-extrabold text-brand-black">
                <span>Total Paid</span>
                <span className="tabular-nums">
                  {formatPrice(activeOrder.total)}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-surface-soft p-5 text-center">
              <p className="text-xs text-neutral-600">
                Want to test with a real food order?
              </p>
              <Link
                to="/restaurants"
                className="mt-2 inline-block text-xs font-bold text-brand-primary hover:underline"
              >
                Browse restaurants &amp; place an order →
              </Link>
            </div>
          )}
        </div>

        {/* Right: Delivery Conditions & Prediction Parameters */}
        <form
          onSubmit={executePrediction}
          className="space-y-6 lg:col-span-7"
        >
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-brand-primary" />
                <div>
                  <h2 className="font-display text-lg font-bold text-brand-black">
                    Delivery Conditions &amp; Prediction Parameters
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Edit supported Random Forest model parameters and click
                    &ldquo;Predict Delivery Time&rdquo;
                  </p>
                </div>
              </div>
            </div>

            {/* Route Coordinates & Read-Only Derived Distance */}
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Route Coordinates &amp; Derived Distance
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {CITY_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyCityPreset(preset)}
                      className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-brand-primarySoft hover:text-brand-primaryDark"
                    >
                      {preset.shortName}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Restaurant Latitude
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.restaurantLat}
                    onChange={(e) =>
                      updateField('restaurantLat', e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 font-mono text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Restaurant Longitude
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.restaurantLon}
                    onChange={(e) =>
                      updateField('restaurantLon', e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 font-mono text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Delivery Latitude
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.deliveryLat}
                    onChange={(e) => updateField('deliveryLat', e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 font-mono text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Delivery Longitude
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.deliveryLon}
                    onChange={(e) => updateField('deliveryLon', e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 font-mono text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {errors.coordinates && (
                <p className="mt-1.5 text-xs text-red-600">
                  {errors.coordinates}
                </p>
              )}

              {/* Read-only Derived Fields matching ETL */}
              <div className="mt-3.5 grid gap-3 rounded-xl bg-surface-soft p-3.5 sm:grid-cols-2">
                <div>
                  <span className="block text-[11px] font-semibold text-neutral-500">
                    Derived Delivery Distance (Read-only · Haversine)
                  </span>
                  <span className="mt-0.5 block font-mono text-sm font-bold text-brand-black">
                    {derivedDistanceKm ?? '--'} km
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-neutral-500">
                    Coordinate Bounds Check (Read-only)
                  </span>
                  <span className="mt-0.5 block font-mono text-sm font-bold text-brand-black">
                    {derivedCoordinatesValid === 1
                      ? '1 (Valid India bounds)'
                      : '0 (Outside bounds)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Traffic & Weather */}
            <div className="mt-6 border-t border-neutral-100 pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Traffic, Weather &amp; City Conditions
              </h3>
              <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Traffic Conditions
                  </label>
                  <select
                    value={form.Road_traffic_density}
                    onChange={(e) =>
                      updateField('Road_traffic_density', e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5 text-sm font-medium focus:border-neutral-400 focus:bg-white focus:outline-none"
                  >
                    {TRAFFIC_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Weather Conditions
                  </label>
                  <select
                    value={form.Weather_conditions}
                    onChange={(e) =>
                      updateField('Weather_conditions', e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5 text-sm font-medium focus:border-neutral-400 focus:bg-white focus:outline-none"
                  >
                    {WEATHER_OPTIONS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    City Area Type
                  </label>
                  <select
                    value={form.City}
                    onChange={(e) => updateField('City', e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5 text-sm font-medium focus:border-neutral-400 focus:bg-white focus:outline-none"
                  >
                    {CITY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Festival Day
                  </label>
                  <select
                    value={form.Festival}
                    onChange={(e) => updateField('Festival', e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5 text-sm font-medium focus:border-neutral-400 focus:bg-white focus:outline-none"
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Vehicle & Courier Conditions */}
            <div className="mt-6 border-t border-neutral-100 pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Vehicle &amp; Courier Conditions
              </h3>
              <div className="mt-3 grid gap-3.5 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Vehicle Type
                  </label>
                  <select
                    value={form.Type_of_vehicle}
                    onChange={(e) =>
                      updateField('Type_of_vehicle', e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5 text-sm font-medium focus:border-neutral-400 focus:bg-white focus:outline-none"
                  >
                    {VEHICLE_OPTIONS.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Vehicle Condition
                  </label>
                  <select
                    value={form.Vehicle_condition}
                    onChange={(e) =>
                      updateField('Vehicle_condition', Number(e.target.value))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5 text-sm font-medium focus:border-neutral-400 focus:bg-white focus:outline-none"
                  >
                    <option value={0}>0 — Poor</option>
                    <option value={1}>1 — Fair</option>
                    <option value={2}>2 — Good</option>
                    <option value={3}>3 — Excellent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Multiple Deliveries
                  </label>
                  <select
                    value={form.multiple_deliveries}
                    onChange={(e) =>
                      updateField('multiple_deliveries', Number(e.target.value))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5 text-sm font-medium focus:border-neutral-400 focus:bg-white focus:outline-none"
                  >
                    <option value={0}>0 — Direct Solo</option>
                    <option value={1}>1 — Single Batch</option>
                    <option value={2}>2 — 2 Stops</option>
                    <option value={3}>3 — 3 Stops</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Courier Age (15–65)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="65"
                    value={form.Delivery_person_Age}
                    onChange={(e) =>
                      updateField('Delivery_person_Age', e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 font-mono text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                  />
                  {errors.Delivery_person_Age && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.Delivery_person_Age}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Courier Rating (1.0–5.0)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    value={form.Delivery_person_Ratings}
                    onChange={(e) =>
                      updateField('Delivery_person_Ratings', e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 font-mono text-sm focus:border-neutral-400 focus:bg-white focus:outline-none"
                  />
                  {errors.Delivery_person_Ratings && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.Delivery_person_Ratings}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700">
                    Order Type
                  </label>
                  <select
                    value={form.Type_of_order}
                    onChange={(e) =>
                      updateField('Type_of_order', e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5 text-sm font-medium focus:border-neutral-400 focus:bg-white focus:outline-none"
                  >
                    {ORDER_TYPE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Derived Order Time Context (Read-Only by default) */}
            <div className="mt-6 border-t border-neutral-100 pt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Order Timestamp Features (Derived)
                </h3>
                <button
                  type="button"
                  onClick={() => setEditTimeFields((v) => !v)}
                  className="text-xs font-semibold text-brand-primary hover:underline"
                >
                  {editTimeFields ? 'Lock Read-Only' : 'Adjust Time'}
                </button>
              </div>

              {!editTimeFields ? (
                <div className="mt-2.5 flex flex-wrap gap-3 rounded-xl bg-surface-soft p-3 text-xs text-neutral-700">
                  <span>
                    Hour: <strong className="font-mono">{form.order_hour}:00</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Date:{' '}
                    <strong className="font-mono">
                      {form.order_day}/{form.order_month}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Day:{' '}
                    <strong>
                      {WEEKDAY_LABELS[form.order_weekday] || 'Today'}
                    </strong>
                  </span>
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600">
                      Hour (0–23)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={form.order_hour}
                      onChange={(e) =>
                        updateField('order_hour', e.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-surface-soft px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600">
                      Day (1–31)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={form.order_day}
                      onChange={(e) => updateField('order_day', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-surface-soft px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600">
                      Month (1–12)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={form.order_month}
                      onChange={(e) =>
                        updateField('order_month', e.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-surface-soft px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600">
                      Weekday
                    </label>
                    <select
                      value={form.order_weekday}
                      onChange={(e) =>
                        updateField('order_weekday', Number(e.target.value))
                      }
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-surface-soft px-2 py-1.5 text-xs"
                    >
                      {WEEKDAY_LABELS.map((label, idx) => (
                        <option key={label} value={idx}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {errors.order_hour && (
                <p className="mt-1 text-xs text-red-600">{errors.order_hour}</p>
              )}
              {errors.order_day && (
                <p className="mt-1 text-xs text-red-600">{errors.order_day}</p>
              )}
              {errors.order_month && (
                <p className="mt-1 text-xs text-red-600">{errors.order_month}</p>
              )}
              {errors.order_weekday && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.order_weekday}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary py-3.5 text-sm font-bold text-white shadow-soft transition-colors hover:bg-brand-primaryDark disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Predicting Delivery Time...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Predict Delivery Time
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  Clock,
  CreditCard,
  Home,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLocationContext } from '../context/LocationContext';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useToast } from '../context/ToastContext';
import { predictETA } from '../services/etaService';
import {
  createRazorpayOrder,
  fetchRazorpayConfig,
  loadRazorpayScript,
  persistBackendOrder,
  verifyRazorpayPayment,
} from '../services/paymentService';
import {
  areCoordinatesValid,
  calculateHaversineKm,
} from '../utils/haversine';
import { FINAL_TEST_METRICS } from '../data/analyticsBaseline';
import { formatPrice } from '../utils/formatters';
import VegBadge from '../components/VegBadge';
import LocationPickerMap from '../components/maps/LocationPickerMap';

const INSTRUCTION_CHIPS = [
  'Leave at door',
  'Avoid calling',
  'Contactless delivery',
];

const PAYMENT_OPTIONS = [
  { id: 'upi', label: 'UPI (GPay / PhonePe)', online: true },
  { id: 'card', label: 'Credit / Debit Card', online: true },
  { id: 'netbanking', label: 'Net Banking', online: true },
  { id: 'wallet', label: 'Wallets', online: true },
  { id: 'cod', label: 'Cash on Delivery (Demo)', online: false },
];

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
  const { shortName, modelCity } = useLocationContext();
  const { user, savedAddresses, addAddress } = useAuth();
  const { placeOrder, recordPrediction } = useOrders();
  const { showToast } = useToast();

  const defaultAddr =
    savedAddresses.find((a) => a.isDefault) || savedAddresses[0] || null;

  const [selectedAddressId, setSelectedAddressId] = useState(
    defaultAddr?.id || 'new'
  );
  const [showNewAddressForm, setShowNewAddressForm] = useState(!defaultAddr);

  const [newLabel, setNewLabel] = useState('Home');
  const [flatNo, setFlatNo] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [cityName, setCityName] = useState(shortName || 'Bengaluru');
  const [pincode, setPincode] = useState('');
  const [pinCoords, setPinCoords] = useState({
    lat: defaultAddr?.lat ?? 12.9855,
    lng: defaultAddr?.lng ?? 77.6412,
  });

  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [selectedChips, setSelectedChips] = useState(['Contactless delivery']);
  const [customInstruction, setCustomInstruction] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Live AI ETA state
  const [etaLoading, setEtaLoading] = useState(false);
  const [etaError, setEtaError] = useState(null);
  const [liveEtaResult, setLiveEtaResult] = useState(null);

  // Razorpay config state
  const [razorpayStatus, setRazorpayStatus] = useState({
    loading: true,
    configured: false,
    reason: '',
  });
  const [paymentError, setPaymentError] = useState(null);

  // Idempotency key per checkout session to avoid duplicate Razorpay / Demo orders
  const idempotencyKeyRef = useRef(`idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    let active = true;
    fetchRazorpayConfig().then((cfg) => {
      if (active) {
        setRazorpayStatus({
          loading: false,
          configured: cfg.configured,
          mode: cfg.mode,
          reason: cfg.reason,
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const activeAddress = useMemo(() => {
    if (showNewAddressForm || selectedAddressId === 'new') {
      return {
        label: newLabel,
        flat: flatNo.trim(),
        street: street.trim(),
        landmark: landmark.trim(),
        city: cityName.trim() || shortName || 'Bengaluru',
        pincode: pincode.trim(),
        lat: pinCoords.lat,
        lng: pinCoords.lng,
      };
    }
    return (
      savedAddresses.find((a) => a.id === selectedAddressId) || savedAddresses[0]
    );
  }, [
    showNewAddressForm,
    selectedAddressId,
    newLabel,
    flatNo,
    street,
    landmark,
    cityName,
    pincode,
    pinCoords,
    shortName,
    savedAddresses,
  ]);

  const rLat = restaurant?.coordinates?.lat ?? 12.9716;
  const rLon = restaurant?.coordinates?.lng ?? 77.5946;
  const dLat = activeAddress?.lat ?? 12.9855;
  const dLon = activeAddress?.lng ?? 77.6412;
  const computedDistance = calculateHaversineKm(rLat, rLon, dLat, dLon) ?? 4.8;
  const coordsValid = areCoordinatesValid(rLat, rLon, dLat, dLon);

  const refreshLiveEta = useCallback(async () => {
    if (!restaurant || items.length === 0) return null;
    setEtaLoading(true);
    setEtaError(null);

    const now = new Date();
    const jsDay = now.getDay();
    const pythonWeekday = jsDay === 0 ? 6 : jsDay - 1;

    try {
      const mlResult = await predictETA({
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
        City: restaurant?.modelCity || modelCity || 'Metropolitian',
      });
      setLiveEtaResult(mlResult);
      recordPrediction(mlResult);
      return mlResult;
    } catch (err) {
      setEtaError(err.message || 'Unable to compute live AI ETA.');
      return null;
    } finally {
      setEtaLoading(false);
    }
  }, [restaurant, items, computedDistance, coordsValid, modelCity, recordPrediction]);

  useEffect(() => {
    refreshLiveEta();
  }, [dLat, dLon, restaurant?.id]);

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

  const toggleChip = (chip) => {
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  const handleSaveNewAddress = () => {
    if (!flatNo.trim() || !street.trim() || !cityName.trim()) {
      setFormErrors((prev) => ({
        ...prev,
        address: 'Enter flat/house number, street, and city to save address.',
      }));
      return false;
    }
    const added = addAddress({
      label: newLabel,
      flat: flatNo.trim(),
      street: street.trim(),
      landmark: landmark.trim(),
      city: cityName.trim(),
      pincode: pincode.trim(),
      lat: pinCoords.lat,
      lng: pinCoords.lng,
      isDefault: true,
    });
    setSelectedAddressId(added.id);
    setShowNewAddressForm(false);
    setFormErrors((prev) => {
      const copy = { ...prev };
      delete copy.address;
      return copy;
    });
    showToast({
      title: `Saved ${added.label} address`,
      description: `${added.flat}, ${added.street}`,
      type: 'success',
    });
    return added;
  };

  const validate = () => {
    const errs = {};
    if (!customerName.trim()) {
      errs.customerName = 'Customer name is required.';
    }
    if (!customerPhone.trim() || customerPhone.trim().length < 7) {
      errs.customerPhone = 'Enter a valid phone number.';
    }
    if (showNewAddressForm) {
      if (!flatNo.trim() || !street.trim() || !cityName.trim()) {
        errs.address = 'Flat/house number, street, and city are required.';
      }
    } else if (!activeAddress) {
      errs.address = 'Select or add a delivery address.';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const finalizeOrder = async ({
    orderCode,
    paymentStatus,
    paymentMode,
    razorpayOrderId = null,
    razorpayPaymentId = null,
    etaResult,
  }) => {
    const formattedAddress = [
      activeAddress.flat,
      activeAddress.street,
      activeAddress.landmark,
      activeAddress.city,
      activeAddress.pincode,
    ]
      .filter(Boolean)
      .join(', ');

    const instructionsCombined = [
      ...selectedChips,
      customInstruction.trim(),
    ]
      .filter(Boolean)
      .join(' · ');

    const etaMinutes =
      etaResult?.predicted_eta_minutes ?? restaurant?.etaMinutes ?? 25;

    const order = placeOrder({
      id: orderCode,
      restaurant: restaurant || {
        name: 'Zomato Partner Kitchen',
        address: formattedAddress,
        coordinates: { lat: rLat, lng: rLon },
        modelCity: modelCity || 'Metropolitian',
      },
      items,
      subtotal,
      deliveryFee,
      platformFee,
      taxes,
      discount,
      appliedPromoCode: appliedPromo?.code || null,
      total,
      deliveryAddress: formattedAddress,
      deliveryAddressDetails: activeAddress,
      deliveryCoordinates: { lat: dLat, lng: dLon },
      restaurantCoordinates: { lat: rLat, lng: rLon },
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryInstructions: instructionsCombined,
      paymentMethod,
      paymentStatus,
      paymentMode,
      razorpayOrderId,
      razorpayPaymentId,
      idempotencyKey: idempotencyKeyRef.current,
      distanceKm: computedDistance,
      etaMinutes,
      etaSource: etaResult ? 'live-ml' : 'restaurant-estimate',
      predictionTelemetry: etaResult || null,
      predictionTimestamp: etaResult ? new Date().toISOString() : null,
      stageIndex: 1,
      orderStatus: 'Restaurant confirmed',
    });

    clearCart();
    showToast({
      title: `Order ${order.id} confirmed!`,
      description: `${order.restaurant.name} · ETA ${order.etaMinutes} min`,
      type: 'success',
    });
    navigate(`/order-confirmation/${order.id}`);
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || submitting) return;

    setSubmitting(true);
    setPaymentError(null);

    const etaResult = liveEtaResult || (await refreshLiveEta());
    const orderCode = `MU-${Math.floor(100000 + Math.random() * 900000)}`;
    const selectedMethodObj = PAYMENT_OPTIONS.find((p) => p.id === paymentMethod);
    const shouldTryRazorpay =
      selectedMethodObj?.online && razorpayStatus.configured;

    const formattedAddress = [
      activeAddress.flat,
      activeAddress.street,
      activeAddress.landmark,
      activeAddress.city,
      activeAddress.pincode,
    ]
      .filter(Boolean)
      .join(', ');

    if (shouldTryRazorpay) {
      try {
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded || !window.Razorpay) {
          throw new Error(
            'Unable to load Razorpay Checkout script. Check your internet connection or use Demo Checkout.'
          );
        }

        const rzpOrder = await createRazorpayOrder({
          order_code: orderCode,
          idempotency_key: idempotencyKeyRef.current,
          restaurant_name: restaurant?.name || 'Zomato Partner Kitchen',
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          delivery_address: formattedAddress,
          items,
          amount_inr: total,
          predicted_eta_minutes: etaResult?.predicted_eta_minutes ?? null,
          payment_method: paymentMethod,
          payment_status: 'PENDING',
        });

        const rzp = new window.Razorpay({
          key: rzpOrder.key_id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          name: 'Mini-Uber-ETA (Zomato Demo)',
          description: `Test Order ${rzpOrder.order_code}`,
          order_id: rzpOrder.razorpay_order_id,
          prefill: {
            name: customerName.trim(),
            contact: customerPhone.trim(),
            email: user?.email || 'demo@example.edu',
          },
          theme: {
            color: '#E23744',
          },
          modal: {
            ondismiss: () => {
              setSubmitting(false);
              setPaymentError(
                'Razorpay test payment was cancelled before completion. You can retry payment anytime.'
              );
            },
          },
          handler: async (response) => {
            try {
              const verification = await verifyRazorpayPayment({
                order_code: rzpOrder.order_code,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });

              if (!verification.verified) {
                throw new Error('Backend Razorpay signature verification failed.');
              }

              await finalizeOrder({
                orderCode: rzpOrder.order_code,
                paymentStatus: 'PAID_TEST',
                paymentMode: 'razorpay_test',
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                etaResult,
              });
            } catch (verifyErr) {
              setPaymentError(
                verifyErr.message || 'Payment verification failed on backend.'
              );
              setSubmitting(false);
            }
          },
        });

        rzp.on('payment.failed', (failureResp) => {
          setPaymentError(
            failureResp?.error?.description ||
              'Razorpay test transaction failed. Please retry.'
          );
          setSubmitting(false);
        });

        rzp.open();
        return;
      } catch (err) {
        setPaymentError(err.message || 'Unable to start Razorpay test checkout.');
        setSubmitting(false);
        return;
      }
    }

    // Clearly labelled Demo Checkout / COD Demo path (never claims real Razorpay processing)
    const demoPaymentStatus = paymentMethod === 'cod' ? 'COD_DEMO' : 'DEMO';
    await persistBackendOrder({
      order_code: orderCode,
      idempotency_key: idempotencyKeyRef.current,
      restaurant_name: restaurant?.name || 'Zomato Partner Kitchen',
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      delivery_address: formattedAddress,
      items,
      amount_inr: total,
      predicted_eta_minutes: etaResult?.predicted_eta_minutes ?? null,
      payment_method: paymentMethod,
      payment_status: demoPaymentStatus,
    });

    await finalizeOrder({
      orderCode,
      paymentStatus: demoPaymentStatus,
      paymentMode: 'demo',
      etaResult,
    });
    setSubmitting(false);
  };

  const etaVal = liveEtaResult?.predicted_eta_minutes ?? null;
  const arrivalLow =
    etaVal !== null ? Math.max(5, Math.round(etaVal - FINAL_TEST_METRICS.mae)) : null;
  const arrivalHigh =
    etaVal !== null ? Math.round(etaVal + FINAL_TEST_METRICS.mae) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-brand-black">
            Secure Checkout
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Confirm delivery address, instructions, live AI delivery forecast, and payment method.
          </p>
        </div>
        <span className="rounded-full border border-neutral-200 bg-surface-soft px-3.5 py-1.5 text-xs font-semibold text-neutral-600">
          {razorpayStatus.configured
            ? 'Razorpay Test Mode Ready'
            : 'Academic Demo Checkout'}
        </span>
      </div>

      <form
        onSubmit={handleCheckoutSubmit}
        className="mt-8 grid gap-8 lg:grid-cols-12"
      >
        {/* Left Column */}
        <div className="space-y-6 lg:col-span-7">
          {/* Contact Information */}
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

          {/* Delivery Address Management + Interactive Map */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <MapPin className="h-5 w-5 text-brand-primary" />
                <h2 className="font-display text-lg font-bold text-brand-black">
                  Delivery Address
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowNewAddressForm((v) => !v)}
                className="inline-flex items-center gap-1 rounded-xl border border-brand-primaryBorder bg-brand-primarySoft px-3 py-1.5 text-xs font-bold text-brand-primaryDark hover:bg-brand-primary hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                {showNewAddressForm ? 'Use Saved Address' : 'Add New Address'}
              </button>
            </div>

            {!showNewAddressForm && savedAddresses.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {savedAddresses.map((addr) => {
                  const selected = addr.id === selectedAddressId;
                  const Icon =
                    addr.label === 'Work'
                      ? Briefcase
                      : addr.label === 'Home'
                      ? Home
                      : MapPin;
                  return (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => setSelectedAddressId(addr.id)}
                      className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                        selected
                          ? 'border-brand-primary bg-brand-primarySoft/60 shadow-soft'
                          : 'border-neutral-200 bg-surface-soft hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-black">
                          <Icon className="h-3.5 w-3.5 text-brand-primary" />
                          {addr.label}
                        </span>
                        {selected && (
                          <Check className="h-4 w-4 text-brand-primary" />
                        )}
                      </div>
                      <p className="mt-2 text-xs font-medium text-neutral-700">
                        {addr.flat}, {addr.street}
                      </p>
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        {addr.city} {addr.pincode}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <LocationPickerMap
                  lat={pinCoords.lat}
                  lng={pinCoords.lng}
                  onLocationSelect={(loc) => {
                    setPinCoords({ lat: loc.lat, lng: loc.lng });
                    if (loc.street) setStreet(loc.street);
                    if (loc.city) setCityName(loc.city);
                    if (loc.pincode) setPincode(loc.pincode);
                  }}
                  heightClass="h-56"
                />

                <div className="flex flex-wrap gap-2">
                  {['Home', 'Work', 'Other'].map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setNewLabel(lbl)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                        newLabel === lbl
                          ? 'bg-brand-primary text-white'
                          : 'bg-surface-soft text-neutral-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700">
                      House / Flat No. *
                    </label>
                    <input
                      type="text"
                      value={flatNo}
                      onChange={(e) => setFlatNo(e.target.value)}
                      placeholder="Flat 4B, Maple Heights"
                      className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700">
                      Landmark (Optional)
                    </label>
                    <input
                      type="text"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="Near Metro Gate"
                      className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700">
                      Street / Area *
                    </label>
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="100 Feet Road, Indiranagar"
                      className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700">
                      City *
                    </label>
                    <input
                      type="text"
                      value={cityName}
                      onChange={(e) => setCityName(e.target.value)}
                      placeholder="Bengaluru"
                      className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700">
                      Pincode
                    </label>
                    <input
                      type="text"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="560038"
                      className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveNewAddress}
                  className="rounded-xl bg-brand-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
                >
                  Save &amp; Select This Address
                </button>
              </div>
            )}

            {formErrors.address && (
              <p className="mt-2 text-xs text-red-600">{formErrors.address}</p>
            )}

            {/* Delivery Instructions */}
            <div className="mt-5 border-t border-neutral-100 pt-4">
              <p className="text-xs font-bold text-neutral-700">
                Delivery Instructions
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {INSTRUCTION_CHIPS.map((chip) => {
                  const active = selectedChips.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => toggleChip(chip)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-brand-primary bg-brand-primarySoft text-brand-primaryDark'
                          : 'border-neutral-200 bg-surface-soft text-neutral-700'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="Any custom instructions for the delivery partner..."
                className="mt-3 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2 text-xs focus:border-neutral-400 focus:bg-white focus:outline-none"
              />
            </div>
          </section>

          {/* Payment Method & Razorpay Test Mode */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <CreditCard className="h-5 w-5 text-brand-primary" />
                <h2 className="font-display text-lg font-bold text-brand-black">
                  Payment Method
                </h2>
              </div>
              {razorpayStatus.configured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Razorpay Test Mode Active
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                  Demo Fallback Active
                </span>
              )}
            </div>

            {!razorpayStatus.loading && !razorpayStatus.configured && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold">Razorpay Test Mode Not Configured</p>
                  <p className="mt-0.5">{razorpayStatus.reason}</p>
                  <p className="mt-1 text-[11px] text-amber-800">
                    To enable real sandbox card/UPI payments, set{' '}
                    <code className="font-mono">RAZORPAY_KEY_ID</code> and{' '}
                    <code className="font-mono">RAZORPAY_KEY_SECRET</code> in your backend <code className="font-mono">.env</code> and rebuild the API containers. Until then, checkout uses an explicitly labelled <strong>Demo Checkout</strong> fallback.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {PAYMENT_OPTIONS.map((opt) => (
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

            {paymentError && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{paymentError}</span>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Live AI ETA + Order Summary */}
        <div className="space-y-5 lg:col-span-5">
          {/* Customer-Facing Live AI ETA Card */}
          <div className="rounded-2xl border border-brand-primaryBorder bg-brand-primarySoft/60 p-5 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-primaryDark">
                <Sparkles className="h-3.5 w-3.5" />
                Estimated Arrival (AI)
              </span>
              <button
                type="button"
                onClick={refreshLiveEta}
                disabled={etaLoading}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
              >
                <RefreshCw
                  className={`h-3 w-3 ${etaLoading ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>

            {etaLoading ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-neutral-600">
                <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
                Calculating delivery time for {computedDistance} km route...
              </div>
            ) : etaError ? (
              <p className="mt-2 text-xs text-red-700">
                Live AI prediction unavailable ({etaError}). Using kitchen estimate (~{restaurant?.etaMinutes || 25} min).
              </p>
            ) : etaVal !== null ? (
              <div className="mt-2">
                <p className="font-display text-3xl font-extrabold text-brand-black tabular-nums">
                  {etaVal} min
                </p>
                <p className="mt-0.5 text-xs text-neutral-600">
                  Expected arrival window: <strong>{arrivalLow}–{arrivalHigh} min</strong> · {computedDistance} km route
                </p>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-brand-black">
                <Clock className="h-4 w-4 text-brand-primary" />
                ~{restaurant?.etaMinutes || 25} min
              </p>
            )}
          </div>

          {/* Bill Summary */}
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
                  Processing...
                </>
              ) : PAYMENT_OPTIONS.find((p) => p.id === paymentMethod)?.online &&
                razorpayStatus.configured ? (
                <>
                  Pay {formatPrice(total)} (Razorpay Test Mode)
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : paymentMethod === 'cod' ? (
                <>
                  Place COD Order (Demo) · {formatPrice(total)}
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Place Order via Demo Checkout · {formatPrice(total)}
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

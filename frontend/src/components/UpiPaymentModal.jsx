import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  fetchYouPIPaymentStatus,
  getYouPIQrSvgUrl,
  submitYouPIUtr,
  subscribeYouPIPaymentStatus,
} from '../services/paymentService';
import { formatPrice } from '../utils/formatters';

const STATE_META = {
  INITIATED: {
    label: 'Initiated',
    badgeClass: 'bg-neutral-100 text-neutral-800 border-neutral-200',
    description: 'Payment session created. Waiting for YouPI-PG checkout readiness.',
  },
  QR_READY: {
    label: 'QR Ready',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    description:
      'Scan the YouPI-PG dynamic QR code in your UPI app or open the hosted checkout portal, then submit your 12-digit UTR.',
  },
  UTR_SUBMITTED: {
    label: 'UTR Submitted',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    description:
      'Your UTR reference is recorded. Order remains Pending Verification until independently reconciled against bank records.',
  },
  PENDING_VERIFICATION: {
    label: 'Pending Verification',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    description:
      'Awaiting independent bank statement reconciliation. Alerts or UTR submission alone do not finalize payment.',
  },
  RECONCILED: {
    label: 'Reconciled',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Bank reconciliation confirmed! Moving to confirmed order summary.',
  },
  FAILED: {
    label: 'Failed',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
    description: 'Payment verification failed or was declined.',
  },
  EXPIRED: {
    label: 'Expired',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
    description: 'This 5-minute UPI payment window expired before verification.',
  },
  CANCELLED: {
    label: 'Cancelled',
    badgeClass: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    description: 'Payment session was cancelled.',
  },
};

export default function UpiPaymentModal({
  isOpen,
  onClose,
  sessionData,
  onOrderPendingVerification,
  onPaymentReconciled,
}) {
  const [timeLeft, setTimeLeft] = useState(300);
  const [uiState, setUiState] = useState('QR_READY');
  const [sseState, setSseState] = useState('connecting');
  const [utrInput, setUtrInput] = useState('');
  const [recordedUtr, setRecordedUtr] = useState(null);
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [utrError, setUtrError] = useState(null);
  const [qrLoadError, setQrLoadError] = useState(false);
  const [qrVersion, setQrVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const orderCode = sessionData?.order_code;
  const amount = sessionData?.amount || 0;
  const checkoutUrl = sessionData?.checkout_url || null;
  const paymentId = sessionData?.payment_id || null;

  useEffect(() => {
    if (!isOpen) return;
    setUiState(sessionData?.ui_state || 'QR_READY');
    setTimeLeft(sessionData?.expires_in_seconds || 300);
    setUtrInput('');
    setRecordedUtr(null);
    setUtrError(null);
    setQrLoadError(false);
    setQrVersion((v) => v + 1);
  }, [isOpen, sessionData]);

  // Countdown timer for active QR session
  useEffect(() => {
    if (!isOpen || uiState !== 'QR_READY') return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setUiState('EXPIRED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, uiState]);

  // Multi-replica SSE status stream + automatic reconnect sync
  useEffect(() => {
    if (!isOpen || !orderCode) return;

    const unsubscribe = subscribeYouPIPaymentStatus(
      orderCode,
      (eventData) => {
        if (eventData?.ui_state) {
          setUiState(eventData.ui_state);
        }
        if (eventData?.utr) {
          setRecordedUtr(eventData.utr);
        }
        if (eventData?.ui_state === 'RECONCILED' && onPaymentReconciled) {
          setTimeout(() => onPaymentReconciled(eventData), 900);
        }
      },
      (connState) => {
        setSseState(connState);
        if (connState === 'connected' || connState === 'reconnecting') {
          fetchYouPIPaymentStatus(orderCode)
            .then((snap) => {
              if (snap?.ui_state) setUiState(snap.ui_state);
              if (snap?.utr) setRecordedUtr(snap.utr);
              if (snap?.ui_state === 'RECONCILED' && onPaymentReconciled) {
                onPaymentReconciled(snap);
              }
            })
            .catch(() => {});
        }
      }
    );

    return () => unsubscribe();
  }, [isOpen, orderCode, onPaymentReconciled]);

  if (!isOpen || !sessionData) return null;

  const currentMeta = STATE_META[uiState] || STATE_META.INITIATED;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const qrImgSrc = `${getYouPIQrSvgUrl(orderCode)}?v=${qrVersion}`;

  const handleUtrSubmit = async (e) => {
    e.preventDefault();
    const trimmed = utrInput.trim();
    if (!/^[A-Za-z0-9-]{6,35}$/.test(trimmed)) {
      setUtrError('Enter a valid 6–35 character UPI Reference / UTR.');
      return;
    }

    setSubmittingUtr(true);
    setUtrError(null);
    try {
      const resp = await submitYouPIUtr(orderCode, trimmed);
      setRecordedUtr(resp.utr || trimmed);
      setUiState(resp.ui_state || 'UTR_SUBMITTED');
    } catch (err) {
      setUtrError(err.message || 'Unable to submit UTR to YouPI-PG.');
    } finally {
      setSubmittingUtr(false);
    }
  };

  const handleManualRefresh = async () => {
    if (!orderCode || refreshing) return;
    setRefreshing(true);
    try {
      const snap = await fetchYouPIPaymentStatus(orderCode);
      if (snap?.ui_state) setUiState(snap.ui_state);
      if (snap?.utr) setRecordedUtr(snap.utr);
      if (snap?.ui_state === 'RECONCILED' && onPaymentReconciled) {
        onPaymentReconciled(snap);
      }
    } catch {
      // Keep existing state cleanly
    } finally {
      setRefreshing(false);
    }
  };

  const handleContinuePending = () => {
    if (onOrderPendingVerification) {
      onOrderPendingVerification({
        order_code: orderCode,
        ui_state: uiState,
        payment_status: 'PENDING_VERIFICATION',
        utr: recordedUtr,
        payment_id: paymentId,
        checkout_url: checkoutUrl,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl sm:p-7">
        <button
          type="button"
          onClick={onClose}
          disabled={uiState === 'RECONCILED'}
          className="absolute right-5 top-5 rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-primarySoft px-3 py-1 text-xs font-bold text-brand-primaryDark">
            <QrCode className="h-3.5 w-3.5" />
            YouPI-PG Manual UPI Checkout
          </div>
          <h3 className="mt-2 font-display text-2xl font-black text-brand-black">
            Complete UPI Payment
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Order <span className="font-mono font-semibold text-neutral-700">{orderCode}</span> · Session{' '}
            <span className="font-mono">{paymentId?.slice(0, 12)}…</span>
          </p>
        </div>

        {/* Status Pill & Amount */}
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-surface-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Total Payable
              </span>
              <p className="font-display text-3xl font-black text-brand-black tabular-nums">
                {formatPrice(amount)}
              </p>
            </div>
            <div className="text-right">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${currentMeta.badgeClass}`}
              >
                {currentMeta.label}
              </span>
              {uiState === 'QR_READY' && (
                <p className="mt-1.5 flex items-center justify-end gap-1 text-xs font-medium text-neutral-600">
                  <Clock className="h-3.5 w-3.5 text-brand-primary" />
                  <span className="font-mono font-bold text-brand-primaryDark tabular-nums">
                    {formattedTime}
                  </span>
                </p>
              )}
            </div>
          </div>
          <p className="mt-2.5 text-xs text-neutral-600">{currentMeta.description}</p>
        </div>

        {/* Body per Verified State */}
        {uiState === 'RECONCILED' ? (
          <div className="my-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h4 className="mt-3 font-display text-lg font-bold text-emerald-950">
              Payment Reconciled
            </h4>
            <p className="mt-1 text-xs text-emerald-800">
              Bank reconciliation verified. UTR:{' '}
              <span className="font-mono font-bold">{recordedUtr || 'Recorded'}</span>
            </p>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Confirming order...
            </p>
          </div>
        ) : uiState === 'FAILED' || uiState === 'EXPIRED' || uiState === 'CANCELLED' ? (
          <div className="my-5 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
            <h4 className="mt-2 font-display text-base font-bold text-red-950">
              Payment {currentMeta.label}
            </h4>
            <p className="mt-1 text-xs text-red-700">{currentMeta.description}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-primaryDark"
            >
              Return to Checkout & Retry
            </button>
          </div>
        ) : uiState === 'UTR_SUBMITTED' || uiState === 'PENDING_VERIFICATION' ? (
          <div className="my-5 space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <h4 className="font-display text-base font-bold text-amber-950">
                    {uiState === 'UTR_SUBMITTED'
                      ? 'UTR Submitted — Awaiting Bank Verification'
                      : 'Pending Independent Bank Reconciliation'}
                  </h4>
                  {recordedUtr && (
                    <p className="mt-1 text-xs text-amber-900">
                      Submitted UTR: <strong className="font-mono">{recordedUtr}</strong>
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-amber-800">
                    For security, orders are <strong>never</strong> marked paid based only on a customer UTR claim or SMS/email notification. Your order status will update automatically once reconciled.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-surface-soft"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Check Reconciliation Status
              </button>
              <button
                type="button"
                onClick={handleContinuePending}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-primaryDark"
              >
                View Pending Order
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="my-4 space-y-4">
            {/* Real YouPI-PG Vector SVG QR */}
            <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-4">
              {qrLoadError ? (
                <div className="py-6 text-center">
                  <ShieldAlert className="mx-auto h-9 w-9 text-amber-500" />
                  <p className="mt-2 text-xs font-bold text-neutral-800">
                    YouPI-PG QR image unavailable
                  </p>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Ensure YouPI-PG Checkout Portal is reachable on port 7000, or open the hosted checkout link below.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQrLoadError(false);
                      setQrVersion((v) => v + 1);
                    }}
                    className="mt-3 inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-surface-soft"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Reload QR from YouPI-PG
                  </button>
                </div>
              ) : (
                <img
                  src={qrImgSrc}
                  alt="YouPI-PG Dynamic UPI QR Code"
                  onError={() => setQrLoadError(true)}
                  className="h-52 w-52 rounded-xl border border-neutral-100 object-contain p-1"
                />
              )}

              {checkoutUrl && (
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-surface-soft px-4 py-2 text-xs font-bold text-brand-black hover:bg-surface-muted"
                >
                  Open Hosted YouPI-PG Checkout
                  <ExternalLink className="h-3.5 w-3.5 text-brand-primary" />
                </a>
              )}
            </div>

            {/* UTR Submission Form */}
            <form
              onSubmit={handleUtrSubmit}
              className="rounded-2xl border border-neutral-200 bg-surface-soft p-4"
            >
              <label className="block text-xs font-bold text-brand-black">
                Step 2: Enter UPI Transaction Reference (UTR) *
              </label>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                After paying in your UPI app (or hosted checkout), paste the 12-digit UTR/reference number below.
              </p>
              <div className="mt-2.5 flex gap-2">
                <input
                  type="text"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  placeholder="e.g. 432819045612"
                  maxLength={35}
                  className="flex-1 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 font-mono text-xs focus:border-brand-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submittingUtr}
                  className="rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white hover:bg-brand-primaryDark disabled:opacity-50"
                >
                  {submittingUtr ? 'Submitting...' : 'Submit UTR'}
                </button>
              </div>
              {utrError && <p className="mt-1.5 text-xs text-red-600">{utrError}</p>}
            </form>
          </div>
        )}

        {/* SSE Connection Telemetry Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            {sseState === 'connected' ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-amber-600" />
            )}
            Live status stream: <strong>{sseState}</strong>
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-neutral-400" />
            Experimental Academic Gateway
          </span>
        </div>
      </div>
    </div>
  );
}

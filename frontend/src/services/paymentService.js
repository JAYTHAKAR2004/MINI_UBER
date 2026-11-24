import apiClient from './apiClient';

/**
 * Checks whether the backend has Razorpay Test-Mode credentials configured.
 * Gracefully handles 404 (containers not rebuilt yet) or network issues.
 */
export async function fetchRazorpayConfig() {
  try {
    const response = await apiClient.get('/payments/razorpay/config');
    const configured = Boolean(response.data?.configured);
    const mode = response.data?.mode || 'test';
    return {
      available: true,
      configured,
      mode,
      isTestMode: configured && mode === 'test',
      keyId: response.data?.key_id || null,
      reason: configured
        ? null
        : 'Razorpay test credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured on the backend.',
    };
  } catch (err) {
    if (err.status === 404) {
      return {
        available: false,
        configured: false,
        mode: 'test',
        isTestMode: false,
        keyId: null,
        reason:
          'Backend Razorpay endpoints are not active in the running API containers yet (rebuild Docker API containers after adding test credentials).',
      };
    }
    return {
      available: false,
      configured: false,
      mode: 'test',
      isTestMode: false,
      keyId: null,
      reason: err.message || 'Unable to check Razorpay backend configuration.',
    };
  }
}

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve(true);
      return;
    }
    const scriptUrl = 'https://checkout.razorpay.com/v1/checkout.js';
    const existing = document.querySelector(`script[src="${scriptUrl}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener(
        'error',
        () => {
          existing.remove();
          resolve(false);
        },
        { once: true }
      );
      return;
    }
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      script.remove();
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

export async function createRazorpayOrder(orderPayload) {
  const response = await apiClient.post('/payments/razorpay/order', orderPayload);
  return response.data;
}

export async function verifyRazorpayPayment(verifyPayload) {
  const response = await apiClient.post('/payments/razorpay/verify', verifyPayload);
  return response.data;
}

/**
 * Builds Razorpay Standard Checkout options.
 * In Test Mode, hides non-scannable Test UPI QR codes and prioritizes Card,
 * Netbanking, Wallets, and UPI ID (Collect/VPA) simulation flows.
 */
export function buildRazorpayCheckoutOptions({
  rzpOrder,
  paymentMethod,
  customerName,
  customerPhone,
  customerEmail,
  testUpiVpa,
  onSuccess,
  onDismiss,
}) {
  const isTestMode =
    rzpOrder?.mode === 'test' ||
    String(rzpOrder?.key_id || '').startsWith('rzp_test_');

  const prefill = {
    name: String(customerName || '').trim(),
    contact: String(customerPhone || '').trim(),
    email: String(customerEmail || '').trim() || 'demo@example.edu',
  };

  if (paymentMethod === 'card') {
    prefill.method = 'card';
  } else if (paymentMethod === 'netbanking') {
    prefill.method = 'netbanking';
  } else if (paymentMethod === 'wallet') {
    prefill.method = 'wallet';
  } else if (paymentMethod === 'razorpay_upi') {
    prefill.method = 'upi';
    if (isTestMode && String(testUpiVpa || '').trim()) {
      prefill.vpa = String(testUpiVpa).trim();
    }
  }

  const logoUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/zomato-logo.png`
      : '/zomato-logo.png';

  const options = {
    key: rzpOrder.key_id,
    amount: rzpOrder.amount,
    currency: rzpOrder.currency,
    name: 'Zomato',
    description: 'Zomato AI Food Delivery',
    image: logoUrl,
    order_id: rzpOrder.razorpay_order_id,
    prefill,
    method: {
      card: true,
      netbanking: true,
      wallet: true,
      upi: true,
    },
    theme: {
      color: '#E23744',
    },
    modal: {
      ondismiss: onDismiss,
    },
    handler: onSuccess,
  };

  if (isTestMode) {
    options.config = {
      display: {
        blocks: {
          test_standard: {
            name: 'Card, Netbanking & Wallets (Test Mode)',
            instruments: [
              { method: 'card' },
              { method: 'netbanking' },
              { method: 'wallet' },
              { method: 'paylater' },
            ],
          },
          test_upi_collect: {
            name: 'UPI ID / VPA (Test Mode)',
            instruments: [{ method: 'upi', flows: ['collect'] }],
          },
        },
        hide: [{ method: 'upi', flows: ['qr'] }],
        sequence:
          paymentMethod === 'razorpay_upi'
            ? ['block.test_upi_collect', 'block.test_standard']
            : ['block.test_standard', 'block.test_upi_collect'],
        preferences: {
          show_default_blocks: false,
        },
      },
    };
  }

  return options;
}

export async function persistBackendOrder(orderPayload) {
  try {
    const response = await apiClient.post('/orders', orderPayload);
    return { persisted: true, data: response.data };
  } catch (err) {
    return {
      persisted: false,
      data: null,
      error: err?.message || 'Unable to persist order on backend.',
    };
  }
}

function resolveApiPrefix() {
  return import.meta.env.VITE_USE_PROXY !== 'false'
    ? '/api'
    : import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
}

/**
 * YouPI-PG Self-Hosted UPI Gateway Services (MANUAL_UPI default; fail-closed)
 */
export async function fetchYouPIConfig() {
  try {
    const response = await apiClient.get('/payments/youpi/config');
    return {
      available: true,
      configured: Boolean(response.data?.configured),
      sessionConfigured: Boolean(response.data?.session_configured),
      webhookConfigured: Boolean(response.data?.webhook_configured),
      method: response.data?.method || 'MANUAL_UPI',
      requiresManualReconciliation:
        response.data?.requires_manual_reconciliation !== false,
      notice: response.data?.notice || '',
    };
  } catch (err) {
    return {
      available: false,
      configured: false,
      sessionConfigured: false,
      webhookConfigured: false,
      method: 'MANUAL_UPI',
      requiresManualReconciliation: true,
      notice:
        err.status === 404
          ? 'Backend YouPI-PG endpoints are not active in the running API containers yet.'
          : err.message || 'Unable to reach YouPI-PG backend configuration.',
    };
  }
}

export async function createYouPIOrder(payload) {
  const response = await apiClient.post('/payments/youpi/order', payload);
  return response.data;
}

export function getYouPIQrSvgUrl(orderCode) {
  return `${resolveApiPrefix()}/payments/youpi/qr/${encodeURIComponent(
    orderCode
  )}.svg`;
}

export async function submitYouPIUtr(orderCode, utr) {
  const response = await apiClient.post('/payments/youpi/utr', {
    order_code: orderCode,
    utr: String(utr || '').trim(),
  });
  return response.data;
}

export async function fetchYouPIPaymentStatus(orderCode) {
  const response = await apiClient.get(
    `/payments/youpi/status/${encodeURIComponent(orderCode)}`
  );
  return response.data;
}

export function subscribeYouPIPaymentStatus(
  orderCode,
  onStatusUpdate,
  onConnectionChange
) {
  const streamUrl = `${resolveApiPrefix()}/payments/youpi/status/${encodeURIComponent(
    orderCode
  )}/stream`;

  const eventSource = new EventSource(streamUrl);

  eventSource.onopen = () => {
    if (onConnectionChange) onConnectionChange('connected');
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (onStatusUpdate) {
        onStatusUpdate(data);
      }
    } catch (parseErr) {
      console.warn('[YouPI SSE] Parse error:', parseErr);
    }
  };

  eventSource.onerror = () => {
    if (onConnectionChange) onConnectionChange('reconnecting');
  };

  return () => {
    eventSource.close();
  };
}



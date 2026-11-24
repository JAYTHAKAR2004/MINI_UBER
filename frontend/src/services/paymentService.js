import apiClient from './apiClient';

/**
 * Checks whether the backend has Razorpay Test-Mode credentials configured.
 * Gracefully handles 404 (containers not rebuilt yet) or network issues.
 */
export async function fetchRazorpayConfig() {
  try {
    const response = await apiClient.get('/payments/razorpay/config');
    return {
      available: true,
      configured: Boolean(response.data?.configured),
      mode: response.data?.mode || 'test',
      keyId: response.data?.key_id || null,
      reason: response.data?.configured
        ? null
        : 'Razorpay test credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured on the backend.',
    };
  } catch (err) {
    if (err.status === 404) {
      return {
        available: false,
        configured: false,
        mode: 'test',
        keyId: null,
        reason:
          'Backend Razorpay endpoints are not active in the running API containers yet (rebuild Docker API containers after adding test credentials).',
      };
    }
    return {
      available: false,
      configured: false,
      mode: 'test',
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
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
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

export async function persistBackendOrder(orderPayload) {
  try {
    const response = await apiClient.post('/orders', orderPayload);
    return { persisted: true, data: response.data };
  } catch {
    return { persisted: false, data: null };
  }
}


import axios from 'axios';

export const RAW_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const useProxy = import.meta.env.VITE_USE_PROXY !== 'false';
export const RESOLVED_BASE_URL = useProxy ? '/api' : RAW_API_BASE_URL;

const apiClient = axios.create({
  baseURL: RESOLVED_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    config.metadata = { startTime: performance.now() };
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => {
    const startTime = response.config?.metadata?.startTime;
    if (startTime) {
      response.clientLatencyMs = Math.round(performance.now() - startTime);
    }
    return response;
  },
  (error) => {
    const status = error.response?.status ?? null;
    const rawDetail = error.response?.data?.detail;
    let message = 'Unable to reach Zomato ML backend.';

    if (error.code === 'ECONNABORTED') {
      message = 'Request timed out after 15s waiting for backend response.';
    } else if (typeof rawDetail === 'string') {
      message = rawDetail;
    } else if (Array.isArray(rawDetail) && rawDetail.length > 0) {
      message = rawDetail
        .map((item) => `${item.loc?.slice(-1)[0] || 'field'}: ${item.msg}`)
        .join('; ');
    } else if (status === 502 || status === 503 || status === 504) {
      message = `Backend gateway returned HTTP ${status}. FastAPI replicas behind Nginx (${RAW_API_BASE_URL}) may still be starting up or unavailable.`;
    } else if (status === 500) {
      message = `Proxy returned HTTP 500 without a FastAPI error body. Check that Nginx/FastAPI is reachable at ${RAW_API_BASE_URL}.`;
    } else if (error.message && status) {
      message = `Backend returned HTTP ${status}: ${error.message}`;
    } else if (error.message) {
      message = `${error.message} (Check if FastAPI / Nginx is running at ${RAW_API_BASE_URL})`;
    }

    return Promise.reject({
      message,
      status,
      code: error.code || 'API_ERROR',
      isNetworkError: !error.response,
      detail: rawDetail ?? null,
    });
  }
);

export default apiClient;


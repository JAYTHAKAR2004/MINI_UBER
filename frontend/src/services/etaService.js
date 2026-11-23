import apiClient from './apiClient';

/**
 * GET / — Root service metadata & instance info.
 */
export async function fetchRootInfo() {
  const response = await apiClient.get('/');
  return {
    ...response.data,
    clientLatencyMs: response.clientLatencyMs ?? null,
  };
}

/**
 * GET /health — FastAPI health, model status, active instance & Redis circuit state.
 */
export async function fetchHealth() {
  const response = await apiClient.get('/health', {
    params: { _t: Date.now() },
  });
  return {
    ...response.data,
    clientLatencyMs: response.clientLatencyMs ?? null,
  };
}

const INTEGER_FIELDS = new Set([
  'coordinates_valid',
  'order_time_missing',
  'order_day',
  'order_month',
  'order_weekday',
]);

/**
 * POST /predict — Run live Random Forest ETA prediction against FastAPI + Redis + Postgres + Kafka.
 * Strips null/undefined/empty/non-finite values, coerces integer schema fields, and validates response shape.
 */
export async function predictETA(payload) {
  const sanitized = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return;
    }
    if (INTEGER_FIELDS.has(key)) {
      const coerced = Math.trunc(Number(value));
      if (!Number.isFinite(coerced)) {
        return;
      }
      sanitized[key] = coerced;
      return;
    }
    sanitized[key] = value;
  });

  const response = await apiClient.post('/predict', sanitized);
  const data = response.data;
  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.predicted_eta_minutes !== 'number' ||
    !Number.isFinite(data.predicted_eta_minutes)
  ) {
    throw {
      message: 'Unexpected response format from /predict endpoint.',
      status: response.status,
      code: 'INVALID_RESPONSE',
      isNetworkError: false,
      detail: null,
    };
  }

  return {
    ...data,
    clientLatencyMs: response.clientLatencyMs ?? null,
    sentPayload: sanitized,
  };
}

/**
 * POST /graphql — Query Strawberry GraphQL endpoint.
 */
export async function fetchGraphQLHealth() {
  const response = await apiClient.post('/graphql', {
    query: 'query { hello projectInfo health }',
  });

  if (response.data?.errors?.length) {
    throw {
      message: response.data.errors[0].message || 'GraphQL query returned errors.',
      status: response.status,
      isNetworkError: false,
    };
  }

  return {
    data: response.data?.data ?? null,
    clientLatencyMs: response.clientLatencyMs ?? null,
  };
}

/**
 * Fires sequential GET /health calls to observe Nginx round-robin distribution across api1/api2/api3.
 */
export async function probeLoadBalancer(count = 6) {
  const probes = [];
  for (let i = 1; i <= count; i += 1) {
    const res = await fetchHealth();
    probes.push({
      requestNumber: i,
      instance: res.instance,
      status: res.status,
      redisCircuit: res.redis_circuit,
      latencyMs: res.clientLatencyMs,
    });
  }
  return probes;
}


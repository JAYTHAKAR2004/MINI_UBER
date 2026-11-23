import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ORDERS_KEY = 'mini_uber_orders_v1';
const PREDICTIONS_KEY = 'mini_uber_predictions_v1';

export const ORDER_STAGES = [
  'Order confirmed',
  'Restaurant preparing food',
  'Pickup',
  'Out for delivery',
  'Delivered',
];

const OrderContext = createContext(null);

export function OrderProvider({ children }) {
  const [orders, setOrders] = useState(() => {
    try {
      const raw = localStorage.getItem(ORDERS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const [predictionHistory, setPredictionHistory] = useState(() => {
    try {
      const raw = localStorage.getItem(PREDICTIONS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore storage errors
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    } catch {
      // ignore storage errors
    }
  }, [orders]);

  useEffect(() => {
    try {
      localStorage.setItem(PREDICTIONS_KEY, JSON.stringify(predictionHistory));
    } catch {
      // ignore storage errors
    }
  }, [predictionHistory]);

  const recordPrediction = useCallback((result) => {
    if (!result || result.predicted_eta_minutes === undefined) return;
    const entry = {
      prediction_id: result.prediction_id ?? null,
      predicted_eta_minutes: result.predicted_eta_minutes,
      model: result.model || 'Random Forest',
      storage: result.storage || null,
      cache: result.cache || null,
      kafka: result.kafka || null,
      processing_time_seconds: result.processing_time_seconds ?? null,
      input_features: result.sentPayload || null,
      timestamp: new Date().toISOString(),
    };
    setPredictionHistory((prev) => [entry, ...prev].slice(0, 30));
  }, []);

  const placeOrder = useCallback((orderPayload) => {
    const id = `MU-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrder = {
      id,
      createdAt: new Date().toISOString(),
      stageIndex: 0,
      ...orderPayload,
    };
    setOrders((prev) => [newOrder, ...prev].slice(0, 20));
    return newOrder;
  }, []);

  const updateOrderStage = useCallback((orderId, stageIndex) => {
    const clamped = Math.max(0, Math.min(ORDER_STAGES.length - 1, stageIndex));
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, stageIndex: clamped } : o))
    );
  }, []);

  const updateOrderPrediction = useCallback((orderId, predictionResult) => {
    if (!orderId || !predictionResult) return;
    const timestamp = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              etaMinutes: predictionResult.predicted_eta_minutes,
              etaSource: 'live-ml',
              predictionTelemetry: predictionResult,
              predictionTimestamp: timestamp,
            }
          : o
      )
    );
  }, []);

  const getOrderById = useCallback(
    (orderId) => orders.find((o) => o.id === orderId) || null,
    [orders]
  );

  const lastPredictionTelemetry = predictionHistory[0] || null;

  return (
    <OrderContext.Provider
      value={{
        orders,
        predictionHistory,
        lastPredictionTelemetry,
        recordPrediction,
        placeOrder,
        updateOrderStage,
        updateOrderPrediction,
        getOrderById,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) {
    throw new Error('useOrders must be used inside OrderProvider');
  }
  return ctx;
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, RefreshCw, Sparkles } from 'lucide-react';
import { useBackendHealth } from '../hooks/useBackendHealth';
import { useOrders } from '../context/OrderContext';
import {
  DATASET_ETA_DISTRIBUTION,
  FINAL_TEST_METRICS,
  MODEL_COMPARISON,
  SAMPLE_ORDER_STATUS_DISTRIBUTION,
} from '../data/analyticsBaseline';
import { formatTimestamp } from '../utils/formatters';
import DataSourceBadge from '../components/DataSourceBadge';
import { MetricSkeletonCard } from '../components/SkeletonCard';

export default function AnalyticsPage() {
  const { health, healthError, loading, refresh } = useBackendHealth();
  const { orders, predictionHistory } = useOrders();
  const [distView, setDistView] = useState('dataset');

  const liveAvgEta = useMemo(() => {
    if (predictionHistory.length === 0) return null;
    const sum = predictionHistory.reduce(
      (acc, p) => acc + Number(p.predicted_eta_minutes || 0),
      0
    );
    return (sum / predictionHistory.length).toFixed(2);
  }, [predictionHistory]);

  const liveEtaBuckets = useMemo(() => {
    const buckets = [
      { bucket: '0–15 min', count: 0 },
      { bucket: '15–25 min', count: 0 },
      { bucket: '25–35 min', count: 0 },
      { bucket: '35–45 min', count: 0 },
      { bucket: '45–60 min', count: 0 },
    ];
    predictionHistory.forEach((p) => {
      const v = Number(p.predicted_eta_minutes);
      if (v <= 15) buckets[0].count += 1;
      else if (v <= 25) buckets[1].count += 1;
      else if (v <= 35) buckets[2].count += 1;
      else if (v <= 45) buckets[3].count += 1;
      else buckets[4].count += 1;
    });
    return buckets;
  }, [predictionHistory]);

  const activeDistribution =
    distView === 'live' ? liveEtaBuckets : DATASET_ETA_DISTRIBUTION;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-brand-black">
            ML &amp; Delivery Analytics
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Real model evaluation metrics from{' '}
            <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-xs">
              reports/
            </code>
            , live FastAPI health, session predictions, and clearly labelled
            sample order breakdowns.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-brand-black shadow-soft hover:bg-surface-soft"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh API Status
        </button>
      </div>

      {/* Live API Status Strip */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-brand-black px-5 py-4 text-white">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold">
            <Activity className="h-4 w-4 text-brand-primary" />
            API Status:{' '}
            {loading ? (
              <span className="text-neutral-400">Checking...</span>
            ) : health ? (
              <span className="text-emerald-400 uppercase">{health.status}</span>
            ) : (
              <span className="text-red-400">UNAVAILABLE</span>
            )}
          </span>
          <span className="text-neutral-600">|</span>
          <span className="text-xs text-neutral-300">
            Active Instance:{' '}
            <code className="font-mono text-white">
              {health?.instance || '—'}
            </code>
          </span>
          <span className="text-neutral-600">|</span>
          <span className="text-xs text-neutral-300">
            Redis Circuit:{' '}
            <code className="font-mono text-brand-primary">
              {health?.redis_circuit || '—'}
            </code>
          </span>
        </div>

        {healthError && (
          <span className="text-xs text-amber-300">{healthError}</span>
        )}
      </div>

      {/* KPI Grid */}
      {loading && !health ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricSkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-500">
                Training Dataset Orders
              </span>
              <DataSourceBadge variant="report" label="Dataset" />
            </div>
            <p className="mt-3 font-display text-3xl font-extrabold text-brand-black tabular-nums">
              {FINAL_TEST_METRICS.datasetRows.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              +{predictionHistory.length} live API calls · {orders.length} demo
              orders
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-500">
                Average Predicted ETA
              </span>
              <DataSourceBadge
                variant={liveAvgEta ? 'live' : 'report'}
                label={liveAvgEta ? 'Live Session' : 'Baseline'}
              />
            </div>
            <p className="mt-3 font-display text-3xl font-extrabold text-brand-black tabular-nums">
              {liveAvgEta ?? FINAL_TEST_METRICS.meanActualEta} min
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {liveAvgEta
                ? `Across ${predictionHistory.length} live POST /predict calls`
                : 'Run AI Predictor to measure live session average'}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-500">
                Avg Actual Delivery Time
              </span>
              <DataSourceBadge variant="report" label="Train Set" />
            </div>
            <p className="mt-3 font-display text-3xl font-extrabold text-brand-black tabular-nums">
              {FINAL_TEST_METRICS.meanActualEta} min
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Measured in train_processed.parquet (10–54 min range)
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-500">
                Prediction Error (Test MAE)
              </span>
              <DataSourceBadge variant="report" label="Test CSV" />
            </div>
            <p className="mt-3 font-display text-3xl font-extrabold text-brand-primaryDark tabular-nums">
              {FINAL_TEST_METRICS.mae} min
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              RMSE {FINAL_TEST_METRICS.rmse} min · R² {FINAL_TEST_METRICS.r2}
            </p>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        {/* ETA Distribution */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-brand-black">
                ETA Distribution
              </h2>
              <p className="text-xs text-neutral-500">
                {distView === 'dataset'
                  ? 'Actual delivery duration buckets across 36,467 processed orders'
                  : `Live predictions triggered in this session (${predictionHistory.length})`}
              </p>
            </div>

            <div className="inline-flex rounded-full bg-surface-soft p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDistView('dataset')}
                className={`rounded-full px-3 py-1 ${
                  distView === 'dataset'
                    ? 'bg-brand-black text-white'
                    : 'text-neutral-600'
                }`}
              >
                Dataset (36k)
              </button>
              <button
                type="button"
                onClick={() => setDistView('live')}
                className={`rounded-full px-3 py-1 ${
                  distView === 'live'
                    ? 'bg-brand-black text-white'
                    : 'text-neutral-600'
                }`}
              >
                Live Session ({predictionHistory.length})
              </button>
            </div>
          </div>

          <div className="mt-5 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activeDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 12, fill: '#52525B' }}
                />
                <YAxis tick={{ fontSize: 12, fill: '#52525B' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    borderColor: '#E5E7EB',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" fill="#E23744" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status Distribution (Sample) */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft lg:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-brand-black">
                Order Status Breakdown
              </h2>
              <p className="text-xs text-neutral-500">
                No order-metrics backend exists — sample operational snapshot
              </p>
            </div>
            <DataSourceBadge variant="demo" label="Sample Analytics" />
          </div>

          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={SAMPLE_ORDER_STATUS_DISTRIBUTION}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={3}
                >
                  {SAMPLE_ORDER_STATUS_DISTRIBUTION.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    borderColor: '#E5E7EB',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Model Validation Comparison */}
      <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-brand-black">
              Validation Model Benchmark (MAE &amp; RMSE in minutes)
            </h2>
            <p className="text-xs text-neutral-500">
              Exact metrics from reports/validation_model_comparison.csv —
              Random Forest achieved the lowest error and was selected for
              production.
            </p>
          </div>
          <DataSourceBadge variant="report" label="Offline ML Benchmark" />
        </div>

        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={MODEL_COMPARISON}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="model" tick={{ fontSize: 12, fill: '#1C1C1C' }} />
              <YAxis tick={{ fontSize: 12, fill: '#52525B' }} unit="m" />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  borderColor: '#E5E7EB',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar
                dataKey="mae"
                name="MAE (min)"
                fill="#E23744"
                radius={[8, 8, 0, 0]}
              />
              <Bar
                dataKey="rmse"
                name="RMSE (min)"
                fill="#1C1C1C"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Live Predictions Log */}
      <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-brand-black">
              Live Session Predictions Log
            </h2>
            <p className="text-xs text-neutral-500">
              Calls made to POST /predict from this frontend session
            </p>
          </div>
          <Link
            to="/predict"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primaryDark"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Run New Prediction
          </Link>
        </div>

        {predictionHistory.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-surface-soft p-5 text-center text-sm text-neutral-500">
            No live predictions recorded in this session yet. Run the AI ETA
            Predictor to populate live telemetry.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 text-neutral-500">
                <tr>
                  <th className="py-2.5 pr-4 font-semibold">Prediction ID</th>
                  <th className="py-2.5 pr-4 font-semibold">ETA</th>
                  <th className="py-2.5 pr-4 font-semibold">Cache</th>
                  <th className="py-2.5 pr-4 font-semibold">Kafka</th>
                  <th className="py-2.5 pr-4 font-semibold">Server Time</th>
                  <th className="py-2.5 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {predictionHistory.slice(0, 10).map((item, idx) => (
                  <tr key={`${item.prediction_id}-${idx}`}>
                    <td className="py-2.5 pr-4 font-mono font-bold">
                      #{item.prediction_id}
                    </td>
                    <td className="py-2.5 pr-4 font-bold text-brand-primaryDark tabular-nums">
                      {item.predicted_eta_minutes} min
                    </td>
                    <td className="py-2.5 pr-4 font-mono">
                      {item.cache?.status || '—'}
                    </td>
                    <td className="py-2.5 pr-4 font-mono">
                      {item.kafka?.status || '—'}
                    </td>
                    <td className="py-2.5 pr-4 font-mono">
                      {item.processing_time_seconds}s
                    </td>
                    <td className="py-2.5 text-neutral-500">
                      {formatTimestamp(item.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


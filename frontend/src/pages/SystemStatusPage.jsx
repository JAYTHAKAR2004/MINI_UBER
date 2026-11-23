import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  GitBranch,
  Loader2,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useBackendHealth } from '../hooks/useBackendHealth';
import { useOrders } from '../context/OrderContext';
import { probeLoadBalancer } from '../services/etaService';
import { RAW_API_BASE_URL, RESOLVED_BASE_URL } from '../services/apiClient';
import { formatTimestamp } from '../utils/formatters';
import DataSourceBadge from '../components/DataSourceBadge';

function StatusPill({ status }) {
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Connected
      </span>
    );
  }
  if (status === 'unverified') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        Not Exposed by /health
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
      <XCircle className="h-3.5 w-3.5 text-red-500" />
      Unavailable
    </span>
  );
}

export default function SystemStatusPage() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const {
    loading,
    health,
    healthError,
    rootInfo,
    graphql,
    graphqlError,
    lastChecked,
    refresh,
  } = useBackendHealth({ autoPollMs: autoRefresh ? 30000 : 0 });

  const { lastPredictionTelemetry } = useOrders();

  const [lbProbes, setLbProbes] = useState([]);
  const [probingLb, setProbingLb] = useState(false);
  const [lbError, setLbError] = useState(null);

  const handleProbeLb = async () => {
    setProbingLb(true);
    setLbError(null);
    try {
      const results = await probeLoadBalancer(6);
      setLbProbes(results);
    } catch (err) {
      setLbError(err.message || 'Load balancer probe failed');
    } finally {
      setProbingLb(false);
    }
  };

  const distinctInstances = [...new Set(lbProbes.map((p) => p.instance))];

  const postgresVerified = lastPredictionTelemetry?.storage === 'PostgreSQL';
  const kafkaStatus = lastPredictionTelemetry?.kafka?.status || null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-3xl font-extrabold text-brand-black">
              System &amp; Infrastructure Monitoring
            </h1>
            <DataSourceBadge variant="live" label="Live Probe Telemetry" />
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            Configured Target:{' '}
            <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-xs">
              {RAW_API_BASE_URL}
            </code>{' '}
            (Client base:{' '}
            <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-xs">
              {RESOLVED_BASE_URL}
            </code>
            ) · Last checked: {formatTimestamp(lastChecked)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-brand-primary"
            />
            Auto-poll (30s)
          </label>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-black px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh All
          </button>
        </div>
      </div>

      {/* 6 Infrastructure Status Cards */}
      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {/* 1. FastAPI Backend */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-base font-bold text-brand-black">
              <Server className="h-5 w-5 text-brand-primary" />
              FastAPI &amp; ML Model
            </span>
            <StatusPill status={health ? 'online' : 'offline'} />
          </div>
          {health ? (
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Status</dt>
                <dd className="font-mono font-semibold text-emerald-700 uppercase">
                  {health.status}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Model Loaded</dt>
                <dd className="font-mono font-semibold">
                  {String(health.model_loaded)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">API Version</dt>
                <dd className="font-mono">{rootInfo?.version || '1.3.0'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Latency</dt>
                <dd className="font-mono">{health.clientLatencyMs ?? '—'} ms</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-xs text-red-600">
              {healthError || 'Unable to reach /health endpoint.'}
            </p>
          )}
        </div>

        {/* 2. Nginx & Active Instance */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-base font-bold text-brand-black">
              <Activity className="h-5 w-5 text-brand-primary" />
              Nginx Load Balancer
            </span>
            <StatusPill status={health?.instance ? 'online' : 'offline'} />
          </div>

          <div className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500">Active Instance</span>
              <code className="rounded bg-surface-soft px-2 py-0.5 font-mono font-bold text-brand-black">
                {health?.instance || 'Unavailable'}
              </code>
            </div>
            <p className="text-neutral-500">
              Round-robin upstream across api1, api2, api3.
            </p>
            <button
              type="button"
              onClick={handleProbeLb}
              disabled={probingLb}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3.5 py-2 text-xs font-semibold text-brand-black hover:bg-surface-muted disabled:opacity-60"
            >
              {probingLb ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Probe Round-Robin (6x)
            </button>

            {lbError && <p className="text-red-600">{lbError}</p>}

            {lbProbes.length > 0 && (
              <div className="mt-2 rounded-xl bg-surface-soft p-2.5">
                <p className="font-semibold text-brand-black">
                  Observed {distinctInstances.length} instance(s):{' '}
                  <span className="font-mono text-brand-primaryDark">
                    {distinctInstances.join(', ')}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 3. Redis Cache & Circuit Breaker */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-base font-bold text-brand-black">
              <Cpu className="h-5 w-5 text-brand-primary" />
              Redis &amp; Circuit Breaker
            </span>
            <StatusPill status={health?.redis_circuit ? 'online' : 'offline'} />
          </div>

          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Circuit State (/health)</dt>
              <dd className="font-mono font-bold text-brand-primaryDark">
                {health?.redis_circuit || 'Unavailable'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Last /predict Cache</dt>
              <dd className="font-mono">
                {lastPredictionTelemetry?.cache?.status || 'Not probed yet'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Configured TTL</dt>
              <dd className="font-mono">300 seconds</dd>
            </div>
          </dl>
        </div>

        {/* 4. GraphQL Endpoint */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-base font-bold text-brand-black">
              <GitBranch className="h-5 w-5 text-brand-primary" />
              Strawberry GraphQL
            </span>
            <StatusPill status={graphql?.data ? 'online' : 'offline'} />
          </div>

          {graphql?.data ? (
            <div className="mt-4 space-y-2 text-xs">
              <p className="text-neutral-600">
                <strong className="text-brand-black">health:</strong>{' '}
                {graphql.data.health}
              </p>
              <p className="text-neutral-600">
                <strong className="text-brand-black">projectInfo:</strong>{' '}
                {graphql.data.projectInfo}
              </p>
              <p className="font-mono text-[11px] text-neutral-400">
                Latency: {graphql.clientLatencyMs} ms
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-red-600">
              {graphqlError || 'GraphQL endpoint /graphql unavailable.'}
            </p>
          )}
        </div>

        {/* 5. PostgreSQL */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-base font-bold text-brand-black">
              <Database className="h-5 w-5 text-brand-primary" />
              PostgreSQL Database
            </span>
            <StatusPill
              status={postgresVerified ? 'online' : 'unverified'}
            />
          </div>

          <div className="mt-4 space-y-2 text-xs text-neutral-600">
            {postgresVerified ? (
              <>
                <p className="font-semibold text-emerald-800">
                  Verified via POST /predict (Prediction #
                  {lastPredictionTelemetry.prediction_id})
                </p>
                <p>Table: eta_predictions persisted successfully.</p>
              </>
            ) : (
              <>
                <p>
                  <code>/health</code> does not expose a PostgreSQL probe.
                </p>
                <Link
                  to="/predict"
                  className="inline-block font-semibold text-brand-black underline decoration-brand-primary underline-offset-4 hover:text-brand-primary"
                >
                  Run POST /predict to verify PostgreSQL write
                </Link>
              </>
            )}
          </div>
        </div>

        {/* 6. Kafka / Redpanda */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-base font-bold text-brand-black">
              <Radio className="h-5 w-5 text-brand-primary" />
              Redpanda / Kafka
            </span>
            <StatusPill
              status={
                kafkaStatus === 'PUBLISHED'
                  ? 'online'
                  : kafkaStatus === 'FAILED'
                  ? 'offline'
                  : 'unverified'
              }
            />
          </div>

          <div className="mt-4 space-y-2 text-xs text-neutral-600">
            {kafkaStatus ? (
              <>
                <p>
                  Last publish status:{' '}
                  <strong className="font-mono text-brand-black">
                    {kafkaStatus}
                  </strong>
                </p>
                <p>
                  Topic:{' '}
                  <code className="font-mono">
                    {lastPredictionTelemetry.kafka?.topic || 'eta-predictions'}
                  </code>
                </p>
              </>
            ) : (
              <>
                <p>
                  <code>/health</code> does not expose a Kafka broker probe.
                </p>
                <Link
                  to="/predict"
                  className="inline-block font-semibold text-brand-black underline decoration-brand-primary underline-offset-4 hover:text-brand-primary"
                >
                  Run POST /predict to verify Kafka event publish
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Backend API Availability Transparency Table */}
      <section className="mt-8 rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-primary" />
          <h2 className="font-display text-lg font-bold text-brand-black">
            Backend Endpoint Coverage &amp; Honest Integration Matrix
          </h2>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 text-neutral-500">
              <tr>
                <th className="py-2.5 pr-4 font-semibold">Capability</th>
                <th className="py-2.5 pr-4 font-semibold">Backend Endpoint</th>
                <th className="py-2.5 pr-4 font-semibold">Integration Mode</th>
                <th className="py-2.5 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-700">
              <tr>
                <td className="py-2.5 pr-4 font-semibold text-brand-black">
                  ML ETA Prediction
                </td>
                <td className="py-2.5 pr-4 font-mono">POST /predict</td>
                <td className="py-2.5 pr-4">
                  <DataSourceBadge variant="live" />
                </td>
                <td className="py-2.5">
                  Full 17-feature schema, Redis cache, PostgreSQL write &amp;
                  Kafka event
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-semibold text-brand-black">
                  API &amp; Circuit Health
                </td>
                <td className="py-2.5 pr-4 font-mono">GET /health, GET /</td>
                <td className="py-2.5 pr-4">
                  <DataSourceBadge variant="live" />
                </td>
                <td className="py-2.5">
                  Reports model_loaded, active Docker instance ID, and Redis
                  circuit state
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-semibold text-brand-black">
                  GraphQL Health
                </td>
                <td className="py-2.5 pr-4 font-mono">POST /graphql</td>
                <td className="py-2.5 pr-4">
                  <DataSourceBadge variant="live" />
                </td>
                <td className="py-2.5">
                  Queries hello, projectInfo, and health via Strawberry GraphQL
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-semibold text-brand-black">
                  Restaurants, Cart, Checkout
                </td>
                <td className="py-2.5 pr-4 font-mono text-neutral-400">
                  Missing on backend
                </td>
                <td className="py-2.5 pr-4">
                  <DataSourceBadge variant="demo" label="Demo + localStorage" />
                </td>
                <td className="py-2.5">
                  Checkout invokes real POST /predict for ETA; payments are demo
                  UI only
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-semibold text-brand-black">
                  Order Tracking &amp; GPS
                </td>
                <td className="py-2.5 pr-4 font-mono text-neutral-400">
                  Missing on backend
                </td>
                <td className="py-2.5 pr-4">
                  <DataSourceBadge variant="simulated" />
                </td>
                <td className="py-2.5">
                  Interactive 6-stage lifecycle &amp; clearly labelled simulated
                  route map
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


import { Bike, Home, Navigation, Store } from 'lucide-react';
import DataSourceBadge from './DataSourceBadge';

const ROUTE_POINTS = [
  { x: 14, y: 74 },
  { x: 26, y: 60 },
  { x: 40, y: 54 },
  { x: 56, y: 42 },
  { x: 71, y: 38 },
  { x: 86, y: 24 },
];

export default function SimulatedRouteMap({
  stageIndex = 0,
  restaurantName = 'Restaurant',
  deliveryAddress = 'Customer Address',
  distanceKm = 5.4,
}) {
  const clampedStage = Math.max(0, Math.min(5, stageIndex));
  const courierPoint = ROUTE_POINTS[clampedStage];
  const completedPoints = ROUTE_POINTS.slice(0, clampedStage + 1)
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
  const fullPathPoints = ROUTE_POINTS.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-brand-primary" />
          <h3 className="font-display text-sm font-bold text-brand-black">
            Delivery Route View
          </h3>
        </div>
        <DataSourceBadge
          variant="simulated"
          label="Simulated Route — No Live GPS Backend"
        />
      </div>

      {/* Stylized Vector Map */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#F3F4F6]">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-label="Simulated delivery route map"
        >
          {/* City grid background blocks */}
          <rect x="0" y="0" width="100" height="100" fill="#F3F4F6" />
          <rect x="6" y="8" width="18" height="16" rx="2" fill="#E5E7EB" />
          <rect x="29" y="8" width="22" height="14" rx="2" fill="#E5E7EB" />
          <rect x="56" y="7" width="17" height="18" rx="2" fill="#D1FAE5" />
          <rect x="78" y="8" width="16" height="12" rx="2" fill="#E5E7EB" />

          <rect x="6" y="30" width="14" height="22" rx="2" fill="#E5E7EB" />
          <rect x="25" y="28" width="24" height="18" rx="2" fill="#E5E7EB" />
          <rect x="54" y="31" width="20" height="19" rx="2" fill="#E5E7EB" />
          <rect x="79" y="34" width="15" height="22" rx="2" fill="#E5E7EB" />

          <rect x="8" y="58" width="16" height="12" rx="2" fill="#D1FAE5" />
          <rect x="29" y="53" width="19" height="17" rx="2" fill="#E5E7EB" />
          <rect x="54" y="56" width="20" height="18" rx="2" fill="#E5E7EB" />
          <rect x="79" y="61" width="15" height="20" rx="2" fill="#E5E7EB" />

          <rect x="6" y="78" width="26" height="14" rx="2" fill="#E5E7EB" />
          <rect x="37" y="76" width="24" height="16" rx="2" fill="#E5E7EB" />
          <rect x="66" y="79" width="28" height="13" rx="2" fill="#E5E7EB" />

          {/* Road network */}
          <path
            d="M0 26 H100 M0 52 H100 M0 74 H100 M23 0 V100 M51 0 V100 M76 0 V100"
            stroke="#FFFFFF"
            strokeWidth="2.4"
          />

          {/* Full planned dashed route */}
          <polyline
            points={fullPathPoints}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="1.6"
            strokeDasharray="2.5 2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Completed Zomato crimson route trail */}
          {clampedStage > 0 && (
            <polyline
              points={completedPoints}
              fill="none"
              stroke="#E23744"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {/* Restaurant Origin Pin */}
        <div
          style={{ left: '14%', top: '74%' }}
          className="absolute -translate-x-1/2 -translate-y-1/2"
        >
          <div className="flex flex-col items-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-black text-white shadow-card">
              <Store className="h-4 w-4" />
            </span>
            <span className="mt-1 whitespace-nowrap rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-brand-black shadow-soft">
              {restaurantName}
            </span>
          </div>
        </div>

        {/* Destination Home Pin */}
        <div
          style={{ left: '86%', top: '24%' }}
          className="absolute -translate-x-1/2 -translate-y-1/2"
        >
          <div className="flex flex-col items-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-primary text-white shadow-card">
              <Home className="h-4 w-4" />
            </span>
            <span className="mt-1 max-w-[130px] truncate whitespace-nowrap rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-brand-black shadow-soft">
              Drop-off
            </span>
          </div>
        </div>

        {/* Moving Courier Marker */}
        <div
          style={{ left: `${courierPoint.x}%`, top: `${courierPoint.y}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out"
        >
          <div className="relative flex h-10 w-10 items-center justify-center">
            {clampedStage < 5 && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary/35" />
            )}
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand-black text-brand-primary shadow-elevated">
              <Bike className="h-4 w-4" />
            </span>
          </div>
        </div>

        {/* Bottom Map Metadata Overlay */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 px-3.5 py-2 text-xs shadow-soft backdrop-blur-sm">
          <span className="truncate font-medium text-neutral-700">
            Destination: <strong className="text-brand-black">{deliveryAddress}</strong>
          </span>
          <span className="shrink-0 font-semibold text-brand-black tabular-nums">
            Route Distance: {distanceKm} km
          </span>
        </div>
      </div>
    </div>
  );
}


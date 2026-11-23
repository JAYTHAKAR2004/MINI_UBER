export function RestaurantSkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white p-3 shadow-soft">
      <div className="aspect-[16/10] w-full rounded-xl skeleton-shimmer" />
      <div className="mt-3.5 space-y-2.5 px-1 pb-1">
        <div className="flex items-center justify-between gap-2">
          <div className="h-5 w-2/3 rounded-md skeleton-shimmer" />
          <div className="h-5 w-11 rounded-full skeleton-shimmer" />
        </div>
        <div className="h-4 w-1/2 rounded-md skeleton-shimmer" />
        <div className="flex gap-3 pt-1">
          <div className="h-4 w-20 rounded-md skeleton-shimmer" />
          <div className="h-4 w-20 rounded-md skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function MetricSkeletonCard() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="h-4 w-24 rounded skeleton-shimmer" />
      <div className="mt-3 h-8 w-32 rounded skeleton-shimmer" />
      <div className="mt-2 h-3 w-40 rounded skeleton-shimmer" />
    </div>
  );
}


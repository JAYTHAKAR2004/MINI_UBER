import { Link } from 'react-router-dom';
import { Leaf, Sparkles, Star } from 'lucide-react';
import FoodImage from './FoodImage';
import { formatPrice } from '../utils/formatters';

export default function RestaurantCard({ restaurant, liveEtaMinutes = null }) {
  const etaDisplay = liveEtaMinutes
    ? `${Math.round(liveEtaMinutes)} min`
    : `${restaurant.etaMinutes} min`;

  return (
    <Link
      to={`/restaurants/${restaurant.slug}`}
      className="group block overflow-hidden rounded-2xl border border-transparent bg-white p-3 transition-all duration-200 hover:border-neutral-200 hover:shadow-card"
    >
      <div className="relative overflow-hidden rounded-2xl">
        <FoodImage
          src={restaurant.image}
          alt={restaurant.name}
          containerClassName="aspect-[16/10] w-full rounded-2xl"
          className="transition-transform duration-300 group-hover:scale-105"
        />

        {restaurant.offer && (
          <span className="absolute bottom-3 left-0 rounded-r-md bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-soft">
            {restaurant.offer}
          </span>
        )}

        {restaurant.isPureVeg && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-700/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-soft">
            <Leaf className="h-3 w-3" />
            Pure Veg
          </span>
        )}

        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-0.5 text-xs font-bold text-brand-black shadow-soft backdrop-blur-sm tabular-nums">
          {liveEtaMinutes && (
            <Sparkles className="h-3 w-3 text-brand-primary" />
          )}
          {etaDisplay}
        </span>
      </div>

      <div className="mt-3 px-0.5 pb-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-display text-[17px] font-semibold text-brand-black group-hover:text-brand-primary">
            {restaurant.name}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-brand-rating px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
            {restaurant.rating.toFixed(1)}
            <Star className="h-2.5 w-2.5 fill-white text-white" />
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between gap-3 text-[13px] text-neutral-500">
          <p className="truncate">{restaurant.cuisine}</p>
          <span className="shrink-0 font-medium text-neutral-600 tabular-nums">
            {formatPrice(restaurant.costForTwo)} for two
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
          <span>{restaurant.city}</span>
          <span>
            {restaurant.deliveryFee === 0 ? (
              <span className="font-semibold text-brand-rating">
                Free delivery
              </span>
            ) : (
              `${formatPrice(restaurant.deliveryFee)} delivery`
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}

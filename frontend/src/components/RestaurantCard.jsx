import { Link } from 'react-router-dom';
import { Clock, Star } from 'lucide-react';
import FoodImage from './FoodImage';
import { formatPrice } from '../utils/formatters';

export default function RestaurantCard({ restaurant }) {
  return (
    <Link
      to={`/restaurants/${restaurant.slug}`}
      className="group block overflow-hidden rounded-2xl border border-neutral-200/80 bg-white p-2.5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-card"
    >
      <div className="relative overflow-hidden rounded-xl">
        <FoodImage
          src={restaurant.image}
          alt={restaurant.name}
          containerClassName="aspect-[16/10] w-full rounded-xl"
          className="transition-transform duration-300 group-hover:scale-105"
        />

        {restaurant.offer && (
          <span className="absolute bottom-2.5 left-0 rounded-r-md bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-soft">
            {restaurant.offer}
          </span>
        )}

        <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-bold text-brand-black shadow-soft backdrop-blur-sm">
          <Clock className="h-3 w-3 text-neutral-600" />
          {restaurant.etaMinutes} min
        </span>
      </div>

      <div className="mt-3 px-1 pb-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-display text-base font-bold text-brand-black group-hover:text-brand-primary">
            {restaurant.name}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-brand-rating px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
            {restaurant.rating.toFixed(1)}
            <Star className="h-2.5 w-2.5 fill-white text-white" />
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-neutral-500">
          <p className="truncate">{restaurant.cuisine}</p>
          <span className="shrink-0 font-medium text-neutral-700 tabular-nums">
            {formatPrice(restaurant.costForTwo)} for two
          </span>
        </div>

        <div className="mt-2.5 flex items-center justify-between border-t border-neutral-100 pt-2 text-xs text-neutral-500">
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

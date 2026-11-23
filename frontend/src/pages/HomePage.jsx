import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  MapPin,
  Minus,
  Percent,
  Plus,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import FoodImage from '../components/FoodImage';
import RestaurantCard from '../components/RestaurantCard';
import VegBadge from '../components/VegBadge';
import {
  CATEGORIES,
  POPULAR_DISHES,
  PROMO_OFFERS,
  RESTAURANTS,
} from '../data/restaurants';
import { useLocationContext } from '../context/LocationContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatPrice } from '../utils/formatters';

export default function HomePage() {
  const navigate = useNavigate();
  const { shortName } = useLocationContext();
  const { items, addItem, updateQuantity, applyPromo, appliedPromo } =
    useCart();
  const { showToast } = useToast();

  const [searchInput, setSearchInput] = useState('');

  const popularNearYou = useMemo(() => {
    const local = RESTAURANTS.filter((r) => r.city === shortName);
    const others = RESTAURANTS.filter((r) => r.city !== shortName);
    return [...local, ...others].slice(0, 6);
  }, [shortName]);

  const recommendedRestaurants = useMemo(
    () => RESTAURANTS.filter((r) => r.recommended).slice(0, 4),
    []
  );

  const handleSearch = (e) => {
    e.preventDefault();
    const q = searchInput.trim();
    navigate(q ? `/restaurants?q=${encodeURIComponent(q)}` : '/restaurants');
  };

  const getDishQty = (dishId) => {
    const found = items.find((i) => i.id === dishId);
    return found ? found.quantity : 0;
  };

  const handleAddDish = (dish) => {
    addItem(dish, dish.restaurant);
    showToast({
      title: `Added ${dish.name}`,
      description: `${dish.restaurantName} · ${formatPrice(dish.price)}`,
      type: 'success',
    });
  };

  const handleApplyPromo = (offer) => {
    const res = applyPromo(offer.code);
    showToast({
      title: res.ok ? `Coupon ${offer.code} saved` : 'Coupon unavailable',
      description: res.ok
        ? `${offer.title} (${offer.subtitle})`
        : res.message,
      type: res.ok ? 'success' : 'error',
    });
  };

  return (
    <div className="bg-white pb-14">
      {/* Compact Zomato Location & Discovery Strip */}
      <section className="border-b border-neutral-100 bg-surface-soft/70">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary">
                <MapPin className="h-3.5 w-3.5" />
                Delivering to {shortName}
              </p>
              <h1 className="mt-1.5 font-display text-2xl font-extrabold text-brand-black sm:text-3xl">
                Order food online in {shortName}
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                Explore popular restaurants, curated dishes, and instant doorstep
                delivery.
              </p>
            </div>

            <form
              onSubmit={handleSearch}
              className="flex w-full max-w-md items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-soft"
            >
              <label className="flex flex-1 items-center gap-2 px-2.5">
                <Search className="h-4 w-4 text-neutral-400" />
                <span className="sr-only">Search restaurants or dishes</span>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search biryani, pizza, burgers..."
                  className="w-full bg-transparent text-sm text-brand-black placeholder:text-neutral-400 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primaryDark"
              >
                Search
              </button>
            </form>
          </div>

          {/* Working Quick Filter Chips */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {[
              { label: 'Rating 4.5+', to: '/restaurants?rating=4.5' },
              { label: 'Under 25 min', to: '/restaurants?fast=true' },
              { label: 'Great Offers', to: '/restaurants?offers=true' },
              { label: 'Free Delivery', to: '/restaurants?freeDelivery=true' },
              { label: 'Dining Out', to: '/restaurants?tab=dining' },
            ].map((chip) => (
              <Link
                key={chip.label}
                to={chip.to}
                className="rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:border-brand-primary hover:text-brand-primary"
              >
                {chip.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Inspiration / Food Categories */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-brand-black sm:text-2xl">
            Eat what makes you happy
          </h2>
          <Link
            to="/restaurants"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:text-brand-primaryDark"
          >
            All cuisines
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {CATEGORIES.map((category) => (
            <Link
              key={category.id}
              to={`/restaurants?category=${encodeURIComponent(category.name)}`}
              className="group flex flex-col items-center text-center"
            >
              <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-neutral-100 shadow-soft transition-all duration-200 group-hover:scale-105 group-hover:border-brand-primary sm:h-24 sm:w-24">
                <FoodImage
                  src={category.image}
                  alt={category.name}
                  containerClassName="h-full w-full"
                />
              </div>
              <span className="mt-2.5 text-xs font-semibold text-brand-black group-hover:text-brand-primary sm:text-sm">
                {category.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Offers & Discounts */}
      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <h2 className="font-display text-xl font-bold text-brand-black">
          Offers &amp; discounts for you
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Object.values(PROMO_OFFERS).map((offer) => {
            const isApplied = appliedPromo?.code === offer.code;
            return (
              <button
                key={offer.code}
                type="button"
                onClick={() => handleApplyPromo(offer)}
                className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all ${
                  isApplied
                    ? 'border-brand-primary bg-brand-primarySoft shadow-soft'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-soft'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primarySoft text-brand-primary">
                    <Percent className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-bold text-brand-black">
                      {offer.title}
                    </p>
                    <p className="text-xs text-neutral-500">{offer.subtitle}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-lg border border-dashed border-brand-primaryBorder bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-brand-primaryDark">
                  {isApplied ? 'APPLIED' : offer.code}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Popular Restaurants Near Location */}
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-brand-black sm:text-2xl">
              Popular restaurants near {shortName}
            </h2>
            <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
              Top-rated kitchens delivering fresh to your doorstep
            </p>
          </div>
          <Link
            to="/restaurants"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-primary hover:text-brand-primaryDark"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {popularNearYou.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
          ))}
        </div>
      </section>

      {/* Popular Dishes */}
      <section className="mt-6 border-y border-neutral-100 bg-surface-soft/70 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold text-brand-black sm:text-2xl">
                Popular dishes right now
              </h2>
              <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
                Most ordered dishes — add straight to your cart
              </p>
            </div>
            <Link
              to="/restaurants"
              className="text-sm font-semibold text-brand-primary hover:text-brand-primaryDark"
            >
              Browse menus
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {POPULAR_DISHES.map((dish) => {
              const qty = getDishQty(dish.id);
              return (
                <div
                  key={dish.id}
                  className="flex flex-col justify-between overflow-hidden rounded-2xl border border-neutral-200/80 bg-white p-3 shadow-soft transition-shadow hover:shadow-card"
                >
                  <div>
                    <Link to={`/restaurants/${dish.restaurantSlug}`}>
                      <FoodImage
                        src={dish.image}
                        alt={dish.name}
                        containerClassName="aspect-[4/3] w-full rounded-xl"
                      />
                    </Link>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <VegBadge isVeg={dish.isVeg !== false} />
                        {dish.bestseller && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">
                            Bestseller
                          </span>
                        )}
                      </div>
                      {dish.rating && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-bold text-brand-rating tabular-nums">
                          {dish.rating}
                          <Star className="h-3 w-3 fill-brand-rating text-brand-rating" />
                        </span>
                      )}
                    </div>

                    <h3 className="mt-1.5 truncate font-display text-sm font-bold text-brand-black">
                      {dish.name}
                    </h3>
                    <Link
                      to={`/restaurants/${dish.restaurantSlug}`}
                      className="block truncate text-xs text-neutral-500 hover:text-brand-primary"
                    >
                      {dish.restaurantName}
                    </Link>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2.5">
                    <span className="text-sm font-bold text-brand-black tabular-nums">
                      {formatPrice(dish.price)}
                    </span>

                    {qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleAddDish(dish)}
                        className="inline-flex items-center gap-1 rounded-lg border border-brand-primaryBorder bg-brand-primarySoft px-3 py-1.5 text-xs font-bold uppercase text-brand-primaryDark transition-colors hover:bg-brand-primary hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1 rounded-lg bg-brand-primary px-1.5 py-1 text-white">
                        <button
                          type="button"
                          onClick={() => updateQuantity(dish.id, -1)}
                          aria-label={`Remove one ${dish.name}`}
                          className="rounded p-0.5 hover:bg-brand-primaryDark"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[1.25rem] text-center text-xs font-bold tabular-nums">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(dish.id, 1)}
                          aria-label={`Add one more ${dish.name}`}
                          className="rounded p-0.5 hover:bg-brand-primaryDark"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Recommended Restaurants */}
      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-primary" />
            <div>
              <h2 className="font-display text-xl font-bold text-brand-black sm:text-2xl">
                Recommended for you
              </h2>
              <p className="text-xs text-neutral-500 sm:text-sm">
                Curated kitchens loved for quality and reliable delivery times
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {recommendedRestaurants.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
          ))}
        </div>
      </section>
    </div>
  );
}

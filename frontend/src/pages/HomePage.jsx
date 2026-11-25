import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Leaf,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Star,
} from 'lucide-react';
import FoodImage from '../components/FoodImage';
import RestaurantCard from '../components/RestaurantCard';
import { RestaurantSkeletonCard } from '../components/SkeletonCard';
import VegBadge from '../components/VegBadge';
import { CATEGORIES, PROMO_BANNERS } from '../data/restaurants';
import { useLocationContext } from '../context/LocationContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { fetchRestaurantsByCity } from '../services/restaurantService';
import { predictETA } from '../services/etaService';
import {
  areCoordinatesValid,
  calculateHaversineKm,
} from '../utils/haversine';
import { formatPrice } from '../utils/formatters';

export default function HomePage() {
  const navigate = useNavigate();
  const { shortName, lat, lng, modelCity } = useLocationContext();
  const { items, addItem, updateQuantity, applyPromo, appliedPromo } =
    useCart();
  const { showToast } = useToast();

  const [cityRestaurants, setCityRestaurants] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(null);
  const [selectedCuisine, setSelectedCuisine] = useState('All');
  const [minRating, setMinRating] = useState(0);
  const [fastOnly, setFastOnly] = useState(false);
  const [pureVegOnly, setPureVegOnly] = useState(false);
  const [offersOnly, setOffersOnly] = useState(false);
  const [priceRange, setPriceRange] = useState('all');
  const [sortBy, setSortBy] = useState('relevance');
  const [liveEtaByRestaurant, setLiveEtaByRestaurant] = useState({});

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError(null);
    setLiveEtaByRestaurant({});

    fetchRestaurantsByCity({ city: shortName, lat, lng })
      .then((res) => {
        if (!active) return;
        setCityRestaurants(res.restaurants || []);
      })
      .catch((err) => {
        if (!active) return;
        setCityRestaurants([]);
        setCatalogError(
          err?.message || `Unable to load restaurants for ${shortName}.`
        );
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    return () => {
      active = false;
    };
  }, [shortName, lat, lng]);

  // Fetch customer-facing live ML ETA for the featured local kitchen cleanly (never across cities)
  useEffect(() => {
    const featured = cityRestaurants[0];
    if (!featured || !featured.coordinates || !areCoordinatesValid(featured.coordinates.lat, featured.coordinates.lng, lat, lng)) {
      return undefined;
    }

    let active = true;
    const now = new Date();
    const jsDay = now.getDay();
    const pythonWeekday = jsDay === 0 ? 6 : jsDay - 1;
    const rLat = featured.coordinates.lat;
    const rLon = featured.coordinates.lng;
    const dist = calculateHaversineKm(rLat, rLon, lat, lng);
    if (dist === null || dist > 50) return undefined;

    predictETA({
      restaurant_id: featured.id,
      selected_city: shortName,
      restaurant_lat: rLat,
      restaurant_lon: rLon,
      delivery_lat: lat,
      delivery_lon: lng,
      Delivery_person_Age: 28,
      Delivery_person_Ratings: 4.7,
      Vehicle_condition: 2,
      multiple_deliveries: 0,
      distance_km: dist,
      coordinates_valid: 1,
      order_time_missing: 0,
      order_hour: now.getHours(),
      order_day: now.getDate(),
      order_month: now.getMonth() + 1,
      order_weekday: pythonWeekday,
      Weather_conditions: 'Cloudy',
      Road_traffic_density: 'Medium',
      Type_of_order: 'Meal',
      Type_of_vehicle: 'motorcycle',
      Festival: 'No',
      City: featured.modelCity || modelCity || 'Metropolitian',
    })
      .then((res) => {
        if (active && typeof res?.predicted_eta_minutes === 'number') {
          setLiveEtaByRestaurant((prev) => ({
            ...prev,
            [featured.id]: res.predicted_eta_minutes,
          }));
        }
      })
      .catch(() => {
        // Do not invent an ETA if prediction fails
      });

    return () => {
      active = false;
    };
  }, [cityRestaurants, shortName, lat, lng, modelCity]);

  const popularDishes = useMemo(() => {
    return cityRestaurants
      .flatMap((restaurant) =>
        (restaurant.menu || [])
          .filter((item) => item.popular)
          .map((item) => ({
            ...item,
            restaurantId: restaurant.id,
            restaurantSlug: restaurant.slug,
            restaurantName: restaurant.name,
            restaurant,
          }))
      )
      .slice(0, 8);
  }, [cityRestaurants]);

  const filteredRestaurants = useMemo(() => {
    const list = cityRestaurants.filter((r) => {
      if (
        selectedCuisine !== 'All' &&
        !(r.categories || []).includes(selectedCuisine)
      ) {
        return false;
      }
      if (minRating > 0 && r.rating < minRating) return false;
      if (fastOnly && r.etaMinutes > 25) return false;
      if (pureVegOnly && !r.isPureVeg) return false;
      if (offersOnly && !r.offer) return false;
      if (priceRange === 'budget' && r.costForTwo > 500) return false;
      if (
        priceRange === 'mid' &&
        (r.costForTwo < 500 || r.costForTwo > 800)
      ) {
        return false;
      }
      if (priceRange === 'premium' && r.costForTwo <= 800) return false;
      return true;
    });

    if (sortBy === 'rating') {
      return [...list].sort((a, b) => b.rating - a.rating);
    }
    if (sortBy === 'eta') {
      return [...list].sort((a, b) => a.etaMinutes - b.etaMinutes);
    }
    if (sortBy === 'costLow') {
      return [...list].sort((a, b) => a.costForTwo - b.costForTwo);
    }
    if (sortBy === 'costHigh') {
      return [...list].sort((a, b) => b.costForTwo - a.costForTwo);
    }
    return list;
  }, [
    cityRestaurants,
    selectedCuisine,
    minRating,
    fastOnly,
    pureVegOnly,
    offersOnly,
    priceRange,
    sortBy,
  ]);

  const hasActiveFilters =
    selectedCuisine !== 'All' ||
    minRating > 0 ||
    fastOnly ||
    pureVegOnly ||
    offersOnly ||
    priceRange !== 'all' ||
    sortBy !== 'relevance';

  const resetAllFilters = () => {
    setSelectedCuisine('All');
    setMinRating(0);
    setFastOnly(false);
    setPureVegOnly(false);
    setOffersOnly(false);
    setPriceRange('all');
    setSortBy('relevance');
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

  const handleBannerPromo = (code) => {
    const res = applyPromo(code);
    showToast({
      title: res.ok ? `Promo ${code} saved for checkout` : 'Promo info',
      description: res.message,
      type: res.ok ? 'success' : 'error',
    });
  };

  const scrollCategories = (dir) => {
    const el = document.getElementById('zomato-category-strip');
    if (el) el.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <div className="bg-white pb-16">
      {/* Inspiration for Your First Order — 10 Zomato Categories */}
      <section className="bg-surface-soft py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <h1 className="font-display text-2xl font-semibold text-brand-black sm:text-[28px]">
              Inspiration for your first order
            </h1>
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => scrollCategories(-1)}
                aria-label="Scroll cuisines left"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-brand-black shadow-soft hover:bg-neutral-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollCategories(1)}
                aria-label="Scroll cuisines right"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-brand-black shadow-soft hover:bg-neutral-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            id="zomato-category-strip"
            className="mt-6 flex gap-6 overflow-x-auto pb-2 scrollbar-none"
          >
            {CATEGORIES.map((category) => {
              const active = selectedCuisine === category.name;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    setSelectedCuisine(active ? 'All' : category.name)
                  }
                  className="group flex w-28 shrink-0 flex-col items-center text-center sm:w-32"
                >
                  <div
                    className={`h-24 w-24 overflow-hidden rounded-full border-2 shadow-soft transition-all duration-200 group-hover:scale-105 sm:h-28 sm:w-28 ${
                      active
                        ? 'border-brand-primary ring-4 ring-brand-primarySoft'
                        : 'border-white'
                    }`}
                  >
                    <FoodImage
                      src={category.image}
                      alt={category.name}
                      containerClassName="h-full w-full"
                    />
                  </div>
                  <span
                    className={`mt-3 text-sm font-medium sm:text-base ${
                      active
                        ? 'font-bold text-brand-primary'
                        : 'text-brand-black group-hover:text-brand-primary'
                    }`}
                  >
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Promotional Food & Delivery Banners */}
      <section className="mx-auto max-w-7xl px-4 pt-9 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {PROMO_BANNERS.map((banner) => {
            const isApplied = appliedPromo?.code === banner.code;
            return (
              <div
                key={banner.id}
                className="group relative flex h-44 flex-col justify-between overflow-hidden rounded-2xl bg-neutral-900 p-5 text-white shadow-soft"
              >
                <img
                  src={banner.image}
                  alt={banner.title}
                  className="absolute inset-0 h-full w-full object-cover opacity-55 transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />

                <div className="relative z-10">
                  <span className="inline-block rounded bg-brand-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    {banner.badge}
                  </span>
                  <h2 className="mt-2 font-display text-lg font-bold leading-snug">
                    {banner.title}
                  </h2>
                  <p className="mt-1 line-clamp-1 text-xs text-neutral-200">
                    {banner.subtitle}
                  </p>
                </div>

                <div className="relative z-10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleBannerPromo(banner.code)}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-brand-black transition-colors hover:bg-brand-primary hover:text-white"
                  >
                    {isApplied ? `${banner.code} Applied` : banner.cta}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/restaurants?offers=true')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-white"
                  >
                    Explore
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sticky Zomato Filter Strip */}
      <section className="sticky top-[72px] z-30 mt-8 border-y border-neutral-100 bg-white/95 py-3.5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-soft">
              <SlidersHorizontal className="h-3.5 w-3.5 text-neutral-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort restaurants"
                className="bg-transparent font-medium text-brand-black focus:outline-none"
              >
                <option value="relevance">Sort: Relevance</option>
                <option value="rating">Rating: High to Low</option>
                <option value="eta">Delivery Time</option>
                <option value="costLow">Cost: Low to High</option>
                <option value="costHigh">Cost: High to Low</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setPureVegOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                pureVegOnly
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-surface-soft'
              }`}
            >
              <Leaf className="h-3.5 w-3.5 text-emerald-600" />
              Pure Veg
            </button>

            <button
              type="button"
              onClick={() => setMinRating((v) => (v === 4.5 ? 0 : 4.5))}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                minRating === 4.5
                  ? 'border-brand-primary bg-brand-primarySoft text-brand-primaryDark'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-surface-soft'
              }`}
            >
              Rating: 4.5+
            </button>

            <button
              type="button"
              onClick={() => setFastOnly((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                fastOnly
                  ? 'border-brand-primary bg-brand-primarySoft text-brand-primaryDark'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-surface-soft'
              }`}
            >
              Under 25 min
            </button>

            <button
              type="button"
              onClick={() => setOffersOnly((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                offersOnly
                  ? 'border-brand-primary bg-brand-primarySoft text-brand-primaryDark'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-surface-soft'
              }`}
            >
              Great Offers
            </button>

            <select
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
              aria-label="Filter by price range"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 focus:outline-none"
            >
              <option value="all">Price: Any</option>
              <option value="budget">Under ₹500 for two</option>
              <option value="mid">₹500 – ₹800 for two</option>
              <option value="premium">₹800+ for two</option>
            </select>

            <select
              value={selectedCuisine}
              onChange={(e) => setSelectedCuisine(e.target.value)}
              aria-label="Filter by cuisine"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 focus:outline-none"
            >
              <option value="All">Cuisines: All</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </section>

      {/* Main Restaurant Grid */}
      <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
              <MapPin className="h-3.5 w-3.5 text-brand-primary" />
              Delivery Restaurants in {shortName}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-brand-black sm:text-[28px]">
              {selectedCuisine === 'All'
                ? `Best Food in ${shortName}`
                : `${selectedCuisine} delivery near ${shortName}`}
            </h2>
          </div>
          <span className="rounded-full bg-surface-soft px-3 py-1 text-[11px] font-medium text-neutral-500">
            Showing {filteredRestaurants.length} demo kitchens in {shortName}
          </span>
        </div>

        {catalogLoading ? (
          <div className="mt-6 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <RestaurantSkeletonCard key={idx} />
            ))}
          </div>
        ) : catalogError ? (
          <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-center">
            <p className="font-display text-lg font-bold text-red-900">
              Unable to load restaurants for {shortName}
            </p>
            <p className="mt-1 text-sm text-red-700">{catalogError}</p>
          </div>
        ) : filteredRestaurants.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-neutral-300 bg-surface-soft px-6 py-14 text-center">
            <p className="font-display text-lg font-bold text-brand-black">
              No restaurants found in {shortName} for these filters
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {cityRestaurants.length === 0
                ? `No partner restaurants are currently available in ${shortName}. Switch cities above to browse supported hubs.`
                : 'Try clearing Pure Veg, price range, or cuisine filters to explore more local kitchens.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRestaurants.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                liveEtaMinutes={liveEtaByRestaurant[restaurant.id] ?? null}
              />
            ))}
          </div>
        )}
      </section>

      {/* Popular Dishes Strip (Active City Only) */}
      {popularDishes.length > 0 && (
        <section className="mt-14 border-t border-neutral-100 bg-surface-soft/70 py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-brand-black">
                  Most ordered in {shortName}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Add signature dishes from {shortName} kitchens straight into your cart
                </p>
              </div>
              <Link
                to="/restaurants"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
              >
                Explore all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {popularDishes.map((dish) => {
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
      )}

      {/* Subtle AI Delivery Banner */}
      <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-soft sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primarySoft text-brand-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-brand-black">
                Smart Delivery Time Forecasting
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                Every order calculates an arrival estimate using traffic, weather, route distance, and our Random Forest model.
              </p>
            </div>
          </div>
          <Link
            to="/predict"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-primaryDark"
          >
            Try Live ETA Calculator
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

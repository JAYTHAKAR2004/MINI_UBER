import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Leaf, MapPin, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { CATEGORIES } from '../data/restaurants';
import { useLocationContext } from '../context/LocationContext';
import { fetchRestaurantsByCity } from '../services/restaurantService';
import RestaurantCard from '../components/RestaurantCard';
import { RestaurantSkeletonCard } from '../components/SkeletonCard';

export default function RestaurantsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { shortName, lat, lng } = useLocationContext();
  const initialQuery = searchParams.get('q') || '';
  const initialCategory = searchParams.get('category') || 'All';
  const activeTab = searchParams.get('tab') === 'dining' ? 'dining' : 'delivery';

  const [cityRestaurants, setCityRestaurants] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState('relevance');
  const [topRatedOnly, setTopRatedOnly] = useState(
    searchParams.get('rating') === '4.5'
  );
  const [fastOnly, setFastOnly] = useState(
    searchParams.get('fast') === 'true'
  );
  const [pureVegOnly, setPureVegOnly] = useState(false);
  const [offersOnly, setOffersOnly] = useState(
    searchParams.get('offers') === 'true'
  );
  const [freeDeliveryOnly, setFreeDeliveryOnly] = useState(
    searchParams.get('freeDelivery') === 'true'
  );
  const [priceRange, setPriceRange] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setSelectedCategory(searchParams.get('category') || 'All');
    setTopRatedOnly(searchParams.get('rating') === '4.5');
    setFastOnly(searchParams.get('fast') === 'true');
    setOffersOnly(searchParams.get('offers') === 'true');
    setFreeDeliveryOnly(searchParams.get('freeDelivery') === 'true');
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setFetchError(null);
    fetchRestaurantsByCity({ city: shortName, lat, lng })
      .then((res) => {
        if (!active) return;
        setCityRestaurants(res.restaurants || []);
      })
      .catch((err) => {
        if (!active) return;
        setCityRestaurants([]);
        setFetchError(
          err?.message || `Unable to load restaurants for ${shortName}.`
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shortName, lat, lng]);

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    const next = new URLSearchParams(searchParams);
    if (category === 'All') {
      next.delete('category');
    } else {
      next.set('category', category);
    }
    setSearchParams(next, { replace: true });
  };

  const handleTabChange = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'dining') {
      next.set('tab', 'dining');
    } else {
      next.delete('tab');
    }
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    setQuery('');
    setSelectedCategory('All');
    setSortBy('relevance');
    setTopRatedOnly(false);
    setFastOnly(false);
    setPureVegOnly(false);
    setOffersOnly(false);
    setFreeDeliveryOnly(false);
    setPriceRange('all');
    setSearchParams({}, { replace: true });
  };

  const filteredRestaurants = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = cityRestaurants.filter((r) => {
      if (activeTab === 'dining' && !r.diningOut) return false;
      if (activeTab === 'delivery' && r.deliveryAvailable === false) return false;

      if (
        selectedCategory !== 'All' &&
        !(r.categories || []).includes(selectedCategory)
      ) {
        return false;
      }

      if (topRatedOnly && r.rating < 4.5) return false;
      if (fastOnly && r.etaMinutes > 25) return false;
      if (pureVegOnly && !r.isPureVeg) return false;
      if (offersOnly && !r.offer) return false;
      if (freeDeliveryOnly && r.deliveryFee > 0) return false;
      if (priceRange === 'budget' && r.costForTwo > 500) return false;
      if (priceRange === 'mid' && (r.costForTwo < 500 || r.costForTwo > 800)) {
        return false;
      }
      if (priceRange === 'premium' && r.costForTwo <= 800) return false;

      if (!q) return true;
      const matchesMeta =
        r.name.toLowerCase().includes(q) ||
        r.cuisine.toLowerCase().includes(q) ||
        (r.area || '').toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q);
      const matchesMenu = (r.menu || []).some((item) =>
        item.name.toLowerCase().includes(q)
      );
      return matchesMeta || matchesMenu;
    });

    if (sortBy === 'rating') {
      return [...list].sort((a, b) => b.rating - a.rating);
    }
    if (sortBy === 'eta') {
      return [...list].sort((a, b) => a.etaMinutes - b.etaMinutes);
    }
    if (sortBy === 'distance') {
      return [...list].sort(
        (a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999)
      );
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
    query,
    activeTab,
    selectedCategory,
    sortBy,
    topRatedOnly,
    fastOnly,
    pureVegOnly,
    offersOnly,
    freeDeliveryOnly,
    priceRange,
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Order Online / Dining Out Switch */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => handleTabChange('delivery')}
            className={`border-b-2 pb-2 font-display text-lg font-bold transition-colors ${
              activeTab === 'delivery'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-neutral-500 hover:text-brand-black'
            }`}
          >
            Delivery
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('dining')}
            className={`border-b-2 pb-2 font-display text-lg font-bold transition-colors ${
              activeTab === 'dining'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-neutral-500 hover:text-brand-black'
            }`}
          >
            Dining Out
          </button>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1 text-xs font-semibold text-neutral-600">
          <MapPin className="h-3.5 w-3.5 text-brand-primary" />
          {shortName} Demo Restaurant Directory
        </span>
      </div>

      {/* Controls Bar */}
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-surface-soft/60 p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex flex-1 items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-soft focus-within:border-neutral-400">
          <Search className="h-4 w-4 text-neutral-400" />
          <span className="sr-only">Search restaurants, cuisines, or dishes</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search in ${shortName} by restaurant, locality, dish, or cuisine...`}
            className="w-full bg-transparent text-sm text-brand-black placeholder:text-neutral-400 focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPureVegOnly((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
              pureVegOnly
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            <Leaf className="h-3.5 w-3.5 text-emerald-600" />
            Pure Veg
          </button>
          <button
            type="button"
            onClick={() => setTopRatedOnly((v) => !v)}
            className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
              topRatedOnly
                ? 'border-brand-primary bg-brand-primarySoft text-brand-primaryDark'
                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            Rating 4.5+
          </button>
          <button
            type="button"
            onClick={() => setFastOnly((v) => !v)}
            className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
              fastOnly
                ? 'border-brand-primary bg-brand-primarySoft text-brand-primaryDark'
                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            Under 25 min
          </button>
          <button
            type="button"
            onClick={() => setOffersOnly((v) => !v)}
            className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
              offersOnly
                ? 'border-brand-primary bg-brand-primarySoft text-brand-primaryDark'
                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            Offers
          </button>
          <button
            type="button"
            onClick={() => setFreeDeliveryOnly((v) => !v)}
            className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
              freeDeliveryOnly
                ? 'border-brand-primary bg-brand-primarySoft text-brand-primaryDark'
                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            Free Delivery
          </button>

          <select
            value={priceRange}
            onChange={(e) => setPriceRange(e.target.value)}
            aria-label="Filter by price range"
            className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 focus:outline-none"
          >
            <option value="all">Price: Any</option>
            <option value="budget">Under ₹500</option>
            <option value="mid">₹500 – ₹800</option>
            <option value="premium">₹800+</option>
          </select>

          <label className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700">
            <SlidersHorizontal className="h-3.5 w-3.5 text-neutral-500" />
            <span className="sr-only">Sort restaurants</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-xs font-semibold text-brand-black focus:outline-none"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="distance">Sort: Nearest First</option>
              <option value="rating">Sort: Rating High to Low</option>
              <option value="eta">Sort: Fastest Delivery</option>
              <option value="costLow">Sort: Cost for Two (Low)</option>
              <option value="costHigh">Sort: Cost for Two (High)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Category Pills */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {['All', ...CATEGORIES.map((c) => c.name)].map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-brand-primary text-white shadow-soft'
                  : 'bg-surface-soft text-neutral-700 hover:bg-surface-muted'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Result Count */}
      <p className="mt-6 text-xs font-medium text-neutral-500">
        Showing{' '}
        <strong className="text-brand-black">{filteredRestaurants.length}</strong>{' '}
        {filteredRestaurants.length === 1 ? 'restaurant' : 'restaurants'} in{' '}
        <strong className="text-brand-black">{shortName}</strong>
        {activeTab === 'dining' ? ' for Dining Out' : ' for Delivery'}
      </p>

      {/* Grid */}
      {isLoading ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <RestaurantSkeletonCard key={idx} />
          ))}
        </div>
      ) : fetchError ? (
        <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 px-6 py-12 text-center">
          <h2 className="font-display text-lg font-bold text-red-900">
            Unable to load {shortName} restaurants
          </h2>
          <p className="mt-1 text-sm text-red-700">{fetchError}</p>
        </div>
      ) : filteredRestaurants.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-300 bg-surface-soft/50 px-6 py-16 text-center">
          <h2 className="font-display text-lg font-bold text-brand-black">
            No matching restaurants found in {shortName}
          </h2>
          <p className="mt-1 max-w-md text-sm text-neutral-500">
            {cityRestaurants.length === 0
              ? `No partner restaurants are currently listed for ${shortName}. Switch to a supported city in the location picker.`
              : 'Try clearing your search query or switching back to all food categories.'}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-primaryDark"
          >
            <RotateCcw className="h-4 w-4" />
            Reset filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRestaurants.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
          ))}
        </div>
      )}
    </div>
  );
}

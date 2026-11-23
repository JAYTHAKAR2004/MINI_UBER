import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Star,
} from 'lucide-react';
import { RESTAURANTS } from '../data/restaurants';
import FoodImage from '../components/FoodImage';
import VegBadge from '../components/VegBadge';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatPrice } from '../utils/formatters';

export default function RestaurantDetailPage() {
  const { slug } = useParams();
  const {
    items,
    restaurant: cartRestaurant,
    itemCount,
    subtotal,
    addItem,
    updateQuantity,
  } = useCart();
  const { showToast } = useToast();

  const restaurant = useMemo(
    () => RESTAURANTS.find((r) => r.slug === slug),
    [slug]
  );

  const menuCategories = useMemo(() => {
    if (!restaurant) return [];
    return ['All', ...new Set(restaurant.menu.map((m) => m.category))];
  }, [restaurant]);

  const [activeMenuCategory, setActiveMenuCategory] = useState('All');
  const [menuSearch, setMenuSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  if (!restaurant) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-brand-black">
          Restaurant not found
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          The kitchen you are looking for is not in our directory.
        </p>
        <Link
          to="/restaurants"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Restaurants
        </Link>
      </div>
    );
  }

  const visibleItems = restaurant.menu.filter((item) => {
    if (activeMenuCategory !== 'All' && item.category !== activeMenuCategory) {
      return false;
    }
    if (vegOnly && item.isVeg === false) return false;
    if (menuSearch.trim()) {
      const q = menuSearch.trim().toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getCartQuantity = (itemId) => {
    const found = items.find((i) => i.id === itemId);
    return found ? found.quantity : 0;
  };

  const handleAdd = (menuItem) => {
    addItem(menuItem, restaurant);
    showToast({
      title: `Added ${menuItem.name}`,
      description: `${restaurant.name} · ${formatPrice(menuItem.price)}`,
      type: 'success',
    });
  };

  const isSameCartRestaurant =
    cartRestaurant?.id === restaurant.id && itemCount > 0;

  return (
    <div className="pb-24">
      {/* Cover Banner */}
      <div className="relative h-60 w-full overflow-hidden bg-neutral-900 sm:h-72">
        <FoodImage
          src={restaurant.heroImage || restaurant.image}
          alt={restaurant.name}
          containerClassName="h-full w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

        <div className="absolute left-4 top-4 sm:left-8 sm:top-6">
          <Link
            to="/restaurants"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-xs font-semibold text-brand-black shadow-soft hover:bg-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Restaurants
          </Link>
        </div>
      </div>

      {/* Restaurant Info Card */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative -mt-12 rounded-3xl border border-neutral-200 bg-white p-6 shadow-card sm:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {restaurant.offer && (
                  <span className="rounded-md bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                    {restaurant.offer}
                  </span>
                )}
                {restaurant.badge && (
                  <span className="rounded-md bg-brand-primarySoft px-2.5 py-0.5 text-[11px] font-semibold text-brand-primaryDark">
                    {restaurant.badge}
                  </span>
                )}
                <span className="rounded-md bg-surface-soft px-2.5 py-0.5 text-[11px] font-medium text-neutral-500">
                  Demo Restaurant
                </span>
              </div>

              <h1 className="mt-3 font-display text-3xl font-extrabold text-brand-black">
                {restaurant.name}
              </h1>
              <p className="mt-1 text-sm text-neutral-600">
                {restaurant.cuisine}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-600 sm:text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-brand-primary" />
                  {restaurant.address}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-neutral-500" />
                  {restaurant.etaRange} delivery · Open {restaurant.openHours}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm font-semibold text-brand-black">
                <span>{formatPrice(restaurant.costForTwo)} for two</span>
                <span className="text-neutral-300">|</span>
                <span>
                  {restaurant.deliveryFee === 0
                    ? 'Free delivery'
                    : `${formatPrice(restaurant.deliveryFee)} delivery fee`}
                </span>
              </div>
            </div>

            {/* Zomato Stacked Rating Box */}
            <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-neutral-200 bg-surface-soft px-4 py-3">
              <div className="inline-flex items-center gap-1 rounded-lg bg-brand-rating px-2.5 py-1.5 text-base font-extrabold text-white tabular-nums">
                {restaurant.rating.toFixed(1)}
                <Star className="h-4 w-4 fill-white text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-brand-black">
                  {restaurant.reviewCount.toLocaleString()}+
                </p>
                <p className="text-[11px] text-neutral-500">Delivery Reviews</p>
              </div>
            </div>
          </div>

          {/* Search Menu + Veg Toggle + Category Tabs */}
          <div className="mt-7 space-y-4 border-t border-neutral-100 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex flex-1 max-w-md items-center gap-2 rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2 focus-within:border-neutral-400 focus-within:bg-white">
                <Search className="h-4 w-4 text-neutral-400" />
                <span className="sr-only">Search menu items</span>
                <input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Search dishes in this menu..."
                  className="w-full bg-transparent text-sm text-brand-black placeholder:text-neutral-400 focus:outline-none"
                />
              </label>

              <button
                type="button"
                onClick={() => setVegOnly((v) => !v)}
                className={`inline-flex items-center gap-2 self-start rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                  vegOnly
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-surface-soft'
                }`}
              >
                <VegBadge isVeg />
                Veg Only
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {menuCategories.map((category) => {
                const active = activeMenuCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveMenuCategory(category)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-brand-primary text-white shadow-soft'
                        : 'bg-surface-soft text-neutral-700 hover:bg-surface-muted'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Menu Items */}
        {visibleItems.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-surface-soft p-10 text-center">
            <p className="font-display text-base font-bold text-brand-black">
              No dishes match your filter
            </p>
            <button
              type="button"
              onClick={() => {
                setMenuSearch('');
                setVegOnly(false);
                setActiveMenuCategory('All');
              }}
              className="mt-3 text-xs font-semibold text-brand-primary underline"
            >
              Show all menu items
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {visibleItems.map((item) => {
              const qty = getCartQuantity(item.id);
              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-soft transition-shadow hover:shadow-card sm:flex-row"
                >
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <VegBadge isVeg={item.isVeg !== false} />
                        {item.bestseller && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            Bestseller
                          </span>
                        )}
                        <span className="text-[11px] font-medium text-neutral-400">
                          {item.category}
                        </span>
                      </div>
                      <h2 className="mt-1.5 font-display text-base font-bold text-brand-black">
                        {item.name}
                      </h2>
                      <div className="mt-1 flex items-center gap-2.5">
                        <span className="text-sm font-bold text-brand-black tabular-nums">
                          {formatPrice(item.price)}
                        </span>
                        {item.rating && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-rating tabular-nums">
                            {item.rating}
                            <Star className="h-3 w-3 fill-brand-rating text-brand-rating" />
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:flex-col">
                    <FoodImage
                      src={item.image}
                      alt={item.name}
                      containerClassName="h-28 w-28 rounded-xl"
                    />

                    {qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleAdd(item)}
                        className="inline-flex w-28 items-center justify-center gap-1 rounded-xl border border-brand-primaryBorder bg-brand-primarySoft py-2 text-xs font-bold uppercase tracking-wide text-brand-primaryDark transition-colors hover:bg-brand-primary hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    ) : (
                      <div className="inline-flex w-28 items-center justify-between rounded-xl bg-brand-primary px-2 py-1.5 text-white shadow-soft">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, -1)}
                          aria-label={`Remove one ${item.name}`}
                          className="rounded-lg p-1 hover:bg-brand-primaryDark"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-xs font-bold tabular-nums">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, 1)}
                          aria-label={`Add one more ${item.name}`}
                          className="rounded-lg p-1 hover:bg-brand-primaryDark"
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
        )}
      </div>

      {/* Sticky Bottom Cart Bar */}
      {isSameCartRestaurant && (
        <div className="fixed bottom-4 left-4 right-4 z-30 mx-auto max-w-3xl">
          <Link
            to="/cart"
            className="flex items-center justify-between rounded-2xl bg-brand-primary px-5 py-3.5 text-white shadow-elevated transition-colors hover:bg-brand-primaryDark"
          >
            <div className="flex items-center gap-3">
              <ShoppingBag className="h-5 w-5" />
              <span className="text-sm font-bold tabular-nums">
                {itemCount} {itemCount === 1 ? 'item' : 'items'} added ·{' '}
                {formatPrice(subtotal)}
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold">
              View Cart
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

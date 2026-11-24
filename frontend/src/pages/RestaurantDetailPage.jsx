import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Leaf,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Search,
  ShoppingBag,
  Star,
  X,
} from 'lucide-react';
import { RESTAURANTS } from '../data/restaurants';
import FoodImage from '../components/FoodImage';
import VegBadge from '../components/VegBadge';
import DeliveryTrackingMap from '../components/maps/DeliveryTrackingMap';
import { useCart } from '../context/CartContext';
import { useLocationContext } from '../context/LocationContext';
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
  const { lat, lng, address } = useLocationContext();
  const { showToast } = useToast();

  const restaurant = useMemo(
    () => RESTAURANTS.find((r) => r.slug === slug),
    [slug]
  );

  const menuCategories = useMemo(() => {
    if (!restaurant) return [];
    const cats = [...new Set(restaurant.menu.map((m) => m.category))];
    return ['All', ...cats];
  }, [restaurant]);

  const [activeMenuCategory, setActiveMenuCategory] = useState('All');
  const [menuSearch, setMenuSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

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

  const gallery =
    restaurant.gallery && restaurant.gallery.length >= 2
      ? restaurant.gallery
      : [restaurant.heroImage || restaurant.image, restaurant.image];

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
    <div className="bg-white pb-24">
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
        {/* Zomato Breadcrumbs */}
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          <Link to="/" className="hover:text-brand-primary">
            Home
          </Link>
          <span>/</span>
          <Link to="/restaurants" className="hover:text-brand-primary">
            {restaurant.city}
          </Link>
          <span>/</span>
          <span className="font-medium text-neutral-700">{restaurant.name}</span>
        </nav>

        {/* Zomato Photo Gallery Mosaic */}
        <div className="mt-4 grid gap-2.5 overflow-hidden rounded-2xl md:grid-cols-12 md:h-80">
          <div className="md:col-span-7 h-56 md:h-full overflow-hidden rounded-2xl md:rounded-none">
            <FoodImage
              src={gallery[0]}
              alt={restaurant.name}
              containerClassName="h-full w-full"
              className="transition-transform duration-300 hover:scale-105"
            />
          </div>
          <div className="hidden md:grid md:col-span-5 grid-rows-2 gap-2.5 h-full">
            <div className="overflow-hidden">
              <FoodImage
                src={gallery[1] || gallery[0]}
                alt={`${restaurant.name} kitchen`}
                containerClassName="h-full w-full"
                className="transition-transform duration-300 hover:scale-105"
              />
            </div>
            <div className="overflow-hidden relative">
              <FoodImage
                src={gallery[2] || restaurant.image}
                alt={`${restaurant.name} dish`}
                containerClassName="h-full w-full"
                className="transition-transform duration-300 hover:scale-105"
              />
              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-1.5 text-xs font-bold text-brand-black shadow-soft hover:bg-white"
              >
                <Navigation className="h-3.5 w-3.5 text-brand-primary" />
                View Route on Map
              </button>
            </div>
          </div>
        </div>

        {/* Restaurant Header Info */}
        <div className="mt-6 flex flex-col justify-between gap-6 border-b border-neutral-200 pb-6 md:flex-row md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {restaurant.offer && (
                <span className="rounded-md bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                  {restaurant.offer}
                </span>
              )}
              {restaurant.isPureVeg && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <Leaf className="h-3 w-3" />
                  Pure Veg
                </span>
              )}
              <span className="rounded-md bg-surface-soft px-2.5 py-0.5 text-[11px] font-medium text-neutral-500">
                Demo Restaurant
              </span>
            </div>

            <h1 className="mt-2 font-display text-3xl font-bold text-brand-black sm:text-4xl">
              {restaurant.name}
            </h1>
            <p className="mt-1 text-base text-neutral-600">
              {restaurant.cuisine}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-brand-primary" />
                {restaurant.address}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-neutral-500" />
                {restaurant.etaRange} · Open {restaurant.openHours}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold text-brand-black">
              <span>{formatPrice(restaurant.costForTwo)} for two</span>
              <span className="text-neutral-300">|</span>
              <span>
                {restaurant.deliveryFee === 0
                  ? 'Free delivery'
                  : `${formatPrice(restaurant.deliveryFee)} delivery fee`}
              </span>
              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:underline md:hidden"
              >
                <Navigation className="h-3.5 w-3.5" />
                Direction Map
              </button>
            </div>
          </div>

          {/* Stacked Zomato Rating Card */}
          <div className="flex shrink-0 items-center gap-3 self-start rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-soft">
            <div className="inline-flex items-center gap-1 rounded-lg bg-brand-rating px-2.5 py-1.5 text-base font-extrabold text-white tabular-nums">
              {restaurant.rating.toFixed(1)}
              <Star className="h-4 w-4 fill-white text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-brand-black tabular-nums">
                {restaurant.reviewCount.toLocaleString()}+
              </p>
              <p className="text-xs text-neutral-500">Delivery Ratings</p>
            </div>
          </div>
        </div>

        {/* Two-Column Zomato Menu Workspace */}
        <div className="mt-7 grid gap-8 lg:grid-cols-12">
          {/* Left Sticky Category Sidebar */}
          <aside className="lg:col-span-3">
            <div className="lg:sticky lg:top-24 rounded-2xl border border-neutral-200 bg-white p-3">
              <p className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
                Menu Categories
              </p>
              <ul className="mt-1 flex gap-1.5 overflow-x-auto lg:flex-col">
                {menuCategories.map((category) => {
                  const active = activeMenuCategory === category;
                  const count =
                    category === 'All'
                      ? restaurant.menu.length
                      : restaurant.menu.filter((m) => m.category === category).length;
                  return (
                    <li key={category} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveMenuCategory(category)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? 'border-l-4 border-brand-primary bg-brand-primarySoft font-bold text-brand-primaryDark'
                            : 'text-neutral-700 hover:bg-surface-soft'
                        }`}
                      >
                        <span>{category}</span>
                        <span className="text-xs text-neutral-400 tabular-nums">
                          ({count})
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          {/* Right Menu Search + Dishes */}
          <div className="lg:col-span-9">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-2xl font-bold text-brand-black">
                Order Online
              </h2>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2 focus-within:border-neutral-400 focus-within:bg-white">
                  <Search className="h-4 w-4 text-neutral-400" />
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Search within menu..."
                    className="w-48 bg-transparent text-xs text-brand-black placeholder:text-neutral-400 focus:outline-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setVegOnly((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors ${
                    vegOnly
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-surface-soft'
                  }`}
                >
                  <VegBadge isVeg />
                  Veg Only
                </button>
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-surface-soft p-10 text-center">
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
                  Reset menu filters
                </button>
              </div>
            ) : (
              <div className="mt-6 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white px-5">
                {visibleItems.map((item) => {
                  const qty = getCartQuantity(item.id);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center"
                    >
                      <div className="flex-1 pr-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <VegBadge isVeg={item.isVeg !== false} />
                          {item.bestseller && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                              Bestseller
                            </span>
                          )}
                          <span className="text-xs text-neutral-400">
                            {item.category}
                          </span>
                        </div>

                        <h3 className="mt-1.5 font-display text-lg font-semibold text-brand-black">
                          {item.name}
                        </h3>

                        <div className="mt-1 flex items-center gap-3">
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

                        <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-neutral-500">
                          {item.description}
                        </p>
                      </div>

                      {/* Zomato Photo + Overlaid ADD Button */}
                      <div className="relative flex shrink-0 flex-col items-center">
                        <FoodImage
                          src={item.image}
                          alt={item.name}
                          containerClassName="h-28 w-32 rounded-xl"
                        />

                        <div className="-mt-4 relative z-10">
                          {qty === 0 ? (
                            <button
                              type="button"
                              onClick={() => handleAdd(item)}
                              className="inline-flex w-24 items-center justify-center gap-1 rounded-lg border border-brand-primaryBorder bg-white py-1.5 text-xs font-bold uppercase text-brand-primary shadow-card transition-colors hover:bg-brand-primary hover:text-white"
                            >
                              ADD
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <div className="inline-flex w-24 items-center justify-between rounded-lg bg-brand-primary px-2 py-1.5 text-white shadow-card">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, -1)}
                                aria-label={`Remove one ${item.name}`}
                                className="rounded p-0.5 hover:bg-brand-primaryDark"
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
                                className="rounded p-0.5 hover:bg-brand-primaryDark"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Restaurant Map Modal */}
      {showMapModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-elevated">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-brand-black">
                  {restaurant.name} · Delivery Route
                </h2>
                <p className="text-xs text-neutral-500">{restaurant.address}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(false)}
                className="rounded-full p-1.5 text-neutral-500 hover:bg-surface-soft"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <DeliveryTrackingMap
              restaurantName={restaurant.name}
              restaurantCoords={restaurant.coordinates}
              deliveryCoords={{
                lat: lat || 12.9855,
                lng: lng || 77.6412,
              }}
              deliveryLabel={address || 'Your Selected Location'}
              etaMinutes={restaurant.etaMinutes}
              stageIndex={0}
              stageLabel="Route Preview"
              showPartner={false}
              heightClass="h-72"
            />
          </div>
        </div>
      )}

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

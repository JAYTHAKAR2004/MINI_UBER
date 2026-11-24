import { useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronDown,
  LogOut,
  MapPin,
  Menu,
  Search,
  Server,
  ShoppingBag,
  Sparkles,
  Truck,
  User,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import LocationModal from './LocationModal';
import { useCart } from '../context/CartContext';
import { useLocationContext } from '../context/LocationContext';
import { useAuth } from '../context/AuthContext';
import { RESTAURANTS } from '../data/restaurants';
import { formatPrice } from '../utils/formatters';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount, subtotal, openDrawer } = useCart();
  const { shortName, address } = useLocationContext();
  const { user, openAuthModal, logout } = useAuth();

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const currentParams = new URLSearchParams(location.search);
  const isDiningTab =
    location.pathname === '/restaurants' &&
    currentParams.get('tab') === 'dining';
  const isDeliveryTab =
    location.pathname === '/restaurants' && !isDiningTab;

  const liveSuggestions = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (q.length < 2) return [];
    const results = [];
    RESTAURANTS.forEach((r) => {
      if (
        r.name.toLowerCase().includes(q) ||
        r.cuisine.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'Restaurant',
          title: r.name,
          subtitle: `${r.cuisine} · ${r.city}`,
          slug: r.slug,
          image: r.image,
        });
      }
      r.menu.forEach((m) => {
        if (m.name.toLowerCase().includes(q)) {
          results.push({
            type: 'Dish',
            title: m.name,
            subtitle: `${r.name} · ${formatPrice(m.price)}`,
            slug: r.slug,
            image: m.image,
          });
        }
      });
    });
    return results.slice(0, 6);
  }, [searchInput]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearchFocused(false);
    const q = searchInput.trim();
    navigate(q ? `/restaurants?q=${encodeURIComponent(q)}` : '/restaurants');
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white">
        {/* Main Zomato Header Row */}
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="shrink-0 focus:outline-none">
            <BrandLogo />
          </Link>

          {/* Elevated Unified Location + Search Bar */}
          <div className="relative hidden flex-1 max-w-2xl md:block">
            <form
              onSubmit={handleSearchSubmit}
              className="flex h-12 items-center rounded-xl border border-neutral-200 bg-white px-2 shadow-soft focus-within:border-neutral-400"
            >
              <button
                type="button"
                onClick={() => setLocationModalOpen(true)}
                aria-label="Choose delivery location"
                className="inline-flex max-w-[185px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-soft"
              >
                <MapPin className="h-4 w-4 shrink-0 text-brand-primary" />
                <span className="truncate text-sm font-medium text-neutral-800">
                  {shortName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
              </button>

              <span className="mx-2 h-6 w-px bg-neutral-200" aria-hidden="true" />

              <label className="flex flex-1 items-center gap-2 px-2">
                <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="sr-only">
                  Search for restaurant, cuisine or a dish
                </span>
                <input
                  type="text"
                  value={searchInput}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search for restaurant, cuisine or a dish"
                  className="w-full bg-transparent text-sm text-brand-black placeholder:text-neutral-400 focus:outline-none"
                />
              </label>

              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                  className="rounded-md p-1 text-neutral-400 hover:text-brand-black"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </form>

            {/* Live Search Dropdown */}
            {searchFocused && liveSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-14 z-30 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2 shadow-elevated">
                {liveSuggestions.map((item, idx) => (
                  <button
                    key={`${item.slug}-${idx}`}
                    type="button"
                    onMouseDown={() => {
                      setSearchFocused(false);
                      navigate(`/restaurants/${item.slug}`);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-soft"
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-brand-black">
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {item.type} · {item.subtitle}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Auth / Profile & Cart */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {!user ? (
              <div className="hidden items-center gap-1 sm:flex">
                <button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-brand-black"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal('signup')}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-brand-black"
                >
                  Sign up
                </button>
              </div>
            ) : null}

            {/* Account / Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                aria-expanded={profileMenuOpen}
                aria-label="Account menu"
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 text-xs font-semibold text-brand-black hover:bg-surface-soft"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-primarySoft text-brand-primaryDark">
                  <User className="h-3.5 w-3.5" />
                </span>
                <span className="hidden max-w-[90px] truncate sm:inline">
                  {user ? user.name : 'Menu'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
              </button>

              {profileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setProfileMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-60 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-elevated">
                    <div className="border-b border-neutral-100 px-3 py-2">
                      <p className="truncate text-xs font-bold text-brand-black">
                        {user ? user.name : 'Guest Customer'}
                      </p>
                      <p className="truncate text-[11px] text-neutral-500">
                        {address || shortName}
                      </p>
                    </div>

                    <div className="py-1">
                      <Link
                        to="/profile"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-surface-soft hover:text-brand-black"
                      >
                        <User className="h-3.5 w-3.5 text-brand-primary" />
                        Profile, Addresses &amp; Orders
                      </Link>
                      <Link
                        to="/track"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-surface-soft hover:text-brand-black"
                      >
                        <Truck className="h-3.5 w-3.5 text-brand-primary" />
                        Track Orders
                      </Link>
                      <Link
                        to="/predict"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-surface-soft hover:text-brand-black"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-brand-primary" />
                        AI Delivery ETA
                      </Link>
                    </div>

                    <div className="border-t border-neutral-100 py-1">
                      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Platform Diagnostics
                      </p>
                      <Link
                        to="/analytics"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-surface-soft hover:text-brand-black"
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-neutral-500" />
                        ML Analytics
                      </Link>
                      <Link
                        to="/system"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-surface-soft hover:text-brand-black"
                      >
                        <Server className="h-3.5 w-3.5 text-neutral-500" />
                        System Status
                      </Link>
                    </div>

                    {user ? (
                      <div className="border-t border-neutral-100 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            logout();
                            setProfileMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Log out
                        </button>
                      </div>
                    ) : (
                      <div className="border-t border-neutral-100 p-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            openAuthModal('login');
                          }}
                          className="flex-1 rounded-lg bg-surface-soft py-1.5 text-xs font-semibold text-brand-black hover:bg-surface-muted"
                        >
                          Log in
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            openAuthModal('signup');
                          }}
                          className="flex-1 rounded-lg bg-brand-primary py-1.5 text-xs font-semibold text-white hover:bg-brand-primaryDark"
                        >
                          Sign up
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={openDrawer}
              aria-label="Open shopping cart"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-primaryDark"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Cart</span>
              {itemCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-brand-primaryDark tabular-nums">
                  {itemCount}
                  <span className="hidden lg:inline">· {formatPrice(subtotal)}</span>
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft text-brand-black hover:bg-surface-muted md:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Zomato Signature Circular Icon Navigation Tabs */}
        <nav
          aria-label="Primary Navigation"
          className="hidden border-t border-neutral-100 bg-white md:block"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
            <Link
              to="/restaurants"
              className={`flex items-center gap-2.5 border-b-2 py-3 text-base font-semibold transition-colors ${
                isDeliveryTab || location.pathname === '/'
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-neutral-600 hover:text-brand-black'
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  isDeliveryTab || location.pathname === '/'
                    ? 'bg-brand-primarySoft text-brand-primary'
                    : 'bg-surface-soft text-neutral-500'
                }`}
              >
                <ShoppingBag className="h-4 w-4" />
              </span>
              Delivery
            </Link>

            <Link
              to="/restaurants?tab=dining"
              className={`flex items-center gap-2.5 border-b-2 py-3 text-base font-semibold transition-colors ${
                isDiningTab
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-neutral-600 hover:text-brand-black'
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  isDiningTab
                    ? 'bg-brand-primarySoft text-brand-primary'
                    : 'bg-surface-soft text-neutral-500'
                }`}
              >
                <UtensilsCrossed className="h-4 w-4" />
              </span>
              Dining Out
            </Link>

            <NavLink
              to="/track"
              className={({ isActive }) =>
                `flex items-center gap-2.5 border-b-2 py-3 text-base font-semibold transition-colors ${
                  isActive
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-transparent text-neutral-600 hover:text-brand-black'
                }`
              }
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-neutral-600">
                <Truck className="h-4 w-4" />
              </span>
              Track Order
            </NavLink>

            <NavLink
              to="/predict"
              className={({ isActive }) =>
                `flex items-center gap-2.5 border-b-2 py-3 text-base font-semibold transition-colors ${
                  isActive
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-transparent text-neutral-600 hover:text-brand-black'
                }`
              }
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primarySoft text-brand-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              AI ETA
            </NavLink>
          </div>
        </nav>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="border-t border-neutral-200 bg-white px-4 pb-4 pt-3 md:hidden">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setLocationModalOpen(true);
              }}
              className="mb-3 flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5 text-left text-xs font-semibold text-brand-black"
            >
              <span className="flex items-center gap-2 truncate">
                <MapPin className="h-4 w-4 shrink-0 text-brand-primary" />
                <span className="truncate">{address || shortName}</span>
              </span>
              <span className="text-brand-primary">Change</span>
            </button>

            <form
              onSubmit={(e) => {
                setMobileMenuOpen(false);
                handleSearchSubmit(e);
              }}
              className="mb-3"
            >
              <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2.5">
                <Search className="h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search restaurant, cuisine or dish"
                  className="w-full bg-transparent text-sm text-brand-black focus:outline-none"
                />
              </label>
            </form>

            <nav className="grid grid-cols-2 gap-2">
              {[
                { to: '/', label: 'Home' },
                { to: '/restaurants', label: 'Delivery' },
                { to: '/restaurants?tab=dining', label: 'Dining Out' },
                { to: '/track', label: 'Track Order' },
                { to: '/predict', label: 'AI ETA' },
                { to: '/profile', label: 'Profile' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl bg-surface-soft px-3.5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-surface-muted"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {!user && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openAuthModal('login');
                  }}
                  className="flex-1 rounded-xl border border-neutral-200 py-2 text-xs font-bold text-brand-black"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openAuthModal('signup');
                  }}
                  className="flex-1 rounded-xl bg-brand-primary py-2 text-xs font-bold text-white"
                >
                  Sign up
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <LocationModal
        isOpen={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
      />
    </>
  );
}

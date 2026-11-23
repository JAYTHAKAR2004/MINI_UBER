import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronDown,
  MapPin,
  Menu,
  Search,
  Server,
  ShoppingBag,
  Sparkles,
  Truck,
  User,
  X,
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import { useCart } from '../context/CartContext';
import { useLocationContext } from '../context/LocationContext';
import { CITY_PRESETS } from '../utils/haversine';
import { formatPrice } from '../utils/formatters';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount, subtotal, openDrawer } = useCart();
  const { cityId, shortName, selectCityPreset } = useLocationContext();

  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const currentParams = new URLSearchParams(location.search);
  const isDiningTab =
    location.pathname === '/restaurants' &&
    currentParams.get('tab') === 'dining';
  const isOrderOnlineTab =
    location.pathname === '/restaurants' && !isDiningTab;

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchInput.trim();
    navigate(
      q ? `/restaurants?q=${encodeURIComponent(q)}` : '/restaurants'
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white">
      {/* Main Header Row */}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Left: Zomato Logo */}
        <Link to="/" className="shrink-0 focus:outline-none">
          <BrandLogo />
        </Link>

        {/* Center: Zomato Location + Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden flex-1 max-w-2xl items-center rounded-xl border border-neutral-200 bg-white px-2 py-1 shadow-soft focus-within:border-neutral-400 md:flex"
        >
          {/* City Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLocationMenuOpen((prev) => !prev)}
              aria-expanded={locationMenuOpen}
              aria-label="Select delivery city"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-black hover:bg-surface-soft"
            >
              <MapPin className="h-4 w-4 shrink-0 text-brand-primary" />
              <span className="max-w-[110px] truncate">{shortName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
            </button>

            {locationMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setLocationMenuOpen(false)}
                />
                <div className="absolute left-0 z-20 mt-2.5 w-64 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-elevated">
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Select Delivery City
                  </p>
                  {CITY_PRESETS.map((city) => {
                    const active = city.id === cityId;
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => {
                          selectCityPreset(city.id);
                          setLocationMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                          active
                            ? 'bg-brand-primarySoft font-semibold text-brand-primaryDark'
                            : 'text-neutral-700 hover:bg-surface-soft'
                        }`}
                      >
                        <span>{city.label}</span>
                        {active && (
                          <span className="h-2 w-2 rounded-full bg-brand-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <span className="mx-2 h-5 w-px bg-neutral-200" aria-hidden="true" />

          {/* Search Input */}
          <label className="flex flex-1 items-center gap-2 px-1.5">
            <Search className="h-4 w-4 shrink-0 text-neutral-400" />
            <span className="sr-only">Search restaurants, cuisines and dishes</span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search for restaurant, cuisine or a dish"
              className="w-full bg-transparent py-1.5 text-sm text-brand-black placeholder:text-neutral-400 focus:outline-none"
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

        {/* Right: Cart & User Profile */}
        <div className="flex items-center gap-2.5">
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
                <span className="hidden sm:inline">· {formatPrice(subtotal)}</span>
              </span>
            )}
          </button>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileMenuOpen((prev) => !prev)}
              aria-expanded={profileMenuOpen}
              aria-label="User profile menu"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 text-sm font-medium text-brand-black hover:bg-surface-soft"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-primarySoft text-brand-primaryDark">
                <User className="h-3.5 w-3.5" />
              </span>
              <span className="hidden text-xs font-semibold sm:inline">
                Account
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
            </button>

            {profileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-elevated">
                  <div className="border-b border-neutral-100 px-3 py-2">
                    <p className="text-xs font-bold text-brand-black">
                      Guest Customer
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      Delivering in {shortName}
                    </p>
                  </div>

                  <div className="py-1">
                    <Link
                      to="/track"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-surface-soft hover:text-brand-black"
                    >
                      <Truck className="h-3.5 w-3.5 text-brand-primary" />
                      Track Orders
                    </Link>
                    <Link
                      to="/cart"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-surface-soft hover:text-brand-black"
                    >
                      <ShoppingBag className="h-3.5 w-3.5 text-brand-primary" />
                      Shopping Cart
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

                  <div className="border-t border-neutral-100 pt-1">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      Project Monitoring
                    </p>
                    <Link
                      to="/analytics"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-surface-soft hover:text-brand-black"
                    >
                      <BarChart3 className="h-3.5 w-3.5 text-neutral-500" />
                      Analytics Dashboard
                    </Link>
                    <Link
                      to="/system"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-surface-soft hover:text-brand-black"
                    >
                      <Server className="h-3.5 w-3.5 text-neutral-500" />
                      System Health
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>

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

      {/* Desktop Secondary Navigation Tabs (Zomato style) */}
      <nav
        aria-label="Primary Navigation"
        className="hidden border-t border-neutral-100 bg-white md:block"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-7 px-4 sm:px-6 lg:px-8">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `border-b-2 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-neutral-600 hover:text-brand-black'
              }`
            }
          >
            Home
          </NavLink>

          <Link
            to="/restaurants"
            className={`border-b-2 py-2.5 text-sm font-semibold transition-colors ${
              isOrderOnlineTab
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-neutral-600 hover:text-brand-black'
            }`}
          >
            Order Online
          </Link>

          <Link
            to="/restaurants?tab=dining"
            className={`border-b-2 py-2.5 text-sm font-semibold transition-colors ${
              isDiningTab
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-neutral-600 hover:text-brand-black'
            }`}
          >
            Dining Out
          </Link>

          <NavLink
            to="/track"
            className={({ isActive }) =>
              `border-b-2 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-neutral-600 hover:text-brand-black'
              }`
            }
          >
            Track Order
          </NavLink>

          <NavLink
            to="/predict"
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 border-b-2 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-neutral-600 hover:text-brand-black'
              }`
            }
          >
            <Sparkles className="h-3.5 w-3.5 text-brand-primary" />
            AI ETA
          </NavLink>
        </div>
      </nav>

      {/* Mobile Search & Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-neutral-200 bg-white px-4 pb-4 pt-3 md:hidden">
          <form onSubmit={handleSearchSubmit} className="mb-3">
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

          <div className="mb-3 flex flex-wrap gap-1.5">
            {CITY_PRESETS.map((city) => (
              <button
                key={city.id}
                type="button"
                onClick={() => selectCityPreset(city.id)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                  city.id === cityId
                    ? 'bg-brand-primarySoft text-brand-primaryDark'
                    : 'bg-surface-soft text-neutral-700'
                }`}
              >
                <MapPin className="h-3 w-3 text-brand-primary" />
                {city.shortName}
              </button>
            ))}
          </div>

          <nav className="grid grid-cols-2 gap-2">
            {[
              { to: '/', label: 'Home' },
              { to: '/restaurants', label: 'Order Online' },
              { to: '/restaurants?tab=dining', label: 'Dining Out' },
              { to: '/track', label: 'Track Order' },
              { to: '/predict', label: 'AI ETA' },
              { to: '/cart', label: 'Cart' },
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
        </div>
      )}
    </header>
  );
}

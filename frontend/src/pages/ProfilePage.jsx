import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Check,
  Home,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Plus,
  ShieldAlert,
  Trash2,
  Truck,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useToast } from '../context/ToastContext';
import { formatPrice, formatTimestamp } from '../utils/formatters';
import LocationPickerMap from '../components/maps/LocationPickerMap';

export default function ProfilePage() {
  const {
    user,
    savedAddresses,
    openAuthModal,
    updateProfile,
    logout,
    addAddress,
    deleteAddress,
    setDefaultAddress,
  } = useAuth();
  const { orders } = useOrders();
  const { showToast } = useToast();

  const [tab, setTab] = useState('orders');
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);

  useEffect(() => {
    setNameInput(user?.name || '');
    setPhoneInput(user?.phone || '');
  }, [user?.name, user?.phone]);

  const [label, setLabel] = useState('Home');
  const [flat, setFlat] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [pincode, setPincode] = useState('');
  const [coords, setCoords] = useState({ lat: 12.9855, lng: 77.6412 });

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const res = await updateProfile({
      full_name: nameInput.trim() || user.name,
      phone: phoneInput.trim(),
    });
    setSavingProfile(false);

    if (!res.ok) {
      showToast({
        title: 'Update failed',
        description: res.error || 'Unable to update your profile.',
        type: 'error',
      });
      return;
    }

    showToast({
      title: 'Profile updated',
      description: 'Saved to your local demo profile.',
      type: 'success',
    });
  };

  const handleLogout = async () => {
    await logout();
    showToast({
      title: 'Logged out',
      description: 'Signed out of your local demo account.',
      type: 'success',
    });
  };

  const handleAddAddress = (e) => {
    e.preventDefault();
    if (!flat.trim() || !street.trim() || !city.trim()) {
      showToast({
        title: 'Missing address fields',
        description: 'Flat/house number, street, and city are required.',
        type: 'error',
      });
      return;
    }
    addAddress({
      label,
      flat: flat.trim(),
      street: street.trim(),
      landmark: landmark.trim(),
      city: city.trim(),
      pincode: pincode.trim(),
      lat: coords.lat,
      lng: coords.lng,
      isDefault: true,
    });
    setAddingAddress(false);
    setFlat('');
    setStreet('');
    setLandmark('');
    setPincode('');
    showToast({
      title: 'Address saved',
      description: `${label} address added and set as default.`,
      type: 'success',
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Top User Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-soft sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primarySoft text-brand-primaryDark">
            <User className="h-8 w-8" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold text-brand-black">
                {user ? user.name : 'Guest Customer'}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                Demo Profile
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {user
                ? `${user.email}${user.phone ? ` · ${user.phone}` : ''}`
                : 'Sign in with a local demo account to personalize your profile and saved addresses.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-bold text-brand-black hover:bg-surface-soft"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white hover:bg-brand-primaryDark"
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>

      {/* Honest Demo Auth Banner */}
      <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span>
          <strong>Local Demo Authentication:</strong> Account credentials (salted hash), saved addresses, and local order snapshots are stored in your browser (<code className="font-mono">localStorage</code>) and kept separate from the backend PostgreSQL order database.
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-7 flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
        {[
          { id: 'orders', label: `Order History (${orders.length})` },
          { id: 'addresses', label: `Saved Addresses (${savedAddresses.length})` },
          { id: 'settings', label: 'Account Settings' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              tab === t.id
                ? 'bg-brand-primary text-white'
                : 'bg-surface-soft text-neutral-700 hover:bg-surface-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'orders' && (
        <div className="mt-6 space-y-4">
          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-surface-soft p-10 text-center">
              <Package className="mx-auto h-8 w-8 text-neutral-400" />
              <p className="mt-2 font-display text-base font-bold text-brand-black">
                No orders yet
              </p>
              <Link
                to="/restaurants"
                className="mt-3 inline-block rounded-xl bg-brand-primary px-5 py-2 text-xs font-bold text-white"
              >
                Order Food Now
              </Link>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-brand-black">
                      {order.id}
                    </span>
                    <span className="rounded-full bg-brand-primarySoft px-2.5 py-0.5 text-[11px] font-bold text-brand-primaryDark">
                      {order.orderStatus || 'Order placed'}
                    </span>
                  </div>
                  <h2 className="mt-1 font-display text-base font-bold text-brand-black">
                    {order.restaurant?.name}
                  </h2>
                  <p className="text-xs text-neutral-500">
                    {formatTimestamp(order.createdAt)} ·{' '}
                    {(order.items || []).map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                  </p>
                  <p className="mt-1 text-xs font-bold text-brand-black tabular-nums">
                    {formatPrice(order.total)} · ETA {order.etaMinutes} min
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    to={`/track/${order.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white hover:bg-brand-primaryDark"
                  >
                    <Truck className="h-3.5 w-3.5" />
                    Track
                  </Link>
                  <Link
                    to={`/order-confirmation/${order.id}`}
                    className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-semibold text-brand-black hover:bg-surface-soft"
                  >
                    Receipt
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'addresses' && (
        <div className="mt-6 space-y-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setAddingAddress((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white hover:bg-brand-primaryDark"
            >
              <Plus className="h-4 w-4" />
              {addingAddress ? 'Cancel' : 'Add Address'}
            </button>
          </div>

          {addingAddress && (
            <form
              onSubmit={handleAddAddress}
              className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft"
            >
              <LocationPickerMap
                lat={coords.lat}
                lng={coords.lng}
                onLocationSelect={(loc) => {
                  setCoords({ lat: loc.lat, lng: loc.lng });
                  if (loc.street) setStreet(loc.street);
                  if (loc.city) setCity(loc.city);
                  if (loc.pincode) setPincode(loc.pincode);
                }}
                heightClass="h-56"
              />
              <div className="flex gap-2">
                {['Home', 'Work', 'Other'].map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLabel(l)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      label === l
                        ? 'bg-brand-primary text-white'
                        : 'bg-surface-soft text-neutral-700'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={flat}
                  onChange={(e) => setFlat(e.target.value)}
                  placeholder="House / Flat No. *"
                  className="rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Landmark"
                  className="rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Street / Area *"
                  className="sm:col-span-2 rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City *"
                  className="rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="Pincode"
                  className="rounded-xl border border-neutral-200 bg-surface-soft px-3 py-2 text-xs"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-brand-black px-5 py-2.5 text-xs font-bold text-white"
              >
                Save Address
              </button>
            </form>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {savedAddresses.map((addr) => {
              const Icon =
                addr.label === 'Work'
                  ? Briefcase
                  : addr.label === 'Home'
                  ? Home
                  : MapPin;
              return (
                <div
                  key={addr.id}
                  className="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-black">
                        <Icon className="h-4 w-4 text-brand-primary" />
                        {addr.label}
                      </span>
                      {addr.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                          <Check className="h-3 w-3" />
                          Default
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-neutral-700">
                      {addr.flat}, {addr.street}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {addr.landmark ? `${addr.landmark} · ` : ''}
                      {addr.city} {addr.pincode}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center gap-3 border-t border-neutral-100 pt-3">
                    {!addr.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDefaultAddress(addr.id)}
                        className="text-xs font-bold text-brand-primary hover:underline"
                      >
                        Set as default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteAddress(addr.id)}
                      className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="mt-6 max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-soft">
          {!user ? (
            <div className="text-center py-6">
              <p className="text-sm font-semibold text-brand-black">
                Sign in with your account to edit profile settings.
              </p>
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="mt-4 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white"
              >
                Log in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700">
                  Email Address
                </label>
                <input
                  type="email"
                  value={user.email || ''}
                  disabled
                  className="mt-1 w-full cursor-not-allowed rounded-xl border border-neutral-200 bg-surface-muted px-3.5 py-2.5 text-sm text-neutral-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700">
                  Full Name
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-surface-soft px-3.5 py-2.5 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-primaryDark disabled:opacity-60"
              >
                {savingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Settings
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}


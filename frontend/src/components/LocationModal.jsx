import { useState } from 'react';
import { Check, MapPin, X } from 'lucide-react';
import { CITY_PRESETS } from '../utils/haversine';
import { useLocationContext } from '../context/LocationContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import LocationPickerMap from './maps/LocationPickerMap';

export default function LocationModal({ isOpen, onClose }) {
  const { cityId, lat, lng, address, selectCityPreset, setCustomLocation } =
    useLocationContext();
  const { clearIncompatibleCart } = useCart();
  const { savedAddresses } = useAuth();
  const { showToast } = useToast();

  const [picked, setPicked] = useState({
    lat: lat || 12.9855,
    lng: lng || 77.6412,
    city: '',
    street: '',
    displayName: address,
  });

  if (!isOpen) return null;

  const notifyCitySwitch = (nextCityName) => {
    const cleared = clearIncompatibleCart(nextCityName);
    if (cleared) {
      showToast({
        title: `Cart cleared for ${nextCityName}`,
        description: `${cleared.name} delivers in ${cleared.city}, so incompatible items were removed.`,
        type: 'info',
      });
    }
  };

  const handleConfirmMapPin = () => {
    const nextCity = picked.city || 'Custom Location';
    notifyCitySwitch(nextCity);
    setCustomLocation({
      shortName: nextCity,
      address: picked.street
        ? `${picked.street}${picked.city ? `, ${picked.city}` : ''}`
        : picked.displayName,
      lat: picked.lat,
      lng: picked.lng,
      source: 'map',
    });
    showToast({
      title: 'Delivery location updated',
      description: picked.city || `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`,
      type: 'success',
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-modal-title"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-elevated sm:p-6">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <div>
            <h2
              id="location-modal-title"
              className="font-display text-lg font-extrabold text-brand-black"
            >
              Choose Delivery Location
            </h2>
            <p className="text-xs text-neutral-500">
              Select a city preset, saved address, or pinpoint your exact drop spot on OpenStreetMap
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close location modal"
            className="rounded-full p-1.5 text-neutral-500 hover:bg-surface-soft hover:text-brand-black"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* City Presets */}
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            Supported Cities ({CITY_PRESETS.length})
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CITY_PRESETS.map((city) => {
              const active = city.id === cityId;
              return (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => {
                    notifyCitySwitch(city.shortName);
                    selectCityPreset(city.id);
                    showToast({
                      title: `Location set to ${city.shortName}`,
                      description: `Showing restaurants delivering in ${city.shortName}.`,
                      type: 'success',
                    });
                    onClose();
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-brand-primary bg-brand-primarySoft text-brand-primaryDark'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-surface-soft'
                  }`}
                >
                  <MapPin className="h-3 w-3 text-brand-primary" />
                  {city.shortName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Saved Addresses */}
        {savedAddresses.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Saved Addresses
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {savedAddresses.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => {
                    notifyCitySwitch(addr.city);
                    setCustomLocation({
                      shortName: addr.city,
                      address: [addr.flat, addr.street, addr.city, addr.pincode]
                        .filter(Boolean)
                        .join(', '),
                      lat: addr.lat,
                      lng: addr.lng,
                      source: 'saved',
                    });
                    onClose();
                  }}
                  className="flex items-start gap-2.5 rounded-xl border border-neutral-200 bg-surface-soft p-3 text-left transition-colors hover:border-brand-primary hover:bg-brand-primarySoft/40"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-brand-black">
                      {addr.label} · {addr.city}
                    </p>
                    <p className="truncate text-[11px] text-neutral-500">
                      {addr.flat}, {addr.street}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Interactive Leaflet Map Picker */}
        <div className="mt-5 border-t border-neutral-100 pt-4">
          <LocationPickerMap
            lat={picked.lat}
            lng={picked.lng}
            onLocationSelect={(loc) => setPicked((prev) => ({ ...prev, ...loc }))}
            heightClass="h-60"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <p className="text-xs text-neutral-600 truncate max-w-md">
            <strong>Selected:</strong>{' '}
            {picked.street || picked.displayName || `${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`}
          </p>
          <button
            type="button"
            onClick={handleConfirmMapPin}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white shadow-soft hover:bg-brand-primaryDark"
          >
            <Check className="h-4 w-4" />
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
}


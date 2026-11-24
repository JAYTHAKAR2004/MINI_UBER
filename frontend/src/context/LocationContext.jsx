import { createContext, useContext, useEffect, useState } from 'react';
import { CITY_PRESETS } from '../utils/haversine';

const STORAGE_KEY = 'mini_uber_location_v2';
const LocationContext = createContext(null);

function inferModelCity(cityName = '') {
  const normalized = cityName.toLowerCase();
  if (
    ['bengaluru', 'bangalore', 'mumbai', 'hyderabad', 'delhi', 'new delhi', 'chennai', 'kolkata'].some(
      (c) => normalized.includes(c)
    )
  ) {
    return 'Metropolitian';
  }
  return 'Urban';
}

export function LocationProvider({ children }) {
  const [locationState, setLocationState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    const initial = CITY_PRESETS[0];
    return {
      cityId: initial.id,
      shortName: initial.shortName,
      modelCity: initial.modelCity,
      address: initial.defaultAddress,
      lat: initial.deliveryLat,
      lng: initial.deliveryLon,
      source: 'preset',
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(locationState));
    } catch {
      // ignore storage errors
    }
  }, [locationState]);

  const selectCityPreset = (cityId) => {
    const preset = CITY_PRESETS.find((c) => c.id === cityId);
    if (!preset) return;
    setLocationState({
      cityId: preset.id,
      shortName: preset.shortName,
      modelCity: preset.modelCity,
      address: preset.defaultAddress,
      lat: preset.deliveryLat,
      lng: preset.deliveryLon,
      source: 'preset',
    });
  };

  const setCustomAddress = (address) => {
    setLocationState((prev) => ({
      ...prev,
      address,
    }));
  };

  const setCustomLocation = ({
    shortName,
    address,
    lat,
    lng,
    modelCity,
    cityId,
    source = 'map',
  }) => {
    setLocationState((prev) => ({
      cityId: cityId || prev.cityId,
      shortName: shortName || prev.shortName,
      modelCity: modelCity || inferModelCity(shortName || prev.shortName),
      address: address || prev.address,
      lat: Number.isFinite(Number(lat)) ? Number(lat) : prev.lat,
      lng: Number.isFinite(Number(lng)) ? Number(lng) : prev.lng,
      source,
    }));
  };

  const activePreset =
    CITY_PRESETS.find((c) => c.id === locationState.cityId) || CITY_PRESETS[0];

  return (
    <LocationContext.Provider
      value={{
        ...locationState,
        activePreset,
        selectCityPreset,
        setCustomAddress,
        setCustomLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocationContext must be used inside LocationProvider');
  }
  return ctx;
}

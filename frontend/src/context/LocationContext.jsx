import { createContext, useContext, useEffect, useState } from 'react';
import {
  CITY_PRESETS,
  normalizeCityName,
  normalizeCitySlug,
} from '../utils/haversine';

const STORAGE_KEY = 'mini_uber_location_v2';
const LocationContext = createContext(null);

function inferModelCity(cityName = '') {
  const slug = normalizeCitySlug(cityName);
  const preset = CITY_PRESETS.find((c) => c.id === slug);
  if (preset) return preset.modelCity;
  return 'Urban';
}

export function LocationProvider({ children }) {
  const [locationState, setLocationState] = useState(() => {
    const defaultPreset =
      CITY_PRESETS.find((c) => c.id === 'bengaluru') || CITY_PRESETS[0];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const normalizedSlug = normalizeCitySlug(
          parsed.shortName || parsed.cityId || defaultPreset.id
        );
        const matched = CITY_PRESETS.find((c) => c.id === normalizedSlug);
        return {
          cityId: matched ? matched.id : normalizedSlug || defaultPreset.id,
          shortName: matched
            ? matched.shortName
            : normalizeCityName(parsed.shortName) || defaultPreset.shortName,
          modelCity:
            matched?.modelCity ||
            parsed.modelCity ||
            inferModelCity(parsed.shortName),
          address: parsed.address || matched?.defaultAddress || defaultPreset.defaultAddress,
          lat: Number.isFinite(Number(parsed.lat))
            ? Number(parsed.lat)
            : matched?.deliveryLat ?? defaultPreset.deliveryLat,
          lng: Number.isFinite(Number(parsed.lng))
            ? Number(parsed.lng)
            : matched?.deliveryLon ?? defaultPreset.deliveryLon,
          source: parsed.source || 'preset',
        };
      }
    } catch {
      // ignore storage errors
    }
    return {
      cityId: defaultPreset.id,
      shortName: defaultPreset.shortName,
      modelCity: defaultPreset.modelCity,
      address: defaultPreset.defaultAddress,
      lat: defaultPreset.deliveryLat,
      lng: defaultPreset.deliveryLon,
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
    const slug = normalizeCitySlug(cityId);
    const preset = CITY_PRESETS.find((c) => c.id === slug);
    if (!preset) return null;
    const nextState = {
      cityId: preset.id,
      shortName: preset.shortName,
      modelCity: preset.modelCity,
      address: preset.defaultAddress,
      lat: preset.deliveryLat,
      lng: preset.deliveryLon,
      source: 'preset',
    };
    setLocationState(nextState);
    return nextState;
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
    const resolvedShortName = normalizeCityName(shortName || locationState.shortName);
    const resolvedSlug = normalizeCitySlug(cityId || resolvedShortName || locationState.cityId);
    const matchedPreset = CITY_PRESETS.find((c) => c.id === resolvedSlug);

    setLocationState((prev) => ({
      cityId: resolvedSlug || prev.cityId,
      shortName: matchedPreset ? matchedPreset.shortName : resolvedShortName || prev.shortName,
      modelCity:
        modelCity ||
        matchedPreset?.modelCity ||
        inferModelCity(resolvedShortName || prev.shortName),
      address: address || matchedPreset?.defaultAddress || prev.address,
      lat: Number.isFinite(Number(lat)) ? Number(lat) : prev.lat,
      lng: Number.isFinite(Number(lng)) ? Number(lng) : prev.lng,
      source,
    }));
  };

  const activePreset =
    CITY_PRESETS.find((c) => c.id === locationState.cityId) ||
    CITY_PRESETS.find((c) => c.id === 'bengaluru') ||
    CITY_PRESETS[0];

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

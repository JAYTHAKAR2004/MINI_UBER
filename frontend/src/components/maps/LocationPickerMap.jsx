import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import { reverseGeocode, searchAddresses } from '../../services/geocodingService';

function createPinIcon(color = '#E23744') {
  return L.divIcon({
    className: 'zomato-map-pin',
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;border-radius:9999px;background:#ffffff;transform:rotate(45deg);"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

export default function LocationPickerMap({
  lat = 12.9855,
  lng = 77.6412,
  onLocationSelect,
  heightClass = 'h-64',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onSelectRef = useRef(onLocationSelect);
  onSelectRef.current = onLocationSelect;

  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [locating, setLocating] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const handleCoordinateChange = async (nextLat, nextLng, shouldReverse = true) => {
    let resolved = {
      lat: nextLat,
      lng: nextLng,
      street: '',
      city: '',
      pincode: '',
      displayName: `${nextLat.toFixed(4)}, ${nextLng.toFixed(4)}`,
    };

    if (shouldReverse) {
      try {
        const rev = await reverseGeocode(nextLat, nextLng);
        resolved = { ...resolved, ...rev };
      } catch {
        // Keep coordinates even if reverse geocoding is rate-limited
      }
    }

    onSelectRef.current?.(resolved);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([lat, lng], {
      draggable: true,
      icon: createPinIcon('#E23744'),
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      handleCoordinateChange(pos.lat, pos.lng, true);
    });

    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      handleCoordinateChange(e.latlng.lat, e.latlng.lng, true);
    });

    mapRef.current = map;
    markerRef.current = marker;

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current && markerRef.current && Number.isFinite(lat) && Number.isFinite(lng)) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.panTo([lat, lng], { animate: true });
    }
  }, [lat, lng]);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (searchText.trim().length < 3) {
      setStatusMessage({
        type: 'info',
        text: 'Enter at least 3 characters to search an address in India.',
      });
      return;
    }

    setSearching(true);
    setStatusMessage(null);
    try {
      const results = await searchAddresses(searchText);
      setSearchResults(results);
      if (results.length === 0) {
        setStatusMessage({
          type: 'info',
          text: 'No matching address found. Try another landmark or click directly on the map.',
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Address lookup failed.',
      });
    } finally {
      setSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatusMessage({
        type: 'error',
        text: 'Geolocation is not supported by your browser. Search or click on the map instead.',
      });
      return;
    }

    setLocating(true);
    setStatusMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLat = position.coords.latitude;
        const nextLng = position.coords.longitude;
        if (mapRef.current && markerRef.current) {
          markerRef.current.setLatLng([nextLat, nextLng]);
          mapRef.current.setView([nextLat, nextLng], 15);
        }
        await handleCoordinateChange(nextLat, nextLng, true);
        setLocating(false);
        setStatusMessage({
          type: 'success',
          text: 'Updated pin to your browser location.',
        });
      },
      (err) => {
        setLocating(false);
        const deniedMsg =
          err.code === 1
            ? 'Location permission was denied. Search for an address or drag the map pin manually.'
            : 'Unable to detect your GPS location right now. You can search or click on the map.';
        setStatusMessage({ type: 'error', text: deniedMsg });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const selectSearchResult = (item) => {
    setSearchResults([]);
    setSearchText(item.street || item.displayName);
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([item.lat, item.lng]);
      mapRef.current.setView([item.lat, item.lng], 15);
    }
    onLocationSelect?.({
      lat: item.lat,
      lng: item.lng,
      street: item.street,
      city: item.city,
      pincode: item.pincode,
      displayName: item.displayName,
    });
  };

  return (
    <div className="space-y-3">
      {/* Search + Current Location Controls */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Search street, area, or landmark..."
              className="w-full rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 text-xs text-brand-black placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-black px-3.5 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
          </button>

          {searchResults.length > 0 && (
            <ul className="absolute left-0 right-0 top-10 z-[1000] max-h-48 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-elevated">
              {searchResults.map((res) => (
                <li key={res.placeId}>
                  <button
                    type="button"
                    onClick={() => selectSearchResult(res)}
                    className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-xs text-neutral-700 hover:bg-brand-primarySoft hover:text-brand-black"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" />
                    <span className="line-clamp-2">{res.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-brand-primaryBorder bg-brand-primarySoft px-3.5 py-2 text-xs font-semibold text-brand-primaryDark hover:bg-brand-primary hover:text-white disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" />
          )}
          Use Current Location
        </button>
      </div>

      {statusMessage && (
        <p
          className={`rounded-xl px-3 py-2 text-xs font-medium ${
            statusMessage.type === 'error'
              ? 'bg-red-50 text-red-700'
              : statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-surface-soft text-neutral-600'
          }`}
        >
          {statusMessage.text}
        </p>
      )}

      {/* Interactive Leaflet Map */}
      <div
        ref={containerRef}
        className={`w-full overflow-hidden rounded-2xl border border-neutral-200 ${heightClass}`}
      />

      <p className="text-[11px] text-neutral-500">
        Click anywhere on the map or drag the red pin to fine-tune your delivery drop spot.
      </p>
    </div>
  );
}


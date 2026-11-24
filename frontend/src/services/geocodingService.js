/**
 * OpenStreetMap Nominatim Geocoding & OSRM Public Route Helpers
 * Note: Uses public OSM/OSRM endpoints directly in the browser without embedding secrets.
 */

export async function searchAddresses(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    countrycodes: 'in',
    limit: '5',
    q,
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Address search unavailable (HTTP ${response.status})`);
  }

  const data = await response.json();
  return (Array.isArray(data) ? data : []).map((item) => {
    const addr = item.address || {};
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.state_district ||
      addr.state ||
      'Bengaluru';
    const road = [addr.house_number, addr.road, addr.suburb || addr.neighbourhood]
      .filter(Boolean)
      .join(', ');

    return {
      placeId: item.place_id,
      displayName: item.display_name,
      shortName: city,
      street: road || item.display_name.split(',').slice(0, 2).join(', '),
      city,
      pincode: addr.postcode || '',
      lat: Number(item.lat),
      lng: Number(item.lon),
    };
  });
}

export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    lat: String(lat),
    lon: String(lng),
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Reverse geocoding unavailable (HTTP ${response.status})`);
  }

  const item = await response.json();
  const addr = item.address || {};
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.state_district ||
    addr.state ||
    'Bengaluru';
  const street = [addr.road, addr.suburb || addr.neighbourhood]
    .filter(Boolean)
    .join(', ');

  return {
    displayName: item.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    street: street || item.display_name?.split(',').slice(0, 2).join(', ') || '',
    city,
    pincode: addr.postcode || '',
  };
}

export async function fetchDrivingRoute(rLat, rLon, dLat, dLon) {
  const fallbackCoords = [];
  const steps = 16;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    fallbackCoords.push([
      rLat + (dLat - rLat) * t,
      rLon + (dLon - rLon) * t,
    ]);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = `https://router.project-osrm.org/route/v1/driving/${rLon},${rLat};${dLon},${dLat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return { coordinates: fallbackCoords, source: 'direct', distanceKm: null };
    }
    const json = await res.json();
    const route = json?.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length > 1) {
      return {
        coordinates: coords.map(([lon, lat]) => [lat, lon]),
        distanceKm:
          typeof route.distance === 'number'
            ? Math.round((route.distance / 1000) * 100) / 100
            : null,
        source: 'osrm',
      };
    }
  } catch {
    // Graceful direct fallback when OSRM is unreachable
  }

  return { coordinates: fallbackCoords, source: 'direct', distanceKm: null };
}


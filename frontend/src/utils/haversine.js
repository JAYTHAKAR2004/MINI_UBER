const EARTH_RADIUS_KM = 6371.0;

/**
 * Parse a coordinate input, returning null for blank or non-finite values.
 */
function parseCoord(value) {
  if (
    value === '' ||
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Compute geographical Haversine distance in km (matches src/pipeline/etl.py).
 */
export function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const vals = [lat1, lon1, lat2, lon2].map(parseCoord);
  if (vals.some((v) => v === null)) {
    return null;
  }
  const [rLat, rLon, dLat, dLon] = vals.map((deg) => (deg * Math.PI) / 180);
  const deltaLat = dLat - rLat;
  const deltaLon = dLon - rLon;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(rLat) * Math.cos(dLat) * Math.sin(deltaLon / 2) ** 2;

  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  return Math.round(km * 100) / 100;
}

/**
 * Validate coordinates using broad India bounds matching src/pipeline/etl.py:
 * latitude in [6, 38], longitude in [68, 98].
 */
export function areCoordinatesValid(rLat, rLon, dLat, dLon) {
  const nums = [rLat, rLon, dLat, dLon].map(parseCoord);
  if (nums.some((v) => v === null)) return 0;
  const [rlat, rlon, dlat, dlon] = nums;
  const rValid = rlat >= 6 && rlat <= 38 && rlon >= 68 && rlon <= 98;
  const dValid = dlat >= 6 && dlat <= 38 && dlon >= 68 && dlon <= 98;
  return rValid && dValid ? 1 : 0;
}

export const CITY_PRESETS = [
  {
    id: 'bengaluru',
    label: 'Bengaluru — Indiranagar',
    shortName: 'Bengaluru',
    modelCity: 'Metropolitian',
    defaultAddress: '100 Feet Road, Indiranagar, Bengaluru 560038',
    restaurantLat: 12.9716,
    restaurantLon: 77.5946,
    deliveryLat: 12.9855,
    deliveryLon: 77.6412,
  },
  {
    id: 'mumbai',
    label: 'Mumbai — Bandra West',
    shortName: 'Mumbai',
    modelCity: 'Metropolitian',
    defaultAddress: 'Hill Road, Bandra West, Mumbai 400050',
    restaurantLat: 19.0596,
    restaurantLon: 72.8295,
    deliveryLat: 19.0921,
    deliveryLon: 72.8511,
  },
  {
    id: 'hyderabad',
    label: 'Hyderabad — Jubilee Hills',
    shortName: 'Hyderabad',
    modelCity: 'Metropolitian',
    defaultAddress: 'Road No. 36, Jubilee Hills, Hyderabad 500033',
    restaurantLat: 17.4326,
    restaurantLon: 78.4071,
    deliveryLat: 17.4486,
    deliveryLon: 78.3908,
  },
  {
    id: 'pune',
    label: 'Pune — Koregaon Park',
    shortName: 'Pune',
    modelCity: 'Urban',
    defaultAddress: 'Lane 7, Koregaon Park, Pune 411001',
    restaurantLat: 18.5362,
    restaurantLon: 73.8939,
    deliveryLat: 18.5626,
    deliveryLon: 73.9143,
  },
  {
    id: 'delhi',
    label: 'New Delhi — Connaught Place',
    shortName: 'New Delhi',
    modelCity: 'Metropolitian',
    defaultAddress: 'Block B, Connaught Place, New Delhi 110001',
    restaurantLat: 28.6315,
    restaurantLon: 77.2167,
    deliveryLat: 28.6542,
    deliveryLon: 77.2373,
  },
];


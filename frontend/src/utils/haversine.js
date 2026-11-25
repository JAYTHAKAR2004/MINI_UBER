const EARTH_RADIUS_KM = 6371.0;
export const MAX_DELIVERY_DISTANCE_KM = 50;

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
    id: 'ahmedabad',
    label: 'Ahmedabad — Bodakdev',
    shortName: 'Ahmedabad',
    modelCity: 'Metropolitian',
    defaultAddress: 'Sindhu Bhavan Road, Bodakdev, Ahmedabad 380054',
    restaurantLat: 23.03,
    restaurantLon: 72.5176,
    deliveryLat: 23.0395,
    deliveryLon: 72.531,
  },
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
    deliveryLat: 19.0821,
    deliveryLon: 72.8411,
  },
  {
    id: 'delhi',
    label: 'Delhi — Connaught Place',
    shortName: 'Delhi',
    modelCity: 'Metropolitian',
    defaultAddress: 'Block B, Connaught Place, Delhi 110001',
    restaurantLat: 28.6315,
    restaurantLon: 77.2167,
    deliveryLat: 28.6442,
    deliveryLon: 77.2273,
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
    modelCity: 'Metropolitian',
    defaultAddress: 'Lane 7, Koregaon Park, Pune 411001',
    restaurantLat: 18.5362,
    restaurantLon: 73.8939,
    deliveryLat: 18.5526,
    deliveryLon: 73.9043,
  },
  {
    id: 'chennai',
    label: 'Chennai — Nungambakkam',
    shortName: 'Chennai',
    modelCity: 'Metropolitian',
    defaultAddress: 'Khader Nawaz Khan Road, Nungambakkam, Chennai 600006',
    restaurantLat: 13.0604,
    restaurantLon: 80.2496,
    deliveryLat: 13.0475,
    deliveryLon: 80.258,
  },
  {
    id: 'kolkata',
    label: 'Kolkata — Park Street',
    shortName: 'Kolkata',
    modelCity: 'Metropolitian',
    defaultAddress: 'Park Street, Taltala, Kolkata 700016',
    restaurantLat: 22.5535,
    restaurantLon: 88.3532,
    deliveryLat: 22.562,
    deliveryLon: 88.365,
  },
  {
    id: 'jaipur',
    label: 'Jaipur — C-Scheme',
    shortName: 'Jaipur',
    modelCity: 'Urban',
    defaultAddress: 'MI Road, C-Scheme, Jaipur 302001',
    restaurantLat: 26.9124,
    restaurantLon: 75.7873,
    deliveryLat: 26.9025,
    deliveryLon: 75.802,
  },
  {
    id: 'gandhinagar',
    label: 'Gandhinagar — Sector 11',
    shortName: 'Gandhinagar',
    modelCity: 'Urban',
    defaultAddress: 'GH-4 Circle, Sector 11, Gandhinagar 382011',
    restaurantLat: 23.2156,
    restaurantLon: 72.6369,
    deliveryLat: 23.2245,
    deliveryLon: 72.648,
  },
  {
    id: 'surat',
    label: 'Surat — Piplod',
    shortName: 'Surat',
    modelCity: 'Urban',
    defaultAddress: 'Gaurav Path, Piplod, Surat 395007',
    restaurantLat: 21.1591,
    restaurantLon: 72.7758,
    deliveryLat: 21.1702,
    deliveryLon: 72.7911,
  },
  {
    id: 'vadodara',
    label: 'Vadodara — Alkapuri',
    shortName: 'Vadodara',
    modelCity: 'Urban',
    defaultAddress: 'RC Dutt Road, Alkapuri, Vadodara 390007',
    restaurantLat: 22.3119,
    restaurantLon: 73.1723,
    deliveryLat: 22.3072,
    deliveryLon: 73.1812,
  },
];

const CITY_ALIASES = {
  ahmedabad: 'ahmedabad',
  amdavad: 'ahmedabad',
  bengaluru: 'bengaluru',
  bangalore: 'bengaluru',
  'bengaluru urban': 'bengaluru',
  mumbai: 'mumbai',
  bombay: 'mumbai',
  'navi mumbai': 'mumbai',
  delhi: 'delhi',
  'new delhi': 'delhi',
  'delhi ncr': 'delhi',
  ncr: 'delhi',
  hyderabad: 'hyderabad',
  secunderabad: 'hyderabad',
  pune: 'pune',
  poona: 'pune',
  chennai: 'chennai',
  madras: 'chennai',
  kolkata: 'kolkata',
  calcutta: 'kolkata',
  jaipur: 'jaipur',
  gandhinagar: 'gandhinagar',
  surat: 'surat',
  vadodara: 'vadodara',
  baroda: 'vadodara',
};

export function normalizeCitySlug(raw = '') {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!cleaned) return '';
  if (CITY_ALIASES[cleaned]) return CITY_ALIASES[cleaned];
  for (const [alias, slug] of Object.entries(CITY_ALIASES)) {
    if (cleaned.includes(alias)) return slug;
  }
  return cleaned;
}

export function normalizeCityName(raw = '') {
  const cleaned = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const slug = normalizeCitySlug(cleaned);
  const preset = CITY_PRESETS.find((c) => c.id === slug);
  return preset ? preset.shortName : cleaned;
}

export function citiesMatch(cityA, cityB) {
  const slugA = normalizeCitySlug(cityA);
  const slugB = normalizeCitySlug(cityB);
  return Boolean(slugA && slugB && slugA === slugB);
}

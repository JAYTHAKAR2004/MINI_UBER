import apiClient from './apiClient';

/**
 * GET /cities — Supported delivery cities and live catalog counts.
 */
export async function fetchCities() {
  const response = await apiClient.get('/cities');
  return response.data?.cities || [];
}

/**
 * GET /restaurants?city=... — Strictly filtered backend catalog by selected city.
 */
export async function fetchRestaurantsByCity({
  city,
  search,
  category,
  pureVeg,
  deliveryOnly = true,
  diningOnly,
  lat,
  lng,
  sort = 'relevance',
} = {}) {
  const params = {};
  if (city) params.city = city;
  if (search) params.search = search;
  if (category && category !== 'All') params.category = category;
  if (pureVeg) params.pure_veg = true;
  if (deliveryOnly) params.delivery_only = true;
  if (diningOnly) params.dining_only = true;
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    params.lat = Number(lat);
    params.lng = Number(lng);
  }
  if (sort) params.sort = sort;

  const response = await apiClient.get('/restaurants', { params });
  return {
    city: response.data?.city || city || null,
    normalizedCity: response.data?.normalized_city || null,
    count: response.data?.count ?? 0,
    restaurants: response.data?.restaurants || [],
  };
}

/**
 * GET /restaurants/:slug — Fetch single restaurant details and menu from backend.
 */
export async function fetchRestaurantBySlug(slug, { lat, lng } = {}) {
  const params = {};
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    params.lat = Number(lat);
    params.lng = Number(lng);
  }
  const response = await apiClient.get(
    `/restaurants/${encodeURIComponent(slug)}`,
    { params }
  );
  return response.data?.restaurant || null;
}


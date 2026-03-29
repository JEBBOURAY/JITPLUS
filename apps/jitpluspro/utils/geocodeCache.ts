import * as Location from 'expo-location';
import Constants from 'expo-constants';

// ── Google Geocoding API response types ──
interface GeoLatLng {
  lat: number;
  lng: number;
}

interface GeoGeometry {
  location: GeoLatLng;
}

interface GeoAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GeoResult {
  geometry: GeoGeometry;
  formatted_address?: string;
  address_components?: GeoAddressComponent[];
}

interface GeoResponse {
  status: string;
  results?: GeoResult[];
}

const CACHE_MAX = 50;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  Constants.expoConfig?.extra?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
  '';

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/** LRU helper: delete and re-insert the key so it becomes the "most recent" entry */
function lruGet<K, V>(cache: Map<K, CacheEntry<V>>, key: K): V | undefined {
  const entry = cache.get(key);
  if (entry !== undefined) {
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return undefined;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
  }
  return undefined;
}

/** LRU eviction: remove the oldest entry (first inserted) when at capacity */
function lruSet<K, V>(cache: Map<K, CacheEntry<V>>, key: K, value: V): void {
  // Proactive sweep: remove all expired entries before inserting
  const now = Date.now();
  for (const [k, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(k);
  }
  if (cache.size >= CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
}

// ── Forward geocode via Google Geocoding API ──
async function googleGeocode(address: string): Promise<Location.LocationGeocodedLocation[]> {
  if (!GOOGLE_MAPS_KEY) return [];
  // Sanitize input: trim, cap length, reject suspicious patterns
  const sanitized = address.trim().slice(0, 200);
  if (!sanitized) return [];
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(sanitized)}&region=ma&language=fr&key=${GOOGLE_MAPS_KEY}`;
  const res = await fetch(url);
  const json: GeoResponse = await res.json();
  const results = json.results;
  if (json.status === 'OK' && results && results.length > 0) {
    return results.map((r: GeoResult) => ({
      latitude: r.geometry.location.lat,
      longitude: r.geometry.location.lng,
    }));
  }
  return [];
}

// ── Reverse geocode via Google Geocoding API ──
async function googleReverseGeocode(
  lat: number,
  lng: number,
): Promise<Location.LocationGeocodedAddress[]> {
  if (!GOOGLE_MAPS_KEY) return [];
  // Validate coordinate ranges
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return [];
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=fr&key=${GOOGLE_MAPS_KEY}`;
  const res = await fetch(url);
  const json: GeoResponse = await res.json();
  const results = json.results;
  if (json.status === 'OK' && results && results.length > 0) {
    const r = results[0];
    const get = (type: string) =>
      r.address_components?.find((c: GeoAddressComponent) => c.types?.includes(type))?.long_name ?? null;
    return [{
      street: get('route'),
      streetNumber: get('street_number'),
      city: get('locality') || get('administrative_area_level_2'),
      district: get('sublocality') || get('neighborhood'),
      region: get('administrative_area_level_1'),
      country: get('country'),
      postalCode: get('postal_code'),
      name: r.formatted_address ?? null,
      isoCountryCode: get('country') ? 'MA' : null,
      timezone: null,
      subregion: null,
      formattedAddress: r.formatted_address ?? null,
    }];
  }
  return [];
}

// ── Forward geocode cache (address → coords) ──
const forwardCache = new Map<string, CacheEntry<Location.LocationGeocodedLocation[]>>();

export async function geocodeAsync(address: string): Promise<Location.LocationGeocodedLocation[]> {
  const key = address.trim().toLowerCase();
  const cached = lruGet(forwardCache, key);
  if (cached) return cached;

  // 1. Try Google Geocoding API (most reliable for Morocco)
  try {
    const googleResults = await googleGeocode(address);
    if (googleResults.length > 0) {
      lruSet(forwardCache, key, googleResults);
      return googleResults;
    }
  } catch (e) { if (__DEV__) console.warn('[geocode] Google geocode failed:', e); }

  // 2. Fallback: device native geocoder (expo-location)
  try {
    const results = await Location.geocodeAsync(address);
    if (results.length > 0) {
      lruSet(forwardCache, key, results);
      return results;
    }
  } catch (e) { if (__DEV__) console.warn('[geocode] native geocode failed:', e); }

  return [];
}

// ── Reverse geocode cache (coords → address) ──
const reverseCache = new Map<string, CacheEntry<Location.LocationGeocodedAddress[]>>();

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export async function reverseGeocodeAsync(
  location: { latitude: number; longitude: number },
): Promise<Location.LocationGeocodedAddress[]> {
  const key = coordKey(location.latitude, location.longitude);
  const cached = lruGet(reverseCache, key);
  if (cached) return cached;

  // 1. Try Google Reverse Geocoding API
  try {
    const googleResults = await googleReverseGeocode(location.latitude, location.longitude);
    if (googleResults.length > 0) {
      lruSet(reverseCache, key, googleResults);
      return googleResults;
    }
  } catch (e) { if (__DEV__) console.warn('[geocode] Google reverse geocode failed:', e); }

  // 2. Fallback: device native geocoder
  try {
    const results = await Location.reverseGeocodeAsync(location);
    if (results.length > 0) {
      lruSet(reverseCache, key, results);
      return results;
    }
  } catch (e) { if (__DEV__) console.warn('[geocode] native reverse geocode failed:', e); }

  return [];
}

import * as Location from 'expo-location';

const CACHE_MAX = 50;

/** LRU helper: delete and re-insert the key so it becomes the "most recent" entry */
function lruGet<K, V>(cache: Map<K, V>, key: K): V | undefined {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

/** LRU eviction: remove the oldest entry (first inserted) when at capacity */
function lruSet<K, V>(cache: Map<K, V>, key: K, value: V): void {
  if (cache.size >= CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

// ── Forward geocode cache (address → coords) ──
const forwardCache = new Map<string, Location.LocationGeocodedLocation[]>();

export async function geocodeAsync(address: string): Promise<Location.LocationGeocodedLocation[]> {
  const key = address.trim().toLowerCase();
  const cached = lruGet(forwardCache, key);
  if (cached) return cached;

  const results = await Location.geocodeAsync(address);
  if (results.length > 0) {
    lruSet(forwardCache, key, results);
  }
  return results;
}

// ── Reverse geocode cache (coords → address) ──
const reverseCache = new Map<string, Location.LocationGeocodedAddress[]>();

function coordKey(lat: number, lng: number): string {
  // Round to 5 decimal places (~1m precision) to merge nearby lookups
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export async function reverseGeocodeAsync(
  location: { latitude: number; longitude: number },
): Promise<Location.LocationGeocodedAddress[]> {
  const key = coordKey(location.latitude, location.longitude);
  const cached = lruGet(reverseCache, key);
  if (cached) return cached;

  const results = await Location.reverseGeocodeAsync(location);
  if (results.length > 0) {
    lruSet(reverseCache, key, results);
  }
  return results;
}

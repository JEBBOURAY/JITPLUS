import * as Location from 'expo-location';

const CACHE_MAX = 50;

// ── Forward geocode cache (address → coords) ──
const forwardCache = new Map<string, Location.LocationGeocodedLocation[]>();

export async function geocodeAsync(address: string): Promise<Location.LocationGeocodedLocation[]> {
  const key = address.trim().toLowerCase();
  const cached = forwardCache.get(key);
  if (cached) return cached;

  const results = await Location.geocodeAsync(address);
  if (results.length > 0) {
    if (forwardCache.size >= CACHE_MAX) forwardCache.delete(forwardCache.keys().next().value!);
    forwardCache.set(key, results);
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
  const cached = reverseCache.get(key);
  if (cached) return cached;

  const results = await Location.reverseGeocodeAsync(location);
  if (results.length > 0) {
    if (reverseCache.size >= CACHE_MAX) reverseCache.delete(reverseCache.keys().next().value!);
    reverseCache.set(key, results);
  }
  return results;
}

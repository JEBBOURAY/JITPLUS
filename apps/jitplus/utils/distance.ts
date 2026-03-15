/**
 * Shared Haversine distance utilities.
 */

/** Haversine distance in km between two points */
export function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Haversine distance in km — returns Infinity when target coords are missing.
 * Convenient overload for nullable merchant coordinates.
 */
export function getDistanceSafe(
  userLat: number,
  userLng: number,
  lat?: number | null,
  lng?: number | null,
): number {
  if (lat == null || lng == null) return Infinity;
  return getDistanceKm(userLat, userLng, lat, lng);
}

/** Format a distance for display (e.g. "350 m" or "2.1 km") */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

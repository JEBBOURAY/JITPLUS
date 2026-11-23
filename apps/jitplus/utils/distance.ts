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

/** Format a distance for display (e.g. "350 m" or "2.1 km") */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  // A decimal helps only nearby: "2.4 km", but "38 km" rather than "37.8 km".
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

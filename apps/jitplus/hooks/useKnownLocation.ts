import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

const MAX_LAST_KNOWN_AGE_MS = 5 * 60 * 1000;

export interface Coords {
  latitude: number;
  longitude: number;
}

/**
 * The user's position when location access was already granted elsewhere in
 * the app. Never prompts: secondary screens should not trigger the system
 * permission dialog.
 */
export function useKnownLocation(): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (!granted) return;
        const position =
          (await Location.getLastKnownPositionAsync({ maxAge: MAX_LAST_KNOWN_AGE_MS }))
          ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (alive && position) {
          setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        }
      } catch { /* location unavailable */ }
    })();
    return () => { alive = false; };
  }, []);

  return coords;
}

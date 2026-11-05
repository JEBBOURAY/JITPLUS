import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { COUNTRIES } from '@/constants/Countries';
import { useAuthStore } from '@/stores/authStore';
import { reverseGeocodeAsync } from '@/utils/geocodeCache';
import { logWarn } from '@/utils/devLogger';

/** Detected country, kept for the app session so later scans start on it instantly. */
let sessionCountryCode: string | null = null;

function isSupported(code: string | null | undefined): code is string {
  return !!code && COUNTRIES.some((c) => c.code === code);
}

/** Where the device is right now, only if location is already allowed (never prompts). */
async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const last = await Location.getLastKnownPositionAsync({ maxAge: 24 * 60 * 60 * 1000 });
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }));
  return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
}

async function countryAt(coords: { latitude: number; longitude: number }): Promise<string | null> {
  const [address] = await reverseGeocodeAsync(coords);
  const code = address?.isoCountryCode?.toUpperCase();
  return isSupported(code) ? code : null;
}

/**
 * ISO code of the country the merchant is in, for the phone dial-code picker.
 * Starts on the merchant's saved country, then refines from the device's position
 * (if location is already granted) or else the merchant's store coordinates.
 */
export function useDetectedCountry(): string {
  const merchant = useAuthStore((s) => s.merchant);
  const saved = merchant?.countryCode;
  const fallback = isSupported(saved) ? saved : COUNTRIES[0].code;
  const [code, setCode] = useState<string>(sessionCountryCode ?? fallback);

  const storeLat = merchant?.latitude;
  const storeLng = merchant?.longitude;

  useEffect(() => {
    if (sessionCountryCode) return;
    let cancelled = false;
    (async () => {
      let detected: string | null = null;
      try {
        const here = await currentPosition();
        if (here) detected = await countryAt(here);
      } catch (e) {
        logWarn('country-detect', 'device position failed:', e);
      }
      if (!detected && typeof storeLat === 'number' && typeof storeLng === 'number') {
        try {
          detected = await countryAt({ latitude: storeLat, longitude: storeLng });
        } catch (e) {
          logWarn('country-detect', 'store position failed:', e);
        }
      }
      if (detected) {
        sessionCountryCode = detected;
        if (!cancelled) setCode(detected);
      }
    })();
    return () => { cancelled = true; };
  }, [storeLat, storeLng]);

  return code;
}

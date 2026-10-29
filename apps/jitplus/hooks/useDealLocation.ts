import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import type { Coords } from '@/hooks/useKnownLocation';

type Translate = (key: string, params?: Record<string, unknown>) => string;

const MAX_LAST_KNOWN_AGE_MS = 10 * 60 * 1000;
/** A cold GPS fix can take long: past this delay the feed loads without a position. */
const FIX_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

async function readPosition(): Promise<Coords | null> {
  const position =
    (await Location.getLastKnownPositionAsync({ maxAge: MAX_LAST_KNOWN_AGE_MS }))
    ?? (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), FIX_TIMEOUT_MS));
  return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null;
}

/**
 * Position for the deal feed. Never prompts by itself; `resolved` turns true
 * once we know whether a position is available, so the feed is fetched once
 * instead of once without and once with the position. `request` asks the
 * user explicitly (our explanation first, then the OS dialog).
 */
export function useDealLocation(t: Translate) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [resolved, setResolved] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        const next = granted ? await readPosition() : null;
        if (mountedRef.current && next) setCoords(next);
      } catch { /* location unavailable */ }
      if (mountedRef.current) setResolved(true);
    })();
    return () => { mountedRef.current = false; };
  }, []);

  const fetchNow = useCallback(async () => {
    try {
      const next = await readPosition();
      if (mountedRef.current && next) setCoords(next);
    } catch { /* location unavailable */ }
  }, []);

  const request = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status === 'granted') { await fetchNow(); return; }
      if (!perm.canAskAgain) {
        Alert.alert(t('discover.locationPromptTitle'), t('discover.locationBlockedBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
        ]);
        return;
      }
      Alert.alert(t('discover.locationPromptTitle'), t('discover.locationPromptBody'), [
        { text: t('notifications.later'), style: 'cancel' },
        {
          text: t('discover.locationAllow'),
          onPress: () => {
            Location.requestForegroundPermissionsAsync()
              .then(({ status }) => (status === 'granted' ? fetchNow() : undefined))
              .catch(() => {});
          },
        },
      ]);
    } catch { /* permission check failed */ }
  }, [t, fetchNow]);

  return { coords, resolved, request };
}

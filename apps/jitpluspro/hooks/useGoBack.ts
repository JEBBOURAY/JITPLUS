import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';

const DOUBLE_TAP_MS = 600;

/**
 * Leaves the screen: previous screen, or the home tab when there is none
 * (opened from a link or a notification). A double tap only counts once, it
 * would otherwise leave two screens.
 */
export function useGoBack() {
  const router = useRouter();
  const lastPress = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastPress.current < DOUBLE_TAP_MS) return;
    lastPress.current = now;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);
}

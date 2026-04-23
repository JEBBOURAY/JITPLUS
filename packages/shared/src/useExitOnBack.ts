import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, ToastAndroid, Platform } from 'react-native';
import { useNavigationContainerRef } from 'expo-router';

/**
 * On Android, shows a "Press back again to exit" toast when the user
 * presses the hardware back button on a root tab.  A second press
 * within 2 seconds exits the app.
 *
 * No-op on iOS (no hardware back button).
 *
 * Uses useEffect + useNavigationContainerRef instead of useFocusEffect
 * to avoid crashing when the navigation context isn't ready yet during
 * the initial tab screen render (expo-router renders tab children before
 * the NavigationContainer context is fully propagated).
 */
export function useExitOnBack(enabled = true, message = 'Press back again to exit') {
  const lastBackRef = useRef(0);
  const navRef = useNavigationContainerRef();

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // If the navigator can go back, let the default behaviour handle it
      if (navRef?.canGoBack()) return false;

      const now = Date.now();
      if (now - lastBackRef.current < 2000) {
        BackHandler.exitApp();
        return true;
      }
      lastBackRef.current = now;
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return true; // prevent default (closing the app)
    });

    return () => sub.remove();
  }, [enabled, navRef, message]);
}

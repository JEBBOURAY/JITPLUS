import { useCallback, useRef } from 'react';
import { BackHandler, ToastAndroid, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * On Android, shows a "Press back again to exit" toast when the user
 * presses the hardware back button on a root tab.  A second press
 * within 2 seconds exits the app.
 *
 * No-op on iOS (no hardware back button).
 */
export function useExitOnBack(enabled = true) {
  const lastBackRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !enabled) return;

      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const now = Date.now();
        if (now - lastBackRef.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackRef.current = now;
        ToastAndroid.show('Appuyez encore pour quitter', ToastAndroid.SHORT);
        return true; // prevent default (closing the app)
      });

      return () => sub.remove();
    }, [enabled]),
  );
}

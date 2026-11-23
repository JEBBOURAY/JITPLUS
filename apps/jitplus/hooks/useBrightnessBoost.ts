import { useCallback, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Brightness from 'expo-brightness';

/**
 * Some Android OEMs revert the window brightness when a system dialog or a
 * notification briefly takes focus, so the boost is re-applied periodically.
 */
const KEEP_ALIVE_MS = 8000;

/**
 * Maximises the brightness while the screen is focused (scannable codes),
 * then hands control back on blur. Returns whether the
 * boost is currently applied.
 *
 * iOS has no per-window brightness: setBrightnessAsync changes the system
 * value and restoreSystemBrightnessAsync is a no-op there, so the value read
 * before boosting is written back on blur and whenever the app leaves the
 * foreground (otherwise the phone stays at 100 % after leaving JitPlus).
 */
export function useBrightnessBoost(): boolean {
  const [boosted, setBoosted] = useState(false);

  useFocusEffect(useCallback(() => {
    const isIOS = Platform.OS === 'ios';
    let cancelled = false;
    let applying = false;
    let saved: number | null = null;

    const apply = async () => {
      if (applying || cancelled) return;
      applying = true;
      try {
        const current = await Brightness.getBrightnessAsync().catch(() => 0);
        // Blurred or backgrounded while reading: release() already ran with
        // nothing saved, so boosting now would leave the system at 100 %.
        if (cancelled || (isIOS && AppState.currentState !== 'active')) return;
        if (current < 0.98) {
          if (isIOS && saved === null) saved = current;
          await Brightness.setBrightnessAsync(1);
        }
        if (!cancelled) setBoosted(true);
      } catch { /* non-fatal */ }
      finally { applying = false; }
    };

    const release = () => {
      if (isIOS) {
        if (saved !== null) {
          const value = saved;
          saved = null;
          Brightness.setBrightnessAsync(value).catch(() => {});
        }
      } else {
        // Releasing the override is more reliable than restoring a captured value,
        // which some Android OEMs fail to report.
        Brightness.restoreSystemBrightnessAsync().catch(() => {});
      }
    };

    apply();
    const keepAlive = setInterval(apply, KEEP_ALIVE_MS);
    const appStateSub = isIOS
      ? AppState.addEventListener('change', (state) => {
          if (state === 'active') apply();
          else if (state === 'background') release();
        })
      : null;

    return () => {
      cancelled = true;
      clearInterval(keepAlive);
      appStateSub?.remove();
      release();
      setBoosted(false);
    };
  }, []));

  return boosted;
}

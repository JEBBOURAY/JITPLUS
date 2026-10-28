import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Brightness from 'expo-brightness';

/**
 * Some Android OEMs revert the window brightness when a system dialog or a
 * notification briefly takes focus, so the boost is re-applied periodically.
 */
const KEEP_ALIVE_MS = 8000;

/**
 * Maximises the window brightness while the screen is focused and `enabled`
 * (scannable codes), then hands control back to the OS on blur. Returns
 * whether the boost is currently applied.
 */
export function useBrightnessBoost(enabled = true): boolean {
  const [boosted, setBoosted] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let applying = false;
    const apply = async () => {
      if (applying) return;
      applying = true;
      try {
        const current = await Brightness.getBrightnessAsync().catch(() => 0);
        if (current < 0.98) await Brightness.setBrightnessAsync(1);
        if (!cancelled) setBoosted(true);
      } catch { /* non-fatal */ }
      finally { applying = false; }
    };
    apply();
    const keepAlive = setInterval(apply, KEEP_ALIVE_MS);
    return () => {
      cancelled = true;
      clearInterval(keepAlive);
      // Releasing the override is more reliable than restoring a captured value,
      // which some Android OEMs fail to report.
      Brightness.restoreSystemBrightnessAsync().catch(() => {});
      setBoosted(false);
    };
  }, [enabled]));

  return boosted;
}
